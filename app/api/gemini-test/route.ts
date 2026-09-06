import { getGeminiClient } from '@/lib/gemini-client';

export async function GET() {
  try {
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Reply with exactly: GEMINI_TEST_OK',
    });

    return Response.json({
      ok: true,
      text: response.text,
    });
  } catch (error) {
    console.error('Gemini test failed:', error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}