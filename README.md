# TRT Clinical Decision Support Dashboard

A web application that helps physicians and patients **organize historical laboratory
results, symptoms, and treatment history**, then generates **evidence-based clinical
summaries and guideline-informed suggestions for clinician review.**

> **⚠️ This is a clinical decision *support* tool — not a prescribing or diagnostic system.**
>
> "This software provides educational and organizational support only. It does not
> diagnose medical conditions or prescribe treatment. All treatment decisions must be
> made by a qualified healthcare professional."
>
> The system never generates a prescription, never recommends exact dosages of
> testosterone, hCG, or aromatase inhibitors, and never renders a diagnosis. The
> physician remains responsible for every medical decision. See
> [`GOLD.md`](./GOLD.md) §2 (the Prime Directive).

---

## Documentation

| File | What it is |
|---|---|
| [`GOLD.md`](./GOLD.md) | **Source of truth.** Requirements, safety boundary, feature spec. Every change must trace to a requirement here. |
| [`AGENTS.md`](./AGENTS.md) | **Operating manual.** Setup, layout, conventions, the AI guardrail contract. Read before contributing. |
| `README.md` | This file. |

---

## Tech stack

- **Frontend:** Next.js 15 (App Router), React, TypeScript (strict), TailwindCSS, shadcn/ui, Framer Motion, React Hook Form, Recharts
- **Data:** PostgreSQL + Prisma ORM, Row Level Security on all patient-data tables
- **Auth:** Auth.js (NextAuth) v5 + Prisma adapter — Credentials + Google OAuth
- **AI:** OpenAI API with Structured Outputs (this pass: typed stubs + **real, tested guardrails**)
- **Deploy:** Vercel-compatible; runs on a Debian LXC behind a Cloudflare Tunnel

---

## Monorepo layout

```
.
├── GOLD.md              # spec / source of truth
├── AGENTS.md            # operating manual
├── apps/
│   └── web/             # Next.js app (App Router)
├── packages/
│   ├── db/              # Prisma schema, client, RLS, seed
│   └── ai/              # guardrails + extraction/analysis/report pipelines
└── .env.example         # env-var reference (copy to .env)
```

---

## Quick start (local dev)

```bash
# 1. Prereqs: Node 20+, pnpm, PostgreSQL
# 2. Install
pnpm install

# 3. Configure env
cp .env.example .env          # fill in DATABASE_URL + AUTH_SECRET

# 4. Database
pnpm db:generate              # generate Prisma client
pnpm db:migrate               # create tables + enable RLS
pnpm db:seed                  # seed the biomarker catalog

# 5. Run
pnpm dev                      # → http://localhost:3000
```

---

## Deploy (on the LXC, behind Cloudflare Tunnel)

The app is served from a Debian 13 LXC. A remote `cloudflared` connector forwards
`https://trt.powerhousegym.co` → `http://<lxc-ip>:3000`.

```bash
# On the LXC (root):
cd /opt/trt
git pull
pnpm install --frozen-lockfile
pnpm db:migrate deploy
pnpm db:seed
pnpm build

# Run with pm2 (boot-persistent)
pm2 start "pnpm start -- -H 0.0.0.0 -p 3000" --name trt
pm2 save && pm2 startup        # follow the printed command once
```

Point the **remote cloudflared** ingress at `http://<lxc-ip>:3000`, then
`https://trt.powerhousegym.co` serves the app.

> If `next build` runs out of memory on a 2 GB box (no swap available), build on a
> beefier machine and rsync `.next/` + `node_modules/` to the LXC.

---

## Status

Foundation pass: landing page, auth, dashboard shell, patient profile, lab upload,
DB schema with RLS, biomarker catalog seed, and a tested AI guardrail layer.
Extraction/analysis/report pipelines return deterministic stub output (guardrails
enforced) — swap in a real OpenAI key in `.env` to go live. See `GOLD.md` §11 for
the roadmap.

---

## Security reminder

Secrets (DB password, `AUTH_SECRET`, API keys, OAuth client secrets) live only in
`.env`, which is gitignored. If any secret was shared to set up this repo
(especially credentials pasted into chat), **rotate it** once configured.
