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
import type { DeterministicReport, EngineInput } from './types';

export { enforceGuardrails, refuseAndRedirect } from './guardrails';
export type { GuardrailResult } from './guardrails';
export * from './types';
export { classifyResult, classifyAll, statusLabel, isAbnormal, isOutOfBand } from './classify';
export { computeTrends, trendArrow, trendWord } from './trends';

/**
 * Run the deterministic engine over the patient's data.
 * Returns a fully-structured, traceable report.
 */
export function analyze(input: EngineInput): DeterministicReport {
  const { patient, results } = input;

  const classified = classifyAll(results);
  const trends = computeTrends(classified);
  const findings = runRules(classified, trends, patient);
  const gaps = coverageGaps(classified);

  const report = assembleReport(results, classified, trends, findings, gaps);

  // Defense-in-depth: audit every prose section against the guardrails. If (by
  // some rule-wording mistake) a sentence read as prescriptive/diagnostic, the
  // guardrail would flag it. We log the audit count but never silently alter
  // the deterministic output — flagged text is surfaced, not hidden, so it can
  // be corrected in the rule wording.
  const allProse = Object.values(report.sections).flat().join(' ');
  const audit = enforceGuardrails(allProse);
  // Attach the audit result for transparency (not used to mutate the report).
  (report as DeterministicReport & { guardrailAudit: unknown }).guardrailAudit = {
    ok: audit.ok,
    reasons: audit.reasons,
    blocked: audit.blocked,
  };

  return report;
}
