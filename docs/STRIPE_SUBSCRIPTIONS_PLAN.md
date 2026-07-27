# Stripe Subscriptions — Implementation Plan

Status: **approved, not started**
Branch: `feat/login-2fa-and-password-recovery` (base a new branch off `main`)
Decision date: 2026-07-26

---

## 1. Why this plan exists

The repository already contains Wompi and PayPal billing backends. Both are
**unreachable from the UI**: every pricing CTA links to `/register`
(`apps/web/src/app/[locale]/pricing/page.tsx:37,48,59`) and no frontend file
calls `/api/billing/*`. The billing layer is complete server-side and dead
client-side.

The existing model is **manual renewal**: a payment arrives, `activatePlan`
advances `currentPeriodEnd` by one month or year
(`apps/web/src/lib/billing/activate.ts:26,88`), and nothing charges again.
`cancelAtPeriodEnd` records intent locally with no provider-side effect,
because there is no recurring charge to stop.

This plan adds Stripe as a **true subscription provider** — Stripe owns the
billing cycle, retries, and dunning — and builds the checkout UI that does not
yet exist.

### Scope

| In scope | Out of scope |
| --- | --- |
| Stripe Checkout (`mode: 'subscription'`) | Stripe Tax / registrations |
| Stripe Billing webhooks + idempotency | Stripe Connect |
| Customer Portal for self-service management | Usage-based billing / Metronome |
| Prisma schema + migration | Proration UI beyond what the Portal gives |
| `.env.example`, CI secret delivery, `setup-github.sh` | Removing Wompi or PayPal |
| Pricing-page checkout + settings subscription card | Adding a global CSP (pre-existing gap, tracked separately) |

---

## 2. Prerequisites — human actions before merge

These are **operational, not code**. Implementation can proceed without them,
but the feature cannot be exercised end-to-end until they are done.

| # | Action | Where | Blocks |
| --- | --- | --- | --- |
| P1 | Create 3 Products, each with its own Price, in **test** and **live** mode | Stripe Dashboard | Checkout |
| P2 | Register the webhook endpoint `POST /api/webhooks/stripe` and copy its signing secret | Stripe Dashboard → Webhooks | Webhooks |
| P3 | Add `STRIPE_WEBHOOK_SECRET` to GitHub environment secrets (`development`, `production`) | GitHub | Webhooks |
| P4 | Add `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_PRO_MONTHLY` to both environments | GitHub | Checkout |
| P5 | Enable the Customer Portal and configure which actions customers may take | Stripe Dashboard → Billing → Customer Portal | Portal |
| P6 | Confirm `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` really exist in both GitHub environments | GitHub | Everything |

### P1 — product catalog

One Product per plan tier. Stripe renders the Product name on every invoice
line item, so tiers must not share a Product or customers cannot tell their
invoices apart.

| Product | Price | Amount | Interval | Env var holding the Price ID |
| --- | --- | --- | --- | --- |
| TRT Insights Plus | monthly | `1499` USD cents | month | `STRIPE_PRICE_PLUS_MONTHLY` |
| TRT Insights Plus | yearly | `11900` USD cents | year | `STRIPE_PRICE_PLUS_YEARLY` |
| TRT Insights Pro | monthly | `9900` USD cents | month | `STRIPE_PRICE_PRO_MONTHLY` |

Plus monthly and Plus yearly are two Prices on **one** Product — they are
billing variants of the same tier. Pro is a **separate** Product.

Amounts must match `PLANS[*].priceUsdCents` in `apps/web/src/lib/plans.ts:34-71`.
Prices are created in Stripe, not in code; code only stores the Price ID.

### P6 — key hygiene

`STRIPE_SECRET_KEY` is an `sk_` key. Prefer a **restricted key** (`rk_`) scoped
to the minimum permissions this integration needs:

- Checkout Sessions: write
- Customers: write
- Subscriptions: read
- Billing Portal Sessions: write
- Invoices: read

The env var name can stay `STRIPE_SECRET_KEY`; only the value changes. Use
distinct keys per environment so a leak in dev cannot touch live money.

> **`STRIPE_PUBLISHABLE_KEY` is not needed by this integration.** We use
> Stripe-hosted Checkout and the hosted Portal — both are full-page redirects,
> so Stripe.js never loads in our app. Note also that Next.js only exposes
> variables prefixed `NEXT_PUBLIC_` to the browser, so a bare
> `STRIPE_PUBLISHABLE_KEY` would be invisible client-side anyway. Leave the
> secret in place for a future embedded-Checkout or Elements migration, but do
> not wire it up now and do not rename it to `NEXT_PUBLIC_*` without a
> deliberate decision.

