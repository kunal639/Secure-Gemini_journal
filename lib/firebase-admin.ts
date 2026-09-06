import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

/**
 * Firebase Admin SDK Server-Side Instance
 * 
 * Target:
 * - Project: smart-spark-466602-p8
 * - Database: ai-studio-personalgeminijo-c1501a01-8a5e-4c62-8b3f-364bd7e908b8
 * 
 * Security Boundary:
 * - NEVER exposed to the browser.
 * - Uses platform ADC or server-side service account credentials.
 * - Server code must explicitly enforce ownership on every adminDb operation.
 */

let adminApp: ReturnType<typeof initializeApp>;

if (getApps().length > 0) {
  adminApp = getApps()[0];
} else {
  let credential = applicationDefault();

  // Support server-side single-line base64-encoded service account secret
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      credential = cert(parsed);
    } catch {
      // Retain applicationDefault() fallback without logging sensitive data
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = cert(parsed);
    } catch {
      // Retain applicationDefault()
    }
  }

  adminApp = initializeApp({
    credential,
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
export { adminApp };
