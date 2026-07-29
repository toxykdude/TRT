/**
 * Auth provider configuration guards.
 *
 * The Google OAuth provider is wired UNCONDITIONALLY in `lib/auth.ts`, but it
 * only functions when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set. When they
 * are empty (the `.env.example` default, and what CI renders when the GitHub
 * Environment secret is missing), Auth.js still builds the outbound
 * authorization URL — Google receives `client_id=` (empty) and rejects the
 * request with `invalid_request: Missing required parameter: client_id`.
 *
 * That failure is account-independent and surfaces in the user's browser as a
 * Google-side error page, which reads like a Google bug rather than a deploy
 * config gap. These helpers close that silent trap two ways:
 *
 *  - `warnIfAuthConfigIncomplete()` runs once at server boot (from
 *    `instrumentation.ts` `register()`), so an empty cred is visible in the
 *    server logs — not only in a user's browser.
 *  - `isGoogleConfigured()` gates the Google button in the login/register
 *    server components, so we never render a button we already know will fail.
 *
 * Google is OPTIONAL — the Credentials/OTP path is the primary auth route, so a
 * missing Google cred is a WARNING, never a crash: the app must still boot.
 * Deliberately kept OUT of `@trt/ai`: auth config has nothing to do with the AI
 * package, and coupling them would be a layering violation.
 */

/** True only when BOTH Google OAuth creds are present and non-empty. */
export function isGoogleConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return (
    typeof id === 'string' &&
    id.trim() !== '' &&
    typeof secret === 'string' &&
    secret.trim() !== ''
  );
}

/**
 * Surface the silent empty-Google-cred trap at startup. Returns the warning
 * strings (and console.warn's each), so callers/unit tests can observe what was
 * flagged. Silent when Google is correctly configured — the absence of a
 * warning is the healthy state.
 */
export function warnIfAuthConfigIncomplete(): string[] {
  const warnings: string[] = [];
  if (!isGoogleConfigured()) {
    warnings.push(
      'Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET empty). ' +
        'The Google sign-in button is hidden. If this is a production deploy, set both ' +
        'GitHub Environment secrets and redeploy; an empty client_id otherwise makes ' +
        'every Google sign-in fail with Google\'s "Missing required parameter: client_id".',
    );
  }
  for (const w of warnings) console.warn(`[trt/auth] ${w}`);
  return warnings;
}