---

## 3. Architecture

### 3.1 Source of truth

For Stripe subscriptions, **Stripe owns `currentPeriodEnd`**. Do not call
`computeNewPeriodEnd` on the Stripe path — read the period end off the Stripe
subscription object. Local computation and Stripe's schedule will drift
(proration, trials, retries, dunning grace), and drift here means either
serving a lapsed customer or locking out a paying one.

`computeNewPeriodEnd` stays exactly as-is for Wompi, PayPal, and MANUAL.

> ⚠️ **Verify before coding:** in recent Stripe API versions `current_period_end`
> moved off the Subscription object onto the subscription **item**
> (`subscription.items.data[0].current_period_end`). Confirm the correct
> location for API version `2026-06-24.dahlia` using the `stripe:stripe-docs`
> skill. Do not guess, and do not copy the field path from an old tutorial.

### 3.2 Pure core, thin shell

`apps/web/tests/unit/billing.test.ts:141-143` records that the existing route
handlers import `prisma` and `auth` at module scope and therefore cannot be
unit-tested. Result: zero tests across seven route files.

New Stripe code must not repeat that. Split it:

```
stripe-events.ts   PURE   event -> StripeAction discriminated union.  Fully unit-tested.
                          Imports nothing but types. No prisma, no stripe client, no env.
stripe.ts          IMPURE Stripe SDK client, env reading, price-ID maps.
activate.ts        PORTED Extended with applyStripeSubscriptionState, using the existing
                          ActivateDb structural port so a fake DB can drive it in tests.
route.ts           SHELL  verify signature -> decideStripeAction -> execute. No branching logic.
```

The webhook route becomes a dispatcher with no decisions of its own. Every
decision lives in a pure function with a test.

### 3.3 Event handling

| Stripe event | Action | Local effect |
| --- | --- | --- |
| `checkout.session.completed` | `link_customer` + `activate` | Persist `stripeCustomerId`/`stripeSubscriptionId`; activate if `payment_status === 'paid'` |
| `invoice.paid` | `activate` | Create `Payment` row; set `ACTIVE`; set `currentPeriodEnd` from Stripe |
| `invoice.payment_failed` | `past_due` | Set `PAST_DUE`; leave `currentPeriodEnd` untouched |
| `customer.subscription.updated` | `sync` | Sync status, `cancelAtPeriodEnd`, `planCode` (plan may have changed in the Portal) |
| `customer.subscription.deleted` | `cancel` | Set `CANCELED` |
| anything else | `ignore` | 200 OK, no writes |

`checkout.session.completed` and `invoice.paid` can arrive **in either order**
and both may fire for the same first period. Both paths must be idempotent and
order-independent: derive state from the Stripe subscription object, never
from "what we think happened before". Never increment — always assign.

### 3.4 Idempotency

Reuse the existing `PaymentEvent` table with `provider: 'STRIPE'` and
`eventId: event.id`. Stripe reuses the event ID across all retries of the same
event, so this is a correct dedupe key.

**Improve on the existing pattern.** Wompi and PayPal do `findUnique` then
`create` (`apps/web/src/app/api/webhooks/wompi/route.ts:43,66`), which is a
time-of-check/time-of-use race — two concurrent retries can both pass the check.
For Stripe, insert first and let the database arbitrate:

```ts
try {
  await prisma.paymentEvent.create({ data: { provider: 'STRIPE', eventId: event.id, payload } });
} catch (e) {
  if (isPrismaUniqueViolation(e)) return NextResponse.json({ ok: true, replay: true });
  throw e;
}
```

`@@unique([provider, eventId])` already exists (`schema.prisma:552`), so this
needs no migration. Do **not** retrofit this onto the Wompi/PayPal routes in
this change — that is a separate, independently reviewable fix.

### 3.5 Raw body — non-negotiable

Stripe signature verification hashes the **exact bytes** Stripe sent. Parsing
and re-serializing changes them and verification will fail.

```ts
export const runtime = 'nodejs';        // Stripe SDK needs Node crypto
export const dynamic = 'force-dynamic'; // never cache a webhook

const rawBody = await req.text();       // MUST be .text(), never .json()
const sig = req.headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(rawBody, sig, env.webhookSecret);
```

Once `req.json()` is called the body stream is consumed — there is no recovery.
This differs from Wompi and PayPal, which verify over parsed data and can use
`req.json()` safely.

