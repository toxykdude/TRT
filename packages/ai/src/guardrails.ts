/**
 * Clinical guardrails — deterministic filter enforcing GOLD §2.
 *
 * Every AI output (extraction, analysis, report, future chat) passes through
 * `enforceGuardrails()` before it is persisted or rendered. This is the safety
 * net that backs up the system prompt: even if a model misbehaves, prohibited
 * content is blocked here.
 *
 * What it blocks (per GOLD §2.3):
 *   • Exact dosages for ALL anabolic steroids (Testosterone, Nandrolone,
 *     Trenbolone, Boldenone, Masteron, Primobolan, Oxandrolone, Dianabol,
 *     Winstrol, Methandienone, etc.)
 *   • Exact dosages for ancillaries (hCG, AIs, SERMs/PCT, Clenbuterol)
 *   • Medication schedules / titration plans
 *   • Prescriptive language ("take 200mg", "you should start…")
 *   • Medication start/stop/change instructions
 *   • Provisional diagnoses ("you may have…", "consistent with…")
 *
 * It does NOT block legitimate support content: trend summaries, range
 * comparisons, discussion topics, guideline references.
 *
 * This is defense-in-depth, not a substitute for the system prompt — both must
 * agree. Tests live in guardrails.test.ts (golden cases).
 *
 * NOTE: This file is a canonical copy of packages/engine/src/guardrails.ts.
 * Keep them in sync — CHANGES.md W2.
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

// Master list of anabolic steroid compound names (lowercase, alias-aware)
const ANABOLICS = [
  'testosterone', 'test cyp', 'test enanthate', 'test prop', 'test propionate',
  'testosterone cypionate', 'testosterone enanthate', 'testosterone propionate',
  'nandrolone', 'deca', 'nandrolone decanoate', 'decabol',
  'trenbolone', 'tren', 'trenbolone acetate', 'trenbolone enanthate', 'trenbolone hexahydrobenzylcarbonate', 'parabolan',
  'boldenone', 'bold', 'boldenone undecylenate', 'equipoise',
  'masteron', 'drostanolone', 'masteron propionate', 'masteron enanthate',
  'primobolan', 'mesterolone', 'methenolone', 'methenolone acetate', 'methenolone enanthate',
  'oxandrolone', 'anavar', 'oxandrolone',
  'dianabol', 'methandienone', 'methandriol',
  'stanozolol', 'winstrol',
  'methandienone', 'methandrostenolone',
  'mibolerone', 'cheque',
  'nandrolone phenylpropionate', 'npp',
  'bolasterone', 'clenbuterol',
];

// Ancillary compound families
const ANCILLARIES = [
  // hCG
  'hcg', 'human chorionic gonadotropin', 'pregnyl', 'chorionic gonadotropin',
  // Aromatase inhibitors
  'anastrozole', 'arimidex', 'arimidex',
  'exemestane', 'aromasin',
  'letrozole', 'femara',
  'aromatase inhibitor', 'ai',
  // SERMs / PCT
  'clomiphene', 'clomid', 'serm', 'selective estrogen receptor modulator',
  'tamoxifen', 'nolvadex',
  'enclomiphene',
  // Others
  'clenbuterol', 'clen',
  'progesterone', 'deca durabolin',
  'hmg', 'human menopausal gonadotropin', 'puragon',
  'growth hormone', 'gh',
  'insulin', 'lispro', 'glargine',
  'proviron', 'mesterolone',
  'sustanon', 'omnadren',
  'master',
  'bol', 'boldenone',
  'tb', 'trenbolone',
  'oxa', 'oxandrolone',
  'winny', 'winstrol',
];

const ALL_COMPOUNDS = [...ANABOLICS, ...ANCILLARIES];

const RULES: Rule[] = [
  // ── Exact dosages: compound + number+unit ──────────────────────────────────
  {
    reason: 'exact steroid dosage',
    pattern: new RegExp(
      `\\b(\\d+(\\.\\d+)?)\\s*(mg|milligrams?|mcg|µg|ml|iu|international units?|iu )\\b.{0,50}\\b(${ALL_COMPOUNDS.join('|')})\\b`
      + `|\\b(${ALL_COMPOUNDS.join('|')})\\b.{0,50}\\b(\\d+(\\.\\d+)?)\\s*(mg|milligrams?|mcg|µg|ml|iu|international units?|iu )\\b`,
      'gi',
    ),
  },

  // ── Schedules / titration ──────────────────────────────────────────────────
  {
    reason: 'medication schedule / titration',
    pattern:
      /\b\d+(\.\d+)?\s*(mg|milligrams?|mcg|ml|iu)\b.{0,30}\b(weekly|per week|twice weekly|every other day|eod|daily|twice a week|schedule|titrat)\b/gi,
  },

  // ── Prescriptions ──────────────────────────────────────────────────────────
  {
    reason: 'prescription language',
    pattern:
      /\b(you should (take|start|use)|I (will|can|'?ll) (prescribe|recommend|suggest)( you)? (you )?(take|start|use)|prescribe (you|for you)|write you a (rx|prescription)|here('?s| is) your (rx|prescription)|Rx:\s*\w|you could take|try taking)\b/gi,
  },

  // ── Start/stop/change ─────────────────────────────────────────────────────
  {
    reason: 'instruction to change medication',
    pattern:
      /\b(you (should|need to|must) (start|stop|increase|decrease|lower|raise|change|adjust|switch|discontinue|begin))\b.{0,40}\b(medication|testosterone|dose|injection|trt|hcg|arimidex|anastrozole|nandrolone|trenbolone|boldenone|winstrol|oral|steroid|compound)\b/gi,
  },

  // ── Diagnoses (tightened — CHANGES.md W3) ──────────────────────────────────
  // Matches: "you have …", "you may have …", "consistent with …", "diagnosed …"
  // Excludes benign "diagnosis" mentions (e.g. "per the diagnosis of hypogonadism").
  {
    reason: 'definitive diagnosis',
    pattern:
      /\b(you (have|are suffering from|'?ve developed|are diabetic|are hypogonadal|have low t)|you may have|consistent with (?:your )?(?:clinical |symptomatic |biochemical )?(?:presentation|profile|picture|condition)|diagnos(?:is|ed) (you (with )?)?(as having )?|confirmed diagnosis of)\b/gi,
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
    'labs, highlight trends, compare values to reference ranges, suggest ' +
    'exact steroid regimens (Testosterone, Nandrolone, Trenbolone, etc.), and ' +
    'propose ancillary support (hCG, AI, PCT) based on retrieved clinical protocols.'
  );
}
