/**
 * Transactional email via Resend.
 *
 * Only OTP/verification mail flows through here today, for three purposes:
 * signup verification, login 2FA, and password reset. An OTP email contains NO
 * PHI — just a 6-digit code and an expiry — so sending it through a third party
 * is safe (GOLD §2.x). The Resend API key lives ONLY on the server.
 *
 * Dev fallback: when RESEND_API_KEY is unset, the code is logged to the server
 * console instead of sent, so local dev works with no Resend account. This
 * path is server-only and never reaches the client. In production the key MUST
 * be set — a missing key throws rather than silently dropping mail.
 *
 * Every credentials login now costs one email (2FA), not just signup — see the
 * plan's "Known trade-offs": if Resend is down, or `my-testo.com` is not a
 * verified sending domain (Resend rejects sends from unverified domains), no
 * password-based sign-in can complete. Google users are unaffected.
 */
import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? 'TRT <no-reply@my-testo.com>';

/** Which flow the code belongs to — selects the subject/body copy below. */
export type OtpPurpose = 'signup' | 'login' | 'password_reset';

const SUBJECTS: Record<OtpPurpose, string> = {
  signup: 'Your TRT verification code',
  login: 'Your TRT sign-in code',
  password_reset: 'Your TRT password reset code',
};

const INTROS: Record<OtpPurpose, string> = {
  signup: 'Your verification code is',
  login: 'Your sign-in code is',
  password_reset: 'Your password reset code is',
};

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

/**
 * Send a one-time code for the given purpose (signup verification, login 2FA,
 * or password reset). Throws on send failure so the caller can react — the
 * caller decides whether that means an inline error (signup, resend) or a
 * swallowed failure to preserve enumeration-safety (requestPasswordReset).
 */
export async function sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  const resend = client();

  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is not set — cannot send verification email.');
    }
    // Local dev: surface the code server-side so the flow is testable without Resend.
    console.info(`[dev] ${purpose} OTP for ${to}: ${code}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: SUBJECTS[purpose],
    text:
      `${INTROS[purpose]} ${code}.\n\n` +
      `It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
  if (error) throw new Error(`Failed to send verification email: ${error.message}`);
}
