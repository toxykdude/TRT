/**
 * Presentation-layer resolvers for the report narrative.
 *
 * The deterministic engine (packages/engine) stores English prose in
 * `report.sections.*` to feed the audit hash + provenance trail. This module
 * REASSEMBLES that same narrative in the active locale directly from the
 * STRUCTURED data the report also carries (classified, trends, findings,
 * coverageGaps) — mirroring the composition in
 * `packages/engine/src/report.ts` but emitting localized strings via the
 * next-intl dictionaries.
 *
 * Hard rules (see GOLD §6 + AGENTS.md §7):
 *   - NEVER touch the engine, the hash, or the stored English prose. Those stay
 *     byte-identical; the UI simply stops rendering them directly.
 *   - Legacy reports that pre-date the persisted structured fields fall back to
 *     the stored English section strings (still render, never crash).
 *   - KB citations + graph facts are source DATA (book titles, excerpts) — they
 *     are passed through verbatim and never translated here.
 */
import type { Translator } from './dosing-i18n';

// ── Lightweight shapes (only what the UI needs; engine types are richer) ───────

export type EvidenceLite = {
  biomarkerKey: string;
  biomarkerName: string;
  date: string | null;
  value: number | null;
  unit: string | null;
  refText: string | null;
  /** RangeStatus, attached apps-side so direction can be recovered (engine evidence omits it). */
  status?: string | null;
};

export type FindingLite = {
  ruleId: string;
  severity: string;
  message: string;
  biomarkerKey?: string;
  evidence: EvidenceLite[];
};

export type ClassifiedLite = {
  biomarkerKey: string;
  biomarkerName: string;
  category: string;
  valueNumeric: number | null;
  unit: string | null;
  status: string;
  refText?: string | null;
  collectedAt?: string | null;
};

export type TrendLite = {
  biomarkerKey: string;
  biomarkerName?: string;
  direction: string;
};

export type CoverageGapLite = {
  category: string;
  missingBiomarkerKeys: string[];
  message: string;
};

type MetaLite = {
  resultCount?: number;
  classifiedCount?: number;
  findingCount?: number;
  redFlagCount?: number;
  dataRangeStart?: string | null;
  dataRangeEnd?: string | null;
};

/**
 * The persisted `sections` JSON shape. Narrative prose + KB/graph citations are
 * the legacy/fallback source; `findings`, `coverageGaps`, and `chartData` are
 * the structured source the assembler localizes from.
 */
export type ReportSectionsLike = {
  executiveSummary?: string;
  hormoneTrends?: string;
  cbcTrends?: string;
  estradiolTrends?: string;
  shbgTrends?: string;
  thyroidTrends?: string;
  metabolicHealth?: string;
  cardiovascularRiskFactors?: string;
  questionsForPhysician?: string[];
  suggestedAdditionalTests?: string[];
  redFlags?: string[];
  lifestyleFactors?: string;
  guidelineReferences?: string[];
  knowledgeBaseReferences?: string[];
  knowledgeGraphFacts?: string[];
  findings?: FindingLite[];
  coverageGaps?: CoverageGapLite[];
  chartData?: {
    classified?: ClassifiedLite[];
    trends?: TrendLite[];
    meta?: MetaLite;
  };
};

export type LocalizedNarrative = {
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
};

export type NarrativeTranslators = {
  report: Translator;
  findings: Translator;
  status: Translator;
  trend: Translator;
  biomarkers: Translator;
  categories: Translator;
};

// ── Value formatting (mirrors engine fmt; locale-neutral, null-safe) ───────────

function fmtValueUnit(value: number | null, unit: string | null): string {
  if (value == null) return '—';
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}

/** Resolve a biomarker display name via the Biomarkers namespace, with fallback. */
function biomarkerName(key: string, raw: string, biomarkersT: Translator): string {
  return biomarkersT.has(key) ? biomarkersT(key) : raw;
}

/** Lowercased, localized status label (mirrors engine statusLabel().toLowerCase()). */
function statusLabel(status: string, statusT: Translator): string {
  return statusT.has(status) ? statusT(status).toLowerCase() : status.toLowerCase();
}

// ── outOfRange building block (engine outOfRangeMsg, localized) ────────────────

function directionOf(status: string | null | undefined): 'below' | 'above' | null {
  if (!status) return null;
  return status === 'LOW' || status === 'BORDERLINE_LOW' ? 'below' : 'above';
}

