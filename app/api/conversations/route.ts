import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, AuthenticationError } from '@/lib/server-auth';
import { checkPreAuthRateLimit, checkRateLimit } from '@/lib/rate-limiter';
import { deleteConversationCascade, authorizeConversation } from '@/lib/server-firestore';

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export async function DELETE(req: NextRequest) {
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
    // 2. Authenticate
    const authHeader = req.headers.get('authorization');
    const verifiedUser = await verifyRequestAuth(authHeader);
    const idToken = authHeader!.trim().split(' ')[1];

    // 3. Rate limit per user
    const userLimit = checkRateLimit(verifiedUser.uid);
    if (!userLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment.' },
        { status: 429 }
      );
    }

    // 4. Extract conversationId from searchParams or body
    const searchParams = req.nextUrl.searchParams;
    let conversationId = searchParams.get('id');

    if (!conversationId) {
      try {
        const body = await req.json();
        conversationId = body.conversationId;
      } catch {
        // query param was empty and body wasn't JSON
      }
    }

    if (!conversationId || typeof conversationId !== 'string' || !ID_REGEX.test(conversationId)) {
      return NextResponse.json(
        { error: 'Invalid or missing conversationId' },
        { status: 400 }
      );
    }

    // 5. Authorize ownership before deleting
    const existing = await authorizeConversation(conversationId, verifiedUser.uid);
    if (!existing) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // 6. FIX 4: True cascade deletion (deletes all subcollection messages and parent conversation)
    const result = await deleteConversationCascade(conversationId, verifiedUser.uid);

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
