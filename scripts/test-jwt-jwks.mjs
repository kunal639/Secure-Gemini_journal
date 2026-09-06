import { generateKeyPair, SignJWT } from 'jose';
import { verifyRequestAuth } from '../lib/server-auth.ts';

async function testCustomRs256() {
  console.log('Testing custom RS256 key pair verification...');
  const { privateKey } = await generateKeyPair('RS256');
  const customJwt = await new SignJWT({
    sub: 'attacker_123',
    email: 'attacker@example.com',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer('https://securetoken.google.com/smart-spark-466602-p8')
    .setAudience('smart-spark-466602-p8')
    .setExpirationTime('2h')
    .sign(privateKey);

  try {
    await verifyRequestAuth(`Bearer ${customJwt}`);
    console.error('FAIL: Custom RS256 token was accepted!');
  } catch (err) {
    console.log('PASS: Custom RS256 token was rejected:', err.message);
  }
}

testCustomRs256().catch(console.error);
