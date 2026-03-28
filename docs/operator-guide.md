# AutoQA 5-Minute Operator Guide

## 1. Install and build

```bash
pnpm install
pnpm build
```

## 2. Run the local smoke gate

```bash
pnpm test
pnpm v2:gate
```

What this proves:

- MCP server builds
- smoke fixture passes
- CI summary generation works
- PR bot dry-run works

## 3. Inspect a repository

```bash
pnpm --filter @autoqa/mcp-server run ci:impact -- --repo C:\path\to\repo --working-tree --format github
```

Use this when:

- you want a PR-style summary without writing anything
- the repo has unstaged local changes

## 4. Generate a PR comment dry-run

```bash
pnpm --filter @autoqa/mcp-server run pr:comment -- --repo C:\path\to\repo --working-tree --dry-run
```

Use this when:

- you want the exact comment body before GitHub upsert
- you are validating marker output or CI behavior

## 5. Use patch + verify flow

```bash
pnpm start
```

Then from an MCP client call:

- `autoqa_suggest_patch`
- `autoqa_verify_patch`

Useful inputs:

- `reportDir`
- `artifactPaths`
- `policyMode`
- `applyThresholdOverride`
- `verifyThresholdOverride`

Repo-level safety mode controls (`autoqa.config.json`):

- `policy.automation.mode`: `report_only | suggest_only | guarded_apply | auto_apply`
- `policy.automation.branchOverrides`: branch pattern bazli mode override

## 6. Inspect local repo memory

```bash
pnpm memory:inspect
pnpm memory:reset
```

Memory location:

- `.autoqa/state/memory.json`
- `.autoqa/state/metrics.json`

## 7. Troubleshooting

- No changes found:
  - `autoqa_ci_summary` now returns a graceful `no_changes` summary in selected flows.
- Patch blocked:
  - inspect `policy.blockedReasons` and `policy.blockedReasonCodes`.
- Unexpected dry-run:
  - check `policy.source` to see whether the decision came from CLI override, repo config, or defaults.
- Execution skipped unexpectedly:
  - inspect `policy.automationMode`, `policy.automationSource`, and `policy.automationPattern`.
- CI summary metrics block bos geliyorsa:
  - once `autoqa_execute_run_plan` veya `autoqa_verify_patch` calistirip metrics sample uret.

## 8. Run Dogfood Pack

```bash
pnpm dogfood -- --limit 3
pnpm dogfood -- --soft-fail
```

Nightly CI workflow:

- `.github/workflows/autoqa-dogfood-nightly.yml`
- artifactlar:
  - `packages/mcp-server/reports/autoqa-dogfood-latest.md`
  - `packages/mcp-server/reports/autoqa-dogfood-latest.json`
