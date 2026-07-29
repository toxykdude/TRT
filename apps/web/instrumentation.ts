/**
 * Next.js startup hook (stable in Next 15).
 *
 * Fires both config-completeness warnings once per server boot so the silent
 * empty-secret traps rendered by CI are visible in server logs instead of
 * failing opaquely in a user's browser:
 *  - `warnIfConfigIncomplete()` (@trt/ai): OPENAI_API_URL / OPENAI_MODEL empty.
 *  - `warnIfAuthConfigIncomplete()` (lib/auth-config): Google OAuth creds
 *    empty, which otherwise makes every Google sign-in fail with Google's
 *    "Missing required parameter: client_id".
 * This file is NOT imported by the unit-test runner.
 */
export async function register(): Promise<void> {
  const { warnIfConfigIncomplete } = await import('@trt/ai');
  warnIfConfigIncomplete();
  const { warnIfAuthConfigIncomplete } = await import('@/lib/auth-config');
  warnIfAuthConfigIncomplete();
}
