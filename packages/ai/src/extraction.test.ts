/**
 * Extraction pipeline tests (P0.2.a).
 *
 * The live OpenAI call is NEVER made here — `extractLabLive` is driven through
 * an injected client fixture (the shape the vision model returns for
 * jmc-sample.pdf). The PDF renderer is also mocked so the suite is hermetic
 * (no poppler/sample-file dependency in the mock path). A live golden run is
 * opt-in via EXTRACTION_GOLDEN_LIVE=1 (see the one-time hand-recording note at
 * the bottom).
 *
 * Covers: stub routing, schema-violation → typed failure (no partial), normalize
 * (raw+normalized+flag), alias resolution (mapped/alias/unmapped), confidence
 * threshold → PENDING_REVIEW, ExtractionRun metadata, and the response_format
 * contract (json_object, with the JSON shape described in the system prompt).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import {
  toLabResultColumns,
  parseValueNumeric,
  deriveFlag,
  dedupeExtractionByCanonical,
  EXTRACTION_CONFIDENCE_THRESHOLD,
} from './extraction';
import { ExtractionSchema, type Extraction } from './schemas';
import { resolveCanonicalCode } from './biomarker-aliases';

// ── Hoisted, controllable mocks (installed before any import resolves) ───────
const mocks = vi.hoisted(() => ({
  /** fake chat.completions.create */
  create: vi.fn(),
  /** fake renderPages */
  render: vi.fn(),
}));

vi.mock('./openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./openai')>();
  return {
    ...actual,
    openaiClient: () => ({ chat: { completions: { create: mocks.create } } }),
  };
});

vi.mock('./pdf-render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pdf-render')>();
  return {
    ...actual,
    renderPages: mocks.render,
  };
});

// Import the SUT AFTER the mocks are registered.
const { extractLab, extractLabLive, extractLabWithRun, ExtractionSchemaError } = await import('./extraction');

// The catalog keys currently seeded (see packages/db/prisma/seed.ts).
const CATALOG = new Set<string>([
  'total_testosterone', 'free_testosterone', 'bioavailable_testosterone', 'shbg',
  'albumin', 'lh', 'fsh', 'estradiol_sensitive', 'prolactin', 'dhea_s',
  'pregnenolone', 'cortisol_am', 'cortisol_pm', 'igf_1', 'tsh', 'free_t3',
  'free_t4', 'reverse_t3', 'psa', 'hemoglobin', 'hematocrit', 'rbc', 'wbc',
  'platelets', 'alt', 'ast', 'creatinine', 'egfr', 'bun', 'sodium', 'potassium',
  'globulin', 'hdl', 'ldl', 'triglycerides', 'total_cholesterol', 'hscrp',
  'ferritin', 'iron', 'vitamin_d', 'vitamin_b12', 'folate', 'a1c', 'insulin',
  'glucose',
]);

const GOLDEN_PDF = path.resolve(__dirname, '../../../sample-results/jmc-sample.pdf');

// Two fake rendered page buffers (contents irrelevant — renderer is mocked).
const FAKE_PAGES = [
  { page: 1, mimeType: 'image/png', data: Buffer.from('page1') },
  { page: 2, mimeType: 'image/png', data: Buffer.from('page2') },
];

// ── Fixture: what a vision model returns for jmc-sample.pdf ───────────────────
const SAMPLE_RESPONSE = {
  labName: 'INST. COOMEVA MANIZALES',
  collectedAt: '2026-07-08',
  biomarkers: [
    {
      name: 'Testosterona Total', canonicalCode: 'total_testosterone',
      value: '584.70', unit: 'ng/dL', referenceLow: '240.24', referenceHigh: '870.68',
      collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1,
    },
    {
      name: 'Hematocrito', canonicalCode: 'hematocrit',
      value: '54', unit: '%', referenceLow: '41', referenceHigh: '53',
      collectedAt: '2026-07-08', confidence: 0.97, sourcePage: 1,
    },
    {
      name: 'Indice de Eosinofilos', canonicalCode: null,
      value: '2.1', unit: '%', referenceLow: '0.5', referenceHigh: '5.0',
      collectedAt: null, confidence: 0.6, sourcePage: 2,
    },
  ],
};

