/**
 * Zod schemas for the AI pipelines. These define the Structured Output contract
 * (GOLD §6.2): every model response is validated against one of these before
 * use, and in production the same schema is passed to OpenAI Structured Outputs
 * so the model is constrained to it at generation time.
 */
import { z } from 'zod';
import { enforceGuardrails, type GuardrailResult } from './guardrails';

// ── Extraction ───────────────────────────────────────────────────────────────
export const ExtractedResultSchema = z.object({
  biomarkerKey: z.string(),
  rawValue: z.string().nullable(),
  rawUnit: z.string().nullable(),
  rawRefLow: z.string().nullable(),
  rawRefHigh: z.string().nullable(),
  rawRefText: z.string().nullable(),
  valueNumeric: z.number().nullable(),
  canonicalUnit: z.string().nullable(),
  flag: z.string().nullable(), // "H" | "L" | null
  uncertain: z.boolean().default(false),
});
export type ExtractedResult = z.infer<typeof ExtractedResultSchema>;

export const ExtractionSchema = z.object({
  collectedAt: z.string().nullable(), // ISO date
  laboratory: z.string().nullable(),
  doctor: z.string().nullable(),
  results: z.array(ExtractedResultSchema),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

// ── Analysis (GOLD §5.12) ────────────────────────────────────────────────────
export const AnalysisSectionSchema = z.object({
  executiveSummary: z.string(),
  importantChanges: z.array(z.string()),
  potentialTrends: z.array(z.string()),
  questionsForPhysician: z.array(z.string()),
  discussionPoints: z.array(z.string()), // evidence-based
  possibleDifferentialsToDiscuss: z.array(z.string()), // NOT diagnoses
  additionalTestingNeeded: z.array(z.string()),
});
export type AnalysisSection = z.infer<typeof AnalysisSectionSchema>;

// ── Report (GOLD §5.13) ──────────────────────────────────────────────────────
export const ReportSectionSchema = z.object({
  executiveSummary: z.string(),
  hormoneTrends: z.string(),
  cbcTrends: z.string(),
  estradiolTrends: z.string(),
  shbgTrends: z.string(),
  thyroidTrends: z.string(),
  metabolicHealth: z.string(),
  cardiovascularRiskFactors: z.string(),
  questionsForPhysician: z.array(z.string()),
  suggestedAdditionalTests: z.array(z.string()),
  redFlags: z.array(z.string()),
  lifestyleFactors: z.string(),
  guidelineReferences: z.array(z.string()),
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

// ── Guardrail-audited output wrapper ─────────────────────────────────────────
/**
 * Every pipeline returns its payload alongside the guardrail verdict. Even
 * though stubs produce safe output, the guardrail pass is real and runs on
 * every output — so swapping in a live OpenAI key later changes nothing about
 * safety enforcement.
 */
export const guarded = <T>(payload: T, textForAudit: string) => {
  return { payload, audit: enforceGuardrails(textForAudit) };
};
