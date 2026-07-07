# GOLD — TRT Clinical Decision Support Dashboard

> **This document is the single source of truth for the project.**
> Every feature, model, prompt, screen, test, and PR must be traceable to a
> requirement here. If a change conflicts with GOLD, GOLD wins — or GOLD is
> deliberately revised via a documented decision. There is no third option.

Status: **Authoritative / v1.0**
Owner: Product + Clinical Safety
Last updated: 2026-07-07

---

## 1. Purpose & Mission

**TRT Clinical Decision Support Dashboard** is a web application that helps
physicians and patients **organize historical laboratory results, symptoms, and
treatment history**, then generates **evidence-based clinical summaries and
guideline-informed suggestions for clinician review**.

The product turns years of fragmented lab PDFs and self-reported data into:

- a clean, chronological, normalized dataset,
- interactive trend visualizations,
- a structured, physician-ready clinical report,
- educational material grounded in current clinical guidelines.

The physician remains responsible for **every** medical decision.

---

## 2. The Prime Directive — Clinical Safety Boundary

This is the most important section in the entire project. Read it before any
contribution.

### 2.1 What this product IS

A **clinical decision *support*** tool. It organizes, normalizes, visualizes,
summarizes, compares to reference ranges, and surfaces discussion points.

### 2.2 What this product is NOT

It is **not** a prescribing system, **not** a diagnostic system, and **not** an
autonomous medical device. It does not replace clinical judgment.

### 2.3 Hard prohibitions (the AI and UI must NEVER do these)

The system — any UI text, AI prompt, AI output, or generated report — must
never:

1. Generate a prescription.
2. Recommend an exact **testosterone** dosage.
3. Recommend an exact **hCG** dosage.
4. Recommend an **aromatase inhibitor** dosage.
5. Recommend a medication schedule / titration plan.
6. Render a medical diagnosis.
7. Tell a user to start, stop, or change any medication.

### 2.4 What the system DOES instead

- Summarize evidence and current clinical guidelines.
- Compare laboratory values against published reference ranges.
- Highlight trends and important changes over time.
- Suggest **topics** to discuss with a physician.
- Suggest **additional laboratory tests** when data are incomplete.
- Flag **red flags** that warrant **prompt medical review** (without diagnosing).
- Always attribute the final decision to the treating clinician.

### 2.5 Mandatory safety surface

Every screen that presents clinical content must display a persistent,
unmissable disclaimer:

> "This software provides educational and organizational support only. It does
> not diagnose medical conditions or prescribe treatment. All treatment
> decisions must be made by a qualified healthcare professional."

Reports additionally state that dosages/medications shown are a **historical
record only** and are never used to recommend new dosages.

---

## 3. Personas

| Persona | Goal in product |
|---|---|
| **Patient** (primary uploader) | Upload labs, track symptoms, share a clean report with their doctor |
| **Physician / clinician** | Review a structured longitudinal summary instead of re-reading raw PDFs |
| **Clinic staff** (future) | Manage multiple patients at scale |

The product is built patient-first; the physician portal is a roadmap item
(§11), but every output must be *clinician-readable* from day one.

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

**AI**
- OpenAI API
- Structured Outputs (JSON schema-constrained)
- Function Calling for deterministic steps (e.g. "save extracted lab")

**Document parsing**
- OCR pipeline
- PDF text + layout extraction
- Image upload support (JPG, PNG, HEIC)

**Deployment**
- Vercel

All third-party services must be chosen/consented-to with PHI handling in mind
(BAA / DPA where applicable).

---

## 5. Feature Requirements

Requirements are grouped by module. Each module maps to deliverables in §10.

### 5.1 Landing page (public marketing)
Premium, Stripe / Linear / Vercel-grade aesthetic.
- **Hero.** Headline: *"Understand Your Hormone Health with Evidence-Based
  Clinical Insights."* Subtitle: *"Upload your laboratory history and receive a
  structured clinical summary to support informed discussions with your
  healthcare provider."* CTA: **Upload Labs**.
- **Feature grid:** Timeline Analysis · AI Lab Extraction · Hormone Trends ·
  Clinical Reports · Secure Data · Dark Mode.