function okResponse(body: unknown, usage: unknown = { prompt_tokens: 1200, completion_tokens: 400 }) {
  return { choices: [{ message: { content: JSON.stringify(body) } }], usage };
}

// ── Stub routing ─────────────────────────────────────────────────────────────
describe('extractLab — stub routing (no OPENAI_API_KEY)', () => {
  const origKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    mocks.create.mockReset();
    mocks.render.mockReset();
  });
  afterEach(() => {
    if (origKey) process.env.OPENAI_API_KEY = origKey;
    else delete process.env.OPENAI_API_KEY;
  });

  it('returns a valid, deterministic stub Extraction and never calls the model', async () => {
    const out = await extractLab({ filePath: '/tmp/none.pdf', mimeType: 'application/pdf', fileName: 'x.pdf' });
    expect(() => ExtractionSchema.parse(out)).not.toThrow();
    expect(out.labName).toBe('Sample Lab (stub extraction)');
    expect(out.biomarkers.length).toBeGreaterThan(0);
    expect(out.biomarkers.every((b) => b.confidence >= 0 && b.confidence <= 1)).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('extractLabWithRun reports a synthetic stub run with modelId "stub"', async () => {
    const { extraction, run } = await extractLabWithRun({
      filePath: '/tmp/none.pdf', mimeType: 'application/pdf', fileName: 'x.pdf',
    });
    expect(run.modelId).toBe('stub');
    expect(run.costUsd).toBeNull();
    expect(extraction.biomarkers.length).toBeGreaterThan(0);
  });
});