function outOfRangeParams(ev: EvidenceLite, biomarkersT: Translator) {
  return {
    biomarker: biomarkerName(ev.biomarkerKey, ev.biomarkerName, biomarkersT),
    valueUnit: fmtValueUnit(ev.value, ev.unit),
    dir: directionOf(ev.status) ?? 'above',
    refSuffix: ev.refText ? ` (${ev.refText})` : '',
  };
}

function localizedOutOfRange(ev: EvidenceLite, reportT: Translator, biomarkersT: Translator): string {
  return reportT('outOfRange', outOfRangeParams(ev, biomarkersT));
}

// ── Per-finding localized message ──────────────────────────────────────────────

const MULTI_HIT_RULES = new Set(['PT-LOW-T', 'PT-ATHEROGENIC-LIPIDS', 'PT-RENAL', 'PT-METABOLIC']);

/** Rules whose template consumes a single {valueUnit} from evidence[0]. */
const SINGLE_VALUE_RULES = new Set([
  'RF-HEMATOCRIT-HIGH',
  'RF-HEMOGLOBIN-HIGH',
  'RF-PSA-ELEVATED',
  'RF-PSA-SIGNIFICANT',
  'RF-ALT-HIGH',
  'RF-AST-HIGH',
  'RF-EGFR-LOW',
  'RF-TRIGLYCERIDES-HIGH',
  'RF-GLUCOSE-HIGH',
  'PT-HEMATOCRIT-RISE',
  'PT-SHBG-LOW',
  'PT-E2-HIGH',
]);

/**
 * Resolve a localized message for a finding. Falls back to the raw English
 * `finding.message` when the ruleId is unknown to the dictionary OR when a
 * multi-hit rule lacks the status context needed to render direction correctly
 * (legacy data) — never crashes, never emits a wrong-direction string.
 */
export function localizedFindingMessage(
  finding: FindingLite,
  translators: NarrativeTranslators,
): string {
  const { report: reportT, findings: findingsT, biomarkers: biomarkersT } = translators;
  const ev = finding.evidence ?? [];

  // PT-OUT-OF-RANGE is a straight passthrough to the shared outOfRange block
  // (engine: `message: outOfRangeMsg(r)`).
  if (finding.ruleId === 'PT-OUT-OF-RANGE') {
    const hit = ev[0];
    return hit ? localizedOutOfRange(hit, reportT, biomarkersT) : finding.message;
  }

  if (MULTI_HIT_RULES.has(finding.ruleId)) {
    return multiHitMessage(finding, translators);
  }

  if (findingsT.has(finding.ruleId)) {
    const hit = ev[0];
    return findingsT(finding.ruleId, {
      valueUnit: hit ? fmtValueUnit(hit.value, hit.unit) : '—',
    });
  }

  // Unknown / legacy ruleId → raw English message (audit-safe).
  return finding.message;
}

function multiHitMessage(finding: FindingLite, translators: NarrativeTranslators): string {
  const { report: reportT, findings: findingsT, biomarkers: biomarkersT } = translators;
  const ev = finding.evidence ?? [];

  // PT-LOW-T appends LH contextually; its evidence = [...tHits, ?lh]. The other
  // multi-hit rules map outOfRange over every evidence point.
  const hitsAll = finding.ruleId === 'PT-LOW-T' ? ev.filter((e) => e.biomarkerKey !== 'lh') : ev;
  if (hitsAll.length === 0) return finding.message;

  // Direction (below/above) comes from evidence.status. If any hit lacks it we
  // cannot render correctly → fall back to the stored English message.
  if (hitsAll.some((e) => directionOf(e.status) === null)) return finding.message;

  const hits = hitsAll.map((e) => localizedOutOfRange(e, reportT, biomarkersT)).join(' ');

  if (finding.ruleId === 'PT-LOW-T') {
    const lh = ev.find((e) => e.biomarkerKey === 'lh');
    const lhClause = lh
      ? reportT('lhClausePresent', { lhValueUnit: fmtValueUnit(lh.value, lh.unit) })
      : reportT('lhClauseAbsent');
    return findingsT('PT-LOW-T', { hits, lhClause });
  }

  return findingsT(finding.ruleId, { hits });
}

// ── Category trend line (engine categoryTrend, localized) ──────────────────────

function latestBy(classified: ClassifiedLite[], key: string): ClassifiedLite | undefined {
  return classified
    .filter((c) => c.biomarkerKey === key)
    .sort((a, b) => (b.collectedAt ?? '').localeCompare(a.collectedAt ?? ''))[0];
}

