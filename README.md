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
| [`AGENTS.md`](./AGENTS.md) | **Operating manual.** Setup, layout, conventions, the analysis/AI contract. Read before contributing. |
| [`docs/ENGINE.md`](./docs/ENGINE.md) | **Deterministic engine.** How analysis works: classify → trends → rules → report, all traceable, all reproducible. |
| [`docs/RAG.md`](./docs/RAG.md) | **Knowledge base & RAG.** Layer 1 (deterministic TF-IDF KB, no model) + Layer 2 (Graphiti MCP graph, builds with an LLM). |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | **Ops.** Deploy, cloudflared, verification, secret rotation. |
| `README.md` | This file. |

---

## Tech stack

- **Frontend:** Next.js 15 (App Router), React, TypeScript (strict), TailwindCSS, shadcn/ui, Framer Motion, React Hook Form, Recharts
- **Data:** PostgreSQL + Prisma ORM, Row Level Security on all patient-data tables
- **Auth:** Auth.js (NextAuth) v5 + Prisma adapter — Credentials + Google OAuth
- **Analysis:** a **deterministic rules engine** (`packages/engine`) — no AI model in the loop. Same inputs always produce the same report (sha256 hash). See [`docs/ENGINE.md`](./docs/ENGINE.md).
- **Knowledge base:** a **deterministic TF-IDF/BM25 corpus KB** (`packages/kb`) that attaches cited reference passages to findings — no model. Plus an optional **Graphiti MCP knowledge graph** (FalkorDB) that builds once with an LLM and can enhance an AI assistant. See [`docs/RAG.md`](./docs/RAG.md).
- **AI (extraction only):** OpenAI API with Structured Outputs for reading values from uploaded documents; scoped strictly to extraction. Guardrails are real and tested.
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
│   ├── engine/          # deterministic analysis engine (classify → trends → rules → report)
│   ├── kb/              # deterministic knowledge base (TF-IDF/BM25) + Graphiti MCP client
│   └── ai/              # extraction pipeline (OCR/document parsing) + guardrails
├── scripts/
│   ├── build-kb.ts      # extract + index the corpus into the deterministic KB
│   └── ingest_corpus.py # LLM-gated Graphiti graph ingestion (build once, freeze)
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
manual value entry, classified results view, and a **deterministic analysis engine**
that generates fully traceable clinical reports (same inputs → same report,
verified by a sha256 hash). DB schema with RLS, biomarker catalog seed, and a
tested guardrail layer. Extraction (reading values from PDFs) is a separate
pipeline in `@trt/ai`. See `GOLD.md` §11 for the roadmap.

---

## Security reminder

Secrets (DB password, `AUTH_SECRET`, API keys, OAuth client secrets) live only in
`.env`, which is gitignored. If any secret was shared to set up this repo
(especially credentials pasted into chat), **rotate it** once configured.
