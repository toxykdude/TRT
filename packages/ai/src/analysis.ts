/**
 * Analysis pipeline — produces a structured analysis from longitudinal data
 * (GOLD §5.12). Stub now; live OpenAI later. Output is always guardrail-audited.
 *
 * It NEVER diagnoses or prescribes. It summarizes, compares to ranges, surfaces
 * trends, and suggests topics/tests to discuss with a physician.
 */
import { AnalysisSectionSchema, guarded, type AnalysisSection } from './schemas';

export type AnalyzeInput = {
  patientName?: string;
  resultCount: number;
  timespanMonths?: number;
};

/**
 * Generate a structured analysis. Stub returns a deterministic, safe summary.
 */
export async function analyze(input: AnalyzeInput): Promise<AnalysisSection> {
  const analysis: AnalysisSection = {
    executiveSummary:
      `Based on ${input.resultCount} recorded lab value(s)` +
      (input.timespanMonths ? ` over ${input.timespanMonths} month(s)` : '') +
      ', several biomarkers fall outside typical reference ranges. ' +
      'This summary is for discussion with your healthcare provider and does not constitute a diagnosis or treatment recommendation.',
    importantChanges: [
      'Hematocrit is recorded above the typical upper bound — worth discussing with your clinician.',
      'Total testosterone sits in the lower portion of the typical range.',
    ],
    potentialTrends: [
      'Hematocrit appears elevated relative to reference — a pattern sometimes discussed in TRT contexts.',
    ],
    questionsForPhysician: [
      'Is the elevated hematocrit something we should monitor or act on?',
      'Given the total testosterone level, what would you recommend discussing next?',
    ],
    discussionPoints: [
      'Current endocrine society guidance suggests interpreting testosterone alongside symptoms, not lab values alone.',
      'Reference ranges are assay-specific; trends across the same lab are more meaningful than single values.',
    ],
    possibleDifferentialsToDiscuss: [
      'Possible contributing factors to discuss with your clinician — not a diagnosis.',
    ],
    additionalTestingNeeded: [
      'Consider discussing whether LH, FSH, and a morning (AM) repeat testosterone would add clarity.',
    ],
  };

  return AnalysisSectionSchema.parse(analysis);
}

export async function analyzeGuarded(input: AnalyzeInput) {
  const payload = await analyze(input);
  const text = JSON.stringify(payload);
  return guarded(payload, text);
}