function trendByName(trends: TrendLite[], key: string): TrendLite | undefined {
  return trends.find((t) => t.biomarkerKey === key);
}

function localizedCategoryTrend(
  classified: ClassifiedLite[],
  trends: TrendLite[],
  keys: string[],
  translators: NarrativeTranslators,
): string {
  const { report: reportT, trend: trendT, biomarkers: biomarkersT } = translators;
  const lines: string[] = [];
  for (const key of keys) {
    const c = latestBy(classified, key);
    const t = trendByName(trends, key);
    if (!c || !t) continue;
    const trendWord = trendT.has(t.direction) ? trendT(t.direction) : t.direction;
    lines.push(
      reportT('categoryTrendLine', {
        biomarker: biomarkerName(c.biomarkerKey, c.biomarkerName, biomarkersT),
        valueUnit: fmtValueUnit(c.valueNumeric, c.unit),
        status: statusLabel(c.status, translators.status),
        trend: trendWord,
      }),
    );
  }
  return lines.length ? lines.join(' ') : reportT('insufficientData');
}

// ── Executive summary (engine execSummary, localized) ──────────────────────────

function localizedExecSummary(
  classified: ClassifiedLite[],
  redFlagCount: number,
  meta: MetaLite | undefined,
  reportT: Translator,
): string {
  const abnormalCount = classified.filter((c) => c.status === 'LOW' || c.status === 'HIGH').length;
  const borderlineCount = classified.filter(
    (c) => c.status === 'BORDERLINE_LOW' || c.status === 'BORDERLINE_HIGH',
  ).length;
  const start = meta?.dataRangeStart ?? null;
  const end = meta?.dataRangeEnd ?? null;
  return reportT('execSummaryBody', {
    classified: classified.length,
    hasDates: start && end ? 'true' : 'false',
    start: start ?? '',
    end: end ?? '',
    hasRed: redFlagCount > 0 ? 'true' : 'false',
    redFlags: redFlagCount,
    abnormal: abnormalCount,
    borderline: borderlineCount,
  });
}

// ── Section composition helpers ────────────────────────────────────────────────

/** categoryTrend(...) joined with one optional finding message (engine pattern). */
function trendPlusOneFinding(
  base: string,
  finding: FindingLite | undefined,
  translators: NarrativeTranslators,
): string {
  if (!finding) return base;
  return `${base} ${localizedFindingMessage(finding, translators)}`;
}

/** categoryTrend(...) joined with N finding messages (engine estradiol/shbg pattern). */
function trendPlusFindings(
  base: string,
  findingMatches: FindingLite[],
  translators: NarrativeTranslators,
): string {
  if (findingMatches.length === 0) return base;
  const msgs = findingMatches.map((f) => localizedFindingMessage(f, translators)).join(' ');
  return `${base} ${msgs}`;
}

// ── Public assembler ───────────────────────────────────────────────────────────

/**
 * Reassemble the report narrative in the active locale from the structured data
 * persisted in `sections` (classified, trends, findings, coverageGaps). When
 * that structured data is absent (legacy reports), each section falls back to
 * the stored English prose. Static sections (lifestyle, guidelines) are always
 * localized.
 */
