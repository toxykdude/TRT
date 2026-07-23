/**
 * Deterministic rule set — the engine's fixed knowledge base.
 *
 * Rules are pure functions over classified results + trends. Each rule emits
 * {@link Finding} objects with full provenance: a stable `ruleId`, a severity,
 * and the exact evidence points that fired it. Add a rule = add a function and
 * register it in `runRules`. No model, no randomness.
 *
 * IMPORTANT (GOLD §2): rules describe observed facts relative to ranges and
 * surface discussion topics. They NEVER prescribe, recommend a dose, or diagnose.
 * The wordings below are deliberately observational ("is above range", "worth
 * discussing with your clinician"), never prescriptive.
 */
import { isAbnormal, isOutOfBand } from './classify';
import type { ClassifiedResult, CoverageGap, Finding, PatientContext, Trend } from './types';

// ── Severity helper ──────────────────────────────────────────────────────────
const evidence = (c: ClassifiedResult) => ({
  biomarkerKey: c.biomarkerKey,
  biomarkerName: c.biomarkerName,
  date: c.collectedAt,
  value: c.valueNumeric,
  unit: c.unit,
  refText: c.refText,
});

/** pick the most recent classified point for a biomarker key */
function latest(results: ClassifiedResult[], key: string): ClassifiedResult | undefined {
  const pts = results.filter((r) => r.biomarkerKey === key);
  if (pts.length === 0) return undefined;
  return pts.sort((a, b) => {
    const da = a.collectedAt ? new Date(a.collectedAt).getTime() : -Infinity;
    const db = b.collectedAt ? new Date(b.collectedAt).getTime() : -Infinity;
    return db - da;
  })[0];
}

function allOf(results: ClassifiedResult[], key: string): ClassifiedResult[] {
  return results
    .filter((r) => r.biomarkerKey === key)
    .sort((a, b) => {
      const da = a.collectedAt ? new Date(a.collectedAt).getTime() : 0;
      const db = b.collectedAt ? new Date(b.collectedAt).getTime() : 0;
      return da - db;
    });
}

