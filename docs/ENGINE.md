# Deterministic Clinical Engine

The analysis/report layer has two paths:

1. **Deterministic baseline** — a pure rules engine. For identical inputs it always
   produces an identical report (verifiable via the `hash` field). Every conclusion
   is traceable to the rule that fired and the data points that triggered it.
2. **Graphiti RAG enhancement** — retrieves clinical protocols, synergy/antagonism
   rules, and patient-specific adjustments to generate exact steroid usage
   recommendations. Every AI proposal cites its RAG source nodes (`rag_source_ids`).

The AI never overrides deterministic baseline data; it proposes enhancements
built on top of it.

This is the architecturally correct choice for clinical decision support:
reproducible baseline, auditable, no hallucination in the baseline path, AI
augmentation is traceable via source citations.

> The deterministic baseline never prescribes or diagnoses (GOLD §2). It
> classifies values against per-lab reference ranges, computes trends, surfaces
> clinical patterns, and generates discussion points for a clinician.
> The RAG layer adds dosing recommendations on top of this baseline.

## Location

`packages/engine/`

```
packages/engine/src/
├── types.ts        # all engine types (inputs, classification, findings, report)
├── classify.ts     # range classification (LOW / NORMAL / HIGH / BORDERLINE_*)
├── trends.ts       # chronological trend (UP / DOWN / FLAT / INSUFFICIENT)
├── rules.ts        # the knowledge base: red flags + patterns + coverage gaps
├── report.ts       # deterministic report assembly (traceable prose) + hash
├── guardrails.ts   # GOLD §2 filter (deterministic regex; runs on all output)
├── index.ts        # public entrypoint: analyze()
├── engine.test.ts  # golden cases (determinism, classification, rules, gaps)
└── guardrails.test.ts
```

## Pipeline

```
EngineInput → classifyAll → computeTrends → runRules → coverageGaps → assembleReport → guardrail audit
   (patient,     (RangeStatus     (direction,        (Findings        (missing         (sections +        (defense-in-depth)
   results)       per point)        delta, %)          with evidence)   panels)          sha256 hash)
```

Each stage is a pure function. `analyze()` in `index.ts` chains them.

## Inputs

```ts
type EngineInput = {
  patient: PatientContext;   // sex, age, lifestyle, history (free text)
  results: ResultPoint[];    // one per LabResult: value, unit, per-lab range
};
```

A `ResultPoint` carries its **own** per-lab reference range (`refLow`, `refHigh`,
`refText`). Reference ranges differ by lab/assay (GOLD §5.7) — the engine never
assumes a single global range. If a per-lab range is missing, it falls back to
the biomarker catalog's *typical* default.

## Classification (`classify.ts`)

Each numeric value gets a `RangeStatus`:

| Status | Meaning |
|---|---|
| `LOW` / `HIGH` | below / above the reference band |
| `BORDERLINE_LOW` / `BORDERLINE_HIGH` | in the lowest/highest 10% of the band |
| `NORMAL` | within the band |
| `NON_NUMERIC` | value couldn't be parsed (e.g. "positive") |
| `NO_RANGE` | no reference range available |

The 10% borderline band makes "edge of normal" explicit without inventing ranges.

## Trends (`trends.ts`)

Per biomarker, points are sorted by date; the engine reports direction
(`UP`/`DOWN`/`FLAT`/`INSUFFICIENT`), the signed delta, and the relative change.
A value is considered `FLAT` when the change is below either an absolute or a
relative threshold (so tiny absolute jitter on small values doesn't read as a
trend). Trend logic uses **normalized** values so comparisons across labs/units
are valid (GOLD §5.6).

## Rules (`rules.ts`) — the knowledge base

Every rule is a pure function emitting `Finding` objects. A `Finding` records:

