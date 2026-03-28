# AutoQA MCP Server

Local-first MCP server for change-aware Playwright maintenance.

## Commands

```bash
pnpm build
pnpm test
pnpm start
pnpm run onboard:mcp
pnpm run pr:comment -- --repo . --dry-run
pnpm run memory:inspect
pnpm run memory:reset
pnpm run v2:gate
pnpm run ci:impact
pnpm run dogfood -- --limit 1
pnpm run dogfood -- --soft-fail
```

## Core Tools

- `autoqa_scan_repo`
- `autoqa_patch_file`
- `autoqa_suggest_patch`
- `autoqa_impact_analysis`
- `autoqa_targeted_run_plan`
- `autoqa_execute_run_plan`
- `autoqa_verify_patch`
- `autoqa_pr_summary`
- `autoqa_ci_summary`

Primary flow: `scan -> impact -> suggest/apply -> execute -> verify -> ci summary`.

PR bot helper:

- `pnpm run pr:comment -- --repo . --pr <number>`
- `pnpm run pr:comment -- --repo . --dry-run`
- `pnpm run pr:comment -- --repo . --report-only`

`autoqa_ci_summary` in `github` mode now emits marker blocks for stable comment upsert:

- `<!-- autoqa:pr-comment:v1 -->`
- `<!-- autoqa:pr-comment:block:start -->`
- `<!-- autoqa:pr-comment:block:end -->`

Artifact-aware inputs:

- `autoqa_suggest_patch` and `autoqa_verify_patch` support:
  - `reportDir` (for example `test-results` or `playwright-report`)
  - `artifactPaths` (explicit paths like `test-results/login/error-context.md`)
- Parsed artifact signals are returned in `evidenceUsed` and included in verification reports under `Evidence used`.

Local repo memory:

- `verify_patch` writes local state to `.autoqa/state/memory.json`.
- `execute_run_plan` and `verify_patch` write local metrics to `.autoqa/state/metrics.json`.
- `pnpm run memory:inspect` prints summary + full JSON payload.
- `pnpm run memory:reset` deletes local memory (force-enabled in package script).
- Memory now tracks pattern-level stats under `patternStats` for acceptance/re-break learning loops.
- Current retention caps:
  - `recentFailures`: 50
  - `acceptedPatches`: 80
  - `rejectedPatches`: 80
  - `selectorHistory`: 120
  - `routeHistory`: 120

Policy config (`autoqa.config.json`):

```json
{
  "policy": {
    "patchAllow": ["tests/**", "qa-tests/**"],
    "patchDeny": ["tests/legacy/**"],
    "protectedFiles": ["src/auth/**", "src/billing/**"],
    "confidenceThresholds": {
      "suggest": 0.55,
      "apply": 0.85,
      "verify": 0.6
    },
    "branch": {
      "reportOnly": ["main", "release/*"]
    },
    "testBudget": {
      "maxTests": 3
    },
    "automation": {
      "mode": "guarded_apply",
      "branchOverrides": [
        { "pattern": "release/*", "mode": "report_only" }
      ]
    }
  }
}
```

Behavior:

- `apply: true` olsa bile policy block varsa patch dry-run kalir.
- `autoqa_verify_patch` ve `autoqa_execute_run_plan`, `testBudget.maxTests` limitini uygular.
- Policy block nedenleri patch `reason` veya verify `stderr` icinde acikca doner.
- `autoqa_suggest_patch` ciktilarinda `blockedReasons` listesi yer alir.
- `autoqa_suggest_patch` ciktilarinda `policy` objesi de doner:
  - `mode`
  - `source`
  - `automationMode`
  - `automationSource`
  - `automationPattern`
  - `applyThreshold`
  - `shouldApply`
  - `blockedReasons`
  - `blockedReasonCodes`
- Safety mode davranisi:
  - `report_only`: patch apply ve run/verify execution bloklanir
  - `suggest_only`: patch apply ve run/verify execution bloklanir
  - `guarded_apply`: policy threshold + protected file kurallariyla calisir
  - `auto_apply`: apply istemi verilmemisse bile apply dener, ama threshold/protected kurallarini asamaz
- CLI override:
  - `policyMode: "report_only"` -> repo config ne olursa olsun apply kapatilir.
  - `policyMode: "enforce"` -> policy kurallari zorunlu uygulanir.
  - `policyMode: "auto"` -> varsayilan repo policy davranisi.

Clean diff handling:

- `autoqa_ci_summary` selected flows now return `status: "no_changes"` instead of hard fail when the selected diff scope is empty.
- `autoqa_ci_summary` includes memory confidence hints (`confidenceHint`, `confidenceExplanation`) when memory state is available.
- `autoqa_ci_summary` includes metrics summary ratios when local metrics samples exist.
- V3 WS1 reason-code contract:
  - `blockedReasonCodes` for `suggest`, `execute`, `verify`
  - `warningCodes` for `targeted_run_plan`
  - `reasonCodes` for `ci_summary`

Operator guide:

- See [docs/operator-guide.md](../../docs/operator-guide.md)
- See [docs/reason-codes.md](../../docs/reason-codes.md)

V2 milestone gate:

- `pnpm run v2:gate`
- Steps:
  - build
  - test (includes smoke)
  - `ci-impact` github summary generation
  - `pr-bot` dry-run summary generation

GitHub Actions:

- Required quality gates workflow is available at `.github/workflows/autoqa-quality-gates.yml`.

Onboarding shortcut:

```bash
pnpm run onboard:mcp
```

This writes MCP config for Codex, VS Code, Cursor, and Claude Desktop. Add `-- --dry-run` to preview.

## Release Gate

Run this before publishing:

```bash
pnpm run release:check
```

`pnpm run dogfood` cleans cloned repositories under `.dogfood/` by default. Pass `--keep-clones` only when you want to inspect a cloned repo after the run.

Dogfood reports:

- Markdown report: `packages/mcp-server/reports/autoqa-dogfood-latest.md`
- JSON report: `packages/mcp-server/reports/autoqa-dogfood-latest.json`
- Per-repo failures are emitted as structured reason codes (`clone_failed`, `ci_impact_failed`, vb.) instead of hard-crashing the entire run.
- Nightly workflow also publishes the latest markdown and JSON reports as GitHub release assets.

`pnpm run ci:impact` prefers merge-base diff analysis and falls back to working tree analysis when the current branch has no committed diff to compare.
