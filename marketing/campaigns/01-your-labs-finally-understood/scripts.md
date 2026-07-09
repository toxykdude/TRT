# Campaign 1 — Your Labs, Finally Understood — Scene Scripts

> 6 scenes · vertical 9:16 · ~30s · patient audience. The validated block under
> each scene (the four `VOICEOVER:` / `ON-SCREEN:` / `CTA:` / `DISCLAIMER:`
> lines) is **≤ 512 chars**, enforced by
> [`scripts/validate-scenes.ts`](../../scripts/validate-scenes.ts). The
> `**Field:**` lines below each block are production direction for the
> marketing/production team — they are **ignored by the validator** but are
> still covered by marketing [`GOLD.md`](../../GOLD.md) §2 (clinical safety) and
> must pass human review. Complies with marketing GOLD §2; closing scene
> (Scene 6) carries the on-screen disclaimer; full text goes in the video
> description.

---

## Production spec (read first)

- **Deliverable:** 1 × 9:16 vertical, 1080×1920, ~30s. Optional cutdowns: 1:1
  (IG feed) and 16:9 (YouTube in-stream / X) from the same masters.
- **Platform-safe zones:** keep all supers and the CTA inside Reels/TikTok
  safe areas — avoid the bottom ~220px (CTA buttons) and the right ~120px
  (like/comment icons). Burn captions center-low but above the safe line.
- **Captions:** burned-in, white text on a 60% black plate, AA contrast, large
  enough to read at 50% scale on a phone. Never rely on auto-captions alone.
- **Color tokens (range bands):** in-range = muted green; out-of-range = amber.
  Never alarm-red. Backgrounds must read correctly in both dark and light mode.
- **Typography:** clean geometric sans (Inter / system), tight tracking on big
  supers. Numbers in a tabular variant where shown.
- **PII in mockups:** every on-screen lab value, name, and date is
  **synthetic/placeholder**. No real patient data. Blur or strip any incidental
  PII in source footage.
- **Music/SFX bed:** one understated track, low pulse → building → resolves at
  Scene 6. UI ticks for taps/toggles. Duck music under VO.
- **Tone (brand voice, GOLD §3):** confident, evidence-led, doctor-respecting,
  sober about TRT. No "optimize your T" bro-copy. No bodies, no needles, no
  before/after transformations — **data timelines, not people**.
- **Total duration:** ~30s (≈5s per scene).

---

### Scene 1 — The folder
VOICEOVER: Three years of labs. Five clinics. Four units. Zero clarity.
ON-SCREEN: Lab PDFs scattered — 2023 to 2026
CTA:
DISCLAIMER:

**Duration:** ~5s (hook)
**Shot/Framing:** Top-down, slow push-in on a real desk.
**Action:** A hand drops a messy stack of printed lab PDFs — different clinic
letterheads, subtly different units (ng/dL vs nmol/L hinted in blurred supers).
A phone lies beside the pile, screen off. Slight desaturation on the pile.
**Super (burned-in captions):** "Three years of labs." → "Five clinics." →
"Four units." cut on the beat; hard cut to "Zero clarity." on a black frame.
**Audio/SFX:** Paper rustle + room tone. Low music pulse enters at ~2s.
**VO note:** Flat, a little tired, matter-of-fact. Land hard on "Zero clarity."
**Transition:** Hard cut / whip-pan into Scene 2.
**Compliance:** "Four units" = lab measurement units, never medication units.
Do not show medication labels, vials, or dosages. No patient names visible.

---

### Scene 2 — The shift
VOICEOVER: What if every lab lived on one clean timeline?
ON-SCREEN: Upload PDF, JPG, PNG, HEIC
CTA: Upload your labs
DISCLAIMER:

**Duration:** ~5s
**Shot/Framing:** Same desk, now clean. Eye-level on the phone as it's flipped
screen-up.
**Action:** The paper pile sweeps/dissolves off-frame. The app opens; a single
clean vertical timeline slides in from the left. Format chips (PDF / JPG / PNG
/ HEIC) type out. The "+ Upload" button glows; a thumb taps it.
**Super:** "One clean timeline."
**Audio/SFX:** Soft UI ticks on each chip; music lifts a notch.
**VO note:** Curious, inviting. Slight upward inflection on "timeline?"
**CTA placement:** "Upload your labs" lower-third **plus** a platform-native
tappable sticker (link sticker on IG, link button on TikTok).
**Transition:** Match-cut on the tap into the timeline UI in Scene 3.
**Compliance:** Show document upload only — no PII on the mocked PDFs.

---

### Scene 3 — Normalized
VOICEOVER: Different labs, different units — normalized so they actually compare.
ON-SCREEN: Per-lab ranges kept. Values normalized.
CTA:
DISCLAIMER:

**Duration:** ~5s
**Shot/Framing:** Close-up UI, screen-recording style with motion-tracked tilt.
**Action:** Two lab cards from different clinics slide in side by side. Each
shows its own raw value + raw unit + raw range (synthetic placeholder numbers).
Animation aligns them onto one normalized axis with a canonical unit; a
"normalized" pill checks on for each.
**Super:** "Per-lab ranges kept." → "Values normalized."
**Audio/SFX:** A clean "snap"/click as the two values align; music steady.
**VO note:** Clear, instructional. Emphasis on "actually compare."
**Transition:** Cards flow left into the graph canvas of Scene 4.
**Compliance:** Use **synthetic** values, never a real patient's labs. Do **not**
label any value "high," "low," "abnormal," or flag a diagnosis — show the
normalization mechanics only. Ranges shown are the lab's own reference ranges.

