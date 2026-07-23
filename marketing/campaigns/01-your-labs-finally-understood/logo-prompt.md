# TRT Logo — Master Generation Prompt

> One master prompt (plus variants) for generating the **TRT Clinical Decision
> Support Dashboard** logo. Tuned for image-gen models (Nano Banana Pro /
> Midjourney / DALL·E / Ideogram). Brand palette is the **authoritative** one
> from [`apps/web/src/app/globals.css`](../../../apps/web/src/app/globals.css):
> primary cyan-blue `hsl(199 89% 48%)` ≈ `#0EA5E9`, deep-navy foreground
> `#0B1220`, light accent cyan. Renders correctly on dark (navy `#070D1A`) and
> light (white) backgrounds.

---

## Brand identity (grounded in the repo)

- **Product:** TRT Clinical Decision Support Dashboard at `trt.powerhousegym.co` —
  organizes fragmented lab PDFs into one normalized timeline + a deterministic,
  reproducible clinician-ready report.
- **Voice (GOLD §3):** confident, evidence-led, doctor-respecting, **sober about
  TRT** — "data discipline, like training." **No** bro-copy, **no** steroid
  imagery, **no** needles, **no** before/after bodies.
- **Heritage:** PowerHouse Gym (the gym brand, red) is the parent; TRT is its
  clinical data tool. The logo should feel like a clinical product, not a
  supplement brand.
- **What the mark should evoke:** *clarity from chaos* — fragmented labs
  becoming one clean line/timeline. Precision, traceability, calm authority.

## Visual rules (non-negotiable)

1. **No medical symbols that imply prescribing/diagnosis** — no caduceus, no
   Rx-only mark, no syringe, no pill, no cross-with-dose. A clean abstract mark
   is preferred.
2. **No anatomical/steroid imagery** — no biceps, no vials, no needles.
3. **Palette:** primary cyan-blue `#0EA5E9` on deep navy `#0B1220`, optional
   muted-green and amber accents (matching the dashboard's in-range/out-of-range
   bands). Never alarm-red as a brand color.
4. **Legible at 32×32 px** (favicon) and at 1:1 hero size. Keep the mark simple.
5. **Wordmark:** "TRT" set in a clean geometric sans (Inter / system), tight
   tracking, with a small subtitle option: "Clinical Decision Support".
6. Works in single-color (white knock-out on navy) and full-color.

---

## MASTER PROMPT (full-color, primary lockup)

```
Minimalist modern logo design for a clinical data product called "TRT". A clean abstract geometric mark suggesting "clarity from chaos": several scattered dashes/dots converging and aligning into a single straight horizontal line, evoking fragmented lab results becoming one organized timeline. Vivid cyan-blue (#0EA5E9) mark on a deep navy (#0B1220) background. To the right of the mark, the wordmark "TRT" in a clean geometric sans-serif, tight tracking, white. Flat vector style, crisp edges, high contrast, no gradients, no shadows, no 3D, no photorealism. Clinical, precise, trustworthy, sober. No needles, no syringes, no pills, no caduceus, no anatomical shapes, no text other than "TRT". Centered, generous negative space, professional brand identity, scalable.
```

## Variant 1 — favicon / app icon (mark only, no wordmark)

```
Minimalist app icon, 1:1 square, rounded corners. A single abstract geometric mark: scattered dots converging into one clean horizontal line, suggesting data becoming organized. Vivid cyan-blue (#0EA5E9) mark on deep navy (#0B1220). Flat vector, crisp, no gradients, no text, no shadows. Legible at small sizes. Clinical, precise, sober. No needles, syringes, pills, or medical-prescribing symbols.
```

## Variant 2 — dark-mode lockup (white knock-out)

```
Minimalist logo lockup for dark mode. Abstract mark of scattered dashes aligning into one straight line, rendered as a pure white knock-out on a deep navy (#070D1A) background. Wordmark "TRT" in white geometric sans-serif to the right. Single-color, flat vector, high contrast, no gradients. Clinical, precise, trustworthy. No medical-prescribing symbols, no anatomical imagery, no text other than "TRT".
```

## Variant 3 — light-mode lockup (navy on white)

```
Minimalist logo lockup for light mode. Abstract mark of scattered dashes aligning into one straight line in deep navy (#0B1220) with a single cyan-blue (#0EA5E9) accent dot at the convergence point. Wordmark "TRT" in navy geometric sans-serif. On a pure white background. Flat vector, crisp, professional. No medical-prescribing symbols, no needles, no text other than "TRT".
```

## Variant 4 — animated logo reveal (for video intros, Kling/t2v)

```
Vertical 9:16, clean deep navy background. Several scattered white dashes drift and align into a single straight horizontal cyan-blue line, forming a logo mark; the wordmark "TRT" fades in to the right in white geometric sans-serif. Smooth, confident, minimal motion, 5 seconds, resolves to a static centered lockup. Clinical, precise, premium. No needles, no syringes, no pills, no anatomical shapes, no other text.
```

---

## Concept rationale (for the marketing/design review)

| Element | Meaning |
|---|---|
| Scattered dashes → one line | Fragmented lab PDFs becoming one organized timeline (the core product promise) |
| Cyan-blue primary | The product's `--primary` token; clinical/precise, not "bro-fitness" red |
| Single accent dot at convergence | The "normalized" data point — traceable, reproducible |
| Geometric sans wordmark | Matches the app's Inter/system typography; confident, not clinical-pretentious |
| Deep navy ground | The product's dark-mode `--background`; serious, trustworthy |

**Deliberately avoided:** caduceus/Rx (implies prescribing), syringe/needle/vial
(steroid-adjacent, banned by GOLD §2/§3), bicep/body (before/after medical
transformation, banned), alarm-red (reserved for `--destructive` only).

---

## Compliance check (marketing GOLD §2)

- No prescription, diagnosis, dose, or start/stop/change language. ✅
- No medical-transformation or body imagery. ✅
- No claim of FDA approval or HIPAA certification. ✅
- Describes a **support/organizational** tool, not a prescriber. ✅
- Brand voice: confident, evidence-led, doctor-respecting, sober. ✅

## Usage

- **Full lockup:** website header, email header, report cover page.
- **Favicon / app icon:** Variant 1, 32×32 and 180×180.
- **Dark/light:** generate both Variant 2 and Variant 3 so every surface is
  correct in both themes (GOLD §6 / AGENTS.md §3 accessibility).
- **Animated reveal:** Variant 4 for the opening/closing of Campaign 1 video
  (renders the motion plate only; burn in "TRT" text in post to avoid t2v
  text hallucination).
