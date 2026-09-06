import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function runLiveAuditProbes() {
  console.log('=== RUNNING LIVE AUDIT PROBES AGAINST APPLICATION & FIRESTORE ===\n');

  const BASE_URL = 'http://localhost:3000';
  const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

  // -------------------------------------------------------------
  // PROBE 1: Unauthenticated request to /api/chat
  // -------------------------------------------------------------
  console.log('[PROBE 1] Unauthenticated request to /api/chat');
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Response:`, data);
  } catch (err) {
    console.error('Probe 1 Error:', err.message);
  }

  // -------------------------------------------------------------
  // PROBE 2: Malformed Authorization schemes to /api/chat
  // -------------------------------------------------------------
  console.log('\n[PROBE 2] Malformed Auth schemes');
  for (const authHeader of ['Basic dXNlcjpwYXNz', 'Token 12345', 'Bearer', 'Bearer   ']) {
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ message: 'Hello' }),
      });
      const data = await res.json();
      console.log(`Header "${authHeader}" -> Status: ${res.status}, Error: ${data.error}`);
    } catch (err) {
      console.error(`Header "${authHeader}" failed:`, err.message);
    }
  }

  // -------------------------------------------------------------
  // PROBE 3: Forged JWT to /api/chat
  // -------------------------------------------------------------
  console.log('\n[PROBE 3] Forged JWT to /api/chat');
  const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlcl8xMjM0NSIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9zbWFydC1zcGFyay00NjY2MDItcDgiLCJhdWQiOiJzbWFydC1zcGFyay00NjY2MDItcDgifQ.fake_signature_data';
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fakeJwt}`,
      },
      body: JSON.stringify({ message: 'Hello', conversationId: 'page_test_1' }),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Error: ${data.error}`);
  } catch (err) {
    console.error('Probe 3 Error:', err.message);
  }

  // -------------------------------------------------------------
  // PROBE 4: Direct Unauthenticated Firestore REST probe
  // -------------------------------------------------------------
  console.log('\n[PROBE 4] Direct Unauthenticated Firestore REST probe');
  try {
    const res = await fetch(`${FIRESTORE_BASE}/conversations`);
    const data = await res.json();
    console.log(`Status: ${res.status}, Body:`, JSON.stringify(data).slice(0, 150));
  } catch (err) {
    console.error('Probe 4 Error:', err.message);
  }

  // -------------------------------------------------------------
  // PROBE 5: Direct Firestore REST probe with fake token
  // -------------------------------------------------------------
  console.log('\n[PROBE 5] Direct Firestore REST probe with fake token');
  try {
    const res = await fetch(`${FIRESTORE_BASE}/conversations`, {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Body:`, JSON.stringify(data).slice(0, 150));
  } catch (err) {
    console.error('Probe 5 Error:', err.message);
  }

  // -------------------------------------------------------------
  // PROBE 6: Direct Anonymous write attempt to Firestore REST
  // -------------------------------------------------------------
  console.log('\n[PROBE 6] Direct Anonymous write attempt to Firestore REST');
  try {
    const res = await fetch(`${FIRESTORE_BASE}/conversations?documentId=hacked_page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ownerId: { stringValue: 'anonymous_attacker' },
          title: { stringValue: 'Injected Page' },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Body:`, JSON.stringify(data).slice(0, 150));
  } catch (err) {
    console.error('Probe 6 Error:', err.message);
  }

  // -------------------------------------------------------------
  // PROBE 7: Client Bundle / Environment Secret Leak Audit
  // -------------------------------------------------------------
  console.log('\n[PROBE 7] Checking client environment variables for secret leaks');
  const leakedClientKeys = Object.keys(process.env).filter(
    (key) => key.startsWith('NEXT_PUBLIC_') && (key.includes('KEY') || key.includes('SECRET'))
  );
  console.log('NEXT_PUBLIC_ sensitive variables:', leakedClientKeys);

  console.log('\n=== AUDIT PROBES FINISHED ===');
}

runLiveAuditProbes().catch((err) => {
  console.error('Fatal probe error:', err);
});
