import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

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

/**
 * Verifies that the conversation exists and belongs to the authenticated UID.
 * If the conversation does not exist, returns null so the caller can initialize it.
 * If the conversation belongs to a different UID, throws an authorization error.
 */
export async function authorizeConversation(
  conversationId: string,
  uid: string,
  idToken: string
): Promise<FirestoreConversation | null> {
  const url = `${FIRESTORE_BASE_URL}/conversations/${encodeURIComponent(conversationId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
  const errorBody = await response.text();

  console.error('[Firestore REST] request failed', {
    status: response.status,
    statusText: response.statusText,
    url,
    body: errorBody,
  });

  if (response.status === 403 || response.status === 401) {
    throw new Error('FORBIDDEN: You do not have permission to access this journal page.');
  }

  throw new Error(`Firestore query failed with status ${response.status}`);
}

  const doc = await response.json();
  const ownerId = doc.fields?.ownerId?.stringValue;

  if (ownerId !== uid) {
    throw new Error('FORBIDDEN: IDOR violation. Conversation does not belong to the authenticated user.');
  }

  return {
    id: conversationId,
    ownerId,
    title: doc.fields?.title?.stringValue || 'Untitled Page',
    createdAt: doc.fields?.createdAt?.timestampValue || new Date().toISOString(),
    updatedAt: doc.fields?.updatedAt?.timestampValue || new Date().toISOString(),
  };
}

/**
 * Creates or initializes a new conversation owned by the authenticated UID.
 */
export async function createConversation(
  conversationId: string,
  uid: string,
  title: string,
  idToken: string
): Promise<void> {
  const now = new Date().toISOString();
  const url = `${FIRESTORE_BASE_URL}/conversations?documentId=${encodeURIComponent(conversationId)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        ownerId: { stringValue: uid },
        title: { stringValue: title.slice(0, 120) },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
      },
    }),
  });

  if (!response.ok && response.status !== 409) {
    const errText = await response.text();
    throw new Error(`Failed to create conversation: ${response.status} ${errText}`);
  }
}

/**
 * Updates a conversation's title and updatedAt timestamp.
 */
export async function updateConversationTimestamp(
  conversationId: string,
  idToken: string,
  title?: string
): Promise<void> {
  const now = new Date().toISOString();
  const queryParams = new URLSearchParams();
  queryParams.append('updateMask.fieldPaths', 'updatedAt');
  if (title) {
    queryParams.append('updateMask.fieldPaths', 'title');
  }

  const url = `${FIRESTORE_BASE_URL}/conversations/${encodeURIComponent(conversationId)}?${queryParams.toString()}`;
  const fields: Record<string, { timestampValue?: string; stringValue?: string }> = {
    updatedAt: { timestampValue: now },
  };
  if (title) {
    fields.title = { stringValue: title.slice(0, 120) };
  }

  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
}

/**
 * Retrieves historical messages for a conversation directly from Firestore.
 * Verifies ownership and strictly enforces boundaries (only messages matching uid & conversationId).
 * Returns messages sorted chronologically ascending, bounded by maxCount.
 */
export async function getConversationHistory(
  conversationId: string,
  uid: string,
  idToken: string,
  maxCount: number = 20
): Promise<FirestoreMessage[]> {
  const url = `${FIRESTORE_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages?pageSize=100`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    if (response.status === 403 || response.status === 401) {
      throw new Error('FORBIDDEN: You do not have permission to view messages for this conversation.');
    }
    throw new Error(`Failed to fetch conversation messages: ${response.status}`);
  }

  const data = await response.json();
  const documents = Array.isArray(data.documents) ? data.documents : [];

  const verifiedMessages: FirestoreMessage[] = [];

  for (const doc of documents) {
    const fields = doc.fields;
    if (!fields) continue;

    const docOwnerId = fields.ownerId?.stringValue;
    const docConvId = fields.conversationId?.stringValue;
    const docRole = fields.role?.stringValue;
    const docContent = fields.content?.stringValue;
    const docCreatedAt = fields.createdAt?.timestampValue;

    // Strict user isolation check
    if (docOwnerId !== uid || docConvId !== conversationId) {
      continue;
    }

    if (docRole !== 'user' && docRole !== 'assistant') {
      continue;
    }

    if (!docContent || typeof docContent !== 'string') {
      continue;
    }

    const pathParts = (doc.name || '').split('/');
    const docId = pathParts[pathParts.length - 1] || `msg_${verifiedMessages.length}`;

    verifiedMessages.push({
      id: docId,
      conversationId: docConvId,
      ownerId: docOwnerId,
      role: docRole,
      content: docContent,
      createdAt: docCreatedAt || new Date().toISOString(),
    });
  }

  // Sort chronologically ascending
  verifiedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Return bounded to maxCount (most recent)
  return verifiedMessages.slice(-maxCount);
}

