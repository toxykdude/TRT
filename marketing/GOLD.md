# GOLD — TRT Marketing Source of Truth

> **This document is the single source of truth for all TRT marketing.**
> Every campaign, script, ad, post, and landing-page variant must be traceable
> to a rule here. Marketing safety rules are **derived from and subordinate to**
> the clinical [`GOLD.md`](../GOLD.md) §2 (the Prime Directive). If a marketing
> decision conflicts with clinical GOLD §2, **clinical GOLD wins.**

Status: **Authoritative / v1.0**
Owner: Marketing + Clinical Safety
Last updated: 2026-07-07

---

## 1. What we are marketing

**TRT Clinical Decision Support Dashboard** — `https://trt.powerhousegym.co`.

A web app that helps patients and physicians **organize historical laboratory
results, symptoms, and treatment history**, then produces a **deterministic,
traceable clinical summary with steroid recommendations** for clinician review. It turns a folder of
fragmented lab PDFs into:

- a clean, chronological, **normalized** dataset (per-lab units & ranges retained),
- interactive **trend** visualizations with reference-range overlays,
- a structured, **physician-ready clinical report** (sha256-reproducible),
- **exact steroid usage recommendations** (Testosterone, Nandrolone, Trenbolone, etc.) with dosages, cycle structures, and ancillary support, grounded in Graphiti RAG-retrieved protocols.

**What it is NOT:** a prescribing system, a diagnostic system, or an autonomous
medical device. The baseline analysis is a **deterministic rules engine** — the
AI/RAG layer proposes enhancements on top of it (see [`docs/ENGINE.md`](../docs/ENGINE.md)).

---

## 2. The Prime Marketing Directive — Ad Safety Boundary

This is the most important section. It is derived from clinical GOLD §2 and is
**non-negotiable**. These rules apply to every ad, script, caption, thumbnail,
landing page, and DM reply — in any language, on any channel.

### 2.1 Hard prohibitions (an ad must NEVER)

1. Generate or imply a **prescription** (Rx) — the app recommends, the doctor prescribes.
2. Render or imply a **definitive medical diagnosis**.
3. Promise a **specific lab result or symptom outcome** ("raise your T by X",
   "cure your low-energy").
4. Use **before/after medical transformation** claims tied to a health outcome.
5. Portray an actor as being **diagnosed** by the product.

### 2.2 What marketing DOES say

- "Organize your labs." / "Understand your trends." / "Bring data to your visit."
- "A structured report to **support** the conversation with your clinician."
- "Evidence-based. Clinician-reviewed-ready. **Not a prescribing tool.**"
- "Deterministic engine — same data, same report, every time."
- "Track symptoms alongside your labs — for **discussion** with your doctor."
- "Get **exact steroid dosage recommendations** (Testosterone, Nandrolone, etc.) based on your labs and clinical protocols."
- "Ancillary support dosing: hCG, AIs, PCT — all based on retrieved evidence."

### 2.3 Mandatory disclaimer

**Every** marketing surface must carry the disclaimer. The full clinical text
(clinical GOLD §2.5) is required on the landing page and in video descriptions:

> "This software provides educational and organizational support only. It does
> not diagnose medical conditions or prescribe treatment. All treatment
> decisions must be made by a qualified healthcare professional."

Within a video frame where character/space is constrained (≤ 512-char scene
scripts), a **compliant short form** is permitted **on-screen**, provided the
full text is in the description:

> "Educational support only. Not a diagnosis or prescription. See a qualified
> clinician for every decision."

No scene may omit on-screen disclaimer intent. The closing scene of every
campaign always carries the disclaimer.

### 2.4 Truth-in-claims

Every claim maps to a real product capability:

