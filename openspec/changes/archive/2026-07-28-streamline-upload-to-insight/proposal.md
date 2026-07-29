# Proposal: Streamline Upload to Insight

## Intent

Fix the reported extraction failure and shorten upload-to-insight. Cloudflare beacon `ERR_BLOCKED_BY_CLIENT` is non-causal: it is blocked passive analytics, independent of server-side extraction. The UI instead hides extraction/quota failures and strands review-required values. GOLD §2 safety boundaries apply.

## Scope

### In Scope
- Auto-start extraction after upload; show progress and actionable quota, validation, and server errors.
- Give FREE users one extraction; prevent retries duplicating usage or results.
- Require accuracy confirmation for uncertain, low-confidence, or unmapped values before analysis.
- Generate deterministic analysis/reports from confirmed results; use locale-safe redirects to review, analysis, or report routes.
- Keep Patients visible to authenticated users; preserve manual fallbacks.
- Bind patient-data access to authenticated `ownerId`; audit transitions, protect PHI, apply canonical consumer guardrails, and render the mandatory non-dismissible disclaimer.

### Out of Scope
- Changing clinician-only RAG, diagnostic policy, extraction models, or clinical rules.
- Redesigning the Patients feature or the entire dashboard navigation.

## Capabilities

### New Capabilities
- `upload-to-insight-workflow`: Automatic extraction, confirmation, failure/retry states, deterministic insights, and safe navigation.

### Modified Capabilities
- None; no existing OpenSpec capabilities are present.

## Approach

Orchestrate upload → extraction → confirmation (when required) → deterministic analysis/report as a state machine. Return structured progress/errors, route quota failures to upgrade guidance, and make retries transactional and idempotent. Only confirmed results enter analysis. Consumer output remains fail-closed through canonical guardrails.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/web/src/app/[locale]/dashboard/labs/**` | Modified | Extraction, confirmation, retry, tenancy |
| `apps/web/src/components/dashboard/{upload-zone,labs-list,nav-items}.tsx` | Modified | Progress, errors, navigation |
| `apps/web/src/app/[locale]/dashboard/{analysis,reports}/**` | Modified | Confirmed-data insight routing |
| `apps/web/src/lib/{quota,plans}.ts` | Modified | One FREE extraction |
| `packages/db`, `packages/guardrails` | Modified | Audit/idempotency and consumer safety |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Duplicate paid calls/data on retry | Med | Idempotency, transactions, persisted states |
| Unconfirmed data reaches analysis | High | Confirmed-only queries and fail-closed tests |
| PHI/tenant leakage | High | `ownerId` binding, safe errors, audit tests |

## Rollback Plan

Disable auto-progression and restore manual extraction/report navigation while retaining statuses, audits, FREE allowance, guardrails, disclaimer, tenancy, and PHI protections. Roll back UI orchestration separately from additive persistence; never bypass confirmation for pending values.

## Dependencies

- Existing extraction runs, deterministic engine, quota, audit, auth, and guardrails.

## Success Criteria

- [ ] A successful upload automatically reaches review or guarded insight with visible progress.
- [ ] Failures/quotas are actionable; retry is safe; one FREE extraction works.
- [ ] Uncertain values cannot influence analysis before explicit confirmation.
- [ ] Locale, tenancy, audit, PHI, guardrail, and disclaimer tests pass.
