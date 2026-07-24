/**
 * PayPal billing integration — Orders v2 REST + JS SDK buttons on the client.
 *
 * Flow:
 *   1. Client renders PayPal buttons (JS SDK, NEXT_PUBLIC_PAYPAL_CLIENT_ID).
 *   2. createOrder → POST /api/billing/paypal/order → server creates the order
 *      via /v2/checkout/orders (intent=CAPTURE) and stores a PENDING Payment.
 *   3. Buyer approves in the PayPal popup.
 *   4. onApprove → POST /api/billing/paypal/capture → server captures and
 *      verifies status=COMPLETED, then activates the subscription.
 *
 * Environments: sandbox (api-m.sandbox.paypal.com) and live (api-m.paypal.com),
 * selected with PAYPAL_ENV.
 */

export type PayPalEnv = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  sandbox: boolean;
};

export function paypalEnv(): PayPalEnv {
  const sandbox = process.env.PAYPAL_ENV !== 'live';
  return {
    clientId: process.env.PAYPAL_CLIENT_ID ?? '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    baseUrl: sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com',
    sandbox,
  };
}

export function paypalConfigured(): boolean {
  const e = paypalEnv();
  return Boolean(e.clientId && e.clientSecret);
}

// ── OAuth client-credentials token (module-level cache) ─────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: PayPalEnv): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const auth = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64');
  const res = await fetch(`${env.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

// ── Orders v2 ────────────────────────────────────────────────────────────────

export type PayPalOrder = {
  id: string;
  status: string;
  links?: Array<{ href: string; rel: string; method: string }>;
};

export type PayPalCaptureResponse = {
  id: string;
  status: string; // "COMPLETED" on success
  purchase_units?: Array<{
    reference_id?: string;
    payments?: { captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }> };
  }>;
};

export async function createOrder(
  params: { reference: string; amountUsd: string; description: string },
  env: PayPalEnv = paypalEnv(),
): Promise<PayPalOrder> {
  const token = await getAccessToken(env);
  const res = await fetch(`${env.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.reference,
          description: params.description,
          amount: { currency_code: 'USD', value: params.amountUsd },
        },
      ],
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PayPal create order failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as PayPalOrder;
}

export async function captureOrder(
  orderId: string,
  env: PayPalEnv = paypalEnv(),
): Promise<PayPalCaptureResponse> {
  const token = await getAccessToken(env);
  const res = await fetch(`${env.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as PayPalCaptureResponse;
}

// ── Webhook signature verification ───────────────────────────────────────────

export type PayPalVerifyParams = {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  webhookId: string;
  /** The raw webhook event body (posted back to PayPal verbatim). */
  webhookEvent: unknown;
};

/**
 * Verify a PayPal webhook signature by posting the headers + event back to
 * PayPal's verify endpoint (the authoritative path). Returns true only when
 * PayPal responds with verification_status === "SUCCESS".
 *
 * Docs: https://developer.paypal.com/api/rest/webhooks/ — the verify endpoint
 * takes transmission_id/time, cert_url, auth_algo, transmission_sig, webhook_id,
 * and the full webhook_event, authenticated with a client-credentials token.
 */
export async function verifyWebhookSignature(
  params: PayPalVerifyParams,
  env: PayPalEnv = paypalEnv(),
): Promise<boolean> {
  const token = await getAccessToken(env);
  const res = await fetch(`${env.baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      transmission_id: params.transmissionId,
      transmission_time: params.transmissionTime,
      cert_url: params.certUrl,
      auth_algo: params.authAlgo,
      transmission_sig: params.transmissionSig,
      webhook_id: params.webhookId,
      webhook_event: params.webhookEvent,
    }),
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === 'SUCCESS';
}

/**
 * Extract the PayPal order id from a webhook event resource. The capture
 * resource carries it under supplementary_data.related_ids.order_id (with an
 * order_id fallback for older shapes). Null when not present.
 *
 * Accepts `unknown` so callers can pass the raw parsed webhook body without an
 * unsafe cast; the shape is narrowed at runtime below.
 */
export function orderIdFromEvent(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const resource = (event as {
    resource?: { supplementary_data?: { related_ids?: { order_id?: string } }; order_id?: string } | null;
  }).resource;
  const r = resource ?? null;
  if (!r) return null;
  return r.supplementary_data?.related_ids?.order_id ?? r.order_id ?? null;
}
