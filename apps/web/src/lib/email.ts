/**
 * Transactional email via Resend.
 *
 * Only OTP/verification mail flows through here today. An OTP email contains NO
 * PHI — just a 6-digit code and an expiry — so sending it through a third party
 * is safe (GOLD §2.x). The Resend API key lives ONLY on the server.
 *
 * Dev fallback: when RESEND_API_KEY is unset, the code is logged to the server
 * console instead of sent, so local signup works with no Resend account. This
 * path is server-only and never reaches the client. In production the key MUST
 * be set — a missing key throws rather than silently dropping mail.
 */
import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? 'TRT <no-reply@powerhousegym.co>';

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

/** Send a signup verification code. Throws on send failure so the action can react. */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const resend = client();

  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is not set — cannot send verification email.');
    }
    // Local dev: surface the code server-side so signup is testable without Resend.
    console.info(`[dev] signup OTP for ${to}: ${code}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your TRT verification code',
    text:
      `Your verification code is ${code}.\n\n` +
      `It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
  if (error) throw new Error(`Failed to send verification email: ${error.message}`);
}
