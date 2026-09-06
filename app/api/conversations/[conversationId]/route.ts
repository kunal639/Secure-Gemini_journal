import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, AuthenticationError } from '@/lib/server-auth';
import { checkPreAuthRateLimit, checkRateLimit } from '@/lib/rate-limiter';
import { deleteConversationCascade, authorizeConversation } from '@/lib/server-firestore';

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

/**
 * DELETE /api/conversations/:conversationId
 * Server-authoritative cascade deletion of a conversation and all its subcollection messages.
 * 
 * Trust boundary:
 * - Client sends ONLY conversationId via the URL path.
 * - Authenticated UID is strictly derived from verified Firebase ID token.
 * - Server verifies conversation ownership before performing deletion.
 * - Parent conversation is deleted ONLY IF all message deletions succeed.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  const requestId = crypto.randomUUID();

  // 1. Pre-auth rate limit check
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown_ip';
  const preAuthLimit = checkPreAuthRateLimit(clientIp);
  if (!preAuthLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  try {
    // 2. Authenticate request and derive UID from verified credential
    const authHeader = req.headers.get('authorization');
    const verifiedUser = await verifyRequestAuth(authHeader);
    const idToken = authHeader!.trim().split(' ')[1];

    // 3. Post-auth rate limit check by authenticated UID
    const userLimit = checkRateLimit(verifiedUser.uid);
    if (!userLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment.' },
        { status: 429 }
      );
    }

    // 4. Extract conversationId from route params
    const { conversationId } = await context.params;

    if (!conversationId || typeof conversationId !== 'string' || !ID_REGEX.test(conversationId)) {
      return NextResponse.json(
        { error: 'Invalid or missing conversationId' },
        { status: 400 }
      );
    }

    // 5. Authorize ownership before deleting
    const existing = await authorizeConversation(conversationId, verifiedUser.uid, idToken);
    if (!existing) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // 6. True cascade deletion (deletes all subcollection messages first, then parent conversation)
    const result = await deleteConversationCascade(conversationId, verifiedUser.uid, idToken);

    console.info(JSON.stringify({
      event: 'conversation_cascade_deleted',
      requestId,
      uidPrefix: verifiedUser.uid.slice(0, 8),
      conversationId: conversationId.slice(0, 16),
      deletedMessagesCount: result.deletedMessagesCount,
    }));

    return NextResponse.json({
      success: true,
      conversationId,
      deletedMessagesCount: result.deletedMessagesCount,
    });
  } catch (error: any) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error.message?.includes('FORBIDDEN')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error(JSON.stringify({
      event: 'conversation_deletion_failed',
      requestId,
      error: error?.message,
    }));
    return NextResponse.json(
      { error: error?.message || 'Failed to delete conversation and subcollection messages' },
      { status: 500 }
    );
  }
}
