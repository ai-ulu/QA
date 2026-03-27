# AutoQA Current Status and Next Sprint

Date: 2026-03-28

## Current Status

AutoQA V2 is now in a hardened, rollout-capable state for MCP-first Playwright maintenance workflows.

Shipped and merged:

- PR-native QA reporting with stable marker-based comment upsert.
- Artifact-aware patch suggestion and verification (`reportDir`, `artifactPaths`, `evidenceUsed`).
- Repo-local memory layer with inspect/reset utilities.
- Policy engine with safe-by-default controls:
  - patch allow/deny/protected patterns
  - confidence thresholds
  - branch `report_only`
  - test budget limits
- Structured policy diagnostics:
  - `policy.source`
  - `blockedReasonCodes`
  - `blockedReasons`
- Graceful clean-diff handling in selected CI flows via `status: "no_changes"`.
- Required quality-gate workflow for GitHub Actions.
- 5-minute operator guide.

Operational status:

- `pnpm build` is green.
- `pnpm test` is green.
- `pnpm v2:gate` is green.
- PR dry-run flow validated against a real external repo clone.

## Release Readiness Summary

Current recommendation:

- Internal rollout: ready
- Early external power users: ready
- Broad rollout for MCP-first Playwright repos: ready

Residual risk:

- Real-world repo diversity can still expose new heuristics gaps.
- The product is intentionally narrow; teams outside the Playwright/MCP wedge will not get the same value.

## Next Sprint

Goal:
Shift from hardening to adoption and signal quality.

1. Add stable reason codes outside policy-only surfaces where useful.
2. Improve memory-derived hints in CI comment output.
3. Add more repo fixtures from real-world layouts.
4. Add lightweight adoption docs/examples for AI builders and QA operators.
5. Monitor first real repos and tighten heuristics from observed failures.
