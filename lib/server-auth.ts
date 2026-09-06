import { jwtVerify, createRemoteJWKSet } from 'jose';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const MAX_HEADER_LENGTH = 4096;
const JWT_PART_REGEX = /^[a-zA-Z0-9_-]+$/;

export interface VerifiedAuthUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

export class AuthenticationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
  }
}

/**
 * Validates and verifies a Firebase ID token from the Authorization header.
 * 
 * Performs early header & structure validation to prevent pre-auth cryptographic abuse:
 * 1. Validates header presence and enforces a strict max length (4096 chars).
 * 2. Enforces "Bearer <token>" schema.
 * 3. Verifies 3-part base64url structure before invoking remote JWKS or crypto verification.
 * 4. Derives user identity strictly from verified JWT payload (`sub`).
 */
export async function verifyRequestAuth(authHeader: string | null): Promise<VerifiedAuthUser> {
  if (!authHeader) {
    throw new AuthenticationError('Missing Authorization header');
  }

  if (authHeader.length > MAX_HEADER_LENGTH) {
    throw new AuthenticationError('Authorization header exceeds maximum allowable size');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Malformed Authorization header. Format must be "Bearer <token>"');
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new AuthenticationError('Missing ID token in Authorization header');
  }

  // Early JWT structure check (header.payload.signature)
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts.every((part) => part.length > 0 && JWT_PART_REGEX.test(part))) {
    throw new AuthenticationError('Malformed JWT token structure');
  }

  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      audience: firebaseConfig.projectId,
    });

    const uid = payload.sub;
    if (!uid || typeof uid !== 'string' || uid.length > 128) {
      throw new AuthenticationError('Invalid user subject identifier in token payload');
    }

    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: Boolean(payload.email_verified),
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Invalid credential';
    throw new AuthenticationError(`Token verification failed: ${message}`);
  }
}
