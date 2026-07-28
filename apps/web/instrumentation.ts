/**
 * Next.js startup hook (stable in Next 15).
 *
 * Fires `warnIfConfigIncomplete()` once per server boot so the silent
 * empty-secret trap (`OPENAI_API_URL=""` / `OPENAI_MODEL=""` rendered by CI)
 * is visible in server logs instead of failing vision calls with an empty
 * base URL / model. This file is NOT imported by the unit-test runner.
 */
export async function register(): Promise<void> {
  const { warnIfConfigIncomplete } = await import('@trt/ai');
  warnIfConfigIncomplete();
}
