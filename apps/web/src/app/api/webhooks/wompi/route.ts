import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@trt/db';
import { isPaidPlan } from '@/lib/plans';
import {
  verifyEventChecksum,
  wompiEnv,
  type WompiEvent,
} from '@/lib/billing/wompi';
import { ensureActivated, activatePlan } from '@/lib/billing/activate';

/**
 * Wompi events webhook (P1.c — Wompi variant).
 *
 * - Verifies the event checksum against WOMPI_EVENTS_SECRET; unsigned or
 *   tampered payloads are rejected with 400 and write nothing.
 * - Idempotent: one PaymentEvent row per (provider, eventId); replays are
 *   no-ops.
 * - transaction.updated → APPROVED activates/extends the subscription;
 *   DECLINED/ERROR/VOIDED update the Payment status only.
 */
export async function POST(req: NextRequest) {
  const env = wompiEnv();
  if (!env.eventsSecret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  let event: WompiEvent;
  try {
    event = (await req.json()) as WompiEvent;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!event?.signature?.checksum || !event?.data?.transaction) {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  }
  if (!verifyEventChecksum(event, env.eventsSecret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const tx = event.data.transaction;
  const eventId = `${tx.id}:${tx.status}:${event.timestamp}`;

  // Idempotency: first writer wins. Replays fall through to the recovery gate
  // so a stuck activation self-heals (RES-1).
  const seen = await prisma.paymentEvent.findUnique({
    where: { provider_eventId: { provider: 'WOMPI', eventId } },
  });

  // Replay recovery (RES-1): a prior delivery may have committed the event and
  // marked the payment APPROVED but thrown before activation. Re-run it.
  if (seen) {
    const replayPayment = await prisma.payment.findUnique({ where: { reference: tx.reference } });
    if (replayPayment?.status === 'APPROVED' && isPaidPlan(replayPayment.planCode)) {
      await ensureActivated({
        userId: replayPayment.userId,
        planCode: replayPayment.planCode,
        paymentStatus: replayPayment.status,
        provider: 'WOMPI',
        externalRef: tx.id,
        isReplay: true,
      });
    }
    return NextResponse.json({ ok: true, replay: true });
  }

  const payment = await prisma.payment.findUnique({ where: { reference: tx.reference } });

  await prisma.paymentEvent.create({
    data: { provider: 'WOMPI', eventId, payload: event as unknown as object },
  });

  if (!payment) {
    // Unknown reference — record and ack (prevents provider retries) but do
    // not activate anything.
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const mapped =
    tx.status === 'APPROVED'
      ? 'APPROVED'
      : tx.status === 'DECLINED'
        ? 'DECLINED'
        : tx.status === 'VOIDED'
          ? 'VOIDED'
          : tx.status === 'ERROR'
            ? 'ERROR'
            : 'PENDING';

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: mapped, externalId: tx.id, raw: event as unknown as object },
  });

  // First delivery: activate DIRECTLY on APPROVED (RES2-1). Not gated by
  // shouldReactivate — a renewal while active must extend currentPeriodEnd.
  // Wompi has no capture route, so this webhook is the sole activation path;
  // gating it would deterministically drop every renewal-while-active.
  // activatePlan is idempotent + atomic; RES-1 recovery holds via the replay
  // branch above (ensureActivated → shouldReactivate) if this throws post-flip.
  if (mapped === 'APPROVED') {
    if (!isPaidPlan(payment.planCode)) {
      return NextResponse.json({ error: 'invalid_plan_on_payment' }, { status: 400 });
    }
    await activatePlan({
      userId: payment.userId,
      planCode: payment.planCode,
      provider: 'WOMPI',
      externalRef: tx.id,
    });
  }

  return NextResponse.json({ ok: true });
}
