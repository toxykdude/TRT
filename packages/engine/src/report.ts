/**
 * Deterministic report assembly.
 *
 * Turns classified results + trends + findings + gaps into the structured
 * report (GOLD §5.13). Pure function of the inputs: same inputs → byte-identical
 * output (modulo the timestamp, which is recorded but excluded from the hash).
 *
 * Every sentence is derived from findings/evidence, so the prose is traceable
 * to the rules and data that produced it. No free-text generation.
 */
import { createHash } from 'node:crypto';
import { REPORT_DISCLAIMER } from '@trt/guardrails';
import { statusLabel } from './classify';
import { trendWord } from './trends';
import type {
  ClassifiedResult,
  DeterministicReport,
  Finding,
  ResultPoint,
  Trend,
} from './types';

const fmt = (v: number | null, unit: string | null) =>
  v == null ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ' ' + unit : ''}`;

function latestBy(results: ClassifiedResult[], key: string): ClassifiedResult | undefined {
  return results
    .filter((r) => r.biomarkerKey === key)
    .sort((a, b) => (b.collectedAt ?? '').localeCompare(a.collectedAt ?? ''))[0];
}

function trendByName(trends: Trend[], key: string): Trend | undefined {
  return trends.find((t) => t.biomarkerKey === key);
}

/** Build a category-level trend sentence from its findings + trend line. */
function categoryTrend(
  trends: Trend[],
  results: ClassifiedResult[],
  keys: string[],
): string {
  const lines: string[] = [];
  for (const key of keys) {
    const t = trendByName(trends, key);
    const c = latestBy(results, key);
    if (!t || !c) continue;
    const dir = trendWord(t.direction);
    const status = statusLabel(c.status).toLowerCase();
    lines.push(`${c.biomarkerName}: latest ${fmt(c.valueNumeric, c.unit)} (${status}), trend ${dir}.`);
  }
  return lines.length ? lines.join(' ') : 'Insufficient data to characterize this section.';
}

export function assembleReport(
  results: ResultPoint[],
  classified: ClassifiedResult[],
  trends: Trend[],
  findings: Finding[],
  gaps: DeterministicReport['coverageGaps'],
): DeterministicReport {
  const dates = results
    .map((r) => r.collectedAt)
    .filter((d): d is string => !!d)
    .sort();
  const dataRangeStart = dates[0] ?? null;
  const dataRangeEnd = dates[dates.length - 1] ?? null;

  const redFlags = findings.filter((f) => f.severity === 'red_flag');
  const attention = findings.filter((f) => f.severity === 'attention');

  // ── Executive summary ──────────────────────────────────────────────────────
  const abnormalCount = classified.filter(
    (c) => c.status === 'LOW' || c.status === 'HIGH',
  ).length;
  const borderlineCount = classified.filter(
    (c) => c.status === 'BORDERLINE_LOW' || c.status === 'BORDERLINE_HIGH',
  ).length;

  let execSummary =
    `This report summarizes ${classified.length} lab value(s)`;
  if (dataRangeStart && dataRangeEnd) {
    execSummary += ` collected between ${dataRangeStart} and ${dataRangeEnd}`;
  }
  execSummary += '. ';
  if (redFlags.length > 0) {
    execSummary += `${redFlags.length} value(s) warrant prompt clinician review. `;
  }
  execSummary +=
    `${abnormalCount} value(s) are outside, and ${borderlineCount} are at the edge of, ` +
    'the reference range. ';
  execSummary +=
    'This summary is educational and organizational; it does not diagnose or prescribe. ' +
    'Discuss all findings with your healthcare provider.';

  // ── Section prose (derived from findings + trends) ─────────────────────────
  const hormoneTrends = categoryTrend(trends, classified, [
    'total_testosterone',
    'free_testosterone',
    'lh',
    'fsh',
    'prolactin',
    'dhea_s',
    'cortisol_am',
    'igf_1',
  ]);
  const cbcTrends = categoryTrend(trends, classified, [
    'hemoglobin',
    'hematocrit',
    'rbc',
    'wbc',
    'platelets',
  ]);
  const estradiolTrends =
    categoryTrend(trends, classified, ['estradiol_sensitive']) +
    ' ' +
    (findings
      .filter((f) => f.biomarkerKey === 'estradiol_sensitive')
      .map((f) => f.message)
      .join(' ') || '');
  const shbgTrends =
    categoryTrend(trends, classified, ['shbg']) +
    ' ' +
    (findings.filter((f) => f.biomarkerKey === 'shbg').map((f) => f.message).join(' ') || '');
  const thyroidTrends = categoryTrend(trends, classified, ['tsh', 'free_t3', 'free_t4', 'reverse_t3']);
  const metabolicHealth =
    categoryTrend(trends, classified, ['glucose', 'a1c', 'insulin']) +
    ' ' +
    (attention.find((f) => f.ruleId === 'PT-METABOLIC')?.message ?? '');
  const cardiovascularRiskFactors =
    categoryTrend(trends, classified, ['ldl', 'hdl', 'triglycerides', 'total_cholesterol']) +
    ' ' +
    (attention.find((f) => f.ruleId === 'PT-ATHEROGENIC-LIPIDS')?.message ?? '');

  // ── Questions for physician (deterministic: one per red_flag/attention finding) ──
  const questionsForPhysician: string[] = [];
  for (const f of [...redFlags, ...attention]) {
    questionsForPhysician.push(`${f.message} How would you like to follow up?`);
  }
  if (questionsForPhysician.length === 0) {
    questionsForPhysician.push(
      'No values crossed the prompt-review thresholds; what routine follow-up cadence do you recommend?',
    );
  }

  // ── Suggested additional tests (from coverage gaps) ────────────────────────
  const suggestedAdditionalTests = gaps.length
    ? gaps.flatMap((g) =>
        g.missingBiomarkerKeys.map((k) => `Consider discussing ${g.category}: ${k} with your clinician.`),
      )
    : ['No expected-panel gaps detected.'];

  // ── Red flags list ──────────────────────────────────────────────────────────
  const redFlagMessages = redFlags.map((f) => f.message);

  // ── Lifestyle factors (deterministic from patient context) ─────────────────
  const lifestyleFactors =
    'Sleep duration, exercise frequency, alcohol use, and body composition influence hormone and ' +
    'metabolic markers. Tracking these consistently over time improves the interpretation of trends.';

  const guidelineReferences = [
    'Endocrine Society Clinical Practice Guideline on Testosterone Therapy in Adult Men with Androgen Deficiency Syndromes.',
    'AACE/ACE clinical guidance on hypogonadism and male sexual health (refer to current published editions for exact citations).',
  ];

  // ── Knowledge-base references (deterministic, cited) ──────────────────────
  // Aggregate all cited passages attached to findings via KB enrichment.
  const seenRefs = new Set<string>();
  const knowledgeBaseReferences: string[] = [];
  for (const f of findings) {
    if (!f.references) continue;
    for (const r of f.references) {
      const key = `${r.documentTitle}|${r.excerpt.slice(0, 40)}`;
      if (seenRefs.has(key)) continue;
      seenRefs.add(key);
      const page = r.page != null ? ` p.${r.page}` : '';
      knowledgeBaseReferences.push(`${r.documentTitle}${page}: ${r.excerpt}`);
    }
  }

  // ── Knowledge-graph facts (Goal 2) ────────────────────────────────────────
  const seenFacts = new Set<string>();
  const knowledgeGraphFacts: string[] = [];
  for (const f of findings) {
    if (!f.graphFacts) continue;
    for (const fact of f.graphFacts) {
      const key = fact.slice(0, 60);
      if (seenFacts.has(key)) continue;
      seenFacts.add(key);
      knowledgeGraphFacts.push(fact);
    }
  }

  const sections = {
    executiveSummary: execSummary,
    hormoneTrends,
    cbcTrends,
    estradiolTrends,
    shbgTrends,
    thyroidTrends,
    metabolicHealth,
    cardiovascularRiskFactors,
    questionsForPhysician,
    suggestedAdditionalTests,
    redFlags: redFlagMessages,
    lifestyleFactors,
    guidelineReferences,
    knowledgeBaseReferences,
    knowledgeGraphFacts,
    // GOLD §2.5 — mandatory, non-optional disclaimer block on every report.
    disclaimer: REPORT_DISCLAIMER,
  };

  // Deterministic hash over everything except the timestamp (which is recorded
  // for display but excluded so two runs on the same data yield the same hash).
  const hash = deterministicHash({
    classified,
    trends,
    findings,
    gaps,
    sections,
  });

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      resultCount: results.length,
      classifiedCount: classified.length,
      findingCount: findings.length,
      redFlagCount: redFlags.length,
      dataRangeStart,
      dataRangeEnd,
    },
    classified,
    trends,
    findings,
    coverageGaps: gaps,
    sections,
    hash,
    dosingRecommendations: [],
  };
}

/** Stable hash: sha256 over a canonical JSON serialization (keys sorted). */
function deterministicHash(obj: unknown): string {
  const json = JSON.stringify(obj, stableReplacer);
  return 'sha256:' + createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function stableReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {});
  }
  return value;
}