// ── Live path (mocked client + renderer) ─────────────────────────────────────
describe('extractLabLive — mocked vision call', () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origModel = process.env.OPENAI_MODEL;
  const origUrl = process.env.OPENAI_API_URL;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_API_URL = 'https://api.openai.com/v1';
    mocks.create.mockReset();
    mocks.render.mockReset();
    mocks.render.mockResolvedValue([...FAKE_PAGES]);
  });
  afterEach(() => {
    if (origKey) process.env.OPENAI_API_KEY = origKey;
    else delete process.env.OPENAI_API_KEY;
    if (origModel) process.env.OPENAI_MODEL = origModel;
    else delete process.env.OPENAI_MODEL;
    if (origUrl) process.env.OPENAI_API_URL = origUrl;
    else delete process.env.OPENAI_API_URL;
  });

  it('renders the file, calls the model with json_object response_format (schema in prompt), parses a typed Extraction', async () => {
    mocks.create.mockResolvedValueOnce(okResponse(SAMPLE_RESPONSE));

    const { extraction, run } = await extractLabLive({
      filePath: GOLDEN_PDF, mimeType: 'application/pdf', fileName: 'jmc-sample.pdf',
    });

    // Renderer was called with the file path.
    expect(mocks.render).toHaveBeenCalledWith(GOLDEN_PDF, 'application/pdf');
    expect(mocks.create).toHaveBeenCalledTimes(1);

    // Z.AI / OpenAI-compatible structured output: json_object mode. The shape
    // contract is carried by the system message (json_object guarantees valid
    // JSON, NOT the shape); the zod gate (ExtractionSchema) is the safety net.
    const arg = mocks.create.mock.calls[0]![0] as {
      model?: string;
      response_format?: { type: string; json_schema?: unknown; strict?: unknown };
      messages?: Array<{ role: string; content: unknown }>;
    };
    expect(arg.model).toBe('gpt-4o-mini');
    expect(arg.response_format?.type).toBe('json_object');
    expect(arg.response_format).not.toHaveProperty('json_schema');
    expect(arg.response_format).not.toHaveProperty('strict');

    // The schema field names MUST appear in the system prompt — this locks the
    // schema-in-prompt contract so a refactor that drops the shape description
    // fails the build.
    const systemMsg = arg.messages?.find((m) => m.role === 'system');
    const systemText = String(systemMsg?.content ?? '');
    expect(systemText).toMatch(/\bJSON\b/); // required token for json_object mode
    for (const field of ['labName', 'collectedAt', 'biomarkers', 'name', 'canonicalCode', 'value', 'unit', 'referenceLow', 'referenceHigh', 'confidence', 'sourcePage']) {
      expect(systemText).toContain(field);
    }

    // User content includes the page images as image_url entries.
    const userMsg = arg.messages?.find((m) => m.role === 'user');
    const content = userMsg?.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(content.filter((c) => c.type === 'image_url')).toHaveLength(2);
    expect(content[1]!.image_url!.url).toMatch(/^data:image\/png;base64,/);

    // Parsed extraction matches the golden fixture.
    expect(extraction.labName).toBe('INST. COOMEVA MANIZALES');
    expect(extraction.biomarkers).toHaveLength(3);
    const t = extraction.biomarkers.find((b) => b.canonicalCode === 'total_testosterone');
    expect(t?.value).toBe('584.70');
    expect(t?.confidence).toBeCloseTo(0.99);

    // Run metadata parsed from usage.
    expect(run.modelId).toBe('gpt-4o-mini');
    expect(run.inputTokens).toBe(1200);
    expect(run.outputTokens).toBe(400);
    expect(run.costUsd).toBeGreaterThan(0);
    expect(run.pageCount).toBe(2);
  });

  it('throws ExtractionSchemaError (no partial write) on non-JSON content', async () => {
    mocks.create.mockResolvedValueOnce(okResponse('plain text', null));
    // override content directly:
    mocks.create.mockReset();
    mocks.create.mockResolvedValueOnce({
      choices: [{ message: { content: 'not json at all' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    await expect(
      extractLabLive({ filePath: GOLDEN_PDF, mimeType: 'application/pdf', fileName: 'x.pdf' }),
    ).rejects.toBeInstanceOf(ExtractionSchemaError);
  });

  it('throws ExtractionSchemaError on schema violation (missing required field)', async () => {
    mocks.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            labName: 'x', collectedAt: null,
            biomarkers: [{ name: 't' }], // missing required fields
          }),
        },
      }],
      usage: null,
    });
    await expect(
      extractLabLive({ filePath: GOLDEN_PDF, mimeType: 'application/pdf', fileName: 'x.pdf' }),
    ).rejects.toBeInstanceOf(ExtractionSchemaError);
  });

  it('records null token counts (and null cost) when usage is absent', async () => {
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(SAMPLE_RESPONSE) } }], usage: null });
    const { run } = await extractLabLive({ filePath: GOLDEN_PDF, mimeType: 'application/pdf', fileName: 'x.pdf' });
    expect(run.inputTokens).toBeNull();
    expect(run.outputTokens).toBeNull();
    expect(run.costUsd).toBeNull();
  });
});

// ── Normalization: raw + normalized + flag (GOLD §5.6–5.7) ────────────────────
describe('toLabResultColumns — raw + normalized mapping', () => {
  it('keeps raw value/unit/range and derives numeric + canonical unit', () => {
    const cols = toLabResultColumns(
      {
        name: 'Testosterona Total', canonicalCode: 'total_testosterone',
        value: '584.70', unit: 'ng/dL', referenceLow: '240.24', referenceHigh: '870.68',
        collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1,
      },
      'ng/dL',
    );
    expect(cols.rawValue).toBe('584.70');
    expect(cols.rawUnit).toBe('ng/dL');
    expect(cols.rawRefLow).toBe('240.24');
    expect(cols.rawRefHigh).toBe('870.68');
    expect(cols.rawRefText).toBe('240.24 - 870.68 ng/dL');
    expect(cols.valueNumeric).toBeCloseTo(584.7);
    expect(cols.unit).toBe('ng/dL');
    expect(cols.flag).toBeNull();
    expect(cols.confidence).toBeCloseTo(0.99);
  });

  it('flags HIGH when value exceeds the upper bound', () => {
    const cols = toLabResultColumns(
      {
        name: 'Hematocrito', canonicalCode: 'hematocrit', value: '54', unit: '%',
        referenceLow: '41', referenceHigh: '53', collectedAt: null, confidence: 0.97, sourcePage: 1,
      },
      '%',
    );
    expect(cols.valueNumeric).toBe(54);
    expect(cols.flag).toBe('H');
  });

  it('honors ">" prefix as HIGH and "<" as LOW even when numeric', () => {
    expect(deriveFlag('>1000', 1000, null, 100)).toBe('H');
    expect(deriveFlag('<0.5', 0.5, 1, null)).toBe('L');
  });

  it('returns null numeric for non-numeric values', () => {
    expect(parseValueNumeric('positive')).toBeNull();
    expect(parseValueNumeric('trace')).toBeNull();
    expect(parseValueNumeric('584.70')).toBeCloseTo(584.7);
    expect(parseValueNumeric('>1000')).toBe(1000);
  });

  it('falls back to the printed unit when no catalog unit is known', () => {
    const cols = toLabResultColumns(
      {
        name: 'Mystery Marker', canonicalCode: null, value: '12', unit: 'IU/L',
        referenceLow: null, referenceHigh: null, collectedAt: null, confidence: 0.5, sourcePage: 1,
      },
      null,
    );
    expect(cols.unit).toBe('IU/L');
    expect(cols.rawRefText).toBeNull();
  });
});

