import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.ts';

export interface FirestoreConversation {
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreMessage {
  id: string;
  conversationId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Verifies that the conversation exists and belongs to the authenticated UID.
 * - If the conversation does not exist, returns null so the caller can initialize it.
 * - If the conversation belongs to a different UID, throws an authorization error.
 * - Enforces deterministic ownership boundary on Admin SDK queries.
 */
export async function authorizeConversation(
  conversationId: string,
  verifiedUid: string
): Promise<FirestoreConversation | null> {
  if (!conversationId || !ID_REGEX.test(conversationId)) {
    throw new Error('INVALID_ID: Conversation ID format is invalid.');
  }

  const docRef = adminDb.collection('conversations').doc(conversationId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  const ownerId = data?.ownerId;

  if (ownerId !== verifiedUid) {
    throw new Error('FORBIDDEN: IDOR violation. Conversation does not belong to the authenticated user.');
  }

  const createdAt = data?.createdAt?.toDate
    ? data.createdAt.toDate().toISOString()
    : typeof data?.createdAt === 'string'
    ? data.createdAt
    : new Date().toISOString();

  const updatedAt = data?.updatedAt?.toDate
    ? data.updatedAt.toDate().toISOString()
    : typeof data?.updatedAt === 'string'
    ? data.updatedAt
    : new Date().toISOString();

  return {
    id: conversationId,
    ownerId,
    title: data?.title || 'Untitled Page',
    createdAt,
    updatedAt,
  };
}

/**
 * Creates or initializes a new conversation owned by the authenticated UID.
 * Derives ownerId strictly from verifiedUid.
 */
export async function createConversation(
  conversationId: string,
  verifiedUid: string,
  title: string
): Promise<FirestoreConversation> {
  if (!conversationId || !ID_REGEX.test(conversationId)) {
    throw new Error('INVALID_ID: Conversation ID format is invalid.');
  }

  const convRef = adminDb.collection('conversations').doc(conversationId);
  const sanitizedTitle = (title || 'New Journal Entry').slice(0, 120);

  await convRef.set({
    ownerId: verifiedUid,
    title: sanitizedTitle,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const nowIso = new Date().toISOString();
  return {
    id: conversationId,
    ownerId: verifiedUid,
    title: sanitizedTitle,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Updates a conversation's title and updatedAt timestamp.
 * Enforces verifiedUid ownership before updating.
 */
export async function updateConversationTimestamp(
  conversationId: string,
  verifiedUid: string,
  title?: string
): Promise<void> {
  if (!conversationId || !ID_REGEX.test(conversationId)) {
    throw new Error('INVALID_ID: Conversation ID format is invalid.');
  }

  const convRef = adminDb.collection('conversations').doc(conversationId);
  const doc = await convRef.get();

  if (!doc.exists) {
    return;
  }

  if (doc.data()?.ownerId !== verifiedUid) {
    throw new Error('FORBIDDEN: IDOR violation. Conversation does not belong to the authenticated user.');
  }

  const updateData: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (title) {
    updateData.title = title.slice(0, 120);
  }

  await convRef.update(updateData);
}

/**
 * Retrieves historical messages for a conversation directly from Firestore.
 * Verifies ownership and strictly enforces boundaries (only messages matching verifiedUid & conversationId).
 * Returns messages sorted chronologically ascending, bounded by limit.
 */
export async function getConversationHistory(
  conversationId: string,
  verifiedUid: string,
  limit: number = 20
): Promise<FirestoreMessage[]> {
  const conv = await authorizeConversation(conversationId, verifiedUid);
  if (!conv) {
    return [];
  }

  const snapshot = await adminDb
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(limit)
    .get();

  const messages: FirestoreMessage[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const docOwnerId = data.ownerId;
    const docConvId = data.conversationId;
    const docRole = data.role;

    if (docOwnerId !== verifiedUid || docConvId !== conversationId) {
      return;
    }
    if (docRole !== 'user' && docRole !== 'assistant') {
      return;
    }

    const createdAt = data.createdAt?.toDate
      ? data.createdAt.toDate().toISOString()
      : typeof data.createdAt === 'string'
      ? data.createdAt
      : new Date().toISOString();

    messages.push({
      id: doc.id,
      conversationId,
      ownerId: docOwnerId,
      role: docRole,
      content: data.content || '',
      createdAt,
    });
  });

  return messages;
}

/**
 * Persists a message to the conversation subcollection under the authenticated user's ownership.
 * Allows server to authoritatively persist role 'user' or role 'assistant'.
 * Generates unique message IDs using crypto.randomUUID() when not provided.
 */
export async function persistMessage(
  conversationId: string,
  verifiedUid: string,
  role: 'user' | 'assistant',
  content: string,
  messageId?: string
): Promise<FirestoreMessage> {
  if (!conversationId || !ID_REGEX.test(conversationId)) {
    throw new Error('INVALID_ID: Conversation ID format is invalid.');
  }

  if (role !== 'user' && role !== 'assistant') {
    throw new Error('INVALID_ROLE: Role must be user or assistant.');
  }

  const conv = await authorizeConversation(conversationId, verifiedUid);
  if (!conv) {
    throw new Error('NOT_FOUND: Cannot persist message to nonexistent conversation.');
  }

  const cleanMessageId =
    messageId && ID_REGEX.test(messageId)
      ? messageId
      : `msg_${crypto.randomUUID()}`;

  const msgRef = adminDb
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .doc(cleanMessageId);

  await msgRef.set({
    ownerId: verifiedUid,
    conversationId,
    role,
    content: content.slice(0, 10000),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    id: cleanMessageId,
    conversationId,
    ownerId: verifiedUid,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Performs a true cascade deletion of a conversation and all its subcollection messages.
 * 
 * Invariant: Never delete the parent conversation if any child deletion fails.
 * Deletes messages in batches, then deletes the parent document.
 */
export async function deleteConversationCascade(
  conversationId: string,
  verifiedUid: string
): Promise<{ deletedMessagesCount: number }> {
  // 1. Verify authorization and ownership first
  const conv = await authorizeConversation(conversationId, verifiedUid);
  if (!conv) {
    return { deletedMessagesCount: 0 };
  }

  const convRef = adminDb.collection('conversations').doc(conversationId);
  const messagesRef = convRef.collection('messages');
  let deletedCount = 0;

  // 2. Batch-delete all subcollection messages
  while (true) {
    const snapshot = await messagesRef.limit(100).get();
    if (snapshot.empty) break;

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deletedCount += snapshot.size;
  }

  // 3. Delete parent conversation document only after messages are verified deleted
  await convRef.delete();
  return { deletedMessagesCount: deletedCount };
}
