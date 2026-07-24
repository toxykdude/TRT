/**
 * Shared OpenAI-compatible client (P0.2.a §2).
 *
 * Configurable for OpenAI or any OpenAI-compatible endpoint (Z.AI, etc.):
 *   OPENAI_API_KEY  — required for live extraction; when unset, `extractLab`
 *                     returns the deterministic stub (dev/tests).
 *   OPENAI_API_URL  — base URL; defaults to the public OpenAI API. Z.AI users
 *                     set this to e.g. https://api.z.ai/api/coding/paas/v4.
 *   OPENAI_MODEL    — model id; defaults to gpt-4o-mini (vision + Structured
 *                     Outputs capable, cheap).
 *
 * VISION CAPABILITY CAVEAT (GOLD §6.2): the configured model MUST support (a)
 * vision image input (we send each PDF page as a PNG data URL) AND (b)
 * `response_format: { type: "json_object" }` (the JSON shape is described in the
 * system prompt and re-validated by the zod ExtractionSchema gate). gpt-4o-mini
 * and Z.AI's glm-4.6v both meet these. If you run another endpoint, set
 * OPENAI_MODEL to a vision-capable model there and OPENAI_API_URL accordingly —
 * a text-only model cannot read the rendered pages and will produce
 * empty/garbage output.
 */
import OpenAI from 'openai';

/** Default OpenAI base URL. */
export const DEFAULT_OPENAI_API_URL = 'https://api.openai.com/v1';

/**
 * Default model. gpt-4o-mini: vision-capable + Structured Outputs, low cost.
 * Override via OPENAI_MODEL (e.g. for a Z.AI vision model).
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

/** True only when a non-empty OPENAI_API_KEY is configured. */
export function isLiveExtractionConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === 'string' && key.trim() !== '' && key.trim() !== 'PASTE_KEY_HERE';
}

/** The OpenAI-compatible client, configured from env. */
export function openaiClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseURL: (process.env.OPENAI_API_URL ?? DEFAULT_OPENAI_API_URL).replace(/\/+$/, ''),
    // Long-lived: vision + PDF extraction can take a while.
    timeout: 300_000,
    maxRetries: 2,
  });
}

/** The model id used for extraction (env-overridable). */
export function extractionModelId(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
}

/**
 * Rough per-1K-token USD cost by model, for ExtractionRun.costUsd. Unknown
 * models return null (cost recorded as null, not a guess). Rates are public
 * list prices as of mid-2026 and are advisory-only.
 */
export const MODEL_COST_PER_1K_TOKENS: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
};

/** Compute a run's USD cost from token usage, or null if the model is unknown. */
export function estimateCostUsd(
  modelId: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const rate = MODEL_COST_PER_1K_TOKENS[modelId];
  if (!rate) return null;
  if (inputTokens == null && outputTokens == null) return null;
  const inp = inputTokens ?? 0;
  const out = outputTokens ?? 0;
  return (inp / 1000) * rate.input + (out / 1000) * rate.output;
}
