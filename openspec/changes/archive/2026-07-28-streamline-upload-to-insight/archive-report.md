# Archive Report — streamline-upload-to-insight

**Change:** `streamline-upload-to-insight`
**Archived:** 2026-07-28
**Mode:** hybrid (OpenSpec filesystem + Engram)
**Archive location:** `openspec/changes/archive/2026-07-28-streamline-upload-to-insight/`
**Final verdict at close:** PASS WITH WARNINGS (0 blockers, 0 CRITICAL findings)

This is the terminal record of the cycle. It describes the state of the change AT CLOSE.
Intermediate snapshots (`apply-progress.md`, the S1-scoped `verify-report`, S1/S2
phase-contract validations) are cited by source and time where referenced; they do not
override the final state recorded here.

---

## 1. Gate Evidence (archive authority)

| Gate | Result | Evidence |
|------|--------|----------|
| Task Completion Gate | PASS | `tasks.md` — 13/13 implementation tasks checked `[x]`; archived copy re-verified post-move |
| CRITICAL-finding gate | PASS | Full-change `verify-report.md` — `critical_findings: 0`, `blockers: 0` |
| Native Review Receipt Gate | PASS (allow) | Orchestrator-provided native ledger: 4 ordinals all passed; final revision `sha256:b465af286ad0a0fe0cca483d510da0866cba204bb5f4fd7eebcb29e71bd17e39`. Ledger `decision_required` is explained by pre-existing untracked working-tree content counting — **no runtime work remains.** |
| Action Context Guard | N/A | Clone-local; delivery disabled/unmanaged; no workspace-planning mode. No `allowedEditRoots` constraint applied. |

No CRITICAL issues, no unchecked implementation tasks, no scope-changed/invalidated/escalated
review state. Archive proceeded under normal authority.

---

## 2. Spec Sync (OpenSpec source of truth)

| Domain | Action | Details |
|--------|--------|---------|
| `upload-to-insight-workflow` | **Created** (new capability) | Main spec did not exist → delta spec IS the full spec. Copied verbatim and byte-identity-verified. 7 ADDED requirements (no MODIFIED/REMOVED/RENAMED). |

**Source of truth updated:** `openspec/specs/upload-to-insight-workflow/spec.md`
(4639 bytes, byte-identical to the archived delta
`.../archive/2026-07-28-streamline-upload-to-insight/specs/upload-to-insight-workflow/spec.md`).

The 7 requirements promoted to main specs:
1. Automatic extraction with visible states
2. FREE extraction allowance
3. Idempotent transactional attempts
4. Explicit accuracy confirmation
5. Locale-safe progression
6. Tenant-bound audited transitions
7. Clinical-surface safety boundaries

No destructive deltas, no REMOVED requirements → the archive rule "Warn before merging
destructive deltas" did not trigger.

---

## 3. Archive Contents

