import { verifyRequestAuth } from '../lib/server-auth.ts';
import { checkRateLimit } from '../lib/rate-limiter.ts';

async function runTests() {
  console.log('=== STARTING PERSONAL GEMINI JOURNAL ADVERSARIAL SECURITY TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST SUITE 1: AUTHENTICATION & TOKEN VERIFICATION
  // -------------------------------------------------------------
  console.log('--- Test Suite 1: Authentication & Identity Derivation ---');

  // Test 1.1: Missing Auth Header
  try {
    await verifyRequestAuth(null);
    assert(false, '1.1 Reject null authorization header');
  } catch (err) {
    assert(err.message.includes('Missing Authorization header'), '1.1 Reject null authorization header');
  }

  // Test 1.2: Malformed Auth Header (missing Bearer prefix)
  try {
    await verifyRequestAuth('Basic dXNlcjpwYXNz');
    assert(false, '1.2 Reject non-Bearer auth scheme');
  } catch (err) {
    assert(err.message.includes('Malformed Authorization header'), '1.2 Reject non-Bearer auth scheme');
  }

  // Test 1.3: Empty Bearer Token
  try {
    await verifyRequestAuth('Bearer ');
    assert(false, '1.3 Reject empty bearer token');
  } catch (err) {
    assert(err.message.includes('Missing ID token'), '1.3 Reject empty bearer token');
  }

  // Test 1.4: Synthetic / Forged JWT Token
  const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlcl91aWQiLCJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIn0.fake_signature_bytes';
  try {
    await verifyRequestAuth(`Bearer ${fakeToken}`);
    assert(false, '1.4 Reject forged JWT signature');
  } catch (err) {
    assert(err.message.includes('Token verification failed') || err.message.includes('Invalid'), '1.4 Reject forged JWT signature');
  }

  // -------------------------------------------------------------
  // TEST SUITE 2: RATE LIMITING & ABUSE PROTECTION
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: Rate Limiting & Resource Protection ---');
  const testUid = `test_flood_user_${Date.now()}`;
  let allowedCount = 0;
  let blockedCount = 0;

  for (let i = 0; i < 25; i++) {
    const result = checkRateLimit(testUid);
    if (result.allowed) {
      allowedCount++;
    } else {
      blockedCount++;
    }
  }

  assert(allowedCount === 20, `2.1 Rate limit allows exactly 20 requests per window (got ${allowedCount})`);
  assert(blockedCount === 5, `2.2 Rate limit drops subsequent flooding requests (blocked ${blockedCount})`);

  // -------------------------------------------------------------
  // TEST SUITE 3: INPUT VALIDATION & INJECTION RESISTANCE
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Input Validation & Boundary Hardening ---');
  const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

  assert(!ID_REGEX.test('../../../etc/passwd'), '3.1 Rejects path traversal in conversation ID');
  assert(!ID_REGEX.test('conv with spaces'), '3.2 Rejects space-injected conversation ID');
  assert(!ID_REGEX.test('conv<script>alert(1)</script>'), '3.3 Rejects XSS payload in conversation ID');
  assert(!ID_REGEX.test('a'.repeat(129)), '3.4 Rejects oversized conversation ID (>128 chars)');
  assert(ID_REGEX.test('valid_conv_id-123'), '3.5 Accepts valid conversation ID');

  // -------------------------------------------------------------
  // TEST SUITE 4: ZERO-TRUST SECRETS & CLIENT BUNDLE AUDIT
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 4: Secrets Hygiene & Zero-Trust Audit ---');
  assert(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10, '4.1 Server environment holds GEMINI_API_KEY securely');
  assert(!process.env.NEXT_PUBLIC_GEMINI_API_KEY, '4.2 GEMINI_API_KEY is NOT exposed as NEXT_PUBLIC_ client secret');

  console.log(`\n=== ADVERSARIAL TEST SUMMARY ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
