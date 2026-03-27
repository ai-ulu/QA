# AutoQA Current Status and Next Sprint

Date: 2026-03-27

## Current Status

AutoQA is now in a usable V2 state for MCP-first QA maintenance workflows.

Shipped and merged:

- PR-native QA reporting with stable comment markers and upsert behavior.
- Artifact-aware patch suggestion (`reportDir`, `artifactPaths`, `evidenceUsed`).
- Repo memory layer (`.autoqa/state/memory.json`) with inspect/reset utilities.
- Policy engine with safe-by-default controls:
  - patch allow/deny/protected patterns
  - confidence thresholds
  - branch `report_only`
  - test budget limits
- Structured policy output in patch suggestions (`policy` object).
- Milestone gate command (`pnpm v2:gate`) and local verification flow.

Operational status:

- Local validation is green (`build`, `test`, `v2:gate`).
- PR dry-run flow validated against a real external repo clone.
- Product is practical for internal usage and early power users.

## Next Sprint (Execution-First)

Goal:
Increase trust and adoption by making outputs more deterministic, review-friendly, and CI-native.

1. Add structured blocked reason contract across all tools.
   - Standardize `blockedReasons` style in suggest/verify/execute.
   - Include stable reason codes (not only free text).

2. Add policy precedence visibility in outputs.
   - Return which layer decided behavior: `cli_override | repo_config | default`.
   - Improve debugging for report-only and confidence blocks.

3. Add memory observability summary in CI output.
   - Include compact memory hints: flaky test counts, recent failure signals.
   - Keep output concise for PR readability.

4. Harden CI behavior for clean-diff repos.
   - Graceful "no changes" summary mode instead of hard error in selected flows.
   - Preserve fail-open semantics where appropriate.

5. Add one GitHub Actions workflow for mandatory quality gates.
   - Required checks:
     - `pnpm build`
     - `pnpm test`
     - optional `pnpm v2:gate` in pull_request context

6. Add small acceptance fixtures for policy edge cases.
   - protected file block
   - apply threshold block
   - report-only override by CLI

7. Publish a short "5-minute operator guide".
   - Single page:
     - onboarding
     - one dry-run flow
     - one verify flow
     - troubleshooting section

## Release Readiness Summary

Current recommendation:

- Internal rollout: ready
- Early external power users: ready with caution
- Broad production rollout: after next sprint hardening items (CI-required checks + structured reason codes)
