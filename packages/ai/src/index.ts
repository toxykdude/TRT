/**
 * @trt/ai — extraction, analysis, dosing, and report pipelines with enforced guardrails.
 *
 * Every export routes its output through `enforceGuardrails()` (GOLD §2/§6).
 * This pass returns deterministic stub data; setting OPENAI_API_KEY will later
 * activate the live OpenAI implementations without changing these signatures.
 *
 * AI participates in both extraction (OCR/PDF) and analysis (Graphiti RAG dosing).
 */
export {
  enforceGuardrails,
  refuseAndRedirect,
  type GuardrailResult,
} from './guardrails';

export { extractLab, extractLabGuarded, type ExtractLabInput } from './extraction';
export { analyze, analyzeGuarded, type AnalyzeInput } from './analysis';
export { generateReport, generateReportGuarded, type ReportInput } from './report';

export {
  ExtractionSchema,
  AnalysisSectionSchema,
  ReportSectionSchema,
  guarded,
  type Extraction,
  type AnalysisSection,
  type ReportSection,
  type ExtractedResult,
} from './schemas';

// ── Dosing recommendations ────────────────────────────────────────────────────
/**
 * Generate steroid + ancillary dosing recommendations from deterministic findings.
 * Called by the report generation route after the deterministic engine runs.
 */
export { generateDosingRecommendations } from './dosing';
export type { DosingRecommendation } from './dosing';
