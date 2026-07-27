# Billing — Stripe Subscriptions

Companion to `docs/STRIPE_SUBSCRIPTIONS_PLAN.md` (the implementation plan).
This doc is the day-to-day reference once the feature is live: how to run it
locally, what the webhook does, and which test cards to use. Wompi and PayPal
remain the Colombia (COP) and legacy PayPal paths respectively — this doc is
Stripe-specific.

## 1. How it works

- **Checkout**: `POST /api/billing/stripe/checkout` creates (or reuses) a
  Stripe Customer for the caller, then a `mode: 'subscription'` Checkout
  Session, and returns `{ url }`. The browser is redirected there — Stripe
  hosts the payment page, so no card data or Stripe key ever touches this app.
- **Self-service management**: `POST /api/billing/portal` returns a Stripe
  Customer Portal URL. Cancellation, payment-method updates, plan changes, and
  invoice history all happen there — this app has no "cancel a Stripe
  subscription" endpoint of its own (`/api/billing/cancel` returns
  `409 { error: 'use_portal', portalUrl }` for Stripe subscribers).
- **Webhook**: `POST /api/webhooks/stripe` verifies the signature over the raw
  request body, records the event once (`PaymentEvent`, idempotent), and
  dispatches to a pure decision function (`decideStripeAction` in
  `apps/web/src/lib/billing/stripe-events.ts`) before writing anything.
- **Source of truth**: Stripe owns `currentPeriodEnd`, subscription status,
  and plan (after a Portal change). This app never computes or extends a
  Stripe subscription's period locally — see plan §3.1.

## 2. Local development

Stripe cannot deliver webhooks to `localhost`. Use the Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI prints its own `whsec_…` — **different** from the one registered in
the Dashboard for the deployed endpoint. Put the CLI's value in your local
`STRIPE_WEBHOOK_SECRET`, not the Dashboard one.

Trigger individual events without going through checkout:

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

Manual end-to-end pass once P1–P6 (plan §2) are done:

1. Subscribe via the pricing page → confirm the local subscription becomes
   `ACTIVE` with the `currentPeriodEnd` Stripe reports (Dashboard → the
   subscription → "Current period").
2. `stripe trigger invoice.payment_failed` → confirm `PAST_DUE`,
   `currentPeriodEnd` unchanged.
3. Cancel via the Customer Portal → confirm `cancelAtPeriodEnd` mirrors within
   a few seconds (driven by `customer.subscription.updated`).
4. Let the period lapse (or trigger `customer.subscription.deleted`) →
   confirm `CANCELED`.

## 3. Test cards (test mode only — never a real card)

| Card | Number | Behavior |
| --- | --- | --- |
| Default success | `4242 4242 4242 4242` | Payment succeeds immediately |
| Requires 3D Secure | `4000 0025 0000 3155` | Prompts authentication in Checkout |
| Generic decline | `4000 0000 0000 0002` | Fails with `card_declined` / `generic_decline` |

Any future expiry date and any 3-digit CVC work with all of the above. Full
reference: https://docs.stripe.com/testing

## 4. Environment variables

See `.env.example` for the authoritative list (Billing: Stripe section) and
`docs/STRIPE_SUBSCRIPTIONS_PLAN.md` §5 for CI wiring. Summary:

| Variable | Where it's used |
| --- | --- |
| `STRIPE_SECRET_KEY` | `apps/web/src/lib/billing/stripe.ts` (`getStripe()`) |
| `STRIPE_WEBHOOK_SECRET` | `apps/web/src/app/api/webhooks/stripe/route.ts` |
| `STRIPE_PRICE_PLUS_MONTHLY` / `_PLUS_YEARLY` / `_PRO_MONTHLY` | `priceIdForPlan()` / `planCodeForPriceId()` |
| `NEXT_PUBLIC_APP_URL` | Checkout success/cancel URLs, Portal return URL |

Price ids differ between Stripe test mode and live mode for the *same* plan —
never hardcode one, and never let a test-mode id reach the production
environment (plan §8 risk table).

## 5. Known gaps (see plan §9 "Explicitly deferred")

- Wompi and PayPal keep their pre-existing findUnique-then-create idempotency
  race; only the new Stripe webhook uses the insert-first pattern.
- No Content-Security-Policy exists anywhere in the app yet — tracked
  separately, unaffected by Stripe's hosted-redirect flows.
- Stripe Tax, proration policy beyond Portal defaults, and usage-based billing
  are out of scope.
