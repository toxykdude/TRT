/**
 * Google OAuth config guards (lib/auth-config).
 *
 * Why this exists: the Google provider is wired unconditionally in `lib/auth.ts`,
 * so when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are empty (the `.env.example`
 * default, and what CI renders when the GitHub Environment secret is missing),
 * Auth.js still builds the outbound authorization URL and Google rejects it
 * with `invalid_request: Missing required parameter: client_id`. That failure
 * is account-independent and surfaces in the user's browser as a Google error
 * page. `isGoogleConfigured()` hides the broken button; `warnIfAuthConfigIncomplete()`
 * makes the gap visible at server boot.
 *
 * Hermetic: both helpers read `process.env` at call time, so each test sets the
 * exact env, runs the helper, and restores it in afterEach.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { isGoogleConfigured, warnIfAuthConfigIncomplete } from '@/lib/auth-config';

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
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

describe('isGoogleConfigured — both creds required, empty string === unset (env trap)', () => {
  it('is false when both creds are unset', () => {
    expect(isGoogleConfigured()).toBe(false);
  });

  it('is false when only the ID is set (secret empty)', () => {
    process.env.GOOGLE_CLIENT_ID = 'xyz.apps.googleusercontent.com';
    expect(isGoogleConfigured()).toBe(false);
  });

  it('is false when only the SECRET is set (id empty)', () => {
    process.env.GOOGLE_CLIENT_SECRET = 'shhh';
    expect(isGoogleConfigured()).toBe(false);
  });

  it('treats the empty-string CI render as unset', () => {
    // CI renders missing GitHub secrets as `KEY=""`, not undefined. An empty
    // string must NOT count as "configured" or the broken-button trap reopens.
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';
    expect(isGoogleConfigured()).toBe(false);
  });

  it('is true only when BOTH creds are present and non-empty', () => {
    process.env.GOOGLE_CLIENT_ID = 'xyz.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'shhh';
    expect(isGoogleConfigured()).toBe(true);
  });
});

describe('warnIfAuthConfigIncomplete — surfaces the silent empty-cred trap', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('warns when Google creds are missing', () => {
    const warnings = warnIfAuthConfigIncomplete();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/GOOGLE_CLIENT_ID/i);
    expect(console.warn).toHaveBeenCalled();
  });

  it('is silent when Google is fully configured (healthy state = no warning)', () => {
    process.env.GOOGLE_CLIENT_ID = 'xyz.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'shhh';
    expect(warnIfAuthConfigIncomplete()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
