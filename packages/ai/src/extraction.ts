/**
 * Extraction pipeline — pulls structured biomarker values from a lab document.
 *
 * P0.2.a: REAL extraction. When OPENAI_API_KEY is set, `extractLab` routes to
 * `extractLabLive`, which renders the file to page images (poppler), sends them
 * to a vision model with a Structured Outputs (json_schema, strict) request,
 * and validates the response against `ExtractionSchema` (GOLD §6.2). When the
 * key is unset, a deterministic stub is returned (dev/tests, clearly marked).
 *
 * GOLD §6: extraction TRANSCRIBES only what is printed — it never infers a
 * value. Confidence + sourcePage give the route what it needs to gate
 * low-confidence values out of trends/reports until a human confirms them.
 */
import { ExtractionSchema, type Extraction, type ExtractedBiomarker } from './schemas';
import {
  openaiClient,
  extractionModelId,
  isLiveExtractionConfigured,
  estimateCostUsd,
} from './openai';
import { renderPages, toDataUrlInputs, type PageImageInput } from './pdf-render';
import { guarded } from './schemas';

export type ExtractLabInput = {
  /** absolute path to the uploaded file on disk (private storage) */
  filePath: string;
  mimeType: string;
  fileName: string;
};

/**
 * Confidence at/above this a value is auto-CONFIRMED; below → PENDING_REVIEW
 * (excluded from trends/reports until confirmed). P0.2.b acceptance criterion.
 */
export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.85;

// ── Structured Outputs JSON schema (strict) ──────────────────────────────────
// Mirrors ExtractedBiomarkerSchema/ExtractionSchema. Strict mode requires every
// property listed in `required` and additionalProperties:false; nullables use a
// ["type","null"] union.
const extractedBiomarkerJsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    canonicalCode: { type: ['string', 'null'] },
    value: { type: 'string' },
    unit: { type: ['string', 'null'] },
    referenceLow: { type: ['string', 'null'] },
    referenceHigh: { type: ['string', 'null'] },
    collectedAt: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    sourcePage: { type: ['integer', 'null'] },
  },
  required: [
    'name',
    'canonicalCode',
    'value',
    'unit',
    'referenceLow',
    'referenceHigh',
    'collectedAt',
    'confidence',
    'sourcePage',
  ],
  additionalProperties: false,
} as const;

const extractionResponseSchema = {
  type: 'object',
  properties: {
    labName: { type: ['string', 'null'] },
    collectedAt: { type: ['string', 'null'] },
    biomarkers: { type: 'array', items: extractedBiomarkerJsonSchema },
  },
  required: ['labName', 'collectedAt', 'biomarkers'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  'You extract biomarker lab results from a lab report image.',
  'Transcribe EXACTLY what is printed — never infer, round, or fabricate a value.',
  'For each biomarker return: the printed name, the value as printed (string),',
  'the unit, the reference range low and high (as printed), the collection date',
  'if present, your transcription confidence (0..1), and the 1-indexed source page.',
  'For canonicalCode: set the machine key if you recognize it (snake_case, e.g.',
  '"total_testosterone", "estradiol_sensitive", "shbg", "hematocrit"); otherwise null.',
  'Omit non-biomarker rows (patient demographics, techniques, signatures, totals).',
  'Return ONLY the JSON matching the provided schema.',
].join(' ');

// ── Stub (deterministic, dev/tests) ──────────────────────────────────────────
// Mirrors the jmc-sample.pdf golden values so the UI flow works with no key.
const STUB_BIOMARKERS: ExtractedBiomarker[] = [
  {
    name: 'Testosterona Total',
    canonicalCode: 'total_testosterone',
    value: '584.70',
    unit: 'ng/dL',
    referenceLow: '240.24',
    referenceHigh: '870.68',
    collectedAt: '2026-07-08',
    confidence: 0.99,
    sourcePage: 1,
  },
  {
    name: 'Hematocrito',
    canonicalCode: 'hematocrit',
    value: '54',
    unit: '%',
    referenceLow: '41',
    referenceHigh: '53',
    collectedAt: '2026-07-08',
    confidence: 0.97,
    sourcePage: 1,
  },
  {
    name: 'Estradiol',
    canonicalCode: 'estradiol_sensitive',
    value: '35',
    unit: 'pg/mL',
    referenceLow: '10',
    referenceHigh: '40',
    collectedAt: '2026-07-08',
    confidence: 0.95,
    sourcePage: 1,
  },
  {
    name: 'SHBG',
    canonicalCode: 'shbg',
    value: '52',
    unit: 'nmol/L',
    referenceLow: '16.5',
    referenceHigh: '55.9',
    collectedAt: '2026-07-08',
    confidence: 0.96,
    sourcePage: 1,
  },
];

/** Deterministic stub extraction — used when OPENAI_API_KEY is unset. */
function stubExtraction(): Extraction {
  return ExtractionSchema.parse({
    labName: 'Sample Lab (stub extraction)',
    collectedAt: new Date().toISOString().slice(0, 10),
    biomarkers: STUB_BIOMARKERS,
  });
}

// ── Live extraction ──────────────────────────────────────────────────────────

/** Metadata about a live run, for the ExtractionRun row. */
export type ExtractionRunMeta = {
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
  pageCount: number;
};

/** Typed failure: the model response did not satisfy the schema. Never partial. */
export class ExtractionSchemaError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'ExtractionSchemaError';
  }
}

