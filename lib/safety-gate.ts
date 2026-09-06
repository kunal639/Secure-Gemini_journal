/**
 * Global Safety Gate — Predefined Crisis Detection & Fixed Response
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Must execute BEFORE:
 *    - Memory retrieval (getConversationHistory)
 *    - External context retrieval
 *    - Gemini API invocation
 *    - Reflection or second-perspective features
 * 2. Deterministic: Uses strict regex pattern matching. Never relies on LLMs for safety decisions.
 * 3. Sensitive: Intentionally favors sensitivity (conservative trigger).
 * 4. Human-Reviewed Fixed Response: Concise, warm, resource-forward, zero engagement-traps.
 * 5. Zero-PII / Crisis logging: Does NOT log matched keywords or user text.
 */

export interface SafetyGateResult {
  isTriggered: boolean;
  triggerCategory?: 'self_harm' | 'suicide_ideation' | 'immediate_crisis';
}

export const FIXED_SAFETY_RESPONSE = `It sounds like you may be going through a deeply difficult or overwhelming time. Please know that you do not have to carry this alone, and there is support available right now.

If you are in immediate danger or need urgent help, please reach out to someone you trust, contact emergency services (such as 911 or your local emergency services), or connect with a trained crisis counselor:

• 988 Suicide & Crisis Lifeline: Call or text 988 (Available 24/7, free, confidential in the US & Canada)
• Crisis Text Line: Text HOME to 741741 (Available 24/7, free, confidential)
• The Trevor Project (LGBTQ youth): Call 1-866-488-7386 or text START to 678-678
• Veterans Crisis Line: Dial 988, then press 1, or text 838255
• International Support: Find free, confidential support in your country at https://findahelpline.com or https://befrienders.org

Please connect with a healthcare professional, counselor, or trusted person in your life who can support you today.`;

// Predefined crisis indicator regex patterns
// Normalized to lowercase, stripped of excessive punctuation/whitespace
const SUICIDE_PATTERNS: RegExp[] = [
  /\b(kill|killing|killed)\s+(my\s*self|myself)\b/i,
  /\b(end|ending|ended)\s+(my\s*life|it\s*all)\b/i,
  /\b(take|taking|took)\s+my\s*(own\s*)?life\b/i,
  /\bcommit(ting|ted|s)?\s+suicide\b/i,
  /\battempt(ing|ed|s)?\s+suicide\b/i,
  /\b(thinking\s+(of|about)|considering)\s+(\w+\s+)?suicide\b/i,
  /\b(suicidal|suicide)\b/i,
  /\b(want|wants|wanted|wishing|wish)\s+to\s+(die|disappear|not\s+wake\s+up)\b/i,
  /\b(wish|wished)\s+(i\s*('?d\s*be|\s*was|\s*were))\s+dead\b/i,
  /\b(better\s+off|everyone\s+would\s+be\s+better\s+off)\s+dead\b/i,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|exist)\s*(anymore|any\s*more)?\b/i,
  /\b(can'?t|cannot)\s+go\s+on\s+living\b/i,
  /\bno\s+reason\s+to\s+(live|go\s+on|keep\s+living)\b/i,
  /\bready\s+to\s+die\b/i,
  /\b(plan|plans|planning)\s+to\s+(kill|end)\s+(my\s*self|my\s*life)\b/i,
  /\b(goodbye|suicide)\s+note\b/i,
  /\b(saying|say)\s+goodbye\s+(forever|to\s+everyone)\b/i,
  /\b(jump|jumping|jumped)\s+off\s+a\s+(bridge|building|roof|cliff)\b/i,
  /\b(hang|hanging|hanged)\s+(my\s*self|myself)\b/i,
  /\b(overdose|overdosing|overdosed)\s+on\s+(pills|drugs|meds|medication)\b/i,
  /\b(slit|slitting)\s+(my\s*)?wrists?\b/i,
];

const SELF_HARM_PATTERNS: RegExp[] = [
  /\b(cut|cutting)\s+(my\s*self|myself)\b/i,
  /\b(burn|burning)\s+(my\s*self|myself)\b/i,
  /\b(harm|hurting|harming|injure|injuring)\s+(my\s*self|myself)\b/i,
  /\b(self\s*[-_]?\s*harm|self\s*[-_]?\s*injury|self\s*[-_]?\s*mutilat(e|ion))\b/i,
  /\bbleed(ing)?\s+(my\s*self\s*)?out\b/i,
];

/**
 * Normalizes input text for resilient pattern detection.
 * Strips zero-width characters and normalizes whitespace.
 */
function normalizeInput(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width characters
    .replace(/\s+/g, ' ') // collapse multi-whitespace
    .trim();
}

/**
 * Deterministically evaluates whether the journal message contains predefined crisis indicators.
 * MUST run before any reflective/context pipeline.
 */
export function evaluateSafetyGate(rawText: string): SafetyGateResult {
  if (!rawText || typeof rawText !== 'string') {
    return { isTriggered: false };
  }

  const normalized = normalizeInput(rawText);

  // Check self-harm patterns
  for (const pattern of SELF_HARM_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isTriggered: true, triggerCategory: 'self_harm' };
    }
  }

  // Check suicide patterns
  for (const pattern of SUICIDE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isTriggered: true, triggerCategory: 'suicide_ideation' };
    }
  }

  return { isTriggered: false };
}
