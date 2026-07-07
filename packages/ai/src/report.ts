/**
 * Report pipeline — generates the full AI clinical report (GOLD §5.13).
 * Stub now; live OpenAI later. Every section is guardrail-audited.
 *
 * Sections follow GOLD §5.13. The disclaimer (GOLD §2.5) is added by the report
 * renderer (apps/web), not here — this module produces the structured payload.
 */
import { ReportSectionSchema, guarded, type ReportSection } from './schemas.js';

export type ReportInput = {
  resultCount: number;
  monthsSpan?: number;
};

/**
 * Generate a structured clinical report. Stub returns deterministic, safe text.
 */
export async function generateReport(input: ReportInput): Promise<ReportSection> {
  const report: ReportSection = {
    executiveSummary:
      `This report summarizes ${input.resultCount} lab value(s)` +
      (input.monthsSpan ? ` across ${input.monthsSpan} month(s)` : '') +
      ' for review by your healthcare provider. It is educational and organizational; it does not diagnose or prescribe.',
    hormoneTrends:
      'Total and free testosterone values are within the typical range but toward the lower end. Discuss whether symptom correlation warrants further evaluation.',
    cbcTrends:
      'Hematocrit is recorded above the typical upper reference bound. This is a common discussion point that your clinician should evaluate.',
    estradiolTrends:
      'Estradiol is within the typical range. No notable change flagged by this summary.',
    shbgTrends:
      'SHBG is within the typical range, toward the upper portion, which can influence free hormone availability.',
    thyroidTrends:
      'Insufficient thyroid data in this record to characterize a trend. Consider completing a thyroid panel if not yet done.',
    metabolicHealth:
      'Metabolic markers were not fully captured. A metabolic panel (glucose, A1C, lipids) would help complete the picture.',
    cardiovascularRiskFactors:
      'Lipid and blood-pressure data are incomplete. Cardiovascular risk assessment should be completed with your clinician.',
    questionsForPhysician: [
      'How should I interpret the elevated hematocrit in my context?',
      'Are there additional tests you would order given these results?',
    ],
    suggestedAdditionalTests: [
      'LH and FSH (if not present)',
      'Morning (AM) repeat total + free testosterone',
      'Lipid panel and blood pressure trend',
    ],
    redFlags: [
      'Hematocrit above the typical upper bound warrants prompt clinician review.',
    ],
    lifestyleFactors:
      'Sleep, exercise frequency, alcohol use, and body composition influence hormone and metabolic markers. Tracking these over time improves interpretation.',
    guidelineReferences: [
      'Endocrine Society Clinical Practice Guideline on Testosterone Therapy in Adult Men with Androgen Deficiency Syndromes.',
      'Refer to current published guidance for exact titles, authors, and publication years when citing.',
    ],
  };

  return ReportSectionSchema.parse(report);
}

export async function generateReportGuarded(input: ReportInput) {
  const payload = await generateReport(input);
  const text = JSON.stringify(payload);
  return guarded(payload, text);
}
