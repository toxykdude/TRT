/**
 * OpenAI env-config trap (streamline-upload-to-insight §1.2 / design.md).
 *
 * The base URL and model id were read with `??` (nullish coalescing), so an
 * empty-string secret rendered by CI (`OPENAI_API_URL=""`) survived as `""` —
 * `"" ?? DEFAULT === ""`. The fix is `||` (treat empty string as unset) plus a
 * startup `warnIfConfigIncomplete()` so the silent trap becomes visible.
 *
 * Hermetic: the helpers read `process.env` at call time, so each test sets the
 * exact env, runs the helper, and restores in afterEach.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  extractionModelId,
  openaiApiBaseUrl,
  warnIfConfigIncomplete,
  DEFAULT_OPENAI_API_URL,
  DEFAULT_OPENAI_MODEL,
} from '@trt/ai';

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_API_URL', 'OPENAI_MODEL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  // Clean slate per test.
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('openaiApiBaseUrl — `||` returns the default on empty string (env trap)', () => {
  it('falls back to the default when OPENAI_API_URL is the empty string', () => {
    process.env.OPENAI_API_URL = '';
    expect(openaiApiBaseUrl()).toBe(DEFAULT_OPENAI_API_URL);
  });

  it('uses the configured base URL when set (and strips trailing slashes)', () => {
    process.env.OPENAI_API_URL = 'https://api.z.ai/api/coding/paas/v4/';
    expect(openaiApiBaseUrl()).toBe('https://api.z.ai/api/coding/paas/v4');
  });

  it('falls back to the default when OPENAI_API_URL is unset', () => {
    delete process.env.OPENAI_API_URL;
    expect(openaiApiBaseUrl()).toBe(DEFAULT_OPENAI_API_URL);
  });
});

describe('extractionModelId — `||` returns the default on empty string (env trap)', () => {
  it('falls back to the default when OPENAI_MODEL is the empty string', () => {
    process.env.OPENAI_MODEL = '';
    expect(extractionModelId()).toBe(DEFAULT_OPENAI_MODEL);
  });

  it('uses the configured model when set', () => {
    process.env.OPENAI_MODEL = 'glm-4.6v';
    expect(extractionModelId()).toBe('glm-4.6v');
  });
});

describe('warnIfConfigIncomplete — surfaces the silent empty-secret trap', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('warns when KEY is configured but OPENAI_API_URL is an empty string', () => {
    process.env.OPENAI_API_KEY = 'sk-live';
    process.env.OPENAI_API_URL = '';
    process.env.OPENAI_MODEL = 'glm-4.6v';
    const warnings = warnIfConfigIncomplete();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/OPENAI_API_URL/i);
    expect(console.warn).toHaveBeenCalled();
  });

  it('warns when KEY is configured but OPENAI_MODEL is an empty string', () => {
    process.env.OPENAI_API_KEY = 'sk-live';
    process.env.OPENAI_API_URL = 'https://api.z.ai/v4';
    process.env.OPENAI_MODEL = '';
    const warnings = warnIfConfigIncomplete();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/OPENAI_MODEL/i);
  });

  it('reports both problems when URL and MODEL are both empty', () => {
    process.env.OPENAI_API_KEY = 'sk-live';
    process.env.OPENAI_API_URL = '';
    process.env.OPENAI_MODEL = '';
    const warnings = warnIfConfigIncomplete();
    expect(warnings).toHaveLength(2);
  });

  it('is silent when live extraction is fully configured', () => {
    process.env.OPENAI_API_KEY = 'sk-live';
    process.env.OPENAI_API_URL = 'https://api.z.ai/v4';
    process.env.OPENAI_MODEL = 'glm-4.6v';
    expect(warnIfConfigIncomplete()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('notes stub mode (informational) when KEY is not configured', () => {
    delete process.env.OPENAI_API_KEY;
    const warnings = warnIfConfigIncomplete();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/OPENAI_API_KEY/i);
  });

  it('treats the PASTE_KEY_HERE placeholder as not configured', () => {
    process.env.OPENAI_API_KEY = 'PASTE_KEY_HERE';
    const warnings = warnIfConfigIncomplete();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/OPENAI_API_KEY/i);
  });
});
