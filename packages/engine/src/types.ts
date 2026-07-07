/**
 * Deterministic clinical engine — core types.
 *
 * Design principle (GOLD §2): this engine is 100% deterministic. For a given
 * set of inputs it always produces the same outputs. Every conclusion is a
 * {@link Finding} that records the exact rule that fired and the data points
 * that triggered it, so any report can be audited end-to-end.
 *
 * No AI model is involved in analysis. The engine encodes a fixed knowledge
 * base of ranges, trend logic, and clinical patterns (the kind a clinician
 * would apply by hand). It NEVER prescribes or diagnoses — it classifies,
 * compares, and surfaces discussion points (GOLD §2.4).
 */

// ── Inputs ───────────────────────────────────────────────────────────────────

export type Sex = 'male' | 'female' | 'intersex' | null;

/** A single measured biomarker value, as stored in the DB (LabResult). */
export type ResultPoint = {
  biomarkerKey: string;
  biomarkerName: string;
  category: string;
  /** ISO date the sample was collected */
  collectedAt: string | null;
  /** Normalized numeric value (canonical unit), null if non-numeric */
  valueNumeric: number | null;
  /** Canonical unit, e.g. "ng/dL" */
  unit: string | null;
  /** Raw value as printed (preserved for display) */
  rawValue: string | null;
  /** Per-lab reference low/high in the canonical unit (authoritative) */
  refLow: number | null;
  refHigh: number | null;
  /** Per-lab reference text exactly as printed */
  refText: string | null;
  /** Lab-set flag: "H" | "L" | "AB" | null */
  flag: string | null;
};

/** Patient context the engine reasons over. */
export type PatientContext = {
  sex: Sex;
  ageYears: number | null;
  // lifestyle
  sleepHoursPerNight: number | null;
  alcoholUse: string | null;
  smokingStatus: string | null;
  // history (free text — only keyword-matched, never "understood")
  medicalConditions: string | null;
  medicationsText: string | null;
};

export type EngineInput = {
  patient: PatientContext;
  results: ResultPoint[];
};

// ── Classification ───────────────────────────────────────────────────────────

export type RangeStatus =
  | 'LOW' // below reference low
  | 'BORDERLINE_LOW' // in lowest 10% of the reference band
  | 'NORMAL'
  | 'BORDERLINE_HIGH' // in highest 10% of the reference band
  | 'HIGH' // above reference high
  | 'NON_NUMERIC' // value couldn't be parsed (e.g. "positive")
  | 'NO_RANGE'; // no reference range available

export type ClassifiedResult = ResultPoint & {
  status: RangeStatus;
  /** how far outside the band, in canonical-unit terms (sign indicates direction) */
  deviation: number | null;
};

// ── Trends ───────────────────────────────────────────────────────────────────

export type TrendDirection = 'UP' | 'DOWN' | 'FLAT' | 'INSUFFICIENT';

export type Trend = {
  biomarkerKey: string;
  biomarkerName: string;
  category: string;
  direction: TrendDirection;
  /** signed change from first to last, in canonical units */
  delta: number | null;
  /** relative change as a fraction of the first value (e.g. 0.25 = +25%) */
  relativeChange: number | null;
  points: { date: string | null; value: number | null; status: RangeStatus }[];
};

// ── Findings (rule outputs with provenance) ──────────────────────────────────

export type Severity = 'info' | 'watch' | 'attention' | 'red_flag';

/**
 * A single deterministic conclusion. Every report section is built from these.
 * `ruleId` + `evidence` make the finding fully auditable: you can see exactly
 * which rule fired and which data points drove it.
 */
export type Finding = {
  ruleId: string;
  severity: Severity;
  /** human-readable, support-only text (never prescriptive/diagnostic) */
  message: string;
  biomarkerKey?: string;
  /** the data points that triggered this finding */
  evidence: Array<{
    biomarkerKey: string;
    biomarkerName: string;
    date: string | null;
    value: number | null;
    unit: string | null;
    refText: string | null;
  }>;
  /** cited reference passages from the deterministic KB (Goal 1), if any */
  references?: Array<{
    documentTitle: string;
    page: number | null;
    excerpt: string;
  }>;
};

// ── Gap analysis ─────────────────────────────────────────────────────────────

export type CoverageGap = {
  category: string;
  missingBiomarkerKeys: string[];
  /** support-only suggestion of what to discuss/order */
  message: string;
};

// ── Report ───────────────────────────────────────────────────────────────────

export type DeterministicReport = {
  generatedAt: string;
  /** summary counts for transparency */
  meta: {
    resultCount: number;
    classifiedCount: number;
    findingCount: number;
    redFlagCount: number;
    dataRangeStart: string | null;
    dataRangeEnd: string | null;
  };
  classified: ClassifiedResult[];
  trends: Trend[];
  findings: Finding[];
  coverageGaps: CoverageGap[];
  // structured sections mirror GOLD §5.13
  sections: {
    executiveSummary: string;
    hormoneTrends: string;
    cbcTrends: string;
    estradiolTrends: string;
    shbgTrends: string;
    thyroidTrends: string;
    metabolicHealth: string;
    cardiovascularRiskFactors: string;
    questionsForPhysician: string[];
    suggestedAdditionalTests: string[];
    redFlags: string[];
    lifestyleFactors: string;
    guidelineReferences: string[];
    /** cited passages from the deterministic KB (Goal 1), empty if KB not built */
    knowledgeBaseReferences: string[];
  };
  /** deterministic — same inputs always produce the same report hash */
  hash: string;
};
