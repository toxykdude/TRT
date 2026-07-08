# TRT Marketing — Overview

> Marketing for **TRT Clinical Decision Support Dashboard** —
> `https://trt.powerhousegym.co`. This is a **clinical decision *support***
> tool, not a prescriber or diagnostic system. Every asset obeys the safety
> boundary in [`GOLD.md`](./GOLD.md) §2, derived from clinical
> [`GOLD.md`](../GOLD.md) §2.

**Read first:** [`GOLD.md`](./GOLD.md) (source of truth) ·
[`AGENTS.md`](./AGENTS.md) (operating guide).

---

## What we're marketing (one paragraph)

TRT Clinical Decision Support Dashboard turns years of fragmented lab PDFs into
a clean, normalized timeline, interactive trend charts (with per-lab reference
ranges), and a **deterministic, physician-ready clinical report** — same data,
same report, every time (sha256-verifiable). AI is used **only** to read values
out of uploaded documents; **analysis is a pure rules engine, no model in the
loop.** The clinician makes every decision.

---

## The three campaigns (v1)

| # | Campaign | Audience | Primary channels | Format |
|---|---|---|---|---|
| 1 | [Your Labs, Finally Understood](./campaigns/01-your-labs-finally-understood/) | TRT patients (men 30–55) | IG Reels, TikTok, YouTube Shorts, Reddit | 6-scene vertical video, ~30s |
| 2 | [The 30-Second Doctor Visit](./campaigns/02-the-30-second-doctor-visit/) | Physicians / clinicians | LinkedIn, Doximity, newsletter | 6-scene long-form + carousel |
| 3 | [Train Your Hormones Like You Train Your Body](./campaigns/03-train-your-hormones/) | PowerHouse Gym members | Gym floor, IG, local email | 6-scene vertical + static |

Each campaign folder has:
- `README.md` — strategy, audience, channels, KPIs, compliance notes.
- `scripts.md` — scene-by-scene scripts. **Every scene ≤ 512 characters**,
  validated by [`scripts/validate-scenes.ts`](./scripts/validate-scenes.ts).

---

## Hard constraints (do not violate)

- **No dose, no prescription, no diagnosis, no start/stop/change, no outcome
  promise** in any creative (GOLD §2.1).
- **Disclaimer on every campaign's final scene** (on-screen) and in every video
  description / post copy (full text).
- **Claims must be true** — map to GOLD §2.4. No FDA/HIPAA-certification claims.
- **Accessibility** — burned-in captions, AA contrast, alt text on static ads.

---

## Validate before review

```bash
pnpm tsx marketing/scripts/validate-scenes.ts
```

Must exit `0` with all scenes ≤ 512 chars and a disclaimer detected on each
campaign's final scene.

---

## Status

v1 — three campaigns scoped, scripted, and safety-reviewed. Ready for platform-
policy check and creative production.
