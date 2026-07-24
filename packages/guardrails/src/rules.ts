/**
 * Canonical guardrail rule table (GOLD §2.3).
 *
 * This is the ONLY place dosing-detection regexes may be defined in the
 * workspace (grep-enforceable). Coverage mirrors every compound family in
 * `packages/ai/src/dosing.ts` COMPOUNDS plus the aliases documented in
 * CHANGES.md W3:
 *
 *   Testosterone, Nandrolone, Trenbolone, Boldenone, Masteron, Primobolan,
 *   Oxandrolone, Dianabol, Winstrol, SARMs, Clomiphene, Tamoxifen,
 *   Clenbuterol, hCG, Aromatase inhibitors (anastrozole/letrozole/exemestane).
 *
 * Design notes:
 * - Dosing units (mg, mcg, µg, IU, cc, ml) are deliberately disjoint from lab
 *   units (ng/dL, pg/mL, nmol/L, ...) so trend prose like "total testosterone
 *   trended from 380 to 412 ng/dL" never fires.
 * - The alias "test" only counts with an ester suffix ("test cypionate") to
 *   avoid false positives on "test results".
 */

// ── Compound families ────────────────────────────────────────────────────────

export type CompoundFamily = {
  key: string;
  /** display name used in findings */
  name: string;
  /** case-insensitive source alternation (no slashes, embedded into patterns) */
  pattern: string;
};

export const COMPOUND_FAMILIES: CompoundFamily[] = [
  {
    key: 'testosterone',
    name: 'Testosterone',
    pattern:
      'testosterone(?:\\s+(?:cypionate|enanthate|propionate|undecanoate|suspension|gel|cream|pellet))?|test\\s+(?:cyp|cypionate|e|enanthate|p|prop|propionate)|sustanon|androgel',
  },
  {
    key: 'nandrolone',
    name: 'Nandrolone',
    pattern: 'nandrolone(?:\\s+(?:decanoate|phenylpropionate))?|\\bdeca\\b|\\bnpp\\b',
  },
  {
    key: 'trenbolone',
    name: 'Trenbolone',
    pattern:
      'trenbolone(?:\\s+(?:acetate|enanthate|hexahydrobenzylcarbonate))?|\\btren\\b(?:\\s+(?:ace|a|e|enanthate))?',
  },
  {
    key: 'boldenone',
    name: 'Boldenone',
    pattern: 'boldenone(?:\\s+undecylenate)?|equipoise|\\beq\\b',
  },
  {
    key: 'masteron',
    name: 'Masteron',
    pattern: 'masteron(?:\\s+(?:propionate|enanthate))?|drostanolone',
  },
  {
    key: 'primobolan',
    name: 'Primobolan',
    pattern: 'primobolan|methenolone(?:\\s+(?:acetate|enanthate))?|\\bprimo\\b',
  },
  {
    key: 'oxandrolone',
    name: 'Oxandrolone',
    pattern: 'oxandrolone|anavar',
  },
  {
    key: 'dianabol',
    name: 'Dianabol',
    pattern: 'dianabol|methandrostenolone|methandienone|\\bdbol\\b',
  },
  {
    key: 'winstrol',
    name: 'Winstrol',
    pattern: 'winstrol|stanozolol|\\bwinny\\b',
  },
  {
    key: 'sarms',
    name: 'SARMs',
    pattern:
      '\\bsarms?\\b|ostarine|mk\\s?-?2866|ligandrol|lgd\\s?-?4033|rad\\s?-?140|testolone|cardarine|gw\\s?-?501516|andarine|ibutamoren|mk\\s?-?677|yk\\s?-?11',
  },
  {
    key: 'clomiphene',
    name: 'Clomiphene',
    pattern: 'clomiphene(?:\\s+citrate)?|clomid',
  },
  {
    key: 'tamoxifen',
    name: 'Tamoxifen',
    pattern: 'tamoxifen(?:\\s+citrate)?|nolvadex',
  },
  {
    key: 'clenbuterol',
    name: 'Clenbuterol',
    pattern: 'clenbuterol|\\bclen\\b',
  },
  {
    key: 'hcg',
    name: 'hCG',
    pattern: '\\bhcg\\b|human chorionic gonadotropin',
  },
  {
    key: 'aromatase_inhibitors',
    name: 'Aromatase inhibitor',
    pattern:
      'anastrozole|arimidex|letrozole|femara|exemestane|aromasin|aromatase\\s+inhibitors?',
  },
];