/**
 * Persists a message to the conversation subcollection under the authenticated user's ownership.
 * Completely eliminates any client-readable or server-stored authorization secret tokens.
 */
export async function persistMessage(
  conversationId: string,
  messageId: string,
  uid: string,
  role: 'user' | 'assistant',
  content: string,
  idToken: string
): Promise<void> {
  const now = new Date().toISOString();
  const url = `${FIRESTORE_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages?documentId=${encodeURIComponent(messageId)}`;

  const fields: Record<string, { stringValue?: string; timestampValue?: string }> = {
    ownerId: { stringValue: uid },
    conversationId: { stringValue: conversationId },
    role: { stringValue: role },
    content: { stringValue: content.slice(0, 10000) },
    createdAt: { timestampValue: now },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok && response.status !== 409) {
    const errText = await response.text();
    throw new Error(`Failed to persist message: ${response.status} ${errText}`);
  }
}

/**
 * Performs a true cascade deletion of a conversation and all its subcollection messages.
 * 
 * Invariant: Never delete the parent conversation if any child deletion fails.
 * Continues deleting messages while nextPageToken exists (no 300-message ceiling).
 * If any message deletion encounters an error, the operation halts and aborts parent
 * deletion to prevent orphaned records, leaving state clean for idempotent retry.
 */
export async function deleteConversationCascade(
  conversationId: string,
  uid: string,
  idToken: string
): Promise<{ deletedMessagesCount: number }> {
  // 1. Verify authorization and ownership first
  const conv = await authorizeConversation(conversationId, uid, idToken);
  if (!conv) {
    return { deletedMessagesCount: 0 };
  }

  // 2. Paginate through all messages and delete them (no 300-message limit)
  let deletedCount = 0;
  let nextPageToken: string | undefined = undefined;

  do {
    const queryParams = new URLSearchParams({ pageSize: '100' });
    if (nextPageToken) {
      queryParams.append('pageToken', nextPageToken);
    }
    const url = `${FIRESTORE_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages?${queryParams.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        break;
      }
      throw new Error(`Failed to list subcollection messages for deletion (status: ${response.status}). Aborting cascade.`);
    }

    const data = await response.json();
    const documents = Array.isArray(data.documents) ? data.documents : [];

    for (const doc of documents) {
      const docName = doc.name;
      if (docName) {
        const delRes = await fetch(`https://firestore.googleapis.com/v1/${docName}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!delRes.ok && delRes.status !== 404) {
          throw new Error(
            `Failed to delete message document during cascade (status: ${delRes.status}). Aborting parent deletion for safety.`
          );
        }
        deletedCount++;
      }
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  // 3. Delete the parent conversation document ONLY AFTER all children have been verified deleted
  const parentUrl = `${FIRESTORE_BASE_URL}/conversations/${encodeURIComponent(conversationId)}`;
  const parentDelRes = await fetch(parentUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!parentDelRes.ok && parentDelRes.status !== 404) {
    throw new Error(`Failed to delete parent conversation document (status: ${parentDelRes.status}).`);
  }

  return { deletedMessagesCount: deletedCount };
}