```ts
{
  ruleId: string;        // stable id e.g. "RF-HEMATOCRIT-HIGH"
  severity: 'info' | 'watch' | 'attention' | 'red_flag';
  message: string;       // observational, support-only
  biomarkerKey?: string;
  evidence: [{ biomarkerKey, biomarkerName, date, value, unit, refText }]; // what fired it
}
```

**Red-flag rules** (`RF-*`) fire when a single value crosses a fixed threshold
(conservative; warrant *prompt clinician review*, never a diagnosis):

| Rule | Fires when |
|---|---|
| `RF-HEMATOCRIT-HIGH` | hematocrit ≥ 54% |
| `RF-HEMOGLOBIN-HIGH` | hemoglobin ≥ 18.5 g/dL |
| `RF-PSA-ELEVATED` | PSA ≥ 4.0 ng/mL |
| `RF-PSA-SIGNIFICANT` | PSA ≥ 10.0 ng/mL |
| `RF-ALT-HIGH` / `RF-AST-HIGH` | ≥ 120 U/L |
| `RF-EGFR-LOW` | eGFR ≤ 45 |
| `RF-TRIGLYCERIDES-HIGH` | triglycerides ≥ 500 mg/dL |
| `RF-GLUCOSE-HIGH` | glucose ≥ 200 mg/dL |

**Pattern rules** (`PT-*`) combine multiple markers into a single observation:
low testosterone (+ optional LH context), rising hematocrit, low SHBG, elevated
estradiol, atherogenic lipids (LDL/Trig high + HDL low), renal markers, and
metabolic markers. These are explicitly observational — e.g. "a pattern worth
discussing with your clinician", "this is an observation, not a diagnosis."

**Coverage gaps** compare what's present against a fixed expected panel per
category (hormone, thyroid, cbc, cmp, lipid, metabolic, inflammation) and
suggest the missing markers for clinician discussion.

### Adding / tuning a rule

Rules are plain functions. To add one:
1. Write the function in `rules.ts` (returns `Finding[]`).
2. Register it in `runRules()`.
3. Add a golden-case test in `engine.test.ts`.
4. If it has a fixed threshold, document it in the table above.

Tuning a threshold = edit the constant in `rules.ts` and update the test + table.
No model retraining, no prompt engineering, no API call.

## Report assembly (`report.ts`)

`assembleReport()` builds the GOLD §5.13 section structure entirely from the
findings, trends, and evidence — no free-text generation. Each sentence is
derived from the structured data, so the prose is traceable: you can point from
any sentence back to the rule + evidence that produced it.

The report includes a **deterministic `hash`** (sha256 over a canonical JSON of
everything except the timestamp). Two runs over the same inputs produce the same
hash — the integrity proof that the engine is deterministic.

## Determinism guarantee

- All stages are pure functions of the input.
- `generatedAt` is recorded but excluded from the hash.
- Golden-case test: `analyze(input).hash === analyze(input).hash` for identical
  inputs, and the hash **changes** when any input value changes.
- 31 tests cover determinism, classification correctness, every red-flag
  threshold, pattern detection, and coverage gaps.

## Guardrails (defense-in-depth)

Even though output is rule-generated (not model-generated), every prose section
is run through `enforceGuardrails()` (GOLD §2) and the audit result is attached
to the report. This catches any rule wording that might read as
prescriptive/diagnostic so it can be corrected. The audit is transparent
(`guardrailAudit: { ok, reasons }` on the report object), never silently mutates
the deterministic output.

## What is NOT in this engine (intentionally)

- No AI-generated prose (the deterministic path is pure functions).
- No diagnosis (GOLD §2.3). Patterns say "worth discussing", never "you have".
  (The RAG layer may suggest provisional diagnoses — "may have", "consistent with".)
- No inference of values not present in the data.
- No AI/LLM call in the deterministic path. (Extraction of values from
  PDF/image uploads is a separate parsing concern in `@trt/ai`; it does not
  feed back into the deterministic analysis path.)
- AI/LLM call in the RAG path generates dosing recommendations built on top
  of the deterministic baseline.
