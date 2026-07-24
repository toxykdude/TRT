# GOLD — TRT Clinical Decision Support Dashboard

> **This document is the single source of truth for the project.**  
> Every feature, model, prompt, screen, test, and PR must be traceable to a requirement here. If a change conflicts with GOLD, GOLD wins — or GOLD is deliberately revised via a documented decision. There is no third option.

**Status:** Authoritative / v1.0  
**Owner:** Product + Clinical Safety  
**Last updated:** 2026-07-07  

---  

## 1. Purpose & Mission  

TRT Clinical Decision Support Dashboard is a web application that helps physicians and patients **organize historical lab results, symptoms, and treatment history**, then generates **evidence‑based clinical summaries and guideline‑informed suggestions for clinician review**.  

The product turns fragmented lab PDFs and self‑reported data into:  
- a clean, chronological, normalized dataset  
- interactive trend visualizations  
- a structured, physician‑ready clinical report  
- a clinician reference module (protocol citations via Graphiti RAG) available **only** to license‑verified clinicians (§2.4)  

---  

## 2. The Prime Directive — Clinical Safety  

> §2 was deliberately revised on 2026-07-24 (see CHANGES.md) to restore the safety
> posture required by the commercial plan (`company_implementation.md` §1, §4).
> The prior "Removed Restrictions" posture is revoked and must never be reinstated
> without a documented, counsel-reviewed decision.

### 2.1 What this product IS  
A **clinical decision *support*** tool that organizes, normalizes, visualizes, summarizes, and compares laboratory values to reference ranges. **Consumer-facing output is educational only**: classifications, trends, citations, and "discuss with your physician" framing. It never prescribes.  

### 2.2 What this product is NOT  
It is not a prescriber, does not replace clinical judgment, and never outputs dosing, cycle, titration, start/stop/change, or diagnostic content to any user who is not a license‑verified clinician (§2.4).  

### 2.3 Hard prohibitions — consumer surface  
For any user who is not a verified CLINICIAN (§2.4), the system must **never**:  
1. Generate exact steroid dosages or cycle structures (Testosterone, Nandrolone, Trenbolone, Boldenone, Masteron, Primobolan, Oxandrolone, Dianabol, Winstrol, SARMs, etc.)  
2. Recommend hCG, aromatase‑inhibitor, SERM/PCT, or Clenbuterol dosages or titration schedules  
3. Suggest medication start/stop/change actions  
4. Render diagnoses or provisional diagnoses  

These rules are enforced in code by the single canonical guardrail package (`packages/guardrails`); every consumer‑bound report payload is scanned and **fails closed** (generation throws rather than emitting dosing content).  

### 2.4 Clinician‑gated reference module  
The dosing/protocol reference module is reachable **only** by CLINICIAN accounts whose license has been verified (`User.licenseVerifiedAt` set exclusively through the admin verification queue — never self‑asserted). For verified clinicians the module may surface protocol reference content with citations (`rag_source_ids`) as decision *support*; the physician validates every output. The dosing section is **never computed** — not merely hidden — for any other role, and `assertConsumerSafe` re‑scans the final payload as defense‑in‑depth.  

### 2.5 Disclaimer surface — mandatory  
Every report payload carries a **required** disclaimer block (schema validation fails without it), and every screen showing clinical interpretation renders a **non‑dismissible** disclaimer: informational/educational only, not medical advice, not a substitute for a physician. First‑login consent is recorded to `ConsentRecord` before upload or report features unlock.  

---  

## 3. Personas  

| Persona | Goal in product |
|---|---|
| **Patient** (primary uploader) | Upload labs, track symptoms, share a clean report with their doctor |
| **Physician / clinician** | Review a structured longitudinal summary instead of re-reading raw PDFs |
| **Clinic staff** (future) | Manage multiple patients at scale |

The product is built patient‑first; the physician portal is a roadmap item (§11), but every output must be *clinician‑readable* from day one.  

---  

## 4. Tech Stack  

**Frontend**  
- Next.js 15 (App Router)  
- React + TypeScript (strict)  
- TailwindCSS  
- shadcn/ui  
- Framer Motion  
- React Hook Form  
- Recharts  

**Backend / Data**  
- Supabase (Postgres + Auth + Storage)  
- Prisma ORM  
- Row Level Security (RLS) on every table that holds patient data  
- Supabase Auth (email/password, Google OAuth, password reset)  

**Analysis & AI**  
- Deterministic rules engine (`packages/engine`) for classification & trend calculation. Same inputs → same baseline report (sha256 hash). See [`docs/ENGINE.md`](./docs/ENGINE.md).  
- **Graphiti RAG pipeline** integrated into analysis for protocol matching and guideline retrieval — its dosing/protocol output is confined to the clinician‑gated reference module (§2.4).  
- OpenAI API for OCR/PDF extraction (structured outputs, JSON schema-constrained).  

**Document parsing**  
- OCR pipeline, PDF text/layout extraction, image upload support (JPG, PNG, HEIC)  

**Deployment**  
- Vercel  

All third‑party services must be chosen/consented-to with PHI handling in mind where applicable.  

---  

## 5. Feature Requirements (condensed)  

