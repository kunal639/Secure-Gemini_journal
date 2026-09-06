import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  uidPrefix?: string;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth.currentUser;
  const rawMessage = error instanceof Error ? error.message : String(error);

  const errInfo: FirestoreErrorInfo = {
    error: rawMessage.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]'),
    operationType,
    path,
    uidPrefix: currentUser?.uid ? currentUser.uid.slice(0, 8) : undefined,
  };

  // Structured logging with zero-PII
  console.error(JSON.stringify({
    event: 'firestore_client_error',
    operation: errInfo.operationType,
    path: errInfo.path,
    uidPrefix: errInfo.uidPrefix,
    isPermissionDenied: rawMessage.toLowerCase().includes('permission-denied'),
  }));

  if (rawMessage.toLowerCase().includes('permission-denied') || rawMessage.includes('403')) {
    throw new Error('Permission denied: You do not have authorization to perform this operation.');
  }

  throw new Error('A database error occurred while processing your journal. Please try again.');
}
