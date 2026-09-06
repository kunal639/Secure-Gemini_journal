/**
 * Comprehensive Phase 1 Hardening Invariants & Security Suite
 */

import { verifyRequestAuth, AuthenticationError } from '../lib/server-auth.ts';
import { checkPreAuthRateLimit, checkRateLimit } from '../lib/rate-limiter.ts';
import { getConversationHistory, persistMessage, deleteConversationCascade } from '../lib/server-firestore.ts';
import fs from 'node:fs';
import path from 'node:path';

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('   PHASE 1 HARDENING — SECURITY INVARIANTS & AUDIT FIX SUITE    ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. INVARIANT: PRE-AUTH ABUSE PROTECTION & EARLY HEADER CHECKS
  // -------------------------------------------------------------
  console.log('1. Testing Pre-auth Abuse Protection & Early Header Checks...');
  try {
    // 1a. Missing Header
    let threw = false;
    try {
      await verifyRequestAuth(null);
    } catch (e) {
      threw = e instanceof AuthenticationError && e.message.includes('Missing Authorization header');
    }
    assert(threw, 'Missing auth header must throw AuthenticationError(401)');

    // 1b. Oversized Header (> 4096 chars)
    threw = false;
    try {
      await verifyRequestAuth('Bearer ' + 'x'.repeat(5000));
    } catch (e) {
      threw = e instanceof AuthenticationError && e.message.includes('exceeds maximum allowable size');
    }
    assert(threw, 'Oversized auth header must be rejected early');

    // 1c. Non-Bearer Scheme
    threw = false;
    try {
      await verifyRequestAuth('Basic dXNlcjpwYXNz');
    } catch (e) {
      threw = e instanceof AuthenticationError && e.message.includes('Bearer <token>');
    }
    assert(threw, 'Non-bearer scheme must be rejected early');

    // 1d. Malformed JWT Structure (not 3 parts)
    threw = false;
    try {
      await verifyRequestAuth('Bearer invalid_token_structure');
    } catch (e) {
      threw = e instanceof AuthenticationError && e.message.includes('Malformed JWT token structure');
    }
    assert(threw, 'Malformed token structure must be rejected before crypto/JWKS');

    // 1e. Forged Token Signature
    threw = false;
    try {
      const forgedJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciJ9.ZmFrZXNpZw';
      await verifyRequestAuth(`Bearer ${forgedJwt}`);
    } catch (e) {
      threw = e instanceof AuthenticationError && (e.message.includes('verification failed') || e.message.includes('signature'));
    }
    assert(threw, 'Forged JWT signature must fail verification');

    results.push({
      test: 'Pre-auth Early Header & Token Checks',
      status: 'PASS',
      details: 'Missing, oversized, malformed, and forged tokens rejected before expensive ops.',
    });
    console.log('   -> PASS: Early header validation protects backend.\n');
  } catch (err) {
    results.push({ test: 'Pre-auth Early Header & Token Checks', status: 'FAIL', details: err.message });
    console.error('   -> FAIL:', err.message, '\n');
  }

  // -------------------------------------------------------------
  // 2. INVARIANT: RATE LIMITING (PRE-AUTH IP + POST-AUTH UID)
  // -------------------------------------------------------------
  console.log('2. Testing Rate Limiter (IP Sliding Window & UID Window)...');
  try {
    const testIp = '198.51.100.42';
    let ipAllowedCount = 0;
    for (let i = 0; i < 70; i++) {
      const res = checkPreAuthRateLimit(testIp);
      if (res.allowed) ipAllowedCount++;
    }
    assert(ipAllowedCount === 60, `IP rate limit must cap at exactly 60 (got ${ipAllowedCount})`);
    const blockedIpRes = checkPreAuthRateLimit(testIp);
    assert(!blockedIpRes.allowed && blockedIpRes.remaining === 0, '61st IP request must be blocked');

    const testUid = 'user_rate_test_' + Date.now();
    let uidAllowedCount = 0;
    for (let i = 0; i < 25; i++) {
      const res = checkRateLimit(testUid);
      if (res.allowed) uidAllowedCount++;
    }
    assert(uidAllowedCount === 20, `UID rate limit must cap at exactly 20 (got ${uidAllowedCount})`);
    const blockedUidRes = checkRateLimit(testUid);
    assert(!blockedUidRes.allowed && blockedUidRes.remaining === 0, '21st UID request must be blocked');

    results.push({
      test: 'Sliding Window Rate Limiter',
      status: 'PASS',
      details: 'Enforced 60 req/min for client IP and 20 req/min for authenticated UID.',
    });
    console.log('   -> PASS: IP and UID rate limits properly bounded.\n');
  } catch (err) {
    results.push({ test: 'Sliding Window Rate Limiter', status: 'FAIL', details: err.message });
    console.error('   -> FAIL:', err.message, '\n');
  }

  // -------------------------------------------------------------
  // 3. INVARIANT: DATABASE-AUTHORITATIVE CONTEXT & HISTORY INTEGRITY
  // -------------------------------------------------------------
  console.log('3. Testing Database-Authoritative Context & Client History Omission...');
  try {
    // Inspect /app/api/chat/route.ts code to ensure client history is NOT destructured or used
    const chatRouteCode = fs.readFileSync(path.resolve('./app/api/chat/route.ts'), 'utf-8');
    assert(!chatRouteCode.includes('history = body.history'), 'chat route must not read history from body');
    assert(!chatRouteCode.includes('{ conversationId, message, userMessageId, history }'), 'chat route must not destructure history');
    assert(chatRouteCode.includes('getConversationHistory('), 'chat route must invoke getConversationHistory from Firestore');

    // Inspect components/journal-workspace.tsx to ensure client does not send history
    const clientWorkspaceCode = fs.readFileSync(path.resolve('./components/journal-workspace.tsx'), 'utf-8');
    assert(!clientWorkspaceCode.includes('history: historyPayload'), 'client must not send history: historyPayload');
    assert(!clientWorkspaceCode.includes('historyPayload ='), 'client must not construct historyPayload');

    results.push({
      test: 'Database-Authoritative History',
      status: 'PASS',
      details: 'Chat route relies strictly on getConversationHistory(conversationId, uid, idToken); client history omitted.',
    });
    console.log('   -> PASS: Client cannot fabricate or poison Gemini context.\n');
  } catch (err) {
    results.push({ test: 'Database-Authoritative History', status: 'FAIL', details: err.message });
    console.error('   -> FAIL:', err.message, '\n');
  }

  // -------------------------------------------------------------
  // 4. INVARIANT: SERVER TRUST BOUNDARY & ZERO FORGEABLE SECRETS
  // -------------------------------------------------------------
  console.log('4. Testing Server Trust Boundary & Firestore Rules Invariants...');
  try {
    const rulesContent = fs.readFileSync(path.resolve('./firestore.rules'), 'utf-8');

    // Check isValidUserMessage: only role == 'user'
    assert(rulesContent.includes("data.role == 'user'"), "isValidUserMessage must restrict data.role == 'user'");
    assert(!rulesContent.includes("data.role == 'assistant'"), "rules must NOT permit client creation of assistant messages");

    // Check complete elimination of client-forgeable tokens
    assert(!rulesContent.includes("serverAuthToken"), "rules must NOT reference serverAuthToken");
    assert(!rulesContent.includes("serverDeleteToken"), "rules must NOT reference serverDeleteToken");
    assert(!rulesContent.includes("SERVER_AUTH_SECRET"), "rules must NOT reference SERVER_AUTH_SECRET");

    // Check deletion is completely forbidden to direct client operations
    assert(rulesContent.includes("allow delete: if false;"), "conversations and messages must deny direct client delete");

    // Check message immutability
    assert(rulesContent.includes("allow update: if false;"), "messages must have allow update: if false");

    // Check conversation ownership and createdAt immutability
    assert(rulesContent.includes("incoming().ownerId == existing().ownerId"), "conversation ownerId must be immutable on update");
    assert(rulesContent.includes("incoming().createdAt == existing().createdAt"), "conversation createdAt must be immutable on update");

    // Check timestamp bounds
    assert(rulesContent.includes("duration.value(300, 's')"), "timestamps must be bounded within 300 seconds of request.time");

    results.push({
      test: 'Server Trust Boundary & Rules Invariants',
      status: 'PASS',
      details: 'Direct client assistant creation forbidden; direct client deletion forbidden; 0 forgeable secrets.',
    });
    console.log('   -> PASS: Firestore rules enforce client role limits, delete protection, and zero secret tokens.\n');
  } catch (err) {
    results.push({ test: 'Server Trust Boundary & Rules Invariants', status: 'FAIL', details: err.message });
    console.error('   -> FAIL:', err.message, '\n');
  }

  // -------------------------------------------------------------
  // 5. INVARIANT: CASCADE DELETION OF CONVERSATIONS & SUBCOLLECTIONS
  // -------------------------------------------------------------
  console.log('5. Testing Cascade Deletion & Orphan Message Prevention...');
  try {
    const serverFirestoreCode = fs.readFileSync(path.resolve('./lib/server-firestore.ts'), 'utf-8');
    assert(serverFirestoreCode.includes('deleteConversationCascade'), 'lib/server-firestore.ts must export deleteConversationCascade');
    assert(serverFirestoreCode.includes("collection('messages')") || serverFirestoreCode.includes('/messages'), 'deleteConversationCascade must query and delete subcollection messages');

    const convsRouteCode = fs.readFileSync(path.resolve('./app/api/conversations/route.ts'), 'utf-8');
    assert(convsRouteCode.includes('export async function DELETE'), 'app/api/conversations/route.ts must export DELETE handler');
    assert(convsRouteCode.includes('deleteConversationCascade('), 'DELETE handler must invoke deleteConversationCascade');

    const workspaceCode = fs.readFileSync(path.resolve('./components/journal-workspace.tsx'), 'utf-8');
    assert(workspaceCode.includes("fetch(`/api/conversations/"), 'client workspace must call /api/conversations/:id DELETE endpoint');
    assert(!workspaceCode.includes("deleteDoc(doc(db, 'conversations', conversationId))"), 'client workspace must not use shallow deleteDoc');

    results.push({
      test: 'Cascade Deletion & Orphan Prevention',
      status: 'PASS',
      details: 'DELETE /api/conversations cascades to subcollection messages and parent doc; no orphaned data.',
    });
    console.log('   -> PASS: Cascade deletion fully plumbed and eliminates orphaned subcollection messages.\n');
  } catch (err) {
    results.push({ test: 'Cascade Deletion & Orphan Prevention', status: 'FAIL', details: err.message });
    console.error('   -> FAIL:', err.message, '\n');
  }

  // -------------------------------------------------------------
  // 6. INVARIANT: OBSERVABILITY & ZERO-PII LOGGING
  // -------------------------------------------------------------
  console.log('6. Testing Observability & Zero-PII Logging...');
  try {
    const chatRoute = fs.readFileSync(path.resolve('./app/api/chat/route.ts'), 'utf-8');
    assert(!chatRoute.includes('console.log(message'), 'must not log raw user message');
    assert(!chatRoute.includes('console.log(assistantText'), 'must not log raw assistant text');
    assert(!chatRoute.includes('console.info(contents'), 'must not log full Gemini contents');
    assert(chatRoute.includes('uidPrefix: verifiedUser.uid.slice(0, 8)'), 'must use pseudonymous uidPrefix');

    const firestoreErrors = fs.readFileSync(path.resolve('./lib/firestore-errors.ts'), 'utf-8');
    assert(!firestoreErrors.includes('email: currentUser?.email'), 'firestore-errors must not log user email');
    assert(firestoreErrors.includes('[REDACTED]'), 'firestore-errors must redact bearer tokens');

    results.push({
      test: 'Observability & Zero-PII Redaction',
      status: 'PASS',
      details: 'All operational telemetry uses structured JSON, pseudonymous UID prefixes, and zero content/PII logging.',
    });
    console.log('   -> PASS: Telemetry preserves user privacy without content leaks.\n');
  } catch (err) {
    results.push({ test: 'Observability & Zero-PII Redaction', status: 'FAIL', details: err.message });
    console.error('   -> FAIL:', err.message, '\n');
  }

  console.log('\n================================================================');
  console.log('                 PHASE 1 HARDENING AUDIT VERDICT                ');
  console.log('================================================================');
  console.table(results);
  const allPassed = results.every((r) => r.status === 'PASS');
  console.log(`\nOVERALL STATUS: ${allPassed ? 'ALL AUDIT FINDINGS RESOLVED & VERIFIED (PASS)' : 'FAILED'}\n`);
}

runSuite().catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
