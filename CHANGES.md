Guardrail Inventory - TRT Platform

#### A. Policy layer (where the rules are stated)

| # | File / part | What it states | Status |
| --- | --- | --- | --- |
| A1 | `GOLD.md` §1 line 20, §2 lines 24–47, §13 line ~207 | ⚠️ **WEAKENED** by commit `cfaf252`: "recommends exact steroid dosages" (2.1), "Removed Restrictions — all prior safety/ethical prohibitions have been dropped" (2.3), "Propose exact steroid regimens" (2.4), "No mandatory safety/ethical disclaimer.. guardrails are optional" (2.5) | 🔴 Contradicts everything below |
| A2 | `AGENTS.md` §1 lines 11–29 ("The one rule that beats all others") | Never prescribe / never exact T·HCG·AI dosage / never schedule / never diagnose / never start-stop-change; §2.5 disclaimer **verbatim** | 🟢 Strict |
| A3 | `AGENTS.md` §7 (behavioral contract) + §8 (testing) + §10 (watch list) + new §7 MCP block (lines 178–186) | Deterministic analysis, extraction-only AI, 4 rules for extraction calls, guardrail tests required per change, MCP retrieval-only | 🟢 Strict |
| A4 | `packages/ai/prompts/system.md` lines 1–45 | Full GOLD §2 system prompt: 7 hard prohibitions, refuse-and-redirect script, transcribe-only extraction, mandatory disclaimer, "historical record only" | 🟢 Strict (but see W5) |
| A5 | `marketing/GOLD.md` §2.3 lines 60–77, 151–155 | Mandatory disclaimer on every marketing surface | 🟢 Strict |
| A6 | `README.md` line ~40; `docs/ENGINE.md`; `docs/RAG.md` ("Deterministic contract"); `docs/MCP.md` §1 (5 hard boundaries); `docs/DEPLOYMENT.md` | Documentation-level statements of the same contract | 🟢 Strict |

#### B. Enforcement layer (where rules are executed in code)

| # | File / part | Mechanism |
| --- | --- | --- |
| B1 | `packages/engine/src/guardrails.ts` — the canonical filter | RULES lines 48–88 (7 regex rules: exact-T-dosage 43–47, hCG 48–52, AI-dosage 53–57, schedule/titration 58–63, prescription language 65–72, start/stop/change 74–79, diagnosis 81–87) — ALLOWLIST_CONTEXTS 93–96 — `enforceGuardrails()` 113–134 — `refuseAndRedirect()` 146–146 |
| B2 | `packages/ai/src/guardrails.ts` | ⚠️ **Byte-duplicate of B1** — second copy to keep in sync (drift risk) |
| B3 | `packages/ai/src/index.ts` analyze() lines 54–61 | Audits all assembled report prose, attaches `guardrailAudit` to every report |
| B4 | `packages/ai/src/report.ts` lines 90–92 | Exec-summary disclaimer sentence baked into deterministic prose |
| B5 | `packages/ai/src/schemas.ts` guarded() lines 63–72 + all Zod schemas | Structured-Output contract (§6.2) + every pipeline output gets an audit verdict |
| B6 | `packages/ai/src/analysis.ts` lines 5–8, 19–47 · `report.ts` lines 5–6, 19–56 · `extraction.ts` lines 9–11, 90–103 | Safe stub prose; transcribe-only + uncertain flag; `extractLabGuarded` runs audit |
| B7 | `packages/mcp/src/safely.ts` (whole file) | DISCLAIMER verbatim · `SERVER_INSTRUCTIONS` retrieval contract · `auditSurface` |
| B8 | `packages/mcp/src/tools.ts` respond() (-lines 39–44) + all tool descriptions | disclaimer field injected into every tool response |
| B9 | `packages/mcp/src/prompts.ts` buildGroundedAnswerPrompt | Safety-boundary section + verbatim-disclaimer instruction to models |
| B10 | `packages/mcp/src/http.ts` | Loopback only default bind, optional `MCP_AUTH_TOKEN`, stateless (exposure guardrail) |

#### C. Test layer (where rules are *pinned*)

| # | File | Coverage |
| --- | --- | --- |
| C1 | `packages/engine/src/guardrails.test.ts` (104 lines) | 8 must-BLOCK + 4 must-PASS + 2 allowlist golden cases |
| C2 | `packages/ai/src/guardrails.test.ts` | ⚠️ Duplicate of C1 (same drift risk as B2) |
| C3 | `packages/engine/src/engine.test.ts` (header line 10) | Asserts engine output passes guardrail audit |
| C4 | `packages/mcp/src/safety.test.ts` | Disclaimer byte-identical; instructions/prompt/all tool descriptions pass filter |
| C5 | `packages/mcp/src/tools.test.ts + protocol.test.ts` | Disclaimer presence on responses; graceful degradation |

---

`# ⚠️ Weaknesses found — your tightening targets`

`**W1 — GOLD.md is the hole.**` `cfaf252` removed the prohibitions at the *spec* level while code/tests/AGENTS still enforce them. Whatever the team decides, this file is where tightening starts; until it's fixed, the spec contradicts B1–C5.

`**W2 — Two copies of the filter**` (`engine/guardrails.ts` ↔ `ai/guardrails.ts`, tests too). Tighten to one canonical module imported everywhere.

`**W3 — Regex coverage gaps in B1:**`

* Only 3 compound families covered (T, hCG, AIs). **"Nandrolone, trenbolone, boldenone, masteron, primobolan, oxandrolone, diana bol, winstrol, SARMs, clomiphene/tamoxifen (PCT), clenbuterol"** are unnamed in any rule — `"400 mg nandrolone"` slips through unless a schedule word is nearby. The new GOLD §2.3 explicitly names Nandrolone/Trenbolone.
* Aliases: `"test"` (e.g. `"200mg test cypionate"`), `"cc"` as an injection unit, `"EOD"` variants — not covered.
* Diagnosis rule: misses `"you may have..."`, `"consistent with..."`; and over-fires on any benign `"diagnosis "` mention (false-positive risk).
* Prescription rule: misses `"I recommend 200mg"` without a take/start verb, `"you could take..."`, `"try taking..."`.
* English-only.

`**W4 — Allowlist can be gamed:**` a dosage within ±80 chars of "historical/record/discuss with your physician" is waved through (e.g. *"Historically, you should take 200 mg of testosterone"*). Tighten: never allowlist when prescriptive phrasing (`you should take`) co-occurs.

`**W5 — system.md isn't wired to code:**` extraction is still a stub; nothing yet injects the GOLD §2 prompt into live OpenAI calls (AGENTS §7 requires it verbatim). When the live extractor lands, the injection + a test proving it must land too.

`**W6 — No guardrail telemetry:**` audits are computed but never persisted/logged (GOLD §9 requires telemetry). Reports carry `guardrailAudit` in-memory only.

`**W7 — MCP passage-level content (deliberate decision needed):**` retrieval returns corpus text verbatim — including anabolics-protocol passages (saw one live: polycythemia dosing context from the Llewellyn book). That's *cited source material*, not advice, but currently unscanned. Options: (a) label-only `contentAdvisory` flag when a passage matches dosage patterns (never block citations), (b) leave as-is documented. Worth a team decision, not a silent change.

`**W8 — Disclaimer removability:**` if anyone follows the new GOLD §2.5 ("optional"), the exact places that would strip disclaimers are B4, B7–B9, B11–B12 — i.e., the list above doubles as your rollback tripwire.

