/**
 * Extraction pipeline — pulls structured biomarker values from a lab document.
 *
 * This pass: deterministic stub. It returns plausible sample data so the UI and
 * data flow can be built and tested end-to-end without an OpenAI key. When
 * OPENAI_API_KEY is set, `extractLab` will route to the live implementation
 * (added in a later pass) — the signature and schema stay identical.
 *
 * GOLD §2 / §6: extraction must transcribe only what is printed, never infer a
 * value. The stub marks every result `uncertain: true` precisely because it
 * didn't actually read a document — surfacing that to the user for review.
 */
import { ExtractionSchema, type Extraction, type ExtractedResult, guarded } from './schemas';

export type ExtractLabInput = {
  /** raw file bytes or path — unused by the stub */
  fileName: string;
  mimeType: string;
};

const STUB_RESULTS: Omit<ExtractedResult, 'uncertain'>[] = [
  {
    biomarkerKey: 'total_testosterone',
    rawValue: '412',
    rawUnit: 'ng/dL',
    rawRefLow: '264',
    rawRefHigh: '916',
    rawRefText: '264 - 916 ng/dL',
    valueNumeric: 412,
    canonicalUnit: 'ng/dL',
    flag: null,
  },
  {
    biomarkerKey: 'free_testosterone',
    rawValue: '68',
    rawUnit: 'pg/mL',
    rawRefLow: '47',
    rawRefHigh: '244',
    rawRefText: '47.0 - 244.0 pg/mL',
    valueNumeric: 68,
    canonicalUnit: 'pg/mL',
    flag: null,
  },
  {
    biomarkerKey: 'shbg',
    rawValue: '52',
    rawUnit: 'nmol/L',
    rawRefLow: '16.5',
    rawRefHigh: '55.9',
    rawRefText: '16.5 - 55.9 nmol/L',
    valueNumeric: 52,
    canonicalUnit: 'nmol/L',
    flag: null,
  },
  {
    biomarkerKey: 'hematocrit',
    rawValue: '54',
    rawUnit: '%',
    rawRefLow: '41',
    rawRefHigh: '53',
    rawRefText: '41.0 - 53.0 %',
    valueNumeric: 54,
    canonicalUnit: '%',
    flag: 'H',
  },
  {
    biomarkerKey: 'estradiol_sensitive',
    rawValue: '35',
    rawUnit: 'pg/mL',
    rawRefLow: '10',
    rawRefHigh: '40',
    rawRefText: '10.0 - 40.0 pg/mL',
    valueNumeric: 35,
    canonicalUnit: 'pg/mL',
    flag: null,
  },
];

/**
 * Extract structured data from an uploaded lab file.
 * Stub implementation — marks all results uncertain (not actually read).
 */
export async function extractLab(input: ExtractLabInput): Promise<Extraction> {
  // In a later pass: if (process.env.OPENAI_API_KEY) return extractLabLive(input);
  // For now, deterministically produce sample data.
  const isStub = !process.env.OPENAI_API_KEY;

  const extraction: Extraction = {
    collectedAt: new Date().toISOString().slice(0, 10),
    laboratory: isStub ? 'Sample Lab (stub extraction)' : null,
    doctor: null,
    results: STUB_RESULTS.map((r) => ({ ...r, uncertain: isStub })),
  };

  return ExtractionSchema.parse(extraction);
}

/** Convenience: extract + run the output through the guardrail audit. */
export async function extractLabGuarded(input: ExtractLabInput) {
  const payload = await extractLab(input);
  const auditText = JSON.stringify(payload);
  return guarded(payload, auditText);
}