Middleware is not a concern: `apps/web/src/middleware.ts:56-59` excludes
`/api/**` entirely.

### 3.6 Cancellation

Stripe subscriptions are cancelled through the **hosted Customer Portal**, not
our own endpoint — the Portal also covers payment-method updates, plan changes,
and invoice history for free.

`apps/web/src/app/api/billing/cancel/route.ts` must branch on
`subscription.provider`:

- `STRIPE` → `409 { error: 'use_portal', portalUrl }`, or redirect
- `WOMPI` / `PAYPAL` / `MANUAL` → existing local-flag behavior, unchanged

The local `cancelAtPeriodEnd` flag is still written for Stripe, but only as a
**mirror** driven by `customer.subscription.updated`. It is never the source of
truth and is never set directly by our own code on the Stripe path.

---

## 4. Schema changes

`packages/db/prisma/schema.prisma`:

```prisma
enum PaymentProvider {
  WOMPI
  PAYPAL
  STRIPE   // ← add
  MANUAL
}

model User {
  // ...
  stripeCustomerId String? @unique   // ← add
}

model Subscription {
  // ...
  stripeSubscriptionId String? @unique   // ← add
}
```

`stripeCustomerId` belongs on **`User`**, not `Subscription`: one Stripe
Customer per person, reused across every subscription they ever hold. Putting
it on `Subscription` would duplicate it and let the two rows disagree.

`SubscriptionStatus` already carries `ACTIVE`, `PAST_DUE`, `CANCELED`,
`EXPIRED` (`schema.prisma:482`) — no change needed.

Migration: `pnpm --filter @trt/db exec prisma migrate dev --name add_stripe_billing`,
then `pnpm --filter @trt/db generate`. Additive and nullable throughout, so it
is safe on existing rows and needs no backfill.

Enum note: adding a value to a Postgres enum inside a transaction has version
restrictions. Verify the generated SQL runs cleanly against the dev database
before opening the PR.

---

## 5. Environment and CI

### 5.1 New variables

| Variable | Secret? | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes | Prefer `rk_`; distinct per environment |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_…`; **per endpoint**, so dev and prod differ |
| `STRIPE_PRICE_PLUS_MONTHLY` | no, but env-specific | Differs between test and live mode |
| `STRIPE_PRICE_PLUS_YEARLY` | no, but env-specific | |
| `STRIPE_PRICE_PRO_MONTHLY` | no, but env-specific | |
| `NEXT_PUBLIC_APP_URL` | no | Already read at `wompi/checkout/route.ts:55`, **never delivered by CI** — fix in this change |

Price IDs live in env, not in `plans.ts`, precisely because test and live mode
issue different IDs for the same plan. Hardcoding them makes the test
environment charge against live prices or fail outright.

### 5.2 `.env.example`

The root `.env.example` currently contains **no billing variables at all** —
not Stripe, not Wompi, not PayPal, despite ten of them being read at runtime.
Add a billing section following the file's existing conventions (`# ── Section ───`
divider, prose comment above each var, quoted values, `""` for unset):

```
# ── Billing: Stripe (subscriptions) ──────────────────────────────────────────
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_PRICE_PLUS_MONTHLY=""
STRIPE_PRICE_PLUS_YEARLY=""
STRIPE_PRICE_PRO_MONTHLY=""

# ── Billing: Wompi (Colombia, COP) ───────────────────────────────────────────
WOMPI_ENV="sandbox"
WOMPI_PUBLIC_KEY=""
WOMPI_INTEGRITY_SECRET=""
WOMPI_EVENTS_SECRET=""

# ── Billing: PayPal ──────────────────────────────────────────────────────────
PAYPAL_ENV="sandbox"
PAYPAL_CLIENT_ID=""
PAYPAL_CLIENT_SECRET=""
PAYPAL_WEBHOOK_ID=""
```

Also add `NEXT_PUBLIC_APP_URL` to the App/Auth section.

### 5.3 Workflows

`.github/workflows/deploy-dev.yml` and `deploy-production.yml` both use the
same shape: an `env:` block on the render step, then heredoc interpolation into
`apps/web/.env.local` (dev step at `:43-107`, prod at `:44`). Add to **both**:

```yaml
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
          STRIPE_PRICE_PLUS_MONTHLY: ${{ secrets.STRIPE_PRICE_PLUS_MONTHLY }}
          STRIPE_PRICE_PLUS_YEARLY: ${{ secrets.STRIPE_PRICE_PLUS_YEARLY }}
          STRIPE_PRICE_PRO_MONTHLY: ${{ secrets.STRIPE_PRICE_PRO_MONTHLY }}
```

