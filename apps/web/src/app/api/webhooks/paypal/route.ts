import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@trt/db';
import { isPaidPlan } from '@/lib/plans';
import { verifyWebhookSignature, orderIdFromEvent } from '@/lib/billing/paypal';
import { ensureActivated, activatePlan } from '@/lib/billing/activate';

/**
 * PayPal events webhook (P1.c — PayPal variant).
 *
 * - Verifies the webhook signature against PayPal's verify-webhook-signature
 *   endpoint using PAYPAL_WEBHOOK_ID; unsigned/tampered payloads are rejected
 *   with 400 and write nothing. Unconfigured (no PAYPAL_WEBHOOK_ID) → 503.
 * - Idempotent: one PaymentEvent row per (PAYPAL, transmission_id); replays
 *   are no-ops.
 * - PAYMENT.CAPTURE.COMPLETED activates/extends the subscription; DENIED marks
 *   the payment declined; REFUNDED/REVERSED mark it voided.
 */
export async function POST(req: NextRequest) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const transmissionId = req.headers.get('paypal-transmission-id');
  const transmissionTime = req.headers.get('paypal-transmission-time');
  const certUrl = req.headers.get('paypal-cert-url');
  const authAlgo = req.headers.get('paypal-auth-algo');
  const transmissionSig = req.headers.get('paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return NextResponse.json({ error: 'missing_signature_headers' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const ok = await verifyWebhookSignature({
    transmissionId,
    transmissionTime,
    certUrl,
    authAlgo,
    transmissionSig,
    webhookId,
    webhookEvent: body,
  });
  if (!ok) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });

  // Idempotency: first writer wins; Keyed by transmission_id. Replays fall
  // through to the recovery gate so a stuck activation self-heals (RES-1).
  const seen = await prisma.paymentEvent.findUnique({
    where: { provider_eventId: { provider: 'PAYPAL', eventId: transmissionId } },
  });

  // Replay recovery (RES-1): a prior delivery may have committed the event and
  // marked the payment APPROVED but thrown before activation. Re-run it.
  if (seen) {
    const replayOrderId = orderIdFromEvent(body);
    const replayPayment = replayOrderId
      ? await prisma.payment.findUnique({ where: { reference: replayOrderId } })
      : null;
    if (replayPayment?.status === 'APPROVED' && isPaidPlan(replayPayment.planCode)) {
      await ensureActivated({
        userId: replayPayment.userId,
        planCode: replayPayment.planCode,
        paymentStatus: replayPayment.status,
        provider: 'PAYPAL',
        externalRef: replayPayment.externalId ?? null,
        isReplay: true,
      });
    }
    return NextResponse.json({ ok: true, replay: true });
  }

  await prisma.paymentEvent.create({
    data: { provider: 'PAYPAL', eventId: transmissionId, payload: body as object },
  });

  const eventType = String(body.event_type ?? '');
  const orderId = orderIdFromEvent(body);
  const payment = orderId
    ? await prisma.payment.findUnique({ where: { reference: orderId } })
    : null;

  if (!payment) {
    // Unknown/unmatched order — record and ack (prevents provider retries) but
    // do not activate anything.
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const mapped =
    eventType === 'PAYMENT.CAPTURE.COMPLETED'
      ? 'APPROVED'
      : eventType === 'PAYMENT.CAPTURE.DECLINED'
        ? 'DECLINED'
        : eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED'
          ? 'VOIDED'
          : 'PENDING';

  const captureId =
    (body.resource as { id?: string } | undefined)?.id ?? payment.externalId ?? null;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: mapped, externalId: captureId, raw: body as object },
  });

  // First delivery: activate DIRECTLY on APPROVED (RES2-1). Not gated by
  // shouldReactivate — a renewal while active must extend currentPeriodEnd.
  // activatePlan is idempotent + atomic ($transaction); RES-1 recovery still
  // holds: if this throws after the payment.status flip, the provider retry
  // hits the replay branch above (ensureActivated → shouldReactivate).
  if (mapped === 'APPROVED') {
    if (!isPaidPlan(payment.planCode)) {
      return NextResponse.json({ error: 'invalid_plan_on_payment' }, { status: 400 });
    }
    await activatePlan({
      userId: payment.userId,
      planCode: payment.planCode,
      provider: 'PAYPAL',
      externalRef: captureId,
    });
  }

  return NextResponse.json({ ok: true });
}
