# TRT Insights — Company Implementation Plan

**Product:** TRT Insights (trt.powerhousegym.co,)
**Document status:** Business planning document — pairs with `develop_saas.md` (engineering roadmap)
**Date:** 2026-07-23

---

## 1. Executive Summary

TRT Insights is a longitudinal hormone-lab intelligence platform: patients upload lab
results (PDF or manual entry), track biomarkers and symptoms over time, and receive
deterministic, citation-backed clinical reports they can bring to their physician.
Clinicians get a prep-for-visit summary layer that compresses a patient's hormone
history into minutes instead of chart-digging.

**Company thesis in one sentence:** own the data layer between TRT patients and their
physicians — the place where labs, symptoms, and treatment history become a single
trend-aware, evidence-cited picture — and monetize it as a subscription on both sides
of the relationship.

**The compliance fork, stated plainly up front:** the codebase currently ships a
consumer-facing exact-steroid-dosing module with its safety guardrails deliberately
removed (see recent commits and GOLD.md §2.3 "Removed Restrictions"). That posture is
**not commercializable** and fixing it is the P0 launch blocker, for mechanical reasons,
not opinion:

- **Payments:** Stripe's restricted-business terms will not underwrite a service that
  generates anabolic-steroid cycle protocols for consumers. No payment rail, no SaaS.
- **Advertising:** Meta, Google, and TikTok health-advertising policies prohibit
  steroid/PED promotion. All three authored campaigns in `marketing/campaigns/` would
  be rejected or get the ad accounts banned.
- **Insurance:** no professional-liability or tech E&O carrier will cover consumer
  steroid-cycle generation. Uninsurable means un-investable and un-sellable to clinics.
- **Criminal/civil exposure:** anabolic steroids are DEA Schedule III controlled
  substances. Facilitating non-prescribed use creates criminal and civil exposure for
  the founder personally, not just the entity.
- **Platform risk:** app-store and hosting acceptable-use policies add takedown risk
  on top of everything above.

The commercial product is therefore the **compliant clinical-decision-support
platform**: consumers get education, trend analysis, classifications, and
"discuss with your physician" framing — never dosing output. The dosing/protocol
reference module survives, but gated exclusively behind license-verified CLINICIAN
accounts. Disclaimers become mandatory again, and the GOLD.md §2 spec-vs-code
contradiction gets resolved in favor of the safety spec. This document assumes that
fork is taken; every section below is built on it.

---

## 2. Current State Assessment

### What works today

| Capability | Evidence | Status |
|---|---|---|
| Auth (Credentials + Google OAuth) | Auth.js v5, `apps/web` | Working |
| Deterministic analysis engine | `packages/engine` (classify → trends → rules → report), sha256-reproducible | Working |
| Clinical reports with trend charts + citations | `apps/web/src/app/dashboard/reports` | Working |
| Knowledge base with deterministic BM25 retrieval | `packages/kb` (57 docs) | Working |
| Data model with Row Level Security | `packages/db/prisma/schema.prisma`, `packages/db/prisma/sql/rls.sql` | Working |
| Manual biomarker entry, symptoms, patient profile | `apps/web/src/app/dashboard/*` | Working |
| Deployment | Debian LXC behind Cloudflare Tunnel, pm2 | Working (not production-grade) |

### What is missing for a SaaS