- `proposal.md` ✅
- `specs/upload-to-insight-workflow/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (13/13 tasks complete — all `[x]`)
- `verify-report.md` ✅ (full-change S1+S2, ordinal 4)
- `apply-progress.md` ✅ (S1+S2 merged)
- `exploration.md` ✅
- `playwright-harness.md` ✅ (manual runtime harness, 5 scenarios)
- `archive-report.md` ✅ (this file)

---

## 4. Final-State Authority Reconciliation

The archive report reflects FINAL state. Where an intermediate snapshot disagrees with a
higher-ranked source, the final state is reported and the stale claim is cited, not echoed.

### 4.1 S2 hardening commit SHA — final state `8adde6b`
`apply-progress.md` (intermediate, rank #4) recorded the third S2/hardening commit as
`6f520d1`. The terminal full-change `verify-report.md` (rank #4, but later and
change-spanning) and the orchestrator's explicit final-state facts (rank #3) both record
the finalized hardening commit as **`8adde6b`** (it carries the S-1/S-2 fixes:
PHI-free `usage_record_failed` log + ownerId-scoped retry `updateMany`). **Final state:
`8adde6b`.** The `6f520d1` reference is a pre-finalization identifier superseded before
the terminal verify; no defect, no contradiction — a SHA carried forward from an earlier
snapshot.

### 4.2 S-1 / S-2 findings — RESOLVED at close
Per `apply-progress.md` and the full-change `verify-report.md`, both S1 suggestions were
accepted and fixed in commit `8adde6b` and locked by `extract-route-hardening.test.ts`
(3 tests: PHI-free metering log + ownerId-scoped retry flip). **Final state: RESOLVED.**

### 4.3 S-3 finding — OPEN (non-blocking, defense-in-depth)
`extract/route.ts:228-231` catch-block FAILED-status flip lacks `ownerId` in its `where`
(parody of the resolved S-2, which fixed the retry path at `:87`). **Tenancy is safe** —
the upstream `findFirst({ where: { id, ownerId } })` at `:38-40` already gates the row
(a cross-owner report returns 404 before the try-block), so an attacker cannot flip
another tenant's report to FAILED. This is a defense-in-depth consistency gap only,
non-blocking. Recorded as S-3 in the verify-report and Engram discovery #144.

### 4.4 W-1 warning — OPEN (manual runtime evidence, blocks prod not archive)
The full-change verify is PASS WITH WARNINGS solely on W-1: component visible-state
*rendering* lacks automated DOM evidence (this repo's vitest is `environment:'node'` with
no jsdom). The flow *decisions* are runtime-tested via pure helpers
(`extract-flow.ts`, `review-flow.ts`, `review-data.ts`); React wiring is typecheck-clean +
build-compiled; the 5-scenario manual Playwright harness (`playwright-harness.md`) is the
deferred runtime DOM evidence. **Per scope, Playwright requires a live server/DB/auth and
MUST run against live DEV before prod.** Not a code defect; the standard test-layer
limitation of this change.

### 4.5 Delivery state — clone-local, branches unpushed
Review-driven development is OFF (clone-local). Delivery is disabled/unmanaged and follows
ordinary repository policy. Implementation branches were NOT pushed and no PRs were
created as part of this SDD cycle:
- S1 `feat/streamline-upload-to-insight-s1` — 4 commits (`07e3e29`, `7d6e6a0`, `eb5839f`,
  `b05e6ac`), base `origin/main` (`70bbb9f`).
- S2 `feat/streamline-upload-to-insight-s2` — 3 commits (`6efa429`, `b811c1f`, `8adde6b`),
  stacked on the S1 tip. 7 commits total, unpushed.

Maintainer-accepted sizing: **`size:exception` for PR2** (1,568 real changed lines, ~56%
test code; production diff ~679 lines under budget). Recommended chain at delivery time:
PR1a/PR1b split for S1 (~409/~616), PR2 single with `size:exception`, stacked-to-main
(auto-chain). These delivery actions are outside this archive phase.

---

## 5. Final Verification Numbers (full change — supersedes S1-scoped report)

Carried from the highest-ranked source covering them (full-change `verify-report.md`,
ordinal 4, reinforced by orchestrator final-state facts). Do not copy S1-scoped counts.

| Metric | Result |
|--------|--------|
| Verdict | PASS WITH WARNINGS |
| Requirements | 7/7 PASS |
| Scenarios | 14/14 PASS |
| `pnpm test` (workspace) | exit 0 — web 232/232, guardrails 63/63, engine 25/25, ai 29/29, kb 7/7, mcp 24/24 |
| `pnpm build` (Next 15) | exit 0 — clean; `/labs/confirm`, `/labs/review/[labReportId]`, `/labs/extract`, `/labs/upload` all compiled |
| `pnpm -r lint` | exit 0 — no warnings/errors |
| `pnpm -r typecheck` | exit 0 — 7/7 Done |
| CRITICAL findings | 0 |
| Open warnings | W-1 (manual Playwright runtime DOM evidence) |
| Open suggestions | S-3 (extract catch-block FAILED-flip ownerId parity, defense-in-depth) |

---

## 6. Open Items Carried Forward (not defects)

- **W-1 — manual Playwright runtime harness** (`playwright-harness.md`, 5 scenarios): MUST
  run against live DEV before prod. Blocks prod deploy, NOT archive.
- **S-3 — `extract/route.ts:228-231` FAILED flip ownerId parity**: opportunistic
  defense-in-depth fix; tenancy already safe upstream.
- **Pre-existing debt NOT part of this change**: `@trt/db` typecheck RED
  (missing `@types/node`, prisma outside rootDir); `.next/types` billing artifacts. Neither
  reproduced in this environment during verify.

---

## 7. Engram Artifact Map (traceability)

All SDD artifacts persisted in Engram (project `trt`). Observation IDs:

| Phase / Artifact | Obs ID | sync_id |
|------------------|--------|---------|
| explore | #128 | obs-7acea602e8ef290c |
| proposal | #130 | obs-b31e317c0a941bc7 |
| spec | #132 | obs-8b7f82713e4084fa |
| design | #133 | obs-754fc6207f245e75 |
| tasks | #135 | obs-7e709a03675ff8c7 |
| apply (S1+S2, Strict TDD) | #137 | obs-b4adfa9185acc605 |
| verify-report (full change, ordinal 4) | #140 | obs-f567a9d977e7dff1 |
| S1 verification findings | #141 | obs-29f831ae9bfcb5ee |
| S-3 discovery | #144 | obs-a2ee101b230abb02 |
| Decision — workflow product decisions | #129 | obs-48245f41439c893c |
| Decision — accept size:exception (PR2) | #136 | obs-9cf9b54d07d3187c |
| Decision — S1 applied/validated, ledger budget | #139 | obs-b66e694002396f80 |
| Discovery — metering rule (gate new attempts only) | #134 | obs-4630a517da6ce46f |
| Phase-contract validation — S1 (PASS A–G) | #138 | obs-06aa3831ef4fa01c |
| Phase-contract validation — S2 (PASS 7 checks) | #143 | obs-aea98e8a40104155 |
| Session summary | #131 | obs-326f08ed86496b46 |
| **archive-report** (this artifact) | *(assigned on persist)* | — |

Note: discovery #134 carries a pending Engram-internal conflict flag
(`contested by #obs-ec0e6090ecb76861`). This is an Engram memory-judgment housekeeping
item between observations, **not** an SDD gate issue — the metering rule it describes was
correctly implemented and is verified passing (4 idempotency cases in `extract-route.test.ts`).

---

## 8. SDD Cycle Complete

The change `streamline-upload-to-insight` has been fully planned, implemented (Strict TDD),
verified (PASS WITH WARNINGS, 0 CRITICAL), and archived. Delta spec promoted to the main
source of truth as a new capability `upload-to-insight-workflow`.

**This archive is intentional-with-warnings** (W-1 manual Playwright runtime evidence
pending against live DEV before prod; S-3 defense-in-depth parity). No CRITICAL issues, no
incomplete implementation tasks, no destructive deltas. Ready for the next change.