/** Combined alternation matching any known compound. */
export const COMPOUND_PATTERN = COMPOUND_FAMILIES.map((c) => c.pattern).join('|');

/** Find the compound family key (if any) mentioned in a text window. */
export function compoundIn(window: string): string | undefined {
  for (const fam of COMPOUND_FAMILIES) {
    if (new RegExp(`(?:${fam.pattern})`, 'i').test(window)) return fam.key;
  }
  return undefined;
}

// ── Rule definitions ─────────────────────────────────────────────────────────

export type RuleCategory =
  | 'dosing'
  | 'schedule'
  | 'prescription'
  | 'start_stop_change'
  | 'diagnosis';

export type GuardrailRule = {
  id: string;
  category: RuleCategory;
  pattern: RegExp;
  /** human-readable explanation for audit reasons */
  description: string;
};

/** Dosing units only — never lab-report units (ng/dL, pg/mL, nmol/L, ...). */
export const AMOUNT =
  '\\d+(?:[.,]\\d+)?\\s*(?:mg|mcg|µg|iu|cc|ml|milligrams?|micrograms?|international units?)\\b';

const FREQ =
  '(?:per|a|every|each)\\s+(?:day|week|month)|daily|weekly|monthly|\\beod\\b|\\be3d\\b|\\be2d\\b|\\bed\\b|\\d+\\s*x\\s*(?:per\\s+|a\\s+|/)?(?:day|week)|twice\\s+(?:a\\s+)?(?:day|week)|once\\s+(?:a\\s+)?(?:day|week)';

