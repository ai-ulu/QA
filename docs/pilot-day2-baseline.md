# Pilot Day 2 Baseline

Date: 2026-04-01

Scope:

- Internal pilot repos only (`QA`, `frontend`, `tmp_flowgram`)
- First-pass CI baseline from last 20 workflow runs on each mapped remote

Method:

- Read repo remotes for selected internal workspaces
- Pull latest workflow runs with GitHub API
- Group by `conclusion` to create an initial failure/churn signal

## Repo Mapping

| Internal Workspace | Remote Repo |
| --- | --- |
| `QA` | `ai-ulu/QA` |
| `frontend` | `ai-ulu/StackMemory` |
| `tmp_flowgram` | `bytedance/flowgram.ai` |

## Baseline Snapshot (Last 20 Runs)

| Repo | Success | Failure | Startup Failure | Action Required | Cancelled | Signal |
| --- | --- | --- | --- | --- | --- | --- |
| `ai-ulu/QA` | 7 | 0 | 13 | 0 | 0 | Infrastructure/workflow startup instability dominates |
| `ai-ulu/StackMemory` | 0 | 1 | 19 | 0 | 0 | Strong startup failure pattern, very high CI fragility |
| `bytedance/flowgram.ai` | 16 | 0 | 0 | 3 | 1 | Mostly healthy; limited churn from policy/permission gates |

## What This Means For Pilot

1. `QA` and `frontend` already have clear maintenance pain signals through repeated `startup_failure`.
2. `tmp_flowgram` is useful as a relatively stable contrast case in the same pilot week.
3. Day 3 runs should prioritize:
   - `QA`: verify if AutoQA output remains actionable under startup-failure-heavy CI.
   - `frontend`: isolate whether failures are infra-only or test-maintenance-coupled.
   - `tmp_flowgram`: validate precision on a repo with healthier CI baseline.

## Evidence Commands

```powershell
git -C C:\Users\sonfi\Documents\Playground\QA remote -v
git -C C:\Users\sonfi\Documents\Playground\frontend remote -v
git -C C:\Users\sonfi\Documents\Playground\tmp_flowgram remote -v
```

```powershell
$d=gh api repos/ai-ulu/QA/actions/runs?per_page=20 | ConvertFrom-Json
$d.workflow_runs | Group-Object conclusion | Sort-Object Count -Descending
```

```powershell
$d=gh api repos/ai-ulu/StackMemory/actions/runs?per_page=20 | ConvertFrom-Json
$d.workflow_runs | Group-Object conclusion | Sort-Object Count -Descending
```

```powershell
$d=gh api repos/bytedance/flowgram.ai/actions/runs?per_page=20 | ConvertFrom-Json
$d.workflow_runs | Group-Object conclusion | Sort-Object Count -Descending
```
