# AutoQA MCP

This repository now evaluates one product only:

- a local MCP server
- for AI coding clients
- that can scan repos, read code diffs, analyze change impact, suggest safe patches, execute targeted Playwright runs, verify patches, and produce CI summaries

Everything outside the MCP path has been removed on purpose.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm onboard:mcp
pnpm pr:comment -- --repo . --dry-run
pnpm memory:inspect
pnpm memory:reset
pnpm v2:gate
pnpm ci:impact
pnpm release:check
pnpm dogfood
pnpm start
node packages/mcp-server/scripts/ci-impact.mjs --repo . --auto-base --format github
```

`pnpm test` runs an MCP smoke test that verifies:

- server startup over stdio
- tool discovery
- repository scanning
- change impact analysis
- automatic merge-base analysis for the current branch
- semantic git diff analysis for selector and text renames
- working tree analysis before commit, including staged and unstaged changes
- untracked file analysis in working tree mode
- git diff based PR summary generation
- CI-friendly QA summaries
- a ready-to-copy GitHub Actions workflow at `.github/workflows/autoqa-impact.yml`
- targeted run planning
- diff-aware patch suggestion
- confidence levels and patch apply gating
- patch rollback payloads
- repo-level `.autoqaignore` and `autoqa.config.json` support
- safe file patching with dry-run diff previews
- targeted Playwright run execution
- patch verification reports
- onboarding docs for Codex, Cursor, and Claude Desktop
- dogfood report across 3 real Playwright repos

`pnpm dogfood` now treats `.dogfood/` as a temporary workspace and cleans cloned repos by default. Use `--keep-clones` only when you need to inspect a cloned target after the run.

`pnpm ci:impact` prefers branch diff analysis with `--auto-base`. If there is no committed diff to compare, it falls back to working tree analysis instead of failing with a parse error.

`pnpm onboard:mcp` performs one-command local onboarding and writes MCP config for Codex, VS Code, Cursor, and Claude Desktop. Use `--dry-run` to preview.

## MCP Surface

Primary tools:

- `autoqa_scan_repo`
- `autoqa_impact_analysis`
- `autoqa_suggest_patch`
- `autoqa_patch_file`
- `autoqa_targeted_run_plan`
- `autoqa_execute_run_plan`
- `autoqa_verify_patch`
- `autoqa_pr_summary`
- `autoqa_ci_summary`

PR comment helper:

- `pnpm pr:comment -- --repo . --pr <number>`
- `pnpm pr:comment -- --repo . --dry-run`
- `pnpm pr:comment -- --repo . --report-only`

Artifact-aware patching:

- `autoqa_suggest_patch` ve `autoqa_verify_patch` artik `reportDir` ve `artifactPaths` argumanlarini kabul eder.
- Ornek:
  - `reportDir`: `test-results` veya `playwright-report` altindaki hata ciktilari
  - `artifactPaths`: tekil dosya yollari (or. `test-results/login/error-context.md`)
- Bu girdilerden cikan sinyaller `evidenceUsed` alaninda doner ve patch confidence hesaplamasina etki eder.

Repo memory:

- `autoqa_verify_patch` her calisma sonunda `.autoqa/state/memory.json` dosyasini gunceller.
- `pnpm memory:inspect` ile memory ozetini inceleyebilirsin.
- `pnpm memory:reset` ile local memory dosyasini sifirlayabilirsin.
- Dosya local state oldugu icin `.gitignore` icinde tutulur.

Policy engine (`autoqa.config.json`):

- `policy.patchAllow`, `policy.patchDeny`, `policy.protectedFiles`
- `policy.confidenceThresholds.suggest|apply|verify`
- `policy.branch.reportOnly` (or: `main`, `release/*`)
- `policy.testBudget.maxTests`

Policy aktifken:

- `apply: true` olsa bile block varsa patch apply edilmez, dry-run doner.
- `verify_patch` ve `execute_run_plan` test secimini policy test butcesi ile sinirlar.
- Block nedeni ciktiya acik metin olarak yazilir (`Blocked by policy`).
- `autoqa_suggest_patch` sonucu `blockedReasons` alanini da verir.
- `autoqa_suggest_patch` sonucu ayrica structured `policy` alani verir (`mode`, `applyThreshold`, `shouldApply`, `blockedReasons`).
- CLI override ile `policyMode: report_only|enforce|auto` secilebilir.

## Scope

This is no longer a general QA platform or SaaS monorepo.

It is a narrow MCP-first maintenance copilot. The primary flow is now `scan -> impact -> suggest/apply -> execute -> verify -> ci summary`.