- Must support dark + light themes and be fully responsive + accessible.

### 5.2 Authentication
Email/password register + login, password reset, Google OAuth. Sessions enforced
server-side; no patient data reachable without auth.

### 5.3 Dashboard shell
Sidebar navigation: **Dashboard · Patients · Labs · Reports · Symptoms ·
Timeline · Analytics · Settings.** Top bar shows the §2.5 safety disclaimer
(persistent).

### 5.4 Patient profile
Structured store of: Age, Height, Weight, Body Fat %, Waist, Blood Pressure,
Resting HR, Sleep, Exercise, Alcohol, Smoking, Medical Conditions, Medications,
Supplements, Goals, Family History. Free-text fields allowed; structured fields
preferred for analytics.

### 5.5 Lab upload
Drag & drop, multi-file, unlimited uploads. Accepted: **PDF, JPG, PNG, HEIC.**
Files land in Supabase Storage (private bucket, RLS).

### 5.6 OCR & extraction pipeline
For each uploaded lab, extract: **date, laboratory, ordering doctor, and every
biomarker** with its **value, reference range, and units.** Units must be
**normalized** (e.g.统一 to canonical units per biomarker) so values are
comparable across labs and over time. Source-of-truth fields (raw value + raw
unit + raw range) are retained alongside the normalized ones.

### 5.7 Biomarker catalog (extensible)
The system ships with a starter catalog (below) and **must be extensible** —
adding a new biomarker is a data/config change, not a code change.

**Hormones:** Total Testosterone · Free Testosterone · Bioavailable
Testosterone · SHBG · Albumin · LH · FSH · Estradiol (sensitive) · Prolactin ·
DHEA-S · Pregnenolone · Cortisol (AM/PM) · IGF-1.

**Thyroid:** TSH · Free T3 · Free T4 · Reverse T3.

**Prostate:** PSA.

**CBC:** Hemoglobin · Hematocrit · RBC · WBC · Platelets.

**CMP / metabolic:** ALT · AST · Creatinine · eGFR · BUN · Electrolytes ·
Albumin · Globulin.

**Lipids:** HDL · LDL · Triglycerides · Total Cholesterol.

**Inflammation / iron:** hsCRP · Ferritin · Iron.

**Vitamins / metabolic:** Vitamin D · Vitamin B12 · Folate · A1C · Insulin ·
Glucose.

> Reference ranges are **per-lab / per-assay** and must be stored with the
> result, not assumed globally. Trend logic must account for unit/range
> differences, not just numeric value.

### 5.8 Timeline
A single, beautiful, interactive timeline aggregating: every uploaded lab,
every TRT protocol entry, every symptom entry, every medication, every body-
composition measurement. Filterable by type and date range.

### 5.9 Graphs
One interactive chart per biomarker (and rollups per panel). Each chart
supports: hover tooltips, zoom, date-range compare, **reference-range
overlay**, **medication overlay**, and **symptom overlay**.

### 5.10 Symptoms module
Track and score: Energy · Mood · Libido · Morning Erections · Recovery · Sleep ·
Motivation · Depression · Focus · Muscle Gain · Fat Loss · Exercise Performance
· Joint Pain. Scoring schema is fixed (e.g. 0–10 or ordinal scale) so scores are
chartable longitudinally.

### 5.11 Medication module
Store: Medication · Route · Frequency · Start Date · End Date · Reason ·
Clinician · **Dose (historical record only)**. Displayed in reports; **never**
used as input to generate or recommend new dosages.

### 5.12 AI analysis pipeline
Given a patient's longitudinal data, produce a **structured** analysis
(JSON-schema-constrained output) containing:
- Executive summary
- Important changes
- Potential trends
- Questions for the physician
- Evidence-based discussion points
- Possible differential diagnoses **to discuss** (not diagnoses)
- Need for additional testing

All outputs pass through the §2 guardrail filter before rendering.