export function assembleLocalizedNarrative(
  sections: ReportSectionsLike,
  translators: NarrativeTranslators,
): LocalizedNarrative {
  const { report: reportT, categories: categoriesT, biomarkers: biomarkersT } = translators;
  const classified = sections.chartData?.classified ?? [];
  const trends = sections.chartData?.trends ?? [];
  const meta = sections.chartData?.meta;
  const findings = sections.findings ?? [];
  const gaps = sections.coverageGaps;

  const hasStructured = classified.length > 0 && Array.isArray(sections.chartData?.trends);
  const hasFindings = Array.isArray(sections.findings);

  // ── Category-trend sections ─────────────────────────────────────────────────
  const hormoneTrends = hasStructured
    ? localizedCategoryTrend(
        classified,
        trends,
        ['total_testosterone', 'free_testosterone', 'lh', 'fsh', 'prolactin', 'dhea_s', 'cortisol_am', 'igf_1'],
        translators,
      )
    : (sections.hormoneTrends ?? '');

  const cbcTrends = hasStructured
    ? localizedCategoryTrend(classified, trends, ['hemoglobin', 'hematocrit', 'rbc', 'wbc', 'platelets'], translators)
    : (sections.cbcTrends ?? '');

  const thyroidTrends = hasStructured
    ? localizedCategoryTrend(classified, trends, ['tsh', 'free_t3', 'free_t4', 'reverse_t3'], translators)
    : (sections.thyroidTrends ?? '');

  const estradiolBase = hasStructured
    ? localizedCategoryTrend(classified, trends, ['estradiol_sensitive'], translators)
    : '';
  const estradiolTrends = hasStructured
    ? trendPlusFindings(
        estradiolBase,
        hasFindings ? findings.filter((f) => f.biomarkerKey === 'estradiol_sensitive') : [],
        translators,
      )
    : (sections.estradiolTrends ?? '');

  const shbgBase = hasStructured
    ? localizedCategoryTrend(classified, trends, ['shbg'], translators)
    : '';
  const shbgTrends = hasStructured
    ? trendPlusFindings(
        shbgBase,
        hasFindings ? findings.filter((f) => f.biomarkerKey === 'shbg') : [],
        translators,
      )
    : (sections.shbgTrends ?? '');

  const metabolicHealth = hasStructured
    ? trendPlusOneFinding(
        localizedCategoryTrend(classified, trends, ['glucose', 'a1c', 'insulin'], translators),
        hasFindings
          ? findings.find((f) => f.severity === 'attention' && f.ruleId === 'PT-METABOLIC')
          : undefined,
        translators,
      )
    : (sections.metabolicHealth ?? '');

  const cardiovascularRiskFactors = hasStructured
    ? trendPlusOneFinding(
        localizedCategoryTrend(classified, trends, ['ldl', 'hdl', 'triglycerides', 'total_cholesterol'], translators),
        hasFindings
          ? findings.find((f) => f.severity === 'attention' && f.ruleId === 'PT-ATHEROGENIC-LIPIDS')
          : undefined,
        translators,
      )
    : (sections.cardiovascularRiskFactors ?? '');

  // ── Executive summary ───────────────────────────────────────────────────────
  const redFlagCount = hasFindings
    ? findings.filter((f) => f.severity === 'red_flag').length
    : (meta?.redFlagCount ?? 0);
  const executiveSummary = hasStructured
    ? localizedExecSummary(classified, redFlagCount, meta, reportT)
    : (sections.executiveSummary ?? '');

  // ── Questions for physician ─────────────────────────────────────────────────
  let questionsForPhysician: string[];
  if (hasFindings) {
    const ordered = [
      ...findings.filter((f) => f.severity === 'red_flag'),
      ...findings.filter((f) => f.severity === 'attention'),
    ];
    questionsForPhysician = ordered.map(
      (f) => `${localizedFindingMessage(f, translators)} ${reportT('followUpQuestion')}`,
    );
    if (questionsForPhysician.length === 0) {
      questionsForPhysician = [reportT('noRedFlagsFollowUp')];
    }
  } else {
    questionsForPhysician = sections.questionsForPhysician ?? [];
  }

  // ── Suggested additional tests (coverage gaps) ──────────────────────────────
  let suggestedAdditionalTests: string[];
  if (Array.isArray(gaps)) {
    if (gaps.length === 0) {
      suggestedAdditionalTests = [reportT('noPanelGaps')];
    } else {
      suggestedAdditionalTests = gaps.flatMap((g) =>
        g.missingBiomarkerKeys.map((k) =>
          reportT('considerDiscussing', {
            category: categoriesT.has(g.category) ? categoriesT(g.category) : g.category,
            biomarker: biomarkersT.has(k) ? biomarkersT(k) : k,
          }),
        ),
      );
    }
  } else {
    suggestedAdditionalTests = sections.suggestedAdditionalTests ?? [];
  }

  // ── Red flags list ──────────────────────────────────────────────────────────
  const redFlags = hasFindings
    ? findings
        .filter((f) => f.severity === 'red_flag')
        .map((f) => localizedFindingMessage(f, translators))
    : (sections.redFlags ?? []);

  // ── Static sections (always localized) ──────────────────────────────────────
  const lifestyleFactors = reportT('lifestyleFactors');
  const guidelineReferences = [reportT('guidelineReference1'), reportT('guidelineReference2')];

  return {
    executiveSummary,
    hormoneTrends,
    cbcTrends,
    estradiolTrends,
    shbgTrends,
    thyroidTrends,
    metabolicHealth,
    cardiovascularRiskFactors,
    questionsForPhysician,
    suggestedAdditionalTests,
    redFlags,
    lifestyleFactors,
    guidelineReferences,
  };
}