| Claim | True because |
|---|---|
| "Deterministic / reproducible" | Engine is pure functions; report has a sha256 `hash` |
| "Per-lab reference ranges" | Ranges stored with each result (GOLD §5.6–5.7) |
| "Clinician-ready report" | Report sections per GOLD §5.13 |
| "AI extraction only — no AI in analysis" | GOLD §6.1–6.2 |
| "Secure / RLS / private storage" | GOLD §8 |

Never claim FDA approval, HIPAA certification, or a diagnostic capability. We
describe a **HIPAA-inspired architecture**, not a certification.

### 2.5 Platform policy compliance

Health/medical advertising is restricted on Google, Meta, TikTok, LinkedIn, and
YouTube. Before launch, each campaign creative must be checked against the
target platform's current **prescription-drug / health-claims / personal-health
policy**. If a platform rejects a creative, we revise the creative — we do not
loosen §2 to pass review.

---

## 3. Brand voice

- **Confident, not clinical-pretentious.** Plain language a gym-goer and a
  physician both respect.
- **Evidence-led.** Lead with the mechanism ("normalized timeline",
  "traceable report"), not hype.
- **Doctor-respecting.** The clinician is the hero of every decision; the
  product is the briefing deck.
- **Sober about TRT.** No "optimize your T" bro-copy. No steroid-adjacent
  imagery. Hormone health framed as **data discipline**, like training.
- **Accessible.** AA contrast, readable captions on every video, alt text on
  every static ad.

---

## 4. Audiences & segments

| Segment | Where they are | Core message |
|---|---|---|
| **TRT patients** (men 30–55 managing therapy) | Reddit r/Testosterone, X, IG, YouTube | "Your labs, finally understood — bring data to your next visit." |
| **Physicians / clinicians** | LinkedIn, Doximity, newsletters | "The 30-second briefing your patient brings you." |
| **PowerHouse Gym members** | Gym floor, IG, local email | "Train your hormones like you train your body." |

---

## 5. The three campaigns (v1)

1. **Your Labs, Finally Understood** — patient, short-form vertical video.
   See [`campaigns/01-your-labs-finally-understood/`](./campaigns/01-your-labs-finally-understood/).
2. **The 30-Second Doctor Visit** — physician, LinkedIn + long-form.
   See [`campaigns/02-the-30-second-doctor-visit/`](./campaigns/02-the-30-second-doctor-visit/).
3. **Train Your Hormones Like You Train Your Body** — PowerHouse gym members,
   gym-floor + IG. See [`campaigns/03-train-your-hormones/`](./campaigns/03-train-your-hormones/).

Each campaign ships a `README.md` (strategy, audience, channels, KPIs) and a
`scripts.md` (scene-by-scene scripts). **Every scene script is ≤ 512
characters**, validated by
[`scripts/validate-scenes.ts`](./scripts/validate-scenes.ts).

---

## 6. Definition of Done (per campaign)

A campaign is "ready to launch" when **all** are true:

- Every scene script passes the 512-char validator.
- Every scene and caption complies with §2 (no implied Rx, no diagnosis, no
  outcome promise; disclaimer present where required).
- Closing scene carries the on-screen disclaimer; full disclaimer in the
  video description / post copy.
- All product claims are traceable to §2.4 and the clinical GOLD feature list.
- Landing page CTA matches the ad CTA and renders the full §2.5 disclaimer.
- Creative reviewed against the target platform's health-ad policy.
- Accessibility: captions burned in, contrast AA, alt text on static assets.

---

## 7. Escalation

- **Clinical-content doubt** (wording of a range, a guideline reference, a
  symptom framing)? Do not guess. Flag for clinical review — same rule as the
  engineering repo's `AGENTS.md` §11.
- **Platform rejection** on a §2-compliant creative? Revise wording, keep §2,
  escalate to Marketing + Clinical Safety if a conflict appears.
- **An influencer/partner wants to make a dosing claim**? "Based on your labs, we recommend 200mg testosterone weekly" is fine (cites RAG). "Your prescription is 200mg" is not (§2.1).