// ── Alias resolution ─────────────────────────────────────────────────────────
describe('resolveCanonicalCode — mapped / alias / unmapped', () => {
  it('exact catalog key passes through', () => {
    expect(resolveCanonicalCode('total_testosterone', CATALOG)).toBe('total_testosterone');
  });

  it('resolves Spanish + English aliases to the canonical key', () => {
    expect(resolveCanonicalCode('Testosterona Total', CATALOG)).toBe('total_testosterone');
    expect(resolveCanonicalCode('Testo Total', CATALOG)).toBe('total_testosterone');
    expect(resolveCanonicalCode('Total Testosterone', CATALOG)).toBe('total_testosterone');
    expect(resolveCanonicalCode('Hematocrito', CATALOG)).toBe('hematocrit');
    expect(resolveCanonicalCode('Hto', CATALOG)).toBe('hematocrit');
    expect(resolveCanonicalCode('Estradiol', CATALOG)).toBe('estradiol_sensitive');
    expect(resolveCanonicalCode('E2', CATALOG)).toBe('estradiol_sensitive');
    expect(resolveCanonicalCode('SHBG', CATALOG)).toBe('shbg');
    expect(resolveCanonicalCode('Glucosa', CATALOG)).toBe('glucose');
    expect(resolveCanonicalCode('Hemoglobina Glicada', CATALOG)).toBe('a1c');
  });

  it('is case/space insensitive and ignores parenthetical qualifiers', () => {
    expect(resolveCanonicalCode('  testosterona  total ', CATALOG)).toBe('total_testosterone');
    expect(resolveCanonicalCode('Glucosa (ayunas)', CATALOG)).toBe('glucose');
  });

  it('returns null for unmapped names (surfaced for review, never dropped)', () => {
    expect(resolveCanonicalCode('Indice de Eosinofilos', CATALOG)).toBeNull();
    expect(resolveCanonicalCode('Some Novel Marker', CATALOG)).toBeNull();
    expect(resolveCanonicalCode('', CATALOG)).toBeNull();
  });
});

// ── Confidence threshold gate ────────────────────────────────────────────────
describe('EXTRACTION_CONFIDENCE_THRESHOLD', () => {
  it('is 0.85', () => {
    expect(EXTRACTION_CONFIDENCE_THRESHOLD).toBe(0.85);
  });

  it('classifies values around the threshold correctly', () => {
    const low = SAMPLE_RESPONSE.biomarkers[2]!; // 0.6
    const high = SAMPLE_RESPONSE.biomarkers[0]!; // 0.99
    expect(low!.confidence).toBeLessThan(EXTRACTION_CONFIDENCE_THRESHOLD);
    expect(high!.confidence).toBeGreaterThanOrEqual(EXTRACTION_CONFIDENCE_THRESHOLD);
  });
});

