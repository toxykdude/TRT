/**
 * @trt/engine — deterministic clinical analysis engine.
 *
 * Public entrypoint: {@link analyze}. Pure function of {@link EngineInput}.
 * For identical inputs it always produces an identical report (same `hash`).
 *
 * Pipeline (all deterministic):
 *   inputs → classify → trends → rules → gaps → assemble report → guardrail audit
 *
 * No AI model participates in analysis. Guardrails (GOLD §2) still run on the
 * assembled prose as defense-in-depth: even though output is rule-generated,
 * the filter blocks anything that might read as prescriptive/diagnostic.
 */
import { classifyAll } from './classify';
import { computeTrends } from './trends';
import { coverageGaps, runRules } from './rules';
import { assembleReport } from './report';
import { enforceGuardrails } from './guardrails';
import { enrichWithKnowledge, type KbSearchFn } from './knowledge';
import type { DeterministicReport, EngineInput } from './types';

export { enforceGuardrails, refuseAndRedirect } from './guardrails';
export type { GuardrailResult } from './guardrails';
export * from './types';
export { classifyResult, classifyAll, statusLabel, isAbnormal, isOutOfBand } from './classify';
export { computeTrends, trendArrow, trendWord } from './trends';
export { enrichWithKnowledge } from './knowledge';
export type { KbSearchFn, KbReference } from './knowledge';

/**
 * Run the deterministic engine over the patient's data.
 * Returns a fully-structured, traceable report.
 *
 * @param input  patient + lab results
 * @param kbSearch  optional deterministic KB search function (from @trt/kb).
 *                  When provided, findings are enriched with cited reference
 *                  passages from the corpus. Determinism is preserved: same
 *                  inputs + KB → same references → same hash.
 */
export function analyze(input: EngineInput, kbSearch?: KbSearchFn): DeterministicReport {
  const { patient, results } = input;

  const classified = classifyAll(results);
  const trends = computeTrends(classified);
  let findings = runRules(classified, trends, patient);
  if (kbSearch) {
    findings = enrichWithKnowledge(findings, kbSearch);
  }
  const gaps = coverageGaps(classified);

  const report = assembleReport(results, classified, trends, findings, gaps);

  // Defense-in-depth: audit every prose section against the guardrails.
  const allProse = Object.values(report.sections).flat().join(' ');
  const audit = enforceGuardrails(allProse);
  (report as DeterministicReport & { guardrailAudit: unknown }).guardrailAudit = {
    ok: audit.ok,
    reasons: audit.reasons,
    blocked: audit.blocked,
  };

  return report;
}
