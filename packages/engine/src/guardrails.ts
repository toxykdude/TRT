/**
 * Clinical guardrails — deterministic filter enforcing GOLD §2.
 *
 * Every AI output (extraction, analysis, report, future chat) passes through
 * `enforceGuardrails()` before it is persisted or rendered. This is the safety
 * net that backs up the system prompt: even if a model misbehaves, prohibited
 * content is blocked here.
 *
 * What it blocks (per GOLD §2.3):
 *   • Prescriptions / Rx suggestions
 *   • Exact testosterone / hCG / aromatase-inhibitor dosages
 *   • Medication schedules / titration plans
 *   • Medical diagnoses ("you have X")
 *   • Instructions to start/stop/change a medication
 *
 * It does NOT block legitimate support content: trend summaries, range
 * comparisons, discussion topics, guideline references.
 *
 * This is defense-in-depth, not a substitute for the system prompt — both must
 * agree. Tests live in guardrails.test.ts (golden cases).
 */

export type GuardrailResult = {
  /** true when the text is safe to show; false when it must be blocked/redacted */
  ok: boolean;
  /** list of guardrail rules that triggered */
  reasons: string[];
  /** the offending snippets, for telemetry/logging (never shown to users) */
  blocked: string[];
};

// ── Rule definitions ─────────────────────────────────────────────────────────
// Each rule: a human-readable reason + a regex that matches prohibited phrasing.
// Regexes are case-insensitive and word-aware. They are deliberately broad on
// the prohibition side (better to false-positive a borderline phrase and surface
// it for review than to let a dosage recommendation through).

type Rule = { reason: string; pattern: RegExp };

const RULES: Rule[] = [
  // ── Exact dosages (GOLD §2.3.2–2.3.4) ──────────────────────────────────────
  // "<number> <unit> of testosterone/hcg/anastrozole/etc", "take 200mg test", etc.
  {
    reason: 'exact testosterone dosage',
    pattern:
      /\b(\d+(\.\d+)?)\s*(mg|milligrams?|mcg|µg|ml|iu|international units?)\b.{0,40}\btestosterone|testosterone\b.{0,40}\b(\d+(\.\d+)?)\s*(mg|milligrams?|mcg|µg|ml|iu|international units?)\b/gi,
  },
  {
    reason: 'exact hCG dosage',
    pattern:
      /\b(\d+(\.\d+)?)\s*(iu|international units?|units?)\b.{0,30}\bhcg| hcg\b.{0,30}\b(\d+(\.\d+)?)\s*(iu|international units?|units?)\b/gi,
  },
  {
    reason: 'aromatase inhibitor dosage',
    pattern:
      /\b(\d+(\.\d+)?)\s*(mg|milligrams?|mcg)\b.{0,30}\b(anastrozole|arimidex|exemestane|letrozole|aromatase inhibitor)|\b(anastrozole|arimidex|exemestane|letrozole|aromatase inhibitor)\b.{0,30}\b(\d+(\.\d+)?)\s*(mg|milligrams?|mcg)\b/gi,
  },
  // Generic "<number> mg / week / per week" dosing schedules
  {
    reason: 'medication schedule / titration',
    pattern:
      /\b\d+(\.\d+)?\s*(mg|milligrams?|mcg|ml|iu)\b.{0,30}\b(weekly|per week|twice weekly|every other day|eod|daily|twice a week|schedule|titrat)\b/gi,
  },

  // ── Prescriptions (GOLD §2.3.1) ────────────────────────────────────────────
  // Anchored on actionable phrasing so it doesn't false-positive on disclaimers
  // that merely *mention* prescribing (e.g. "this tool does not prescribe").
  {
    reason: 'prescription language',
    pattern:
      /\b(you should (take|start|use)|I (will|can|'?ll) (prescribe|recommend|suggest)( you)? (you )?(take|start|use)|prescribe (you|for you)|write you a (rx|prescription)|here('?s| is) your (rx|prescription)|Rx:\s*\w)/gi,
  },

  // ── Start/stop/change (GOLD §2.3.7) ────────────────────────────────────────
  {
    reason: 'instruction to change medication',
    pattern:
      /\b(you (should|need to|must) (start|stop|increase|decrease|lower|raise|change|adjust|switch|discontinue))\b.{0,40}\b(medication|testosterone|dose|injection|trt|hcg|arimidex|anastrozole)/gi,
  },

  // ── Diagnoses (GOLD §2.3.6) ────────────────────────────────────────────────
  // "you have / you are suffering from / you've developed <condition>"
  {
    reason: 'definitive diagnosis',
    pattern:
      /\b(you (have|are suffering from|'?ve developed|are diabetic|are hypogonadal|have low t)|diagnos(?:is|ed) (you (with )?)?(as having )?|confirmed diagnosis of)\b/gi,
  },
];

// Phrases that indicate a *support* context and should NOT be blocked even if a
// dosage number appears nearby (e.g. "the patient's historical dose was 100mg" —
// allowed because it's a historical record, per GOLD §5.11).
const ALLOWLIST_CONTEXTS: RegExp[] = [
  /\b(historical(?:ly)? (dose|record|context)?|past dose|currently prescribed|on file|as recorded|per the (lab )?report)\b/i,
  /\bdiscuss.{0,30}(your|with (your|a)) (physician|doctor|provider|clinician)/i,
];

function matches(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text)) !== null) {
    found.push(m[0].trim());
    if (m.index === pattern.lastIndex) pattern.lastIndex++; // avoid zero-width loop
  }
  return found;
}

/**
 * Enforce clinical guardrails on a piece of AI-generated (or user) text.
 * Returns ok=false if any rule matches outside an allowlisted context.
 */
export function enforceGuardrails(text: string): GuardrailResult {
  const reasons: string[] = [];
  const blocked: string[] = [];

  for (const rule of RULES) {
    const hits = matches(text, rule.pattern);
    for (const hit of hits) {
      // Skip if the surrounding window is an allowlisted support context.
      const idx = text.toLowerCase().indexOf(hit.toLowerCase());
      const window = text.slice(Math.max(0, idx - 80), Math.min(text.length, idx + hit.length + 80));
      if (ALLOWLIST_CONTEXTS.some((re) => re.test(window))) continue;
      reasons.push(rule.reason);
      blocked.push(hit);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    blocked,
  };
}

/**
 * Refusal text for prohibited user requests (e.g. "what dose should I take?").
 * Used by pipelines when a user prompt itself asks for something we never do.
 */
export function refuseAndRedirect(_userRequest: string): string {
  return (
    "I can't recommend dosages, prescriptions, or treatment changes. " +
    'Please discuss this with your healthcare provider. I can help organize your ' +
    'labs, highlight trends, compare values to reference ranges, and suggest ' +
    'topics to raise with your clinician.'
  );
}
