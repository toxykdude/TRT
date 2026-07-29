/**
 * Auth.js error-code → user-facing presentation.
 *
 * Auth.js forwards only an allowlist of error types to the client (`clientErrors`
 * in `@auth/core/errors.js`: CredentialsSignin, OAuthAccountNotLinked,
 * OAuthCallbackError, AccessDenied, Verification, MissingCSRF, AccountNotLinked,
 * WebAuthnVerificationError). EVERY other throw is flattened to
 * `?error=Configuration` (`@auth/core/index.js`), including `InvalidCheck` —
 * which fires whenever the `__Secure-authjs.pkce.code_verifier` cookie cannot be
 * decrypted. That cookie carries `Max-Age=900`, so lingering on the Google
 * consent screen past 15 minutes, refreshing mid-flow, or catching a deploy
 * mid-flow all produce it. Those users are one retry away from success, so
 * `Configuration` must NOT be presented as a fatal server fault.
 *
 * The `?error=` value is attacker-controlled. Mapping is exact-match against a
 * closed table and unrecognised input collapses to `unknown`, so nothing from
 * the query string can reach the rendered page.
 */

/** Presentation for one Auth.js error code. `key` indexes `Auth.Error.reason`. */
export interface AuthErrorPresentation {
  /** Message key under the `Auth.Error.reason` namespace. Never user input. */
  key: string;
  /** True when simply retrying the sign-in is a plausible remedy. */
  retryable: boolean;
}

/**
 * Closed mapping table. Keys are the exact `AuthError.type` values Auth.js
 * emits; anything absent here is treated as untrusted and falls through to
 * `unknown`.
 */
const PRESENTATIONS: Readonly<Record<string, AuthErrorPresentation>> = {
  // Catch-all for every non-allowlisted throw. In practice this is dominated by
  // InvalidCheck (expired/stale PKCE cookie), which a retry fixes. The copy for
  // this key has to stay honest for a genuine misconfiguration too.
  Configuration: { key: 'interrupted', retryable: true },
  // A stale sign-in form — same shape, same remedy.
  MissingCSRF: { key: 'interrupted', retryable: true },

  // The provider itself reported a failure (denied token exchange, etc.).
  OAuthCallbackError: { key: 'providerError', retryable: true },
  // Expired or already-consumed verification link.
  Verification: { key: 'verification', retryable: true },
  // Wrong or expired sign-in code. Reachable when the OTP callback is hit
  // directly rather than through the verify page.
  CredentialsSignin: { key: 'credentials', retryable: true },
  // A protected surface was reached without a session.
  SessionRequired: { key: 'sessionRequired', retryable: true },

  // Terminal: the user declined consent. Retrying changes nothing on its own.
  AccessDenied: { key: 'accessDenied', retryable: false },
  // Terminal: the email already belongs to an account created by another
  // method. The user must sign in the original way, not retry this one.
  OAuthAccountNotLinked: { key: 'accountNotLinked', retryable: false },
  AccountNotLinked: { key: 'accountNotLinked', retryable: false },
};

/** Fallback for absent, empty, or unrecognised codes. */
const UNKNOWN: AuthErrorPresentation = { key: 'unknown', retryable: true };

/**
 * Resolve an Auth.js `?error=` param to a safe presentation.
 *
 * Accepts the full `string | string[] | undefined` shape Next.js produces for
 * `searchParams`; repeated params use the first entry.
 */
export function presentAuthError(
  raw: string | string[] | null | undefined,
): AuthErrorPresentation {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code) return UNKNOWN;
  // Own-property lookup only: an inherited key ('constructor', '__proto__')
  // arriving through the query string must not resolve to a presentation.
  const match = Object.hasOwn(PRESENTATIONS, code) ? PRESENTATIONS[code] : undefined;
  return match ?? UNKNOWN;
}
