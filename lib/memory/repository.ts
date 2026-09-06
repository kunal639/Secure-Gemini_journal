import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import type {
  JournalMemory,
  MemoryCandidate,
} from './types';

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

const MAX_MEMORY_LENGTH = 500;
const MAX_MEMORIES_TO_RETURN = 50;

function validateId(value: string, fieldName: string): void {
  if (!ID_REGEX.test(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
}

function normalizeContent(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MEMORY_LENGTH);
}

function convertTimestamp(
  value: unknown,
): string {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (
      (value as { toDate: () => Date })
        .toDate()
        .toISOString()
    );
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return new Date(0).toISOString();
}

export async function createMemory(
  verifiedUid: string,
  candidate: MemoryCandidate,
  sourceConversationId: string,
  sourceMessageId: string,
): Promise<JournalMemory> {
  validateId(verifiedUid, 'user ID');
  validateId(sourceConversationId, 'conversation ID');
  validateId(sourceMessageId, 'message ID');

  const content = normalizeContent(candidate.content);

  if (!content) {
    throw new Error('Memory content cannot be empty');
  }

  if (
    candidate.type !== 'PATTERN' &&
    candidate.type !== 'PREFERENCE' &&
    candidate.type !== 'GOAL' &&
    candidate.type !== 'EVENT'
  ) {
    throw new Error('Invalid memory type');
  }

  // Verify that the source conversation belongs to the authenticated user.
  const conversationRef = adminDb
    .collection('conversations')
    .doc(sourceConversationId);

  const conversationSnapshot = await conversationRef.get();

  if (!conversationSnapshot.exists) {
    throw new Error('Source conversation not found');
  }

  const conversation = conversationSnapshot.data();

  if (conversation?.ownerId !== verifiedUid) {
    throw new Error('Forbidden source conversation');
  }

  const memoryRef = adminDb.collection('memories').doc();

  const memoryData = {
    ownerId: verifiedUid,
    type: candidate.type,
    content,
    sourceConversationId,
    sourceMessageId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await memoryRef.set(memoryData);

  const snapshot = await memoryRef.get();
  const data = snapshot.data();

  if (!data) {
    throw new Error('Failed to read created memory');
  }

  return {
    id: memoryRef.id,
    ownerId: verifiedUid,
    type: data.type,
    content: data.content,
    sourceConversationId: data.sourceConversationId,
    sourceMessageId: data.sourceMessageId,
    createdAt: convertTimestamp(data.createdAt),
    updatedAt: convertTimestamp(data.updatedAt),
  };
}

export async function getUserMemories(
  verifiedUid: string,
  limit = MAX_MEMORIES_TO_RETURN,
): Promise<JournalMemory[]> {
  validateId(verifiedUid, 'user ID');

  const safeLimit = Math.min(
    Math.max(limit, 1),
    MAX_MEMORIES_TO_RETURN,
  );

  const snapshot = await adminDb
    .collection('memories')
    .where('ownerId', '==', verifiedUid)
    .orderBy('updatedAt', 'desc')
    .limit(safeLimit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ownerId: data.ownerId,
      type: data.type,
      content: data.content,
      sourceConversationId: data.sourceConversationId,
      sourceMessageId: data.sourceMessageId,
      createdAt: convertTimestamp(data.createdAt),
      updatedAt: convertTimestamp(data.updatedAt),
    };
  });
}