/**
 * Live extraction: render → vision model (Structured Outputs) → zod validate.
 * Throws ExtractionSchemaError on a schema violation (caller records FAILED,
 * never partial-writes). Returns the typed Extraction + run metadata.
 */
export async function extractLabLive(
  input: ExtractLabInput,
): Promise<{ extraction: Extraction; run: ExtractionRunMeta }> {
  const startedAt = Date.now();
  const modelId = extractionModelId();
  const client = openaiClient();

  // 1. Render the file to page images.
  const pages = await renderPages(input.filePath, input.mimeType);
  const imageInputs = toDataUrlInputs(pages);

  // 2. Build the Structured Outputs request.
  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [
    { type: 'text', text: 'Extract every biomarker result printed on this lab report.' },
    ...imageInputs.map((p: PageImageInput) => ({
      type: 'image_url' as const,
      image_url: { url: p.dataUrl },
    })),
  ];

  // 3. Call the model with strict json_schema response_format.
  const completion = await client.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'lab_extraction',
        strict: true,
        schema: extractionResponseSchema,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const usage = completion.usage;
  const inputTokens = usage?.prompt_tokens ?? null;
  const outputTokens = usage?.completion_tokens ?? null;

  // 4. Parse + validate against the zod schema. NEVER partial-write.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ExtractionSchemaError('Model response was not valid JSON', { cause: e });
  }
  const result = ExtractionSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionSchemaError('Model response failed schema validation', {
      cause: result.error,
    });
  }

  const durationMs = Date.now() - startedAt;
  return {
    extraction: result.data,
    run: {
      modelId,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(modelId, inputTokens, outputTokens),
      durationMs,
      pageCount: pages.length,
    },
  };
}

/**
 * Extract structured data from an uploaded lab file.
 * Routes to live (OPENAI_API_KEY set) or the deterministic stub.
 * `extractLabLive` throws ExtractionSchemaError on validation failure.
 */
export async function extractLab(input: ExtractLabInput): Promise<Extraction> {
  if (!isLiveExtractionConfigured()) return stubExtraction();
  const { extraction } = await extractLabLive(input);
  return extraction;
}

/**
 * Live-or-stub extraction that also returns run metadata (tokens/cost/duration).
 * The stub reports a synthetic run with modelId 'stub'. The route writes one
 * ExtractionRun row from this.
 */
export async function extractLabWithRun(
  input: ExtractLabInput,
): Promise<{ extraction: Extraction; run: ExtractionRunMeta }> {
  if (!isLiveExtractionConfigured()) {
    return {
      extraction: stubExtraction(),
      run: {
        modelId: 'stub',
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        durationMs: 0,
        pageCount: 0,
      },
    };
  }
  return extractLabLive(input);
}

/** Convenience: extract + run the output through the guardrail audit. */
export async function extractLabGuarded(input: ExtractLabInput) {
  const payload = await extractLab(input);
  const auditText = JSON.stringify(payload);
  return guarded(payload, auditText);
}

// ── Duplicate-canonical dedupe (RES-1 / R-1) ─────────────────────────────────
// Two printed biomarker names can resolve to the SAME canonical Biomarker.key
// (e.g. "Total Testosterone" + "Testo Total" both alias to "total_testosterone").
// Persisting both would insert two rows with the same (labReportId, biomarkerId)
// and trip @@unique([labReportId, biomarkerId]) mid-transaction. Dedupe BEFORE
// the write, keeping the highest-confidence transcription per canonical code.
// Unmapped biomarkers (resolver returns null) are NEVER deduped: they persist
// with a NULL biomarkerId, and Postgres treats multiple NULLs as distinct, so
// the unique index never fires for them — unmapped rows always surface for review.

