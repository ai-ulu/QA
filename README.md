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

## Scope

This is no longer a general QA platform or SaaS monorepo.

It is a narrow MCP-first maintenance copilot. The primary flow is now `scan -> impact -> suggest/apply -> execute -> verify -> ci summary`.