export const RULES: GuardrailRule[] = [
  // 1) Exact compound + amount (either order, within a short window).
  {
    id: 'dosing.compound_amount',
    category: 'dosing',
    description: 'compound name adjacent to an exact dose amount',
    pattern: new RegExp(
      `(?:(?:${COMPOUND_PATTERN})\\W{0,40}(?:${AMOUNT})|(?:${AMOUNT})\\W{0,40}(?:of\\s+)?(?:${COMPOUND_PATTERN}))`,
      'gi',
    ),
  },
  // 2) Amount + frequency (dosing schedule), even without a named compound.
  {
    id: 'dosing.amount_frequency',
    category: 'dosing',
    description: 'exact dose amount tied to an administration frequency',
    pattern: new RegExp(`(?:${AMOUNT})\\W{0,25}(?:${FREQ})|(?:${FREQ})\\W{0,25}(?:${AMOUNT})`, 'gi'),
  },
  // 3) Cycle structures / protocol framing near compounds or amounts.
  {
    id: 'dosing.cycle',
    category: 'dosing',
    description: 'cycle/protocol structure language',
    pattern: new RegExp(
      `(?:weeks?\\s*\\d+\\s*(?:-|–|to)\\s*\\d+|\\d+\\s*(?:-|–)\\s*week\\s+(?:cycle|blast)|\\bcycle\\b[^.]{0,40}(?:${AMOUNT})|blast\\s+and\\s+cruise|cruise\\s+and\\s+blast|kickstart(?:ing)?\\s+(?:a\\s+)?cycle|\\bpct\\b\\s*:\\s*[^.]{0,60}(?:${AMOUNT}))`,
      'gi',
    ),
  },
  // 4) Titration / dose-adjustment instructions.
  {
    id: 'schedule.titration',
    category: 'schedule',
    description: 'titration or dose-adjustment instruction',
    pattern: new RegExp(
      `(?:titrat(?:e|ing|ion)[^.]{0,60}(?:${AMOUNT})|(?:increase|decrease|raise|lower|bump|adjust|reduce)\\s+(?:the\\s+)?(?:dose|dosage)?[^.]{0,40}(?:to\\s+)?(?:${AMOUNT})|(?:ramp|pyramid)\\s+(?:up|down)[^.]{0,40}(?:${AMOUNT}))`,
      'gi',
    ),
  },
  // 5) Prescriptive language with amounts or compounds.
  {
    id: 'prescription.language',
    category: 'prescription',
    description: 'recommendation/prescription phrasing of a dose or compound',
    pattern: new RegExp(
      `(?:(?:i|we)\\s+(?:would\\s+)?recommend[^.]{0,80}(?:${AMOUNT}|${COMPOUND_PATTERN})|you\\s+(?:should|could|can|may want to)\\s+(?:take|use|run|inject|start)\\b[^.]{0,60}(?:${AMOUNT}|${COMPOUND_PATTERN})|try\\s+taking\\b[^.]{0,60}(?:${AMOUNT}|${COMPOUND_PATTERN})|prescri(?:be|bing|ption)[^.]{0,60}(?:${AMOUNT}))`,
      'gi',
    ),
  },
  // 6) Start/stop/change medication instructions.
  {
    id: 'start_stop_change.instruction',
    category: 'start_stop_change',
    description: 'instruction to start, stop, or change a medication/compound',
    pattern: new RegExp(
      `(?:you\\s+(?:should|could|can|need to)\\s+)?(?:start|stop|begin|discontinue|quit|switch(?:\\s+to)?|come off|go off)\\s+(?:taking\\s+|using\\s+|on\\s+)?(?:${COMPOUND_PATTERN})`,
      'gi',
    ),
  },
  // 7) Provisional/definitive diagnosis aimed at the user.
  {
    id: 'diagnosis.provisional',
    category: 'diagnosis',
    description: 'provisional or definitive diagnosis of the user',
    pattern: new RegExp(
      '(?:you\\s+(?:may\\s+)?(?:have|are|suffer from)\\s+(?:low\\s*t\\b|hypogonad|primary\\s+hypogonadism|secondary\\s+hypogonadism|androgen\\s+deficien)|(?:this|these\\s+(?:labs|results|values))\\s+(?:is|are)\\s+consistent\\s+with\\s+(?:a\\s+)?(?:diagnosis\\s+of\\s+)?\\w+|you\\s+(?:have|are)\\s+(?:been\\s+)?diagnosed\\s+with)',
      'gi',
    ),
  },
];

// ── Allowlist (historical record context) ────────────────────────────────────
//
// Historical-record phrasing ("previously prescribed", "medication history")
// may mention a dose without being advice — BUT an allowlisted window never
// applies when prescriptive phrasing co-occurs (CHANGES.md W4 anti-gaming).

const ALLOWLIST_CONTEXT =
  /(?:historical(?:ly)?|(?:as|previously)\s+prescribed|record\s+only|for\s+(?:my|your)\s+records?|medication\s+history|past\s+(?:prescription|medication|cycle)s?\b)/i;

const PRESCRIPTIVE_PHRASE =
  /(?:you\s+(?:should|could|can|may want to)|i\s+(?:would\s+)?recommend|try\s+taking|we\s+recommend)/i;

const ALLOWLIST_WINDOW = 100;

/** True when the match sits in a genuine historical-record context. */
export function isAllowlisted(text: string, matchIndex: number, matchLength: number): boolean {
  const start = Math.max(0, matchIndex - ALLOWLIST_WINDOW);
  const end = Math.min(text.length, matchIndex + matchLength + ALLOWLIST_WINDOW);
  const window = text.slice(start, end);
  if (!ALLOWLIST_CONTEXT.test(window)) return false;
  // Never allowlist when prescriptive phrasing co-occurs in the window.
  if (PRESCRIPTIVE_PHRASE.test(window)) return false;
  return true;
}