/** Resolver signature: printed name → canonical key, or null when unmapped. */
export type CanonicalResolver = (printedName: string) => string | null;

/**
 * Remove extracted biomarkers that resolve to the same canonical code, keeping
 * the one with the highest transcription confidence. Output order is stable
 * (follows the original extraction order) for deterministic persistence.
 */
export function dedupeExtractionByCanonical(
  biomarkers: readonly ExtractedBiomarker[],
  resolve: CanonicalResolver,
): ExtractedBiomarker[] {
  const bestByCode = new Map<string, ExtractedBiomarker>();
  const unmapped: ExtractedBiomarker[] = [];
  for (const b of biomarkers) {
    const code = resolve(b.name);
    if (code == null) {
      unmapped.push(b);
      continue;
    }
    const prev = bestByCode.get(code);
    if (prev == null || b.confidence > prev.confidence) {
      bestByCode.set(code, b);
    }
  }
  const order = new Map(biomarkers.map((b, i) => [b, i]));
  return [...bestByCode.values(), ...unmapped].sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  );
}

// ── Raw → normalized LabResult-column mapping (GOLD §5.6–5.7) ────────────────
// The model gives `value` (string as printed); the DB stores BOTH the raw
// string AND a normalized numeric + canonical unit. This helper performs that
// mapping so the route stays thin and the math is unit-testable.

/** DB-ready columns derived from one extracted biomarker. */
export type LabResultColumns = {
  rawValue: string | null;
  rawUnit: string | null;
  rawRefLow: string | null;
  rawRefHigh: string | null;
  rawRefText: string | null;
  valueNumeric: number | null;
  /** canonical unit (catalog unit when mapped, else the printed unit) */
  unit: string | null;
  flag: string | null;
  confidence: number;
};

/**
 * Parse a printed value into a number, honoring '>'/'<'/'<' qualifiers.
 * Returns null when non-numeric (e.g. "positive", "trace").
 */
export function parseValueNumeric(value: string): number | null {
  const cleaned = value.replace(/[<>=~]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Derive a lab-style flag from the value vs range, or honor '>'/'<' prefixes. */
export function deriveFlag(
  value: string,
  valueNumeric: number | null,
  refLow: number | null,
  refHigh: number | null,
): string | null {
  if (value.startsWith('>')) return 'H';
  if (value.startsWith('<')) return 'L';
  if (valueNumeric == null) return null;
  if (refHigh != null && valueNumeric > refHigh) return 'H';
  if (refLow != null && valueNumeric < refLow) return 'L';
  return null;
}

// TODO dedupe numOrNull — 4 divergent copies exist (extraction.ts, analysis.ts,
// reports/generate/route.ts, labs/results/page.tsx). analysis.ts lacks the
// `.trim()` guard so '' → 0 there vs null elsewhere; consolidating would change
// classifyResult refLow/refHigh behavior with no covering tests. Not consolidated.
function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map an ExtractedBiomarker to the raw+normalized LabResult columns.
 * @param biomarker         the extracted biomarker
 * @param canonicalUnit     the catalog Biomarker.canonicalUnit when mapped, else null
 */
export function toLabResultColumns(
  biomarker: ExtractedBiomarker,
  canonicalUnit: string | null,
): LabResultColumns {
  const refLowNum = numOrNull(biomarker.referenceLow);
  const refHighNum = numOrNull(biomarker.referenceHigh);
  const valueNumeric = parseValueNumeric(biomarker.value);
  const unit = canonicalUnit ?? biomarker.unit;
  return {
    rawValue: biomarker.value,
    rawUnit: biomarker.unit,
    rawRefLow: biomarker.referenceLow,
    rawRefHigh: biomarker.referenceHigh,
    rawRefText: formatRefText(biomarker.referenceLow, biomarker.referenceHigh, unit),
    valueNumeric,
    unit,
    flag: deriveFlag(biomarker.value, valueNumeric, refLowNum, refHighNum),
    confidence: biomarker.confidence,
  };
}

function formatRefText(low: string | null, high: string | null, unit: string | null): string | null {
  const hasLow = low != null && low.trim() !== '';
  const hasHigh = high != null && high.trim() !== '';
  if (!hasLow && !hasHigh) return null;
  const band = [hasLow ? low : '', hasHigh ? high : ''].filter((x) => x !== '').join(' - ');
  return unit ? `${band} ${unit}` : band;
}
