import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  upsertSignupOtp: vi.fn(),
  sendOtpEmail: vi.fn(),
}));

vi.mock('@trt/db', () => ({
  servicePrisma: {
    user: { findUnique: mocks.findUser },
    signupOtp: { upsert: mocks.upsertSignupOtp },
  },
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'password-hash') } }));
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(async () => 'en') }));
vi.mock('@/lib/auth', () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendOtpEmail: mocks.sendOtpEmail }));
vi.mock('@/lib/password', () => ({ verifyUserPassword: vi.fn(), validatePasswordChange: vi.fn() }));
vi.mock('@/lib/otp', () => ({
  generateOtpCode: vi.fn(() => '123456'),
  hashOtp: vi.fn(async () => 'code-hash'),
  otpExpiry: vi.fn(() => new Date('2026-07-26T00:10:00Z')),
  verifyOtp: vi.fn(),
  evaluateOtpAttempt: vi.fn(),
  canResendOtp: vi.fn(),
  dailySendCapReached: vi.fn(),
  nextSendWindow: vi.fn(),
}));

const { requestSignupOtp } = await import('@/app/actions');

function signupForm() {
  const form = new FormData();
  form.set('name', 'Test User');
  form.set('email', 'test@example.com');
  form.set('password', 'safe-password');
  return form;
}

describe('requestSignupOtp database availability', () => {
  beforeEach(() => {
    mocks.findUser.mockReset();
    mocks.upsertSignupOtp.mockReset();
    mocks.sendOtpEmail.mockReset();
  });

  it('returns a generic error when the account lookup fails', async () => {
    mocks.findUser.mockRejectedValue(new Error('database unavailable'));

    await expect(requestSignupOtp({}, signupForm())).resolves.toEqual({
      error: 'Registration is temporarily unavailable. Please try again.',
    });
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('returns the same generic error when the pending signup cannot be stored', async () => {
    mocks.findUser.mockResolvedValue(null);
    mocks.upsertSignupOtp.mockRejectedValue(new Error('missing relation'));

    await expect(requestSignupOtp({}, signupForm())).resolves.toEqual({
      error: 'Registration is temporarily unavailable. Please try again.',
    });
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
  });
});