const fmt = (v: number | null, unit: string | null) =>
  v == null ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ' ' + unit : ''}`;

// ── Red-flag rules: single-value thresholds warranting prompt review ─────────
// These fire on a value crossing a fixed threshold (not just the lab's own
// range). Thresholds are conservative and observational — they flag for
// *prompt clinician review*, they do not diagnose.

type RedFlagRule = {
  ruleId: string;
  biomarkerKey: string;
  /** fires when value >= threshold (HIGH direction) */
  atLeast?: number;
  /** fires when value <= threshold (LOW direction) */
  atMost?: number;
  message: (c: ClassifiedResult) => string;
};

const RED_FLAG_RULES: RedFlagRule[] = [
  {
    ruleId: 'RF-HEMATOCRIT-HIGH',
    biomarkerKey: 'hematocrit',
    atLeast: 54,
    message: (c) =>
      `Hematocrit is recorded at ${fmt(c.valueNumeric, c.unit)}, at or above 54%. ` +
      'This warrants prompt clinician review (a common discussion point in TRT contexts).',
  },
  {
    ruleId: 'RF-HEMOGLOBIN-HIGH',
    biomarkerKey: 'hemoglobin',
    atLeast: 18.5,
    message: (c) =>
      `Hemoglobin is recorded at ${fmt(c.valueNumeric, c.unit)}, markedly elevated. Prompt clinician review is warranted.`,
  },
  {
    ruleId: 'RF-PSA-ELEVATED',
    biomarkerKey: 'psa',
    atLeast: 4.0,
    message: (c) =>
      `PSA is recorded at ${fmt(c.valueNumeric, c.unit)}, at or above 4.0 ng/mL. Prompt clinician review is warranted.`,
  },
  {
    ruleId: 'RF-PSA-SIGNIFICANT',
    biomarkerKey: 'psa',
    atLeast: 10.0,
    message: (c) =>
      `PSA is recorded at ${fmt(c.valueNumeric, c.unit)}, ≥ 10.0 ng/mL. Prompt clinician review is strongly advised.`,
  },
  {
    ruleId: 'RF-ALT-HIGH',
    biomarkerKey: 'alt',
    atLeast: 120,
    message: (c) =>
      `ALT is recorded at ${fmt(c.valueNumeric, c.unit)}, markedly elevated. Prompt clinician review is warranted to assess liver function.`,
  },
  {
    ruleId: 'RF-AST-HIGH',
    biomarkerKey: 'ast',
    atLeast: 120,
    message: (c) =>
      `AST is recorded at ${fmt(c.valueNumeric, c.unit)}, markedly elevated. Prompt clinician review is warranted to assess liver function.`,
  },
  {
    ruleId: 'RF-EGFR-LOW',
    biomarkerKey: 'egfr',
    atMost: 45,
    message: (c) =>
      `eGFR is recorded at ${fmt(c.valueNumeric, c.unit)}, reduced. Prompt clinician review is warranted to assess kidney function.`,
  },
  {
    ruleId: 'RF-TRIGLYCERIDES-HIGH',
    biomarkerKey: 'triglycerides',
    atLeast: 500,
    message: (c) =>
      `Triglycerides are recorded at ${fmt(c.valueNumeric, c.unit)}, markedly elevated. Prompt clinician review is warranted.`,
  },
  {
    ruleId: 'RF-GLUCOSE-HIGH',
    biomarkerKey: 'glucose',
    atLeast: 200,
    message: (c) =>
      `Glucose is recorded at ${fmt(c.valueNumeric, c.unit)}, markedly elevated. Prompt clinician review is warranted.`,
  },
];

function runRedFlagRules(results: ClassifiedResult[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RED_FLAG_RULES) {
    const c = latest(results, rule.biomarkerKey);
    if (!c || c.valueNumeric == null) continue;
    const hit =
      (rule.atLeast != null && c.valueNumeric >= rule.atLeast) ||
      (rule.atMost != null && c.valueNumeric <= rule.atMost);
    if (hit) {
      findings.push({
        ruleId: rule.ruleId,
        severity: 'red_flag',
        message: rule.message(c),
        biomarkerKey: rule.biomarkerKey,
        evidence: [evidence(c)],
      });
    }
  }
  return findings;
}

// ── Pattern rules: multi-marker clinical patterns (TRT context) ──────────────
// These combine several markers into a single discussion point. They are
// observational ("a pattern consistent with…"), explicitly NOT diagnoses.

type PatternContext = {
  results: ClassifiedResult[];
  trends: Trend[];
  patient: PatientContext;
};

function outOfRangeMsg(c: ClassifiedResult): string {
  const dir = c.status === 'LOW' || c.status === 'BORDERLINE_LOW' ? 'below' : 'above';
  return `${c.biomarkerName} (${fmt(c.valueNumeric, c.unit)}) is ${dir} the reference range${
    c.refText ? ` (${c.refText})` : ''
  }.`;
}

/** Total/free testosterone low + symptoms keyword → discuss with clinician */
function patternLowTestosterone(ctx: PatternContext): Finding[] {
  const out: Finding[] = [];
  const total = latest(ctx.results, 'total_testosterone');
  const free = latest(ctx.results, 'free_testosterone');
  const lh = latest(ctx.results, 'lh');
  const hits: ClassifiedResult[] = [];
  if (total && (total.status === 'LOW' || total.status === 'BORDERLINE_LOW')) hits.push(total);
  if (free && (free.status === 'LOW' || free.status === 'BORDERLINE_LOW')) hits.push(free);
  if (hits.length === 0) return out;

  const ev = [...hits, ...(lh ? [lh] : [])].map((c) => evidence(c));
  let msg =
    `Recorded testosterone value(s) sit in the lower portion of or below the reference range: ` +
    hits.map(outOfRangeMsg).join(' ');
  msg +=
    lh != null
      ? ` LH (${fmt(lh.valueNumeric, lh.unit)}) helps contextualize whether this is primary or secondary in origin — a distinction for your clinician to make.`
      : ' No LH value is on record to contextualize this; consider discussing with your clinician.';
  msg += ' This is an observation, not a diagnosis.';
  out.push({
    ruleId: 'PT-LOW-T',
    severity: 'attention',
    message: msg,
    biomarkerKey: 'total_testosterone',
    evidence: ev,
  });
  return out;
}

/** Hematocrit trending up — common in TRT, watch closely */
function patternRisingHematocrit(ctx: PatternContext): Finding[] {
  const trend = ctx.trends.find((t) => t.biomarkerKey === 'hematocrit');
  const latest_ = latest(ctx.results, 'hematocrit');
  if (!trend || !latest_ || trend.direction !== 'UP') return [];
  return [
    {
      ruleId: 'PT-HEMATOCRIT-RISE',
      severity: 'watch',
      message:
        `Hematocrit is trending up (latest ${fmt(latest_.valueNumeric, latest_.unit)}). ` +
        'Rising hematocrit is a pattern worth monitoring with your clinician.',
      biomarkerKey: 'hematocrit',
      evidence: [evidence(latest_)],
    },
  ];
}

/** Low SHBG → higher free fraction; a discussion point */
function patternShbg(ctx: PatternContext): Finding[] {
  const shbg = latest(ctx.results, 'shbg');
  const free = latest(ctx.results, 'free_testosterone');
  if (!shbg || !(shbg.status === 'LOW' || shbg.status === 'BORDERLINE_LOW')) return [];
  const ev = [shbg, ...(free ? [free] : [])].map((c) => evidence(c));
  return [
    {
      ruleId: 'PT-SHBG-LOW',
      severity: 'info',
      message:
        `SHBG (${fmt(shbg.valueNumeric, shbg.unit)}) is low; lower SHBG can raise the free ` +
        'hormone fraction. Worth discussing with your clinician when interpreting free testosterone.',
      biomarkerKey: 'shbg',
      evidence: ev,
    },
  ];
}

/** Estradiol elevated in a male context — discussion point */
function patternEstradiol(ctx: PatternContext): Finding[] {
  const e2 = latest(ctx.results, 'estradiol_sensitive');
  if (!e2 || !(e2.status === 'HIGH' || e2.status === 'BORDERLINE_HIGH')) return [];
  return [
    {
      ruleId: 'PT-E2-HIGH',
      severity: 'watch',
      message:
        `Estradiol (${fmt(e2.valueNumeric, e2.unit)}) is above the reference range. ` +
        'A discussion point for your clinician, particularly in the context of any symptoms.',
      biomarkerKey: 'estradiol_sensitive',
      evidence: [evidence(e2)],
    },
  ];
}

/** Lipid risk pattern: high LDL/Trigs + low HDL */
function patternAtherogenic(ctx: PatternContext): Finding[] {
  const ldl = latest(ctx.results, 'ldl');
  const tg = latest(ctx.results, 'triglycerides');
  const hdl = latest(ctx.results, 'hdl');
  const hits: ClassifiedResult[] = [];
  if (ldl && (ldl.status === 'HIGH' || ldl.status === 'BORDERLINE_HIGH')) hits.push(ldl);
  if (tg && (tg.status === 'HIGH' || tg.status === 'BORDERLINE_HIGH')) hits.push(tg);
  if (hdl && (hdl.status === 'LOW' || hdl.status === 'BORDERLINE_LOW')) hits.push(hdl);
  if (hits.length < 2) return [];
  return [
    {
      ruleId: 'PT-ATHEROGENIC-LIPIDS',
      severity: 'attention',
      message:
        'An atherogenic lipid pattern is present (multiple lipid values outside the reference range): ' +
        hits.map(outOfRangeMsg).join(' ') +
        ' Worth discussing cardiovascular follow-up with your clinician.',
      biomarkerKey: 'ldl',
      evidence: hits.map((c) => evidence(c)),
    },
  ];
}

/** Low eGFR / elevated creatinine — renal discussion point */
function patternRenal(ctx: PatternContext): Finding[] {
  const egfr = latest(ctx.results, 'egfr');
  const cr = latest(ctx.results, 'creatinine');
  if (!egfr || !(egfr.status === 'LOW' || egfr.status === 'BORDERLINE_LOW')) {
    if (!cr || !(cr.status === 'HIGH' || cr.status === 'BORDERLINE_HIGH')) return [];
  }
  const hits = [egfr, cr].filter((c): c is ClassifiedResult => !!c && isAbnormal(c.status));
  return [
    {
      ruleId: 'PT-RENAL',
      severity: 'watch',
      message:
        'Kidney-function markers are outside the reference range: ' +
        hits.map(outOfRangeMsg).join(' ') +
        ' Worth discussing with your clinician.',
      biomarkerKey: egfr ? 'egfr' : 'creatinine',
      evidence: hits.map((c) => evidence(c)),
    },
  ];
}

/** Insulin resistance pattern: elevated glucose/A1C/insulin/HOMA-IR proxies */
function patternMetabolic(ctx: PatternContext): Finding[] {
  const glucose = latest(ctx.results, 'glucose');
  const a1c = latest(ctx.results, 'a1c');
  const insulin = latest(ctx.results, 'insulin');
  const hits: ClassifiedResult[] = [];
  if (glucose && (glucose.status === 'HIGH' || glucose.status === 'BORDERLINE_HIGH')) hits.push(glucose);
  if (a1c && (a1c.status === 'HIGH' || a1c.status === 'BORDERLINE_HIGH')) hits.push(a1c);
  if (insulin && (insulin.status === 'HIGH' || insulin.status === 'BORDERLINE_HIGH')) hits.push(insulin);
  if (hits.length === 0) return [];
  return [
    {
      ruleId: 'PT-METABOLIC',
      severity: 'attention',
      message:
        'Metabolic markers are elevated relative to reference: ' +
        hits.map(outOfRangeMsg).join(' ') +
        ' Worth discussing metabolic health follow-up with your clinician.',
      biomarkerKey: a1c ? 'a1c' : 'glucose',
      evidence: hits.map((c) => evidence(c)),
    },
  ];
}

// ── General out-of-range sweep (mild severity, for everything not otherwise hit) ──
function patternOutOfRange(ctx: PatternContext): Finding[] {
  const out: Finding[] = [];
  // keys already covered by a more specific rule above
  const covered = new Set([
    'total_testosterone',
    'free_testosterone',
    'shbg',
    'estradiol_sensitive',
    'hematocrit',
    'ldl',
    'triglycerides',
    'hdl',
    'egfr',
    'creatinine',
    'glucose',
    'a1c',
    'insulin',
  ]);
  const seen = new Set<string>();
  for (const r of ctx.results) {
    if (covered.has(r.biomarkerKey) || seen.has(r.biomarkerKey)) continue;
    if (isOutOfBand(r.status)) {
      seen.add(r.biomarkerKey);
      out.push({
        ruleId: 'PT-OUT-OF-RANGE',
        severity: 'info',
        message: outOfRangeMsg(r),
        biomarkerKey: r.biomarkerKey,
        evidence: [evidence(r)],
      });
    }
  }
  return out;
}

export function runRules(
  results: ClassifiedResult[],
  trends: Trend[],
  patient: PatientContext,
): Finding[] {
  const ctx: PatternContext = { results, trends, patient };
  const redFlags = runRedFlagRules(results);
  const patterns = [
    ...patternLowTestosterone(ctx),
    ...patternRisingHematocrit(ctx),
    ...patternShbg(ctx),
    ...patternEstradiol(ctx),
    ...patternAtherogenic(ctx),
    ...patternRenal(ctx),
    ...patternMetabolic(ctx),
    ...patternOutOfRange(ctx),
  ];
  // Red flags first, then by severity, then stable by ruleId
  const sevRank: Record<string, number> = { red_flag: 0, attention: 1, watch: 2, info: 3 };
  const rank = (s: string) => sevRank[s] ?? 99;
  return [...redFlags, ...patterns].sort((a, b) => {
    const s = rank(a.severity) - rank(b.severity);
    return s !== 0 ? s : a.ruleId.localeCompare(b.ruleId);
  });
}

// ── Coverage gaps (GOLD §5.13: suggested additional tests) ────────────────────
// Deterministic: a fixed panel expectation per category, checked against what's
// present in the data. Missing markers are suggested for discussion.

export const EXPECTED_PANEL: Record<string, string[]> = {
  hormone: [
    'total_testosterone',
    'free_testosterone',
    'shbg',
    'lh',
    'fsh',
    'estradiol_sensitive',
    'prolactin',
  ],
  thyroid: ['tsh', 'free_t3', 'free_t4'],
  cbc: ['hemoglobin', 'hematocrit', 'rbc', 'wbc', 'platelets'],
  cmp: ['alt', 'ast', 'creatinine', 'egfr', 'bun'],
  lipid: ['hdl', 'ldl', 'triglycerides', 'total_cholesterol'],
  metabolic: ['a1c', 'glucose'],
  inflammation: ['hscrp'],
};

export const BIOMARKER_DISPLAY_NAMES: Record<string, string> = {
  total_testosterone: 'Total testosterone',
  free_testosterone: 'Free testosterone',
  lh: 'LH',
  fsh: 'FSH',
  estradiol_sensitive: 'Estradiol (sensitive)',
  prolactin: 'Prolactin',
  free_t3: 'Free T3',
  free_t4: 'Free T4',
  bun: 'BUN',
  hscrp: 'hs-CRP',
  a1c: 'Hemoglobin A1C',
};

const pretty = (k: string) => BIOMARKER_DISPLAY_NAMES[k] ?? k;

export function coverageGaps(results: ClassifiedResult[]): CoverageGap[] {
  const present = new Set(results.map((r) => r.biomarkerKey));
  const gaps: CoverageGap[] = [];
  for (const [category, keys] of Object.entries(EXPECTED_PANEL)) {
    const missing = keys.filter((k) => !present.has(k));
    if (missing.length === 0) continue;
    gaps.push({
      category,
      missingBiomarkerKeys: missing,
      message:
        `${category.charAt(0).toUpperCase() + category.slice(1)} panel is incomplete; ` +
        `consider discussing the following with your clinician: ${missing.map(pretty).join(', ')}.`,
    });
  }
  return gaps;
}
