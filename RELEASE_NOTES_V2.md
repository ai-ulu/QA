# AutoQA V2 Release Notes

Date: 2026-03-27

## What shipped

- PR-native QA bot with stable marker-based comment upsert (`autoqa-pr-bot`).
- Artifact-aware patch suggestion and verification flow (`reportDir`, `artifactPaths`, `evidenceUsed`).
- Repo-local memory layer at `.autoqa/state/memory.json`.
- Policy engine for safe automation (`allow/deny/protected`, confidence thresholds, branch report-only, test budget).
- Structured policy output in patch suggestions (`policy.mode`, `policy.applyThreshold`, `policy.shouldApply`, `policy.blockedReasons`).
- Memory utility commands:
  - `pnpm memory:inspect`
  - `pnpm memory:reset`
- Milestone gate command:
  - `pnpm v2:gate`

## Verification completed

- `pnpm test` passed
- `pnpm build` passed
- `pnpm run v2:gate` passed
- Live dry-run validated on `ai-ulu/StackMemory` clone:
  - `ci-impact` (working tree mode)
  - `pr-bot --dry-run`

## Notes

- Local memory state is ignored by git: `.autoqa/state/`.
- Policy precedence supports CLI override via `policyMode` (`auto`, `report_only`, `enforce`).