and the matching heredoc lines. `NEXT_PUBLIC_APP_URL` is **not** a secret —
hardcode it in the heredoc next to `NEXTAUTH_URL`
(`https://dev.my-testo.com` / `https://my-testo.com`), matching how that file
already handles non-secret values.

`scripts/setup-github.sh:37-44` — add the five names to `APP_SECRETS` so
`setup-github.sh env <environment>` pushes them.

`pr-validation.yml` needs **no Stripe secrets**. It only runs lint, typecheck,
`vitest`, and a build with placeholder env (`:63-71`). The new unit tests are
pure and must not require a Stripe key — if a test needs one, the test is wrong.

> `NEXT_PUBLIC_*` variables are inlined into the client bundle **at build
> time**. Because CI renders `.env.local` before `pnpm build`, ordering already
> works — but never put a secret behind a `NEXT_PUBLIC_` prefix.

### 5.4 Local development

Webhooks cannot reach localhost. Use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

It prints a **different** `whsec_…` than the Dashboard endpoint. Use that one
locally. Trigger events with `stripe trigger invoice.paid`.

---

## 6. Work plan

Strict TDD: for every task with a test, the test is written and **failing**
before the implementation exists. `pnpm test` runs `vitest run`.

### Phase 0 — foundation

| # | Task | Files |
| --- | --- | --- |
| 0.1 | Add `stripe` (Node SDK `^22.3.0`) to `apps/web/package.json`; `pnpm install` | `apps/web/package.json`, `pnpm-lock.yaml` |
| 0.2 | Schema: `STRIPE` enum value, `User.stripeCustomerId`, `Subscription.stripeSubscriptionId` | `packages/db/prisma/schema.prisma` |
| 0.3 | Generate migration + Prisma client; confirm it applies to the dev DB | `packages/db/prisma/migrations/**` |

Do not commit `packages/db/src/generated/**` churn beyond what the migration
genuinely requires.

### Phase 1 — pure core (tests first)

| # | Task | Files |
| --- | --- | --- |
| 1.1 | **Tests** for `stripe-events.ts`: every row of §3.3, plus unknown events, missing subscription, missing price ID, both event orderings | `apps/web/tests/unit/stripe-billing.test.ts` |
| 1.2 | Implement `decideStripeAction`, `mapStripeSubscriptionStatus`, `periodEndFromSubscription` — pure, type-only imports | `apps/web/src/lib/billing/stripe-events.ts` |
| 1.3 | **Tests** for the price-ID map both directions, and `stripeConfigured()` with vars present/absent | same test file |
| 1.4 | Implement `stripeEnv()`, `stripeConfigured()`, `getStripe()` (lazy singleton, `apiVersion: '2026-06-24.dahlia'`), `priceIdForPlan()`, `planCodeForPriceId()` | `apps/web/src/lib/billing/stripe.ts` |

`planCodeForPriceId` is what the webhook uses to learn which plan an invoice is
for — build it by inverting the same env map, and make it return `null` rather
than throwing on an unknown Price ID (a Price created in the Dashboard and not
yet deployed to env must not crash the webhook).

Mirror the existing house style: a top-of-file block comment explaining the
flow, as in `wompi.ts:1-17` and `paypal.ts:1-14`.

### Phase 2 — activation port (tests first)

| # | Task | Files |
| --- | --- | --- |
| 2.1 | **Tests** for `applyStripeSubscriptionState` driven by a fake `ActivateDb` — new sub, renewal, plan change, past-due, cancel, out-of-order replay | `apps/web/tests/unit/stripe-billing.test.ts` |
| 2.2 | Implement `applyStripeSubscriptionState({ userId, planCode, stripeSubscriptionId, status, currentPeriodEnd, cancelAtPeriodEnd }, db, now)` — **assigns** `currentPeriodEnd`, never computes it | `apps/web/src/lib/billing/activate.ts` |
| 2.3 | Widen the `provider` union on `activatePlan`/`ensureActivated` to include `'STRIPE'` | same |

Reuse the existing `ActivateDb` structural port (`activate.ts:12-23`) — do not
invent a second injection mechanism.

### Phase 3 — routes