### 5.13 AI clinical report
Generated report sections:
- Executive Summary
- Hormone Trends · CBC Trends · Estradiol Trends · SHBG Trends · Thyroid Trends
- Metabolic Health · Cardiovascular Risk Factors
- Questions to Discuss with Physician
- Suggested Additional Laboratory Tests (when data incomplete)
- **Red Flags Requiring Prompt Medical Review**
- Lifestyle Factors
- References to relevant clinical guidelines

Export: **PDF, Word (.docx), Print.** Every export carries the §2.5 disclaimer
and a "historical record only" note on any medication/dose content.

### 5.14 Settings
Account, profile, data export, consent management, and deletion (right-to-be-
forgotten), theme preference.

---

## 6. AI System — Behavioral Contract

Every AI interaction (extraction, analysis, report, future chat) must:

1. Receive the §2 guardrails verbatim in its system prompt.
2. Emit **structured** output validated against a schema; free-form prose only
   inside sanctioned text fields.
3. Be post-processed by a deterministic guardrail pass that rejects/blocks any
   output matching prohibited patterns (dosage recommendations, prescriptions,
   schedules, diagnoses).
4. Cite or reference guideline material where claims are made; never fabricate
   references.
5. Refuse to answer "what dose should I take" style prompts and redirect to the
   physician.

Extraction AI is bounded to *reading* structured data from documents; it must
never infer a value that isn't present (mark as `uncertain` / ask for review).

---

## 7. UX Principles

- Premium animations (Framer Motion) — purposeful, not gratuitous.
- Glassmorphism accents where they aid hierarchy.
- First-class **dark mode and light mode**; no mode is an afterthought.
- Fully responsive, fast, and **accessible** (WCAG 2.1 AA target: semantic
  markup, keyboard nav, screen-reader labels, color contrast).
- Clinical content is always accompanied by context (units, range, date).

---

## 8. Security & Compliance

HIPAA-inspired architecture (or applicable local privacy regulation). Required:

- **Encryption** in transit (TLS) and at rest.
- **Row Level Security** on every patient-data table; tenant = patient (or
  clinician with granted access).
- **Audit logs** for all access to and changes of patient data.
- **Role-based access** (patient, clinician, clinic admin — future).
- **Patient consent management** — explicit consent recorded before any data is
  processed or shared.
- **Secure uploads** — private storage, signed URLs, no public patient data.
- **Data minimization & retention controls**, including deletion on request.
- Secrets via environment variables / Vercel + Supabase secret management; never
  committed.

> Compliance posture must be reviewed by a qualified professional before any
> production use with real PHI. This document defines intent, not a legal
> certification.

---

## 9. Non-Functional Requirements

- **Performance:** lab pages interactive quickly; large histories paginate.
- **Reliability:** extraction failures surface for human review, never silently
  drop data.
- **Observability:** structured logs, error tracking, AI-output guardrail
  telemetry.
- **Extensibility:** new biomarkers, new labs, new report sections added via
  data/config, not code forks.
- **Testability:** guardrails, extraction mapping, and trend logic are unit-
  tested with golden cases.

---

## 10. Deliverables (from the master prompt)

1. Full application architecture
2. Database schema
3. Prisma models
4. Supabase schema (tables, RLS policies, storage buckets)
5. API routes
6. OCR pipeline
7. AI extraction pipeline
8. AI analysis pipeline
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

Physician portal · multi-patient dashboard · clinic analytics · FHIR/HL7
integration · lab API integration · wearable data (Apple Health, Garmin, Oura,
Whoop) · AI chatbot over patient history (same guardrails apply).

---

## 12. Definition of Done (per feature)

A feature is "done" when **all** are true:
- Implements the GOLD requirement it traces to.
- Never violates §2 (verified by a guardrail test where applicable).
- Shows the §2.5 disclaimer on any clinical surface.
- Has unit tests for logic and at least one happy-path test.
- Passes the type check, lint, and build.
- Is accessible (keyboard + screen reader) and works in dark + light mode.
- Stores PHI only behind RLS, with audit logging.
- Updates documentation if it changes data shape or AI behavior.

---

## 13. References

The Prime Directive and biomarker catalog above are derived from the project's
master prompt. Clinical guideline references attached to AI outputs must point
to real, current sources (e.g. published endocrine society guidance) — never
invented citations.
