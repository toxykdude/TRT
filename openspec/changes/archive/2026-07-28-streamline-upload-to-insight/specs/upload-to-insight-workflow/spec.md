# Upload-to-Insight Workflow Specification

## Purpose

Define authenticated upload-to-insight behavior.

## Requirements

### Requirement: Automatic extraction with visible states

After upload, the system MUST auto-start extraction and show progress. A 402 MUST open the upgrade dialog. Validation/server failures MUST show retry and manual-entry actions. Patients MUST remain visible to all authenticated users.

#### Scenario: Successful automatic extraction
- GIVEN an authenticated user uploads a supported file
- WHEN upload succeeds
- THEN extraction starts automatically with visible progress

#### Scenario: Actionable extraction failure
- GIVEN extraction returns a quota, validation, or server error
- WHEN its structured error is received
- THEN 402 opens upgrade guidance; otherwise retry and manual entry are shown

### Requirement: FREE extraction allowance

A FREE account MUST receive exactly one extraction. Usage MUST be metered when its attempt starts; pre-upload messaging MUST state that upload uses the allowance.

#### Scenario: First FREE extraction
- GIVEN a FREE account has no metered attempt
- WHEN extraction starts
- THEN its one allowance is consumed and extraction proceeds

#### Scenario: FREE allowance exhausted
- GIVEN a FREE account consumed its allowance
- WHEN another extraction starts
- THEN status 402 and upgrade guidance are returned

### Requirement: Idempotent transactional attempts

Attempts and retries MUST be idempotent and transactional. Repetition MUST NOT duplicate usage or LabResults; failed persistence MUST NOT leave partial LabResults.

#### Scenario: Repeated request
- GIVEN an attempt is recorded
- WHEN it is retried or delivered concurrently
- THEN one usage record and one logical LabResult set exist

#### Scenario: Persistence failure
- GIVEN extracted values fail persistence
- WHEN the transaction ends
- THEN no partial results remain and retry is available

### Requirement: Explicit accuracy confirmation

Each uncertain, low-confidence, or unmapped value MUST show biomarker, value, unit, and uncertainty reason. Users MUST be able to confirm accuracy, correct the value, or re-enter manually. Unconfirmed values MUST NOT affect analysis, trends, reports, or dosing recommendations.

#### Scenario: Confirm extracted value
- GIVEN a review-required value is shown
- WHEN the user confirms its accuracy
- THEN it becomes eligible for deterministic analysis

#### Scenario: Correct or manually re-enter value
- GIVEN a review-required value is shown
- WHEN the user corrects or manually re-enters and confirms it
- THEN only the confirmed final value becomes eligible

#### Scenario: Leave value unconfirmed
- GIVEN a value remains unconfirmed
- WHEN clinical output is produced
- THEN that value is excluded from every listed output

### Requirement: Locale-safe progression

Redirects MUST preserve locale. Review-required extraction MUST route to confirmation; otherwise it MUST route to analysis or insight.

#### Scenario: Review route
- GIVEN extraction has a review-required value
- WHEN progression occurs
- THEN the locale-prefixed confirmation surface opens

#### Scenario: Insight route
- GIVEN extraction has no review-required values
- WHEN progression occurs
- THEN the locale-prefixed analysis or insight surface opens

### Requirement: Tenant-bound audited transitions

Patient-data reads/writes MUST bind authenticated `ownerId` and ignore client ownership. Upload, extraction, retry, correction, manual re-entry, and confirmation MUST create audit rows. Errors/logs MUST NOT expose PHI.

#### Scenario: Ownership and audit enforcement
- GIVEN a request supplies any `ownerId`
- WHEN an authenticated user performs a transition
- THEN only authenticated-owner data is accessed and the transition is audited

### Requirement: Clinical-surface safety boundaries

Consumer payloads MUST pass canonical guardrails and fail closed. Clinical surfaces MUST show a non-dismissible disclaimer. Consumer medication overlays MUST be timing-only without dose. Deterministic dose recommendations remain authenticated-user-accessible; RAG enhancements MUST remain license-verified-clinician-only.

#### Scenario: Consumer clinical surface
- GIVEN a consumer opens a clinical surface
- WHEN its payload passes guardrails and renders
- THEN the disclaimer remains and overlays omit medication dose

#### Scenario: Unsafe consumer payload
- GIVEN canonical guardrails reject a consumer payload
- WHEN delivery is attempted
- THEN delivery fails closed

## Diagnostic Context

Cloudflare beacon `ERR_BLOCKED_BY_CLIENT` is non-causal and not an extraction dependency.
