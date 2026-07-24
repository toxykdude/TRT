/**
 * Zod schemas for the AI pipelines. These define the Structured Output contract
 * (GOLD §6.2): every model response is validated against one of these before
 * use, and in production the same schema is passed to OpenAI Structured Outputs
 * so the model is constrained to it at generation time.
 */
import { z } from 'zod';
import { enforceGuardrails, type GuardrailResult } from './guardrails';

// ── Extraction (P0.2.a) ──────────────────────────────────────────────────────
// Model-facing Structured Output contract. Transcribes a lab document exactly as
// printed (GOLD §6.2 — never infer a value). Each biomarker carries the printed
// `name`, the resolved `canonicalCode` (Biomarker.key, or null when unmapped →
// surfaced for review), plus `confidence` and `sourcePage` for auditability.
// The raw→normalized mapping to LabResult columns lives in extraction.ts.
export const ExtractedBiomarkerSchema = z.object({
  /** biomarker name exactly as printed on the report */
  name: z.string(),
  /** resolved Biomarker.key, or null when no catalog/alias match (review) */
  canonicalCode: z.string().nullable(),
  /** value exactly as printed ("584.70", ">1000", "<0.5", "positive") */
  value: z.string(),
  unit: z.string().nullable(),
  referenceLow: z.string().nullable(),
  referenceHigh: z.string().nullable(),
  /** ISO date/time the sample was collected, if present on the report */
  collectedAt: z.string().nullable(),
  /** model's self-reported transcription confidence, 0..1 */
  confidence: z.number().min(0).max(1),
  /** 1-indexed page the value was read from, if known */
  sourcePage: z.number().int().nullable(),
});
export type ExtractedBiomarker = z.infer<typeof ExtractedBiomarkerSchema>;

export const ExtractionSchema = z.object({
  labName: z.string().nullable(),
  /** report-level collection date if a single one is present */
  collectedAt: z.string().nullable(),
  biomarkers: z.array(ExtractedBiomarkerSchema),
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
  /** GOLD §2.5 — REQUIRED. Schema validation fails without it. */
  disclaimer: z.string().min(1),
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

