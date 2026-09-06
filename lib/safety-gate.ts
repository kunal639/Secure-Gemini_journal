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

export type SafetyClassification = 'HARD_SAFETY' | 'CONCERNING_DISTRESS' | 'NORMAL';

export interface SafetyGateResult {
  isTriggered: boolean;
  classification: SafetyClassification;
  triggerCategory?: 'self_harm' | 'suicide_ideation' | 'immediate_crisis' | 'concerning_distress';
}

export const FIXED_SAFETY_RESPONSE = `It sounds like you may be going through a deeply difficult or overwhelming time. Please know that you do not have to carry this alone, and there is support available right now.

If you are in immediate danger or need urgent help, please reach out to someone you trust, contact emergency services (such as 911 or your local emergency services), or connect with a trained crisis counselor:

• 988 Suicide & Crisis Lifeline: Call or text 988 (Available 24/7, free, confidential in the US & Canada)
• Crisis Text Line: Text HOME to 741741 (Available 24/7, free, confidential)
• The Trevor Project (LGBTQ youth): Call 1-866-488-7386 or text START to 678-678
• Veterans Crisis Line: Dial 988, then press 1, or text 838255
• International Support: Find free, confidential support in your country at https://findahelpline.com or https://befrienders.org

Please connect with a healthcare professional, counselor, or trusted person in your life who can support you today.`;

export const CONCERNING_DISTRESS_RESPONSE = `It sounds like things are feeling very heavy and exhausting right now. Holding this kind of weight on your own is genuinely difficult.

Your thoughts are recorded safely here. Please consider reaching out to a trusted friend, family member, or a healthcare professional who can offer real-world support and be there with you. If you ever feel in danger or need immediate help, support is also available anytime through the 988 Lifeline (call or text 988).`;

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

// Multi-factor indicator categories for CONCERNING_DISTRESS
// At least TWO distinct categories must be present to distinguish genuine concerning distress
// from single isolated expressions of tiredness, frustration, or ordinary sadness.

const FUNCTIONING_IMPAIRMENT_PATTERNS: RegExp[] = [
  /\b(getting\s+|so\s+|too\s+)?(hard|difficult|struggling|impossible|can'?t|cannot)\s+to\s+(get\s+up|get\s+out\s+of\s+bed|move|function|do\s+anything|leave\s+(the\s+)?(bed|house|room))\b/i,
  /\b(can'?t|cannot|unable\s+to|struggling\s+to)\s+(even\s+)?(get\s+out\s+of\s+bed|get\s+up|move|shower|eat|function)\b/i,
  /\b(stuck|lying|staying)\s+in\s+bed\s+(all\s+day|for\s+days)\b/i,
  /\bno\s+energy\s+to\s+(get\s+up|move|function|live)\b/i,
];

const SOCIAL_WITHDRAWAL_PATTERNS: RegExp[] = [
  /\b(don'?t|do\s+not)\s+feel\s+like\s+(talking|speaking|reaching\s+out)\s+to\s+(anyone|anybody|people|someone)\b/i,
  /\b(can'?t|cannot)\s+(bring\s+myself\s+to\s+)?(talk|speak)\s+to\s+(anyone|anybody|people)\b/i,
  /\b(pushing|pushed|shutting|shut)\s+everyone\s+(away|out)\b/i,
  /\b(isolating|isolated)\s+(myself|completely)\b/i,
  /\bcompletely\s+alone\s+and\s+(isolated|disconnected|withdrawn)\b/i,
  /\bcutting\s+myself\s+off\s+from\s+everyone\b/i,
];

const OVERWHELMING_DISTRESS_PATTERNS: RegExp[] = [
  /\b(life\s+is|everything\s+is|it\s+is|feeling)\s+(suffocating|unbearable|crushing|drowning\s+me)\b/i,
  /\b(feel|feeling)\s+(like\s+i'?m\s+)?(drowning|suffocating|being\s+crushed)\b/i,
  /\b(overwhelmed|suffocated)\s+by\s+(everything|life|existence)\b/i,
  /\bweight\s+is\s+(too\s+heavy|crushing\s+me)\b/i,
];

const INABILITY_TO_COPE_PATTERNS: RegExp[] = [
  /\b(can'?t|cannot)\s+(take|bear|handle|cope\s+with)\s+(this|it|anything|life)\s+(anymore|any\s*more)?\b/i,
  /\b(at\s+my\s+limit|at\s+the\s+breaking\s+point|falling\s+apart\s+completely)\b/i,
  /\b(losing\s+the\s+will|losing\s+my\s+grip|running\s+on\s+empty)\b/i,
  /\b(hopeless|completely\s+empty|no\s+strength\s+left)\b/i,
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
 * Deterministically evaluates whether the journal message contains predefined crisis indicators
 * or concerning distress.
 * MUST run before any reflective/context pipeline.
 */
export function evaluateSafetyGate(rawText: string): SafetyGateResult {
  if (!rawText || typeof rawText !== 'string') {
    return { isTriggered: false, classification: 'NORMAL' };
  }

  const normalized = normalizeInput(rawText);

  // 1. HARD_SAFETY: Check self-harm patterns
  for (const pattern of SELF_HARM_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isTriggered: true, classification: 'HARD_SAFETY', triggerCategory: 'self_harm' };
    }
  }

  // 1. HARD_SAFETY: Check suicide patterns
  for (const pattern of SUICIDE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isTriggered: true, classification: 'HARD_SAFETY', triggerCategory: 'suicide_ideation' };
    }
  }

  // 2. CONCERNING_DISTRESS: Multi-indicator co-occurrence check
  // Requires at least TWO distinct distress dimensions to prevent false-positives
  // from isolated phrases like "bad day", "tired", or "life is hard".
  let matchedCategories = 0;

  if (FUNCTIONING_IMPAIRMENT_PATTERNS.some((p) => p.test(normalized))) {
    matchedCategories++;
  }
  if (SOCIAL_WITHDRAWAL_PATTERNS.some((p) => p.test(normalized))) {
    matchedCategories++;
  }
  if (OVERWHELMING_DISTRESS_PATTERNS.some((p) => p.test(normalized))) {
    matchedCategories++;
  }
  if (INABILITY_TO_COPE_PATTERNS.some((p) => p.test(normalized))) {
    matchedCategories++;
  }

  if (matchedCategories >= 2) {
    return {
      isTriggered: false, // isTriggered strictly designates HARD_SAFETY crisis
      classification: 'CONCERNING_DISTRESS',
      triggerCategory: 'concerning_distress',
    };
  }

  // 3. NORMAL: Safe to proceed to Phase 4 Selective Intervention pipeline
  return { isTriggered: false, classification: 'NORMAL' };
}