| # | Task | Files |
| --- | --- | --- |
| 3.1 | `POST /api/billing/stripe/checkout` — auth → `isPaidPlan` → find-or-create Stripe Customer (persist `stripeCustomerId`) → create session → `{ url }` | `apps/web/src/app/api/billing/stripe/checkout/route.ts` |
| 3.2 | `POST /api/billing/portal` — auth → require `stripeCustomerId` → `billingPortal.sessions.create` → `{ url }` | `apps/web/src/app/api/billing/portal/route.ts` |
| 3.3 | `POST /api/webhooks/stripe` — raw body, `constructEvent`, insert-first idempotency, dispatch to `decideStripeAction`, execute | `apps/web/src/app/api/webhooks/stripe/route.ts` |
| 3.4 | Branch `cancel/route.ts` on provider per §3.6 | `apps/web/src/app/api/billing/cancel/route.ts` |
| 3.5 | Surface `stripeCustomerId` presence in `status/route.ts` so the UI knows whether to show "Manage billing" | `apps/web/src/app/api/billing/status/route.ts` |

Checkout Session parameters:

```ts
await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: stripeCustomerId,
  client_reference_id: session.user.id,
  line_items: [{ price: priceIdForPlan(planCode), quantity: 1 }],
  // NO payment_method_types — omitting it enables dynamic payment methods
  integration_identifier: 'trt-subscription-<8 random letters>',
  success_url: `${appUrl}/${locale}/dashboard/settings?billing=success`,
  cancel_url:  `${appUrl}/${locale}/pricing?billing=canceled`,
});
```

Hard rules for this call:

- **Never pass `payment_method_types`.** Omitting it lets Stripe pick and rank
  the highest-converting eligible methods per customer, configured from the
  Dashboard with no redeploy. Hardcoding `['card']` silently disables wallets
  and local methods.
- **Do not enable `automatic_tax`.** Stripe collects zero tax and returns no
  error until an active tax registration exists — the integration would look
  correct and quietly under-collect. Tax is a separate, deliberate project.
- Follow the existing error convention: `503 { error: 'stripe_not_configured' }`
  when unconfigured, `400 { error: 'invalid_plan' }`, `401 { error: 'Unauthorized' }`
  — matching `paypal/order/route.ts:20-29`.

**Do not create a `PENDING` Payment row at checkout time.** PayPal does this
because it owns a single one-shot order. For subscriptions the authoritative
record is the Stripe invoice, and every abandoned checkout would leave an
orphaned `PENDING` row that nothing ever reconciles. Create `Payment` rows from
`invoice.paid`, keyed `reference: invoice.id` (satisfies the `@unique`
constraint and gives clean idempotency).

Currency: Stripe Prices are USD, so `Payment.currency = 'USD'`, consistent with
the PayPal path.

### Phase 4 — frontend

This is the largest gap. Nothing here exists today.

| # | Task | Files |
| --- | --- | --- |
| 4.1 | `CheckoutButton` client component — POSTs to the checkout route, `window.location.href = url`, pending + error states | `apps/web/src/components/billing/checkout-button.tsx` |
| 4.2 | Wire the pricing page: authenticated → `CheckoutButton` with the real `planCode`; anonymous → `/register?plan=<code>` | `pricing/page.tsx`, `components/ui/pricing-section-4.tsx` |
| 4.3 | Honor `?plan=` after registration by redirecting into checkout | register flow |
| 4.4 | `SubscriptionCard` in dashboard settings — plan, renewal date, status, cancel-pending banner, "Manage billing" → portal | `apps/web/src/components/billing/subscription-card.tsx`, `dashboard/settings/page.tsx` |
| 4.5 | Handle `?billing=success` and `?billing=canceled` on the settings page | `dashboard/settings/page.tsx` |
| 4.6 | i18n keys for every new string, EN **and** ES | `apps/web/messages/en.json`, `es.json` |

`pricing-section-4.tsx` currently renders CTAs as `<Button asChild><Link>`
(`:220-231`) driven by `plan.href`. Extend `PricingPlanView` with an optional
`planCode` and render `CheckoutButton` when it is present — keep the `href`
path for FREE and for anonymous visitors so the component stays usable in both
states.

The Wompi checkout route already redirects to `/dashboard/settings?billing=success`
(`wompi/checkout/route.ts:55-64`) — a page that renders no billing UI at all.
Task 4.4 fixes that dangling redirect for Wompi too.

Existing i18n copy at `en.json:151` already promises "Secure checkout is
completed from your authenticated account." Task 4.2 is what finally makes that
sentence true.

**Never render a Stripe key in a client component.** The client only ever
receives a `url` returned by our server.

### Phase 5 — CI, docs, verification

