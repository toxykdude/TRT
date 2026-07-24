/**
 * Wompi billing integration (Colombia) — Widget & Checkout Web + events.
 * Docs: https://docs.wompi.co/docs/colombia/inicio-rapido/
 *
 * Flow (Widget):
 *   1. Client asks POST /api/billing/wompi/checkout for signed widget params.
 *   2. Server builds a unique reference and the integrity signature:
 *        sha256( reference + amountInCents + currency + INTEGRITY_SECRET )
 *      rendered into the widget's data-signature:integrity attribute.
 *   3. Wompi processes the payment and POSTs an event to our webhook.
 *   4. Webhook verifies the event checksum:
 *        sha256( concat(signature.properties values from data) + timestamp + EVENTS_SECRET )
 *      then activates the subscription idempotently.
 *
 * Environments: sandbox (https://sandbox.wompi.co/v1, pub_test_/prv_test_
 * keys) and production (https://production.wompi.co/v1, pub_prod_/prv_prod_).
 */
import crypto from 'node:crypto';

export type WompiEnv = {
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  baseUrl: string;
  sandbox: boolean;
};

export function wompiEnv(): WompiEnv {
  const sandbox = process.env.WOMPI_ENV !== 'production';
  return {
    publicKey: process.env.WOMPI_PUBLIC_KEY ?? '',
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET ?? '',
    eventsSecret: process.env.WOMPI_EVENTS_SECRET ?? '',
    baseUrl: sandbox ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1',
    sandbox,
  };
}

export function wompiConfigured(): boolean {
  const e = wompiEnv();
  return Boolean(e.publicKey && e.integritySecret && e.eventsSecret);
}

/**
 * Unique payment reference (≤ 255 chars per Wompi). Contains no PHI — just an
 * opaque plan code, a truncated user id fragment, and a timestamp.
 */
export function buildReference(userId: string, planCode: string, now = Date.now()): string {
  const frag = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'anon';
  const rand = crypto.randomBytes(3).toString('hex'); // same-ms uniqueness
  return `trt_${planCode.toLowerCase()}_${frag}_${now.toString(36)}${rand}`;
}

/**
 * Widget integrity signature (server-side only — the integrity secret never
 * reaches the client). Pure function for tests.
 */
export function computeIntegritySignature(
  params: { reference: string; amountInCents: number; currency: string },
  integritySecret: string,
): string {
  const plain = `${params.reference}${params.amountInCents}${params.currency}${integritySecret}`;
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}

// ── Webhook event verification ───────────────────────────────────────────────

export type WompiTransaction = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';
  reference: string;
  amount_in_cents: number;
  currency: string;
  payment_method_type?: string;
  customer_email?: string;
};

export type WompiEvent = {
  event: string; // e.g. "transaction.updated"
  data: { transaction: WompiTransaction } & Record<string, unknown>;
  sent_at: string;
  timestamp: number;
  signature: { properties: string[]; checksum: string };
};

/** Resolve a dotted property path ("transaction.id") inside event.data. */
function resolvePath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, data);
}

/**
 * Verify a Wompi event checksum. Pure function for tests:
 *   sha256( values(properties).join('') + timestamp + eventsSecret ) === checksum
 */
export function verifyEventChecksum(event: WompiEvent, eventsSecret: string): boolean {
  try {
    const values = event.signature.properties.map((p) => {
      const v = resolvePath(event.data as Record<string, unknown>, p);
      return v == null ? '' : String(v);
    });
    const plain = values.join('') + String(event.timestamp) + eventsSecret;
    const digest = crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
    const expected = event.signature.checksum;
    return (
      digest.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}

/** Fetch the authoritative transaction state from the Wompi API. */
export async function getTransaction(
  transactionId: string,
  env: WompiEnv = wompiEnv(),
): Promise<WompiTransaction | null> {
  const res = await fetch(`${env.baseUrl}/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: WompiTransaction };
  return json.data ?? null;
}
