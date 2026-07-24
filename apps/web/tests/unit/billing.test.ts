/**
 * Billing signature + activation tests (P1.c acceptance criteria).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildReference,
  computeIntegritySignature,
  verifyEventChecksum,
  type WompiEvent,
} from '@/lib/billing/wompi';
import { computeNewPeriodEnd, shouldReactivate, shouldActivateOnDelivery } from '@/lib/billing/activate';
import { orderIdFromEvent, verifyWebhookSignature } from '@/lib/billing/paypal';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('Wompi integrity signature', () => {
  it('matches the documented sha256 construction', () => {
    const params = { reference: 'trt_plus_monthly_abc123_lx01', amountInCents: 6200000, currency: 'COP' };
    const secret = 'test_integrity_secret';
    const expected = sha256(`${params.reference}${params.amountInCents}${params.currency}${secret}`);
    expect(computeIntegritySignature(params, secret)).toBe(expected);
  });
});

describe('Wompi reference', () => {
  it('is unique per call and contains no email/PHI', () => {
    const a = buildReference('user_abcdef123456', 'PLUS_MONTHLY');
    const b = buildReference('user_abcdef123456', 'PLUS_MONTHLY');
    expect(a).not.toBe(b);
    expect(a).toContain('plus_monthly');
    expect(a).not.toContain('@');
  });

  it('is reused as the PayPal purchase_units reference_id (unique, no PHI)', () => {
    // The PayPal order route now builds its reference_id via the same helper so
    // re-checkouts never collide on Payment.reference @unique.
    const refs = new Set(
      Array.from({ length: 50 }, () => buildReference('user_abc123', 'PRO_MONTHLY')),
    );
    expect(refs.size).toBe(50); // all unique
    for (const r of refs) {
      expect(r).not.toContain('@');
      expect(r).toContain('pro_monthly');
    }
  });
});

describe('PayPal webhook order-id extraction', () => {
  it('reads the order id from supplementary_data.related_ids', () => {
    const id = orderIdFromEvent({
      resource: { supplementary_data: { related_ids: { order_id: 'ORD-123' } } },
    });
    expect(id).toBe('ORD-123');
  });
  it('falls back to resource.order_id', () => {
    const id = orderIdFromEvent({ resource: { order_id: 'ORD-456' } });
    expect(id).toBe('ORD-456');
  });
  it('returns null when no order id is present', () => {
    expect(orderIdFromEvent({ resource: {} })).toBeNull();
    expect(orderIdFromEvent({})).toBeNull();
  });
});

describe('Wompi event checksum verification', () => {
  const secret = 'test_events_secret';
  function makeEvent(overrides?: Partial<WompiEvent>): WompiEvent {
    const data = {
      transaction: {
        id: 'tx_123',
        status: 'APPROVED' as const,
        reference: 'trt_plus_monthly_abc_lx01',
        amount_in_cents: 6200000,
        currency: 'COP',
      },
    };
    const timestamp = 1753300000;
    const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
    const values = ['tx_123', 'APPROVED', '6200000'];
    const checksum = sha256(values.join('') + String(timestamp) + secret);
    return {
      event: 'transaction.updated',
      data,
      sent_at: '2026-07-24T00:00:00Z',
      timestamp,
      signature: { properties, checksum },
      ...overrides,
    } as WompiEvent;
  }

  it('accepts a well-formed signed event', () => {
    expect(verifyEventChecksum(makeEvent(), secret)).toBe(true);
  });

  it('rejects a tampered event (wrong secret)', () => {
    expect(verifyEventChecksum(makeEvent(), 'wrong_secret')).toBe(false);
  });

  it('rejects a forged checksum', () => {
    const e = makeEvent();
    e.signature = { ...e.signature, checksum: sha256('forged') };
    expect(verifyEventChecksum(e, secret)).toBe(false);
  });

  it('rejects when a signed property value is altered', () => {
    const e = makeEvent();
    e.data.transaction.status = 'DECLINED'; // checksum was for APPROVED
    expect(verifyEventChecksum(e, secret)).toBe(false);
  });
});

describe('computeNewPeriodEnd (renewal semantics)', () => {
  const now = new Date('2026-07-24T12:00:00Z');

  it('new subscription: +1 month from now', () => {
    const end = computeNewPeriodEnd(null, 'month', now);
    expect(end.toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('new yearly subscription: +1 year', () => {
    const end = computeNewPeriodEnd(null, 'year', now);
    expect(end.toISOString().slice(0, 10)).toBe('2027-07-24');
  });

  it('early renewal extends from current period end (no paid time lost)', () => {
    const existing = { currentPeriodEnd: new Date('2026-08-10T00:00:00Z'), status: 'ACTIVE' };
    const end = computeNewPeriodEnd(existing, 'month', now);
    expect(end.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('expired subscription restarts from now', () => {
    const existing = { currentPeriodEnd: new Date('2026-06-01T00:00:00Z'), status: 'EXPIRED' };
    const end = computeNewPeriodEnd(existing, 'month', now);
    expect(end.toISOString().slice(0, 10)).toBe('2026-08-24');
  });
});

// ── Replay recovery gate (RES-1) ─────────────────────────────────────────────
// shouldReactivate decides whether a webhook replay must re-run activation
// after a prior delivery marked the payment APPROVED but failed before the
// subscription became active. Pure + unit-tested because the routes import
// prisma/auth at module scope and aren't directly unit-testable.

describe('shouldReactivate (replay recovery gate)', () => {
  const now = new Date('2026-07-24T12:00:00Z');

  it('re-activates when APPROVED with no subscription (stuck, never activated)', () => {
    expect(shouldReactivate({ paymentStatus: 'APPROVED', subscription: null, now })).toBe(true);
  });

  it('skips when APPROVED and an ACTIVE subscription extends into the future', () => {
    expect(
      shouldReactivate({
        paymentStatus: 'APPROVED',
        subscription: { status: 'ACTIVE', currentPeriodEnd: new Date('2026-08-24T00:00:00Z') },
        now,
      }),
    ).toBe(false);
  });

  it('re-activates when APPROVED but the subscription period has expired', () => {
    expect(
      shouldReactivate({
        paymentStatus: 'APPROVED',
        subscription: { status: 'ACTIVE', currentPeriodEnd: new Date('2026-06-01T00:00:00Z') },
        now,
      }),
    ).toBe(true);
  });

  it('never activates a non-APPROVED payment', () => {
    for (const status of ['PENDING', 'DECLINED', 'ERROR', 'VOIDED'] as const) {
      expect(shouldReactivate({ paymentStatus: status, subscription: null, now })).toBe(false);
    }
  });

  it('re-activates when the subscription exists but is not ACTIVE', () => {
    expect(
      shouldReactivate({
        paymentStatus: 'APPROVED',
        subscription: { status: 'CANCELED', currentPeriodEnd: new Date('2026-08-24T00:00:00Z') },
        now,
      }),
    ).toBe(true);
  });
});

// ── First-delivery vs replay activation decision (RES2-1) ────────────────────
// shouldActivateOnDelivery splits the two webhook paths: first delivery always
// activates on APPROVED (a renewal while active MUST extend the period); replay
// is gated by shouldReactivate so it only recovers a stuck activation.

describe('shouldActivateOnDelivery (RES2-1: first delivery vs replay)', () => {
  const now = new Date('2026-07-24T12:00:00Z');
  const activeFuture = { status: 'ACTIVE' as const, currentPeriodEnd: new Date('2026-08-24T00:00:00Z') };

  it('first delivery: APPROVED + ACTIVE+future sub → true (THE RES2-1 regression)', () => {
    // Was false under the old ensureActivated→shouldReactivate gate; renewals
    // while active must extend currentPeriodEnd, not be dropped.
    expect(
      shouldActivateOnDelivery({ isReplay: false, paymentStatus: 'APPROVED', subscription: activeFuture, now }),
    ).toBe(true);
  });

  it('first delivery: APPROVED + no sub → true', () => {
    expect(
      shouldActivateOnDelivery({ isReplay: false, paymentStatus: 'APPROVED', subscription: null, now }),
    ).toBe(true);
  });

  it('first delivery: non-APPROVED → false', () => {
    expect(
      shouldActivateOnDelivery({ isReplay: false, paymentStatus: 'PENDING', subscription: null, now }),
    ).toBe(false);
  });

  it('replay: APPROVED + no sub → true (recovery)', () => {
    expect(
      shouldActivateOnDelivery({ isReplay: true, paymentStatus: 'APPROVED', subscription: null, now }),
    ).toBe(true);
  });

  it('replay: APPROVED + ACTIVE+future → false (already active, no-op)', () => {
    expect(
      shouldActivateOnDelivery({ isReplay: true, paymentStatus: 'APPROVED', subscription: activeFuture, now }),
    ).toBe(false);
  });

  it('replay: APPROVED + expired period → true', () => {
    expect(
      shouldActivateOnDelivery({
        isReplay: true,
        paymentStatus: 'APPROVED',
        subscription: { status: 'ACTIVE', currentPeriodEnd: new Date('2026-06-01T00:00:00Z') },
        now,
      }),
    ).toBe(true);
  });
});

// ── PayPal webhook signature verification ────────────────────────────────────
//
// PayPal verifies signatures server-side (you POST the headers+event back to
// PayPal's verify endpoint), so we mock fetch — this is the PayPal analog of the
// pure verifyEventChecksum tests above.

describe('verifyWebhookSignature', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(verifyStatus: string, verifyOk = true): ReturnType<typeof vi.fn> {
    const mock = vi.fn();
    let tokenCall = 0;
    mock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/v1/oauth2/token')) {
        tokenCall++;
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (u.includes('/v1/notifications/verify-webhook-signature')) {
        if (!verifyOk) return new Response('boom', { status: 500 });
        return new Response(JSON.stringify({ verification_status: verifyStatus }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  const params = {
    transmissionId: 'tid',
    transmissionTime: '2026-07-24T00:00:00Z',
    certUrl: 'https://paypal/cert',
    authAlgo: 'SHA256withRSA',
    transmissionSig: 'sig',
    webhookId: 'wh',
    webhookEvent: { id: 'evt', event_type: 'PAYMENT.CAPTURE.COMPLETED' },
  };

  it('returns true when PayPal says SUCCESS', async () => {
    mockFetch('SUCCESS');
    await expect(verifyWebhookSignature(params)).resolves.toBe(true);
  });

  it('returns false when PayPal says FAILURE (tampered/forged signature)', async () => {
    mockFetch('FAILURE');
    await expect(verifyWebhookSignature(params)).resolves.toBe(false);
  });

  it('returns false when the verify endpoint errors', async () => {
    mockFetch('SUCCESS', false);
    await expect(verifyWebhookSignature(params)).resolves.toBe(false);
  });

  it('posts the documented verify body (transmission/cert/algo/sig/webhook_id/event)', async () => {
    const mock = mockFetch('SUCCESS');
    await verifyWebhookSignature(params);
    const verifyCall = mock.mock.calls.find((c) =>
      String(c[0]).includes('/v1/notifications/verify-webhook-signature'),
    );
    expect(verifyCall).toBeTruthy();
    const body = JSON.parse(String((verifyCall![1] as RequestInit).body));
    expect(body.transmission_id).toBe('tid');
    expect(body.cert_url).toBe('https://paypal/cert');
    expect(body.auth_algo).toBe('SHA256withRSA');
    expect(body.transmission_sig).toBe('sig');
    expect(body.webhook_id).toBe('wh');
    expect(body.webhook_event.event_type).toBe('PAYMENT.CAPTURE.COMPLETED');
  });
});
