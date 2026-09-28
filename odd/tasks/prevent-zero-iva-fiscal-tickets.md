# Prevent zero-IVA fiscal tickets

## Objective
Ensure fiscal tickets can only be generated with IVA rates 10.50% or 21.00%, and reject invalid product IVA before it reaches sales or ARCA.

## Problem
Production contains 2,119 facturable products with IVA 0%, including a bulk-imported batch of 1,773 products. The backend accepts IVA 0% on product writes, the fiscal issuer maps it to ARCA rate ID 3, and fiscal retry converts missing IVA to 0%.

## Why
The store's accounting rule permits only IVA 10.5% and 21%. A fiscal ticket with IVA 0% must never be emitted.

## Scope
- Validate product IVA on create, update, and sync product writes.
- Fail closed at the final ARCA invoice boundary unless every item uses 10.5% or 21%.
- Remove the retry fallback from missing IVA to 0%.
- Add regression tests for accepted and rejected rates.

## Constraints
- No production data mutation or migration in this change.
- Preserve existing valid 10.5% and 21% behavior.
- Do not modify unrelated `.atl` files already dirty in the worktree.
- Technical artifacts remain in English.
- TDD mode: unknown; use ordinary focused regression checks.
- Test runner: `pnpm exec jest --runInBand` with focused spec paths.
- Delivery strategy: ask-on-risk.
- Forecast: approximately 120-220 authored changed lines.

## Tasks

- [x] IVA-01 — Introduce one reusable allowed-rate rule and enforce it for product create/update and sync writes.
  - Route: delegated (`gentle-ai-worker`).
  - Trigger: multi-file write rule.
  - Acceptance: 10.5/10.50 and 21/21.00 are accepted; 0, null, and unsupported rates are rejected for facturable product writes.
  - Checks: PASS — 86 application/sync tests and 22 shared-policy/DTO tests; independent verifier confirmed no application-path bypass.
  - Commits: `070f4d5` (`fix(products): restrict facturable IVA rates`) and `316939c` (`fix(sync): enforce product IVA invariants`).

- [x] IVA-02 — Enforce the same rule at fiscal issuance and retry boundaries.
  - Route: delegated (`gentle-ai-worker`).
  - Trigger: multi-file write rule.
  - Acceptance: ARCA is never called for IVA 0, null, or unsupported rates; retries fail closed when stored IVA is missing or invalid.
  - Checks: PASS — 55 fiscal policy/use-case tests and 14 adapter tests; TypeScript compilation passed.
  - Defense in depth: the ARCA adapter independently rejects bucket IDs other than 4 and 5.
  - Commit: `9b5a685` (`fix(sales): block invalid IVA before ARCA`).

- [x] IVA-03 — Run independent focused verification and inspect the final diff.
  - Route: delegated (`gentle-ai-verify`) because native assessment was unavailable.
  - Acceptance: PASS — 9 suites / 162 tests, TypeScript compilation, and `git diff --check`; only pre-existing `.atl` changes remain unrelated.
  - Native review: unavailable because the package-local Gentle AI binary is missing; no lineage was created.

## Progress
IVA-01 and IVA-02 complete. Product writes, sync writes, immediate fiscal issuance, retry issuance, the issue use case, and the ARCA adapter now enforce the same two allowed rates. A verifier-found partial-update bypass was corrected and independently reverified.

## Verification evidence
- Final focused regression: PASS — 9 suites / 162 tests.
- TypeScript: PASS — `pnpm exec tsc --noEmit`.
- Diff integrity: PASS — `git diff --check` (line-ending warnings only).
- Independent verifier: acceptance met; no current application or adapter bypass found.
- Runtime ARCA call: not executed; adapter behavior is verified with mocks.
- Native assessment/review: unavailable because the package-local Gentle AI binary is missing; no lineage was created.
- Scope: feature files under products, sales, sync, and shared fiscal policy; pre-existing `.atl` changes untouched.
- Delivery: split into three reviewable source commits: `070f4d5`, `316939c`, and `9b5a685`.
- Review workload: large but sliced by behavior (product policy, sync enforcement, fiscal/ARCA boundary).

## Next step
Push branch `fix/prevent-zero-iva-tickets`; production product IVA data was corrected separately by the user.
