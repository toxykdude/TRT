/**
 * `presentAuthError` — Auth.js error-code → user-facing presentation mapping.
 *
 * Why this exists: Auth.js only forwards a small allowlist of error types to the
 * client (`clientErrors` in @auth/core/errors.js). EVERY other throw — including
 * `InvalidCheck`, which fires on a routine expired/stale PKCE cookie — is
 * flattened to `?error=Configuration` and rendered by the built-in page as
 * "Server error / There is a problem with the server configuration". That is a
 * dead end for a user whose only real problem is that they sat on the Google
 * consent screen for longer than the cookie's 15-minute `Max-Age`.
 *
 * Behavioral contract:
 *  - `Configuration` is treated as INTERRUPTED and retryable, not as a fatal
 *    server fault (S-AE-CONFIG). It is the catch-all bucket, so the copy must be
 *    honest for both the transient cookie case and a genuine misconfiguration.
 *  - Codes that a retry cannot fix (`AccessDenied`, account-linking conflicts)
 *    are NOT marked retryable (S-AE-TERMINAL).
 *  - The `?error=` param is attacker-controlled. An unrecognised value NEVER
 *    round-trips into the returned key — it collapses to `unknown`
 *    (S-AE-NO-REFLECT). This is what keeps the page from echoing injected text.
 *  - Next.js hands `searchParams` values as `string | string[] | undefined`, so
 *    all three shapes must map without throwing (S-AE-SHAPES).
 */
import { describe, it, expect } from 'vitest';
import { presentAuthError } from '@/lib/auth-error';

describe('presentAuthError', () => {
  it('maps Configuration to an interrupted, retryable presentation (S-AE-CONFIG)', () => {
    // The bucket that InvalidCheck (expired PKCE cookie) lands in. A user who
    // retries succeeds, so this must never read as a fatal server fault.
    expect(presentAuthError('Configuration')).toEqual({
      key: 'interrupted',
      retryable: true,
    });
  });

  it('maps MissingCSRF to the same interrupted bucket (S-AE-CONFIG)', () => {
    // Same root shape: a stale form/cookie. Retrying fixes it.
    expect(presentAuthError('MissingCSRF')).toEqual({
      key: 'interrupted',
      retryable: true,
    });
  });

  it('marks codes a retry cannot fix as non-retryable (S-AE-TERMINAL)', () => {
    expect(presentAuthError('AccessDenied')).toEqual({
      key: 'accessDenied',
      retryable: false,
    });
    expect(presentAuthError('OAuthAccountNotLinked')).toEqual({
      key: 'accountNotLinked',
      retryable: false,
    });
    expect(presentAuthError('AccountNotLinked')).toEqual({
      key: 'accountNotLinked',
      retryable: false,
    });
  });

  it('maps the remaining recoverable provider codes (S-AE-CONFIG)', () => {
    expect(presentAuthError('OAuthCallbackError')).toEqual({
      key: 'providerError',
      retryable: true,
    });
    expect(presentAuthError('Verification')).toEqual({
      key: 'verification',
      retryable: true,
    });
    expect(presentAuthError('CredentialsSignin')).toEqual({
      key: 'credentials',
      retryable: true,
    });
    expect(presentAuthError('SessionRequired')).toEqual({
      key: 'sessionRequired',
      retryable: true,
    });
  });

  it('never reflects an unrecognised value into the key (S-AE-NO-REFLECT)', () => {
    const hostile = '<script>alert(1)</script>';
    const result = presentAuthError(hostile);

    expect(result).toEqual({ key: 'unknown', retryable: true });
    // The guarantee that matters: nothing from the query string survives.
    expect(result.key).not.toContain('script');
  });

  it('is exact-match only — casing variants are not recognised (S-AE-NO-REFLECT)', () => {
    // Auth.js emits exact `error.type` values. Anything else is untrusted input
    // and must fall through to `unknown` rather than be coerced into a match.
    expect(presentAuthError('configuration').key).toBe('unknown');
    expect(presentAuthError('CONFIGURATION').key).toBe('unknown');
  });

  it('accepts every searchParams shape without throwing (S-AE-SHAPES)', () => {
    expect(presentAuthError(undefined)).toEqual({ key: 'unknown', retryable: true });
    expect(presentAuthError(null)).toEqual({ key: 'unknown', retryable: true });
    expect(presentAuthError('')).toEqual({ key: 'unknown', retryable: true });

    // Repeated params (`?error=a&error=b`) arrive as an array — take the first.
    expect(presentAuthError(['AccessDenied', 'Configuration'])).toEqual({
      key: 'accessDenied',
      retryable: false,
    });
    expect(presentAuthError([])).toEqual({ key: 'unknown', retryable: true });
  });
});
