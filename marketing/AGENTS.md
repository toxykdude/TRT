# AGENTS.md — TRT Marketing Operating Guide

> How humans **and** AI agents produce marketing for TRT. Read this before
> creating or editing any campaign asset. The marketing source of truth is
> [`GOLD.md`](./GOLD.md); the **clinical** source of truth is the root
> [`../GOLD.md`](../GOLD.md). If the two ever appear to conflict, **clinical
> GOLD §2 wins** — escalate, don't "fix" it by loosening safety.

---

## 0. Read these first (in order)

1. [`../GOLD.md`](../GOLD.md) §2 — the clinical Prime Directive. It governs
   what marketing may never say. **Marketing is a clinical surface** under the
   repo-wide rule that §2 applies to "UI text, AI prompts, AI outputs, reports,
   tests, and documentation alike."
2. [`./GOLD.md`](./GOLD.md) — the marketing source of truth (audiences, brand
   voice, the three campaigns, definition of done).
3. This file — how to set up, where things live, and the conventions every
   asset must follow.

---

## 1. The one rule that beats all others

We are marketing a **clinical decision *support*** tool, not a clinic, not a
prescriber, not a diagnosis machine. From clinical GOLD §2, marketing must
**never**:

- recommend a dose of testosterone, hCG, or an aromatase inhibitor;
- generate or imply a prescription or titration schedule;
- render or imply a diagnosis;
- tell anyone to start/stop/change a medication;
- promise a specific lab or symptom outcome.

And marketing must **always** carry the disclaimer (full text in
[`./GOLD.md`](./GOLD.md) §2.3) on every clinical surface. The closing scene of
every campaign carries it on-screen.

If an influencer, a partner, or a "make it punchier" request pushes toward any
of the above, **refuse and cite §2**. There is no third option.

---

## 2. Project layout

```
marketing/
├── GOLD.md                         # marketing source of truth
├── AGENTS.md                       # this file
├── README.md                       # overview of the 3 campaigns
├── campaigns/
│   ├── 01-your-labs-finally-understood/
│   │   ├── README.md               # strategy, audience, channels, KPIs
│   │   └── scripts.md              # scene scripts (each ≤ 512 chars)
│   ├── 02-the-30-second-doctor-visit/
│   │   ├── README.md
│   │   └── scripts.md
│   └── 03-train-your-hormones/
│       ├── README.md
│       └── scripts.md
└── scripts/
    └── validate-scenes.ts          # enforces ≤ 512 chars per scene
```

---

## 3. Conventions

- **Scene format.** Each scene lives as a fenced block in a campaign's
  `scripts.md`, in this exact shape so the validator can parse it:

  ```
  ### Scene N — <title>
  VOICEOVER: <line>
  ON-SCREEN: <line>
  CTA: <line>
  DISCLAIMER: <short or full>
  ```

- **512-character limit.** The full text of one scene block (the five lines
  above, after the heading) must be **≤ 512 characters**. This is a hard
  constraint — enforced by `scripts/validate-scenes.ts`, must stay green.
- **Disclaimer.** Every campaign's **final scene** carries the disclaimer
  on-screen. Mid-funnel scenes may use the short form (GOLD §2.3); the full
  disclaimer always goes in the video description / post copy.
- **Claims.** Every product claim must map to a row in
  [`./GOLD.md`](./GOLD.md) §2.4. No invented capabilities.
- **Tone.** Follow brand voice (GOLD §3): confident, evidence-led,
  doctor-respecting, sober about TRT. No "optimize your T" bro-copy.
- **Accessibility.** Captions burned into every video; AA contrast on text;
  alt text on every static ad. Not optional.
- **Language.** English (v1). Any translation must re-pass §2 review.

---

## 4. Workflow

1. Work on a branch, not `main`.
2. Pick a campaign folder. Edit its `README.md` (strategy) and/or `scripts.md`
   (scenes).
3. Run the validator before requesting review:
   ```bash
   pnpm tsx marketing/scripts/validate-scenes.ts
   ```
4. Self-check §2: no dose, no prescription, no diagnosis, no start/stop/change,
   no outcome promise, disclaimer present where required.
5. PR description includes: which campaign, which GOLD § it traces to, how §2
   is preserved, validator output.
6. Definition of Done is [`./GOLD.md`](./GOLD.md) §6 — verify each item.

---

## 5. Where things can go wrong (watch list)

- **"Punchier" copy drifts into a dose/outcome claim.** Keep §2.1 next to the
  draft. "Raise your T" is out; "see your T trend" is in.
- **Before/after medical transformations.** Banned (§2.1.6). Show data
  timelines, not body transformations attributed to the product.
- **Forgetting the disclaimer** in the final scene or the description.
- **Inventing a capability** (FDA approval, HIPAA "certified", diagnosis).
  We say "HIPAA-inspired architecture" and "support, not prescribe."
- **Platform policy blind spots.** Health ads are restricted; check the
  target platform's current policy before launch (GOLD §2.5).
- **Actor portrayed as diagnosed by the product.** Banned. Actors are
  *organizing data*, not being diagnosed.

---

## 6. Asking for help

- Wording of a range, a guideline, a symptom framing? Flag for clinical review
  — do not guess medical facts into copy.
- Platform rejected a §2-compliant creative? Revise wording, keep §2, escalate
  if a real conflict appears.
- Unsure if a line is a "diagnosis" or an "outcome claim"? Treat it as blocked
  until Marketing + Clinical Safety review it.
