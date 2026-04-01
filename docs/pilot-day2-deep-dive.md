# Pilot Day 2 Deep Dive

Date: 2026-04-01

Goal:

- Deepen Day 2 baseline with concrete failure/retry samples
- Classify observed non-success runs as:
  - `infra_or_workflow_startup`
  - `test_maintenance_or_test_runtime`
  - `policy_or_permission_gate`

Internal scope:

- `QA` -> `ai-ulu/QA`
- `frontend` -> `ai-ulu/StackMemory`
- `tmp_flowgram` -> `bytedance/flowgram.ai`

## Sample Set

| Workspace | Repo | Non-success samples reviewed | Window |
| --- | --- | --- | --- |
| `QA` | `ai-ulu/QA` | 10 | recent non-success runs |
| `frontend` | `ai-ulu/StackMemory` | 10 | recent non-success runs |
| `tmp_flowgram` | `bytedance/flowgram.ai` | 10 | recent non-success runs |

## Observed Patterns

### 1) QA (`ai-ulu/QA`)

Representative runs:

- `23696255698` `AutoQA Quality Gates` -> `startup_failure`
- `23696254800` `AutoQA Quality Gates` -> `startup_failure`
- `23696254739` `AutoQA Impact` -> `startup_failure`
- `23696254681` `AutoQA PR Bot` -> `startup_failure`

Classification:

- Primary class: `infra_or_workflow_startup`
- Reasoning: repeated startup failures across multiple workflows and events, with no stable job-level execution evidence for those runs.

### 2) frontend (`ai-ulu/StackMemory`)

Representative runs:

- `22830277534` `Deploy to Production` -> `startup_failure`
- `22208581114` `.github/workflows/ci.yml` -> `failure`
- `21923962182` `CI` -> `startup_failure`
- `21923961971` `Deploy to Production` -> `startup_failure`

Classification:

- Primary class: `infra_or_workflow_startup`
- Secondary class: `test_or_ci_failure`
- Reasoning: dominant startup failures with one explicit workflow failure; baseline is too unstable to attribute most pain to test maintenance yet.

### 3) tmp_flowgram (`bytedance/flowgram.ai`)

Representative runs:

- `22748555597` `E2E Tests` -> `failure` (job `e2e` failed)
- `22748555661` `CI` -> `failure`
- `23328635222` `E2E Tests` -> `action_required`
- `23328635212` `PR Common Checks` -> `action_required`
- `23328635484` `Running Copilot coding agent` -> `cancelled`

Classification:

- Primary class: `test_maintenance_or_test_runtime`
- Secondary class: `policy_or_permission_gate`
- Reasoning: explicit E2E job failure confirms test/runtime pain; action-required runs indicate policy/permission gate noise.

## Pilot Implications

1. `QA` and `frontend` should be treated as startup-stability stress cases first, then test-maintenance cases.
2. `tmp_flowgram` is the best immediate signal repo for Day 3 end-to-end maintenance loop validation (`scan -> impact -> suggest -> execute -> verify`).
3. Day 3 success criteria should be split:
   - Reliability lane: can AutoQA still produce useful summaries when CI startup is unstable?
   - Maintenance lane: can AutoQA reduce diagnosis-to-fix time on real E2E failure flows?

## Action For Day 3

1. Run one full maintenance loop on `tmp_flowgram` from a real E2E break/fix candidate.
2. Run one report-only loop on `QA` and one on `frontend` to measure signal quality under startup instability.
3. Log each run using the template in `docs/pilot-templates.md`.

## Evidence Commands

```powershell
$d=gh api repos/ai-ulu/QA/actions/runs?per_page=100 | ConvertFrom-Json
$d.workflow_runs | Where-Object { $_.conclusion -ne 'success' -and $_.conclusion -ne 'skipped' } |
  Select-Object -First 12 id,name,conclusion,event,head_branch,created_at,html_url
```

```powershell
$d=gh api repos/ai-ulu/StackMemory/actions/runs?per_page=100 | ConvertFrom-Json
$d.workflow_runs | Where-Object { $_.conclusion -ne 'success' -and $_.conclusion -ne 'skipped' } |
  Select-Object -First 12 id,name,conclusion,event,head_branch,created_at,html_url
```

```powershell
$d=gh api repos/bytedance/flowgram.ai/actions/runs?per_page=100 | ConvertFrom-Json
$d.workflow_runs | Where-Object { $_.conclusion -ne 'success' -and $_.conclusion -ne 'skipped' } |
  Select-Object -First 12 id,name,conclusion,event,head_branch,created_at,html_url
```
