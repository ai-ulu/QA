# AutoQA MCP Server

Local-first MCP server for change-aware Playwright maintenance.

## Commands

```bash
pnpm build
pnpm test
pnpm start
pnpm run ci:impact
pnpm run dogfood -- --limit 1
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

## Release Gate

Run this before publishing:

```bash
pnpm run release:check

`pnpm run dogfood` cleans cloned repositories under `.dogfood/` by default. Pass `--keep-clones` only when you want to inspect a cloned repo after the run.

`pnpm run ci:impact` prefers merge-base diff analysis and falls back to working tree analysis when the current branch has no committed diff to compare.
```