// ── Schema shape contract ────────────────────────────────────────────────────
describe('ExtractionSchema shape (P0.2.a target)', () => {
  it('accepts the target shape with nullable fields', () => {
    const out = ExtractionSchema.parse(SAMPLE_RESPONSE) as Extraction;
    expect(out.biomarkers[0]!.name).toBe('Testosterona Total');
    expect(out.biomarkers[2]!.canonicalCode).toBeNull();
    expect(out.biomarkers[0]!.sourcePage).toBe(1);
  });

  it('rejects a biomarker with confidence out of [0,1]', () => {
    const bad = {
      ...SAMPLE_RESPONSE,
      biomarkers: [{ ...SAMPLE_RESPONSE.biomarkers[0]!, confidence: 1.5 }],
    };
    expect(() => ExtractionSchema.parse(bad)).toThrow();
  });
});

// ── Duplicate-canonical dedupe (RES-1 / R-1) ─────────────────────────────────
// Two printed names can alias to the same canonical key; persisting both would
// trip @@unique([labReportId, biomarkerId]). The dedupe keeps one per canonical
// code and leaves unmapped rows untouched.
describe('dedupeExtractionByCanonical', () => {
  const b = (name: string, canonicalCode: string | null, confidence: number, value = '1') => ({
    name,
    canonicalCode,
    value,
    unit: null,
    referenceLow: null,
    referenceHigh: null,
    collectedAt: null,
    confidence,
    sourcePage: null,
  });

  it('keeps only the highest-confidence biomarker per resolved canonical code', () => {
    // "Testosterona Total" + "Testo Total" both resolve to total_testosterone.
    const resolver = (n: string) =>
      n === 'Testosterona Total' || n === 'Testo Total' ? 'total_testosterone' : null;
    const out = dedupeExtractionByCanonical(
      [b('Testosterona Total', null, 0.9, '500'), b('Testo Total', null, 0.99, '584')],
      resolver,
    );
    expect(out.filter((x) => x.value === '584')).toHaveLength(1); // higher conf kept
    expect(out.filter((x) => x.value === '500')).toHaveLength(0); // lower conf dropped
    expect(out).toHaveLength(1);
  });

  it('never dedupes unmapped biomarkers (NULL biomarkerId never collides)', () => {
    const resolver = () => null; // everything unmapped
    const out = dedupeExtractionByCanonical(
      [b('Mystery A', null, 0.5), b('Mystery B', null, 0.9)],
      resolver,
    );
    expect(out).toHaveLength(2);
  });

  it('keeps distinct canonical codes separate', () => {
    const resolver = (n: string) =>
      n === 'A' ? 'total_testosterone' : n === 'B' ? 'hematocrit' : null;
    const out = dedupeExtractionByCanonical(
      [b('A', null, 0.9), b('B', null, 0.8)],
      resolver,
    );
    expect(out).toHaveLength(2);
  });

  it('preserves original extraction order (stable, deterministic)', () => {
    const resolver = (n: string) => (n === 'A' || n === 'B' ? 'total_testosterone' : null);
    const out = dedupeExtractionByCanonical(
      [b('A', null, 0.7), b('B', null, 0.7), b('C', null, 0.7)], // A & B collide
      resolver,
    );
    // A wins the collision (first-seen on tie, stable order), C unmapped stays.
    expect(out.map((x) => x.name)).toEqual(['A', 'C']);
  });

  it('uses the resolver result, not the model-supplied canonicalCode', () => {
    // The route resolves via the catalog/alias map, not the model field. Two
    // names with model canonicalCode=null can still collide once resolved.
    const resolver = () => 'total_testosterone';
    const out = dedupeExtractionByCanonical(
      [b('x', null, 0.8), b('y', null, 0.95)],
      resolver,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('y'); // higher confidence
  });

  it('returns an empty array for an empty extraction', () => {
    expect(dedupeExtractionByCanonical([], () => 'x')).toEqual([]);
  });
});

/*
 * LIVE GOLDEN RUN (opt-in, one-time hand-recording) — NOT executed in CI.
 * ─────────────────────────────────────────────────────────────────────────────
 * Set OPENAI_API_KEY + EXTRACTION_GOLDEN_LIVE=1 and call extractLabLive against
 * sample-results/jmc-sample.pdf with the real renderer + client (bypass the
 * vi.mock above). Once the output is eyeballed as correct, copy the model's JSON
 * into SAMPLE_RESPONSE above so the mocked suite permanently asserts it.
 */
