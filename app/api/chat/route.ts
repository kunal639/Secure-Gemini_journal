import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyRequestAuth, AuthenticationError } from '@/lib/server-auth';
import { checkPreAuthRateLimit, checkRateLimit } from '@/lib/rate-limiter';
import {
  authorizeConversation,
  createConversation,
  updateConversationTimestamp,
  persistMessage,
  getConversationHistory,
} from '@/lib/server-firestore';
import { evaluateSafetyGate, FIXED_SAFETY_RESPONSE } from '@/lib/safety-gate';

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB
const MAX_HISTORY_MESSAGES = 20;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // 1. Pre-auth Abuse Protection: IP-based rate limiting before cryptographic ops
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown_ip';
  const preAuthLimit = checkPreAuthRateLimit(clientIp);
  if (!preAuthLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests from this IP. Please try again in a few moments.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(preAuthLimit.resetInSeconds),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // 2. Early Payload Size Bound Check (protect against memory flooding)
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return NextResponse.json(
      { error: 'Payload Too Large. Maximum allowed size is 64KB.' },
      { status: 413 }
    );
  }

  try {
    // 3. Authenticate Request & Derive User Identity
    const authHeader = req.headers.get('authorization');
    const verifiedUser = await verifyRequestAuth(authHeader);
    const idToken = authHeader!.trim().split(' ')[1];

    // 4. Abuse Protection / Rate Limiting per Authenticated UID
    const userRateLimit = checkRateLimit(verifiedUser.uid);
    if (!userRateLimit.allowed) {
      console.warn(JSON.stringify({
        event: 'rate_limit_exceeded',
        requestId,
        uidPrefix: verifiedUser.uid.slice(0, 8),
        resetInSeconds: userRateLimit.resetInSeconds,
      }));
      return NextResponse.json(
        { error: 'Too many requests. Please slow down and reflect for a moment before writing again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(userRateLimit.resetInSeconds),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // 5. Parse & Validate Request Body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const { conversationId, message, userMessageId } = body;

    if (!conversationId || typeof conversationId !== 'string' || !ID_REGEX.test(conversationId)) {
      return NextResponse.json(
        { error: 'Invalid or missing conversationId. Must match ^[a-zA-Z0-9_-]{1,128}$' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message exceeds maximum allowable length of ${MAX_MESSAGE_LENGTH} characters` },
        { status: 400 }
      );
    }

    const cleanUserMessageId =
      userMessageId && typeof userMessageId === 'string' && ID_REGEX.test(userMessageId)
        ? userMessageId
        : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 6. Authorize Conversation Ownership (Prevent IDOR)
    const existingConversation = await authorizeConversation(conversationId, verifiedUser.uid, idToken);
    const isNewConversation = !existingConversation;

    if (isNewConversation) {
      const generatedTitle = message.trim().split('\n')[0].slice(0, 50) || 'New Journal Entry';
      await createConversation(conversationId, verifiedUser.uid, generatedTitle, idToken);
    }

    // 7. GLOBAL SAFETY GATE (Pre-Gemini & Pre-Context Evaluation)
    // CRITICAL INVARIANT: The Safety Gate MUST execute BEFORE:
    // - Memory / history retrieval (getConversationHistory)
    // - External context retrieval
    // - Gemini reflection generation
    // - Future reflection / second-perspective features
    // If triggered, STOP normal pipeline immediately and return fixed response.
    const safetyCheck = evaluateSafetyGate(message);

    if (safetyCheck.isTriggered) {
      // 1. Persist the user's journal entry so their thought is not lost
      await persistMessage(
        conversationId,
        cleanUserMessageId,
        verifiedUser.uid,
        'user',
        message.trim(),
        idToken
      );

      // 2. Persist the fixed, human-reviewed safety response (Zero-LLM generated)
      const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await persistMessage(
        conversationId,
        assistantMessageId,
        verifiedUser.uid,
        'assistant',
        FIXED_SAFETY_RESPONSE,
        idToken
      );

      // 3. Update conversation timestamp
      await updateConversationTimestamp(conversationId, idToken);

      // 4. Structured Operational Logging (Zero-PII: ZERO crisis text or keywords in logs)
      const latencyMs = Date.now() - startTime;
      console.info(JSON.stringify({
        event: 'safety_gate_triggered',
        requestId,
        uidPrefix: verifiedUser.uid.slice(0, 8),
        conversationId: conversationId.slice(0, 16),
        triggerCategory: safetyCheck.triggerCategory,
        latencyMs,
        status: 200,
      }));

      // 5. Return fixed safe response immediately. Gemini and memory retrieval are completely skipped.
      return NextResponse.json({
        success: true,
        conversationId,
        userMessageId: cleanUserMessageId,
        assistantMessage: {
          id: assistantMessageId,
          role: 'assistant',
          content: FIXED_SAFETY_RESPONSE,
          createdAt: new Date().toISOString(),
        },
        safetyGateTriggered: true,
      });
    }

    // 8. FIX 1: Database-Authoritative Context Retrieval (Executed ONLY for non-triggered entries)
    // History is NEVER trusted from client. It is retrieved directly from Firestore.
    let storedHistory: any[] = [];
    if (!isNewConversation) {
      storedHistory = await getConversationHistory(
        conversationId,
        verifiedUser.uid,
        idToken,
        MAX_HISTORY_MESSAGES
      );
    }

    // Map stored database messages to Gemini contents
    const contents: any[] = storedHistory.map((item) => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }],
    }));

    // Append the new verified user turn
    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    });

    // 9. Persist the User's Journal Entry to Firestore
    await persistMessage(
      conversationId,
      cleanUserMessageId,
      verifiedUser.uid,
      'user',
      message.trim(),
      idToken
    );

    // 10. Invoke Gemini Server-Side via @google/genai
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(JSON.stringify({
        event: 'gemini_config_error',
        requestId,
        error: 'Missing GEMINI_API_KEY in environment',
      }));
      return NextResponse.json(
        { error: 'AI journaling service is temporarily misconfigured. Please try again shortly.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `You are a thoughtful, contemplative personal journal companion in the Personal Gemini Journal.
Your role is to help the user reflect honestly on their thoughts, emotions, patterns, decisions, and daily life.
Tone: Warm, empathetic, grounded, contemplative, and concise (typically 2-4 sentences or a short paragraph).
Guidelines:
- You are not a generic customer-service chatbot, task assistant, or sycophantic cheerleader.
- Do not lecture, preach, patronize, or provide repetitive boilerplate disclaimers.
- Encourage genuine self-inquiry with an occasional open-ended, gentle question.
- Treat every entry as a personal reflection.`;

    let assistantText = '';
    try {
      // First attempt with primary model gemini-3.8-flash
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });
      assistantText = response.text || '';
    } catch (primaryError: any) {
      // Automatic fallback for 503 high-demand spike
      console.warn(JSON.stringify({
        event: 'gemini_primary_fallback',
        requestId,
        model: 'gemini-3.8-flash',
        status: primaryError?.status,
      }));

      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });
      assistantText = fallbackResponse.text || '';
    }

    const cleanedAssistantText = assistantText.trim();
    if (!cleanedAssistantText) {
      throw new Error('Gemini returned an empty response.');
    }

    // 10. FIX 2: Persist Assistant Response via Server-Authoritative Path
    const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await persistMessage(
      conversationId,
      assistantMessageId,
      verifiedUser.uid,
      'assistant',
      cleanedAssistantText,
      idToken
    );

    // Update conversation timestamp
    await updateConversationTimestamp(conversationId, idToken);

    // 11. Structured Operational Logging (Zero-PII, no journal content logged)
    const latencyMs = Date.now() - startTime;
    console.info(JSON.stringify({
      event: 'chat_turn_completed',
      requestId,
      uidPrefix: verifiedUser.uid.slice(0, 8),
      conversationId: conversationId.slice(0, 16),
      isNewConversation,
      historyCount: storedHistory.length,
      responseChars: cleanedAssistantText.length,
      latencyMs,
      status: 200,
    }));

    return NextResponse.json({
      success: true,
      conversationId,
      userMessageId: cleanUserMessageId,
      assistantMessage: {
        id: assistantMessageId,
        role: 'assistant',
        content: cleanedAssistantText,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const isAuthError = error instanceof AuthenticationError || error.message?.includes('UNAUTHORIZED');
    const isForbidden = error.message?.includes('FORBIDDEN');

    console.error(JSON.stringify({
      event: 'chat_turn_failed',
      requestId,
      errorName: error?.name,
      errorMessage: error?.message,
      isAuthError,
      isForbidden,
      latencyMs,
    }));

    if (isAuthError) {
      return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: 401 });
    }

    if (isForbidden) {
      return NextResponse.json({ error: error.message || 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while processing your journal entry. Please try again.' },
      { status: 500 }
    );
  }
}