| # | Task | Files |
| --- | --- | --- |
| 5.1 | Billing section in `.env.example` per §5.2 (Stripe **and** the currently-undocumented Wompi/PayPal vars) | `.env.example` |
| 5.2 | Stripe env in both deploy workflows; hardcode `NEXT_PUBLIC_APP_URL` | `deploy-dev.yml`, `deploy-production.yml` |
| 5.3 | Extend `APP_SECRETS` | `scripts/setup-github.sh` |
| 5.4 | Document the flow, the Stripe CLI loop, and the test cards | `docs/DEPLOYMENT.md` or a new `docs/BILLING.md` |
| 5.5 | `pnpm lint && pnpm typecheck && pnpm test` green | — |

---

## 7. Testing

**Framework:** Vitest. `apps/web/vitest.config.ts` includes only
`tests/unit/**/*.test.ts`, `environment: 'node'`.

New file: `apps/web/tests/unit/stripe-billing.test.ts`, following the
conventions already in `billing.test.ts` — local factory helpers like
`makeEvent()` (`:66`), `vi.fn()` for `globalThis.fetch` with
`vi.restoreAllMocks()` in `afterEach` (`:255-278`).

Required coverage:

1. `decideStripeAction` — one case per §3.3 row, plus unknown event type,
   subscription-less invoice, and unknown Price ID.
2. **Ordering:** `invoice.paid` before `checkout.session.completed` reaches the
   same final state as the reverse. This is the highest-value test here.
3. **Replay:** the same event applied twice produces one activation and does
   not double-extend `currentPeriodEnd`. This is the Stripe analogue of the
   RES2-1 regression already guarded at `billing.test.ts:194`.
4. `periodEndFromSubscription` — correct field path (see §3.1 warning), unix →
   `Date` conversion, missing-field returns `null` rather than an Invalid Date.
5. `mapStripeSubscriptionStatus` — every Stripe status mapped to a valid
   `SubscriptionStatus`; unknown input must not throw.
6. Price-ID map both directions; `stripeConfigured()` true/false.
7. `applyStripeSubscriptionState` against a fake `ActivateDb` — the six
   scenarios in task 2.1.

No test may require a network call or a real Stripe key. `pr-validation.yml`
runs with no Stripe env at all, and it must stay that way.

**Manual verification** (after prerequisites, using `stripe listen`):
subscribe → confirm `ACTIVE` + correct `currentPeriodEnd` → `stripe trigger
invoice.payment_failed` → confirm `PAST_DUE` → cancel via Portal → confirm
`cancelAtPeriodEnd` mirrors → let it lapse → confirm `CANCELED`.

Test card numbers: use the `stripe:test-cards` skill. Never use a real card in
test mode.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| `current_period_end` field path changed in recent API versions | §3.1 — verify against docs before coding; a test asserts the path |
| Signature verification fails because the body was parsed | §3.5 — `req.text()` only; never `req.json()` on this route |
| Duplicate activation from concurrent webhook retries | §3.4 — insert-first idempotency, DB arbitrates |
| Local `currentPeriodEnd` drifts from Stripe's | §3.1 — always assign from Stripe, never compute or increment |
| Test-mode Price IDs deployed to production | §5.1 — Price IDs are per-environment secrets, never hardcoded |
| Live key leaks into the repo | §2 P6 — restricted key, env only; consider a pre-commit hook for `sk_`/`rk_` |
| Enum migration fails on Postgres | §4 — verify the generated SQL against the dev DB before the PR |
| Wompi's `?billing=success` redirect still lands nowhere | Task 4.4 builds that page |

---

## 9. Explicitly deferred

- **PayPal is dead code.** Its four env vars (`PAYPAL_CLIENT_ID`,
  `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID`) are read at runtime
  but **no workflow ever delivers them**, so every PayPal route returns
  `503 paypal_not_configured` in every deployed environment. This plan neither
  fixes nor removes it. Decide separately: wire up the secrets, or delete the
  routes and `paypal.ts`.
- **No Content-Security-Policy exists** anywhere in the app —
  `apps/web/next.config.mjs` sets no `headers()`. Stripe-hosted Checkout is a
  full redirect so it needs no CSP, but the absence is a real pre-existing gap.
  Track it on its own.
- **The TOCTOU idempotency race in the Wompi and PayPal webhooks** (§3.4) is
  left in place deliberately, so the fix can be reviewed on its own merits.
- **Stripe Tax**, proration policy beyond Portal defaults, and usage-based
  billing.