- **Landing page:** public marketing, dark/light theme, responsive, accessible.  
- **Authentication:** email/password, Google OAuth, password reset, server-side session enforcement.  
- **Dashboard shell:** sidebar navigation + persistent top bar.  
- **Patient profile:** structured fields (vitals, lifestyle, history, meds, supplements, goals) plus free-text.  
- **Lab upload:** drag-&-drop, multi-file, unlimited; accepts PDF/JPG/PNG/HEIC; stored in private Supabase bucket with RLS.  
- **OCR & extraction:** extracts date, lab, doctor, biomarkers, values, ranges, units; normalizes units; retains raw fields.  
- **Biomarker catalog:** extensible starter list covering hormones, thyroid, prostate, CBC, CMP, lipids, inflammation/iron, vitamins/metabolic. Ranges stored per-lab/per-assay.  
- **Timeline:** single interactive view aggregating labs, TRT entries, symptoms, meds, body-composition; filterable by type/date.  
- **Graphs:** per-biomarker charts with hover, zoom, date-range compare, reference/medication/symptom overlays.  
- **Symptoms module:** fixed 0–10 or ordinal scale for Energy, Mood, Libido, Sleep, Recovery, etc.  
- **Medication module:** store historical & proposed doses; route, frequency, dates, clinician, reason.  
- **Deterministic + RAG analysis engine:** rules engine handles classification/trends/coverage gaps for all users; Graphiti RAG protocol/dosing reference content is generated **only** for license‑verified clinicians (§2.4) and cites its RAG source nodes.  
- **Clinical report:** Executive Summary, Trend Panels, Red Flags, Lifestyle Factors, References, mandatory Disclaimer (§2.5). Verified‑clinician reports additionally include the RAG reference module. Export PDF/Word/Print.  
- **Settings:** account, profile, data export, consent, deletion, theme preference.  

---  

## 6. Analysis & AI — Behavioral Contract  

### 6.1 Hybrid Analysis Path  
Baseline classification and trend calculation remain deterministic (sha256 reproducible) and are the **entire** analysis for consumer roles. Graphiti RAG retrieval (clinical protocols, synergy/antagonism rules, patient‑specific adjustments) feeds only the clinician‑gated reference module (§2.4). The AI never overrides deterministic baseline data; it proposes enhancements built on top of it.  

### 6.2 Graphiti RAG Integration (clinician‑gated)  
- Ingests extracted labs, symptom scores, medication history, and body metrics.  
- Retrieves relevant protocol chunks, guideline excerpts, and precedent cases.  
- Outputs structured protocol proposals (compound, dose, frequency, route, cycle length, ancillary support, expected biomarker shift) **exclusively** to verified CLINICIAN accounts.  
- Every proposal includes `rag_source_ids` for traceability.  
- Consumer payloads are scanned by `packages/guardrails` and fail closed (§2.3).  

### 6.3 AI Extraction (unchanged)  
OCR/PDF extraction remains scoped to document parsing. Structured output validated against schema; missing values marked `uncertain` and queued for review.  

---  

## 7. UX Principles  

- Premium animations (Framer Motion) — purposeful, not gratuitous.  
- Glassmorphism accents where they aid hierarchy.  
- First-class dark/light mode; fully responsive and accessible (WCAG 2.1 AA target).  
- Clinical content always accompanied by context (units, range, date, RAG source link).  

---  

## 8. Security & Compliance  

HIPAA-inspired architecture (or applicable local privacy regulation). Required:  
- Encryption in transit (TLS) and at rest.  
- Row Level Security on every patient-data table; tenant = patient or granted clinician.  
- Audit logs for all access to and changes of patient data.  
- Role-based access (patient, clinician, clinic admin — future).  
- Secure uploads: private storage, signed URLs.  
- Secrets via environment variables / Vercel + Supabase secret management.  

> Compliance posture must be reviewed by a qualified professional before production PHI use. This document defines intent.  

---  

## 9. Non-Functional Requirements  

- **Performance:** lab pages interactive quickly; large histories paginate.  
- **Reliability:** extraction failures surface for human review, never silently drop data.  
- **Observability:** structured logs, error tracking, RAG query telemetry, dosing proposal trace IDs.  
- **Extensibility:** new biomarkers, labs, report sections added via data/config, not code forks.  
- **Testability:** guardrails, extraction mapping, trend logic, and RAG retrieval paths unit-tested with golden cases.  

---  

## 10. Deliverables (from the master prompt)  

1. Full application architecture  
2. Database schema  
3. Prisma models  
4. Supabase schema (tables, RLS policies, storage buckets)  
5. API routes  
6. OCR pipeline  
7. AI extraction pipeline  
8. Graphiti RAG integration & dosing engine  
9. Dashboard UI  
10. Timeline UI  
11. Graph components  
12. Report generator  
13. Authentication  
14. Settings  
15. Deployment configuration (Vercel + Supabase)  
16. Testing strategy  
17. Security review  
18. Documentation  

---  

## 11. Roadmap (explicitly out of v1 scope)  

Physician portal · multi-patient dashboard · clinic analytics · FHIR/HL7 integration · lab API integration · wearable data (Apple Health, Garmin, Oura, Whoop) · AI chatbot over patient history (uses same RAG pipeline).  

---  

## 12. Definition of Done (per feature)  

A feature is "done" when **all** are true:  
- Implements the GOLD requirement it traces to.  
- Never violates core data integrity or traceability rules.  
- Has unit tests for logic and at least one happy-path test.  
- Passes the type check, lint, and build.  
- Is accessible (keyboard + screen reader) and works in dark + light mode.  
- Stores PHI only behind RLS, with audit logging.  
- Updates documentation if it changes data shape or AI/RAG behavior.  

---  

## 13. References  

The Prime Directive and biomarker catalog above are derived from the project's master prompt. Clinical guideline references attached to AI outputs must point to real, current sources (e.g., published endocrine society guidance) — never invented citations. Graphiti RAG source nodes are appended to all clinician‑module (§2.4) proposals for full auditability.  

--- End of GOLD.md ---