| Gap | Evidence | Severity |
|---|---|---|
| **Lab PDF extraction is a stub** — returns canned sample data; the live OpenAI Structured Outputs path is a commented TODO | `packages/ai/src/extraction.ts`, `apps/web/src/app/dashboard/labs/extract/route.ts` | Critical — the core value prop is not implemented |
| **Guardrails removed** — dosage-blocking guardrails deleted, GOLD.md §2 rewritten to drop safety restrictions, disclaimers "optional"; `CHANGES.md` itself flags the spec as internally contradictory with surviving code/tests | Recent commits; `GOLD.md` §2.3; `packages/engine/src/guardrails.ts` vs `packages/ai/src/guardrails.ts` | Critical — launch blocker (see §1) |
| **No billing** — no Stripe, no plans, no metering | Absent from codebase | Blocking for paid launch |
| **No admin UI** — ADMIN role exists only in the Prisma `Role` enum | `packages/db/prisma/schema.prisma` | Blocking for paid launch |
| **No multi-tenancy** — `Patient.ownerId` is `@unique`; one user = one patient; clinician portal is roadmap-only | `packages/db/prisma/schema.prisma` (GOLD §11 roadmap) | Blocking for clinician tier |
| **Guardrail audits not persisted** — computed in memory, never written despite an existing `AuditLog` model | `packages/db/prisma/schema.prisma` | Compliance gap |
| **Corpus provenance** — knowledge corpus (`to-rag/`) is bodybuilding/anabolics literature (Llewellyn's Anabolics 11th Ed, etc.), not clinical guidelines | `to-rag/` | Content-quality and credibility gap for the clinician tier |
| No transactional email, no backups/monitoring/rate limiting hardening | Absent | Required before paid launch |

The dosing "RAG" is in reality a hardcoded, deterministic rule table
(`packages/ai/src/dosing.ts`, `COMPOUNDS` array). There is no LLM call at report
time, so per-report marginal API cost today is approximately $0 — a genuine
structural advantage for gross margin (see §9). The only real LLM spend to date is
a one-time Graphiti corpus ingestion (`scripts/ingest_corpus.py` via Z.AI
GLM-4.5-air). Future variable cost is OpenAI extraction per uploaded lab PDF,
estimated $0.01–0.05/document with a mini-tier model.

---

## 3. Product & Positioning

**Positioning statement:** *TRT Insights is the longitudinal hormone-lab intelligence
layer between patient and physician.* Not a telehealth clinic, not a lab, not a
prescriber — the system of record and analysis for a patient's hormone journey.

### Target segments

1. **Self-directed patients** on or considering physician-supervised TRT. Men 30–55,
   already paying for labs and treatment, currently tracking results in spreadsheets,
   screenshots, and forum posts. They want to understand their numbers and walk into
   appointments prepared.
2. **TRT / men's-health clinicians and telehealth clinics.** Their pain is time:
   reviewing a new patient's scattered lab history takes 20–30 minutes of chart work.
   A prep-for-visit summary that compresses this to under a minute is directly
   monetizable against clinician hourly cost.
3. **Gym members** — a captive, zero-CAC beta channel through the parent
   brand. Ideal demographic overlap with segment 1; used for beta recruitment,
   testimonial generation, and extraction-accuracy data collection before public launch.

### Competitive frame

| Alternative | What they do | Where TRT Insights wins |
|---|---|---|
| Lab portals (Quest, Labcorp, clinic portals) | Show raw values against generic reference ranges, one draw at a time | Longitudinal trends, hormone-specific context, symptom correlation, physician-ready reports |
| Telehealth TRT clinics (Marek Health-style services) | Bundle labs + prescribing + coaching; analysis is locked to their service | Clinic-agnostic: works with any provider, any lab; the patient owns the record |
| Spreadsheet status quo | Free, flexible, universal | Zero analysis, no citations, no classifications, unusable in a 15-minute visit |

Deliberate non-goals: prescribing, dispensing, telehealth visits, lab fulfillment.
Staying out of care delivery keeps the regulatory surface small (see §4) and makes
the product complementary — not competitive — to the clinics in segment 2.

---

## 4. Compliance & Legal Foundation

*This section is practical guidance, not legal advice — engage healthcare-regulatory
counsel before Phase 2 (paid launch). One consult early is far cheaper than one
enforcement action later.*

### 4.1 Entity setup

- Form an LLC (or C-corp if outside investment is planned) separate from any
  Gym's operating entity, so product liability does not attach to the gym business.
- Register the DBA "TRT Insights"; assign the domain and IP to the entity.
- Adopt written policies from day one: privacy policy, terms of service, acceptable-use
  policy, data-retention policy, incident-response outline.

### 4.2 FDA posture — the CDS exemption

Under 21st Century Cures Act §3060(a) (codified as FD&C Act §520(o)), software is
exempt from device regulation as clinical decision support when, among other criteria,
it is intended to **support or provide recommendations to a healthcare professional**,
and enables that professional to **independently review the basis** for the
recommendations rather than relying primarily on them.

This maps directly onto the architecture:

- The deterministic rules engine (`packages/engine`) and citation-backed reports are
  exactly the transparency the exemption rewards: every classification traces to a
  named rule, every recommendation to a retrievable source in `packages/kb`.
- **Physician-facing transparency helps qualify; hidden consumer dosing recommendations
  break it.** A consumer-facing module that outputs exact steroid doses is not CDS
  aimed at a professional, and the "independent review" prong collapses when the end
  user is a layperson. This is the second, independent reason (beyond §1's commercial
  blockers) that the dosing module must be clinician-gated.
- Consumer-tier output stays in the safe zone: education, trend visualization,
  classification against reference ranges, and "discuss with your physician" framing.

### 4.3 HIPAA posture

- HIPAA applies when handling PHI as a **covered entity or business associate**. A
  direct-to-consumer app where patients upload their own labs is generally *not* a
  covered entity — but the moment a clinic uses the platform for its patients (Phase
  3–4), TRT Insights becomes a business associate and must sign BAAs.
- **The current Debian LXC behind a Cloudflare Tunnel is not BAA-ready.** No signed
  BAA is available for that stack, and single-node self-hosting cannot meet the
  audit/backup/access-control expectations a clinic's compliance officer will impose.
- Path: remain on current infra through the consumer phases while behaving *as if*
  HIPAA applied (encryption at rest and in transit, RLS, persisted audit logs, access
  controls); migrate to BAA-capable managed hosting (managed Postgres + HIPAA-eligible
  compute) as a Phase 3 gate. Engineering details in `develop_saas.md` P3.

### 4.4 Disclaimers, ToS, and content duties

- **Mandatory, non-dismissible disclaimers** on every report and every screen showing
  clinical interpretation: informational/educational, not medical advice, not a
  substitute for a physician. GOLD.md §2.5 currently makes these "optional" — that is
  reversed as part of P0 (see `develop_saas.md` P0.1).
- ToS: no doctor–patient relationship, no emergency use, arbitration clause,
  limitation of liability, age gate (18+), prohibition on using output to source or
  self-administer controlled substances.
- Privacy policy: what is collected, retention, deletion rights, no sale of health data.
- **Clinician license verification is a duty, not a feature.** Gating the protocol
  reference module on CLINICIAN role means the company must actually verify licenses
  (NPI lookup + state-board check + document upload, manual review at launch scale)
  and re-verify periodically. An unverified "clinician" checkbox provides zero
  protection.
- **Content re-sourcing:** clinician-grade reference content should migrate from
  bodybuilding literature (`to-rag/`, Llewellyn's Anabolics) toward guideline-grade
  sources — Endocrine Society clinical practice guidelines, AUA testosterone
  deficiency guideline — with the citation layer pointing at those. This is both a
  liability reducer and the credibility wedge for selling to clinics.

### 4.5 Insurance

- Professional liability (miscellaneous medical E&O) + technology E&O + cyber, bundled.
  Estimate $3,000–6,000/yr at seed scale (estimate; quote after P0 is complete —
  carriers will ask exactly the questions §1 answers, and the current posture is
  declinable).

---

## 5. Pricing Structure

Marginal cost per report is near zero (deterministic engine, no LLM at report time);
the only variable cost is extraction (~$0.05/doc worst case) and Stripe fees. Gross
margin at the recommended prices exceeds 90%, so pricing is anchored to **value**
(clinician time saved; patient clarity) rather than cost.

### Tier comparison

| | **Patient Free** | **Patient Plus** | **Clinician Pro** | **Clinic / Enterprise** |
|---|---|---|---|---|
| Price | $0 | $14.99/mo or $119/yr | $99/mo per seat | from $499/mo |
| Lab entry | Manual only | PDF upload (fair-use) + manual | Everything in Plus | Everything in Pro |
| PDF uploads | — | 10/mo fair-use cap | 50/mo per seat | Pooled, contract terms |
| Biomarker trends | 3 biomarkers | Full history, all biomarkers | Full history, per patient | Full history, per patient |
| Reports | 1 per quarter | Unlimited | Unlimited | Unlimited |
| Symptom correlation | — | Included | Included | Included |
| Multi-patient panel | — | — | Included | Included |
| Prep-for-visit summaries | — | — | Included | Included |
| Clinician reference module (dosing/protocols) | Never | Never | After license verification | After license verification |
| PDF export | — | Included | Included | Included |
| BAA / SSO / audit export | — | — | — | Included |
| White-label option | — | — | — | Available |

### Rationale

- **Patient Free** exists for SEO capture and the gym beta funnel; 3-biomarker trends
  and 1 report/quarter is enough to demonstrate value and create upgrade pressure
  without cannibalizing Plus.
- **Patient Plus at $14.99/mo** sits well below what this segment already spends per
  lab draw ($50–150) and reads as "one supplement bottle." Annual at $119 (~34%
  discount) front-loads cash and cuts churn.
- **Clinician Pro at $99/mo** is anchored to time saved: if prep-for-visit summaries
  save even 20 minutes/week of chart review, the seat pays for itself several times
  over at typical clinician hourly economics. The license-verified reference module is
  the differentiated hook — available nowhere in the consumer tier, by design (§1, §4).
- **Clinic/Enterprise from $499/mo** prices the BAA, SSO, audit export, and
  white-label as compliance/ops value, not features.

### Metering rules

- Uploads metered per calendar month per account (Plus: 10/mo; Pro: 50/mo/seat);
  overage prompts an upgrade rather than surprise billing at launch.
- Report generation unmetered on paid tiers (marginal cost ≈ 0); free tier enforced
  at 1/quarter.
- Every extraction records token usage and cost for margin monitoring
  (`develop_saas.md` P0.2).

---

## 6. Marketing Structure

### 6.1 The compliance rewrite comes first

Meta, Google, and TikTok health-ads policies prohibit promotion of anabolic
steroids/PEDs and heavily restrict personal-health targeting and before/after or
sensational health claims. **No ad, landing page, or organic post may promise dosing
guidance, cycle optimization, or PED protocols.** The compliant creative angle —
"understand your labs, track your trends, walk into your appointment prepared" — is
also the better-converting one for the actual buyer.

### 6.2 The three authored campaigns, mapped and rewritten

| Campaign (existing asset) | Funnel stage | Audience / channels | Compliance rewrite required |
|---|---|---|---|
| `marketing/campaigns/01-your-labs-finally-understood` — "Your Labs, Finally Understood" | Top/mid funnel, patient acquisition | Men 30–55; IG, TikTok, Shorts, Reddit | Strip any dosage/protocol implication; center on lab literacy, trends, "know before your visit" |
| `marketing/campaigns/02-the-30-second-doctor-visit` — "The 30-Second Doctor Visit" | Mid/bottom funnel, clinician acquisition | Physicians; LinkedIn, Doximity | Reframe as prep-for-visit time savings and CDS transparency; no treatment-recommendation claims |
| `marketing/campaigns/03-train-your-hormones` — "Train Your Hormones Like You Train Your Body" | Beta funnel | Gym members; in-gym + owned channels | Remove any performance-enhancement framing; position as health tracking discipline; add physician-supervision framing |

Brand system stays as authored: cyan #0EA5E9 on navy #0B1220, evidence-led voice, no
bro-copy.

### 6.3 Channel plan

1. **Organic SEO — biomarker education pages** (primary long-term channel). High-intent
   queries this audience actually searches: "free testosterone low but total normal,"
   "estradiol sensitive vs standard assay," "SHBG high on TRT," "hematocrit limit
   TRT." Each page: explainer + interactive reference-range widget + CTA into Patient
   Free. The KB corpus (`packages/kb`) seeds this content cheaply.
2. **Reddit / communities.** Genuine participation and educational content in
   TRT-adjacent subreddits; never dosing talk, never astroturfing. Free-tier trend
   screenshots are the shareable artifact.
3. **Gym in-house channel** — zero-CAC beta funnel: posters, trainer
   referrals, member email/app. Powers Phase 1 (§10) with 50–100 beta users.
4. **LinkedIn / Doximity for clinicians** — Campaign 02, plus founder-authored posts
   on CDS transparency and TRT monitoring workflows. Warm outreach to telehealth TRT
   clinics for Phase 3–4 pilots.
5. **Content engine:** one educational article + one short video per week, cut into
   platform-native formats; every asset ends in the same measurable CTA.

### 6.4 KPI framework

Building on the targets already authored in the campaign briefs:

| Stage | Metric | Target |
|---|---|---|
| Awareness | Video view-through rate (VTR) | ≥ 35% |
| Consideration | CTA click-through | ≥ 3% |
| Acquisition | Sign-up rate from clicks | ≥ 5% |
| Activation | Uploaded a lab or entered biomarkers within 7 days | ≥ 40% (estimate; set baseline in beta) |
| Conversion | Free → Plus within 60 days | ≥ 5% (estimate) |
| Retention | Plus 3-month retention | ≥ 70% (estimate) |

**CAC/LTV sanity targets:** blended CAC ≤ $40 for Patient Plus (LTV at $14.99/mo,
~14-month average life ≈ $190 (estimate) → LTV:CAC ≈ 4.7); clinician seats justify CAC
up to $400 given $99/mo pricing and stickier multi-patient usage. Gym-channel CAC ≈ $0
is what makes Phase 1 free to run.

---

## 7. Admin Backend — Decision

**Yes. An admin backend is required before paid launch.** Plainly: the company cannot
take money, verify clinicians, or demonstrate compliance without one.

Justification, mapped to concrete needs:

1. **Subscription & user management** — refunds, plan changes, comped accounts,
   account deletion (privacy-policy obligation). Doing this by hand-editing Postgres
   in production is how billing incidents happen.
2. **Clinician license-verification queue** — the gate on the reference module (§4.4)
   is only as real as the review workflow behind it: document upload, NPI/state-board
   check, approve/reject with an audit trail.
3. **Guardrail-audit log review** — GOLD.md's security/compliance and audit
   requirements (§8, §12) call for audit logging; guardrail audits are currently
   computed in memory and never persisted despite the existing `AuditLog` model.
   Persist them (P0.1) and give admins a viewer.
4. **Extraction-failure review queue** — the extraction pipeline (P0.2) will produce
   low-confidence and failed parses; someone must review them, both for user support
   and for accuracy-liability management (§11).
5. **KB / corpus version management** — which knowledge-base version produced which
   report is a compliance question (reproducibility is already a system property;
   version visibility makes it operational).
6. **Support tooling with audited impersonation** — view-as-user for support, with
   every impersonation session written to `AuditLog`.
7. **Business metrics** — signups, activation, MRR, churn, extraction cost per doc.

**Scope decision:** build it as an `/admin` route group inside the existing Next.js
app, gated on the existing `ADMIN` role — not a separate product. Same auth, same RLS
posture, same deploy. Engineering scope in `develop_saas.md` P2.

---

## 8. Company Structure for Take-Off

Lean by design; the product's deterministic architecture keeps operational load low.

| Role | Arrangement | Why |
|---|---|---|
| Founder-operator | Full-time | Product, engineering, growth, support |
| Medical Director / Advisor (MD) | Fractional, retained early — **non-negotiable** | CDS credibility, clinician-content sign-off, guideline re-sourcing review (§4.4), the name clinics will ask for |
| Healthcare-regulatory counsel | Project-based | Entity setup, ToS/privacy, CDS-exemption review before Phase 2, BAA templates before Phase 3 |
| Designer / video contractor | Per-campaign | Executes the three campaigns and the content engine |
| First employee | When MRR sustainably covers salary (~$8–10k MRR as a working threshold, estimate) | Full-stack engineer or support lead, whichever is the bigger founder bottleneck at the time |

**Advisory board note:** two or three advisors — one practicing TRT/men's-health
clinician (can be the Medical Director), one SaaS growth operator, one
healthcare-compliance profile. Small equity grants (0.1–0.5%, standard advisor terms),
quarterly cadence.

---

## 9. Financial Model Sketch

All figures are estimates for planning; revisit quarterly.

### Fixed costs (monthly unless noted)

| Item | Cost |
|---|---|
| Infrastructure (current LXC era) | $50–150/mo |
| Tooling (email provider, monitoring, analytics, misc SaaS) | ~$100/mo |
| Insurance (E&O + cyber, §4.5) | $3,000–6,000/yr → ~$250–500/mo |
| Legal setup (one-time, year 1) | $3,000–8,000 one-time |
| **Steady-state fixed burn (ex-founder time)** | **≈ $500–750/mo** |

### Variable costs

| Item | Cost |
|---|---|
| Extraction (OpenAI, mini-tier model) | ~$0.01–0.05 per uploaded document |
| Stripe | 2.9% + $0.30 per transaction |
| Report generation | ≈ $0 (deterministic engine, no LLM at report time) |

Per Patient Plus subscriber at $14.99/mo: Stripe ≈ $0.73; extraction at 10 docs/mo
worst case ≈ $0.50; contribution ≈ **$13.76/mo (~92% margin)**. Per Clinician Pro seat
at $99/mo: Stripe ≈ $3.17; extraction at 50 docs/mo worst case ≈ $2.50; contribution ≈
**$93.33/mo (~94% margin)**.

### Break-even

Against ~$625/mo steady-state fixed burn (midpoint):

- **≈ 46 Patient Plus subscribers** ($625 ÷ $13.76), or
- **≈ 7 Clinician Pro seats** ($625 ÷ $93.33), or any blend
  (e.g., 25 Plus + 4 Pro ≈ $717/mo contribution).

Break-even on cash costs is deliberately tiny; the real cost is founder time, which is
why Phase 1 optimizes for learning velocity, not revenue.

### 12-month projection (post-paid-launch months)

| Scenario | Month 3 | Month 6 | Month 9 | Month 12 | Assumptions |
|---|---|---|---|---|---|
| **Conservative** — Plus subs | 30 | 60 | 90 | 120 | Gym funnel + SEO only, 5% free→paid |
| — Pro seats | 0 | 2 | 5 | 8 | First clinician pilots month 6 |
| — MRR | ~$450 | ~$1,100 | ~$1,850 | ~$2,600 | |
| **Base** — Plus subs | 60 | 150 | 280 | 450 | Paid ads live month 4, content engine compounding |
| — Pro seats | 0 | 5 | 15 | 30 | One clinic (5 seats) converts month 9 |
| — MRR | ~$900 | ~$2,750 | ~$5,700 | ~$9,700 | |

Base case crosses the first-hire threshold (§8) around month 12.

---

## 10. Launch Phases & Milestones

| Phase | Window | Scope | Go/no-go criteria to exit |
|---|---|---|---|
| **Phase 0 — Compliance hardening** | Weeks 1–6 | P0.1 + P0.2 from `develop_saas.md`: restore safety spec and guardrails, clinician-gate dosing module, mandatory disclaimers, persist audits, real extraction pipeline | GOLD.md §2 contradiction resolved; zero dosing output reachable by non-CLINICIAN accounts (test-enforced); extraction passes golden test on `sample-results/jmc-sample.pdf`; audit records persisted |
| **Phase 1 — Free private beta** | Weeks 6–12 | Gym channel; 50–100 users; collect testimonials + extraction-accuracy data | ≥ 50 active users; extraction accuracy ≥ 95% on real-world uploads (human-review corrected); ≥ 10 usable testimonials; activation ≥ 40% |
| **Phase 2 — Paid patient launch** | Month 4+ | Stripe live (P1 billing + email), Patient Plus on sale, campaigns 01/03 (rewritten) running | Billing webhooks battle-tested; quota enforcement verified; ToS/privacy reviewed by counsel; churn instrumentation live |
| **Phase 3 — Clinician tier** | Month 6+ | License verification live, multi-patient panel (P2 multi-tenancy), reference module clinician-gated, campaign 02 running | ≥ 3 verified clinicians in pilot; license-verification workflow audited; BAA-capable hosting migration complete or scheduled with a hard date |
| **Phase 4 — Clinic / Enterprise** | Month 9+ | Seats, BAA, SSO, audit export, white-label | First signed clinic contract; BAA executed on compliant infra; security questionnaire pack ready |

Each phase gate is binary: criteria unmet means the phase does not start, regardless
of calendar pressure. Phase 0 in particular has no workaround — see §1.

---

## 11. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Regulatory reclassification** — FDA treats the product as a device (CDS exemption fails) | Low–Med | High | Keep consumer output educational-only; keep clinician outputs transparent and reviewable (deterministic rules + citations); counsel review before Phase 2; Medical Director sign-off on clinical content |
| 2 | **Platform ad rejections / account bans** — health-policy enforcement on Meta/Google/TikTok | Med | Med | Compliance rewrite before any spend (§6.1); lead with organic SEO and the zero-CAC gym channel so paid ads are additive, not existential |
| 3 | **Extraction accuracy liability** — wrong extracted value drives a wrong-looking report | Med | High | Confidence thresholds + human-in-the-loop review before values enter `LabResult`; golden tests; extraction-failure admin queue; mandatory disclaimers; show source-page provenance next to extracted values |
| 4 | **Single-founder bus factor** | High | High | Everything documented in-repo; deterministic engine reduces tribal knowledge; managed-service migration (P3) removes hand-run infra; advisory board continuity |
| 5 | **Self-hosted infra failure or breach** — 2GB LXC, no BAA, PHI-adjacent data | Med | High | P3 hardening (backups + restore drills, monitoring, rate limiting, 2FA); migrate to managed BAA-capable hosting as the Phase 3 gate; minimize retained data |
| 6 | **Content-provenance challenge** — clinician tier attacked as "bodybuilding-literature-based" | Med | Med | Re-source clinician content toward Endocrine Society / AUA guideline-grade references (§4.4); Medical Director review; keep citations visible on every output |
| 7 | **Payment-processor account review** — Stripe flags the vertical | Low–Med | High | Complete P0 before Stripe application; consumer product contains no dosing surface at all; keep clinician gating and verification documentation ready to show |

---

*Engineering execution for every TODO above is specified in `develop_saas.md`.*