---

### Scene 4 — Trends
VOICEOVER: See the trend. See the range. See what changed, and when.
ON-SCREEN: Reference range + medication + symptom overlays
CTA:
DISCLAIMER:

**Duration:** ~5s (the money shot — music peaks here)
**Shot/Framing:** Hero graph, slow push-in. X = dates, Y = normalized value.
**Action:** The trend line draws left→right. A shaded reference-range band
fades in behind it. Two overlay toggles click on: (1) a thin "medication"
track showing **timing only**, and (2) a "symptoms" track with small dots/notes.
**Super:** "See the trend. See the range. See what changed, and when."
**Audio/SFX:** Music swell on the line draw; UI ticks on each toggle.
**VO note:** Measured, confident. One beat of silence between each "See the…"
**Transition:** Graph shrinks/minimizes into the report card in Scene 5.
**Compliance:** Medication overlay = **presence/timing only — never a dose**
(no mg/mcg/IU/ml anywhere on screen). Symptom notes are patient-logged and
generic ("fatigue," "mood") — not diagnoses. Range band = the lab's reference
range, labeled as such. No claim that any value is "good/bad."

---

### Scene 5 — The report
VOICEOVER: A structured report your doctor can scan in 30 seconds.
ON-SCREEN: Traceable. Reproducible. Clinician-ready.
CTA: Bring data to your next visit
DISCLAIMER:

**Duration:** ~5s
**Shot/Framing:** Phone screen scrolls a clean structured report, then a hand
lifts it and sets it beside a notepad/coffee (implies "bringing it to a visit").
**Action:** Report scrolls past clear section headers. Footer shows a
`sha256: …` hash and a "Reproducible" badge. Optional 1s cut: the report shown
as a printout on a clipboard.
**Super:** "Traceable. Reproducible. Clinician-ready."
**Audio/SFX:** Music begins to resolve/decay toward the close.
**VO note:** Warm, resolving. The clinician is the hero ("your doctor").
**CTA placement:** "Bring data to your next visit" lower-third.
**Transition:** Soft cross-dissolve to the end-card in Scene 6.
**Compliance:** Report sections are **organizational** (timeline, trends,
history) — no recommendation, no diagnosis, no dose anywhere in the mockup.
Show the hash to substantiate "reproducible" (truth-in-claims, GOLD §2.4).

---

### Scene 6 — Close
VOICEOVER: Organize your hormone health. Start at the link.
ON-SCREEN: trt.powerhousegym.co
CTA: Upload Labs
DISCLAIMER: Educational support only. Not a diagnosis or prescription. See a qualified clinician.

**Duration:** ~5s (end-card)
**Shot/Framing:** Static end-card, clean and high-contrast.
**Action:** Logo + URL `trt.powerhousegym.co` center, large tappable "Upload
Labs" button below. Background: the timeline/graph motif from Scene 4 drifts
and fades to brand color. The short-form disclaimer sits in the lower-third for
the full scene (on-screen ≥ ~2s, readable).
**Super:** URL + CTA + short-form disclaimer (the `DISCLAIMER:` line above).
**Audio/SFX:** Music resolves to a clean, confident button-up sting.
**VO note:** Calm, assured close. Emphasis on "Start at the link."
**Transition:** Hold; loop point designed so a re-watch doesn't feel broken.
**Compliance:** This scene **carries the on-screen disclaimer** (required,
marketing GOLD §2.3 / §6). The **full** disclaimer goes in the video
description / post copy (template below). No clinical claims in the CTA.

---

## Video description / caption template (full disclaimer required here)

> Years of lab PDFs from different clinics and units? **TRT** turns them into
> one clean, normalized timeline — with per-lab reference ranges, trend graphs,
> and a structured, reproducible report to bring to your next visit.
>
> 👉 Organize your labs: https://trt.powerhousegym.co
>
> _This software provides educational and organizational support only. It does
> not diagnose medical conditions or prescribe treatment. All treatment
> decisions must be made by a qualified healthcare professional._

**Caption (short, platform-native):** Three years of labs. Zero clarity. → One
clean timeline. Bring data to your next visit. 🔗 trt.powerhousegym.co

---

## Compliance checklist (marketing GOLD §6 — Definition of Done)

- [ ] Validator green: `pnpm tsx marketing/scripts/validate-scenes.ts` — every
      scene's 4-line block ≤ 512 chars; closing scene has a disclaimer; no §2.1
      tripwire phrase (dose / prescription / diagnosis / start-stop-change /
      outcome promise / cure / FDA / HIPAA-certified).
- [ ] No before/after medical transformations; show data timelines, not bodies.
- [ ] Actor is **organizing data**, never being diagnosed by the product.
- [ ] No dose anywhere (no mg/mcg/IU/ml on screen); medication overlay is
      timing-only.
- [ ] "Trend / report / organize" language only — no "optimize / boost / fix."
- [ ] Closing scene carries the on-screen disclaimer; **full** disclaimer in
      every video description and post copy.
- [ ] All product claims map to GOLD §2.4 (reproducible hash, per-lab ranges,
      clinician-ready report, AI-extraction-only, secure storage).
- [ ] Captions burned in; AA contrast; dark + light both correct; alt text on
      any static cutdowns.
- [ ] Creative checked against the current IG / TikTok / YouTube health-ad
      policy before boosting.
