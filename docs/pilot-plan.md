# AutoQA Pilot Plan

## Objective

Run a 7-day pilot that answers four questions with evidence instead of intuition:

1. Does AutoQA become part of the normal maintenance loop?
2. Does it work only on our repos, or does it generalize?
3. Which buyer message lands first: QA, EM, or VP Eng?
4. Is the next sprint about product capability, packaging, or distribution?

## Pilot Shape

- 70% internal repos
- 30% external canary repos
- First week target: 5 to 8 repos total

## Repo Mix

### Internal Pilot Repos

Use 3 to 5 internal surfaces first.

Current local candidates found in this workspace:

1. `QA`
   - Purpose: control repo for AutoQA itself
   - Why it matters: verifies dogfood loop, policy behavior, CI summary, PR summary
   - Limitation: biased because the repo is designed around AutoQA

2. `frontend`
   - Path: `C:\Users\sonfi\Documents\Playground\frontend`
   - Why it matters: real Next.js app with Playwright E2E, multi-browser matrix, retries on CI
   - Signal: `@playwright/test` in `package.json`, `playwright.config.ts`, `retries: process.env.CI ? 2 : 0`

3. `tmp_flowgram`
   - Path: `C:\Users\sonfi\Documents\Playground\tmp_flowgram`
   - Why it matters: separate E2E package with explicit retry and web server wiring
   - Signal: `e2e/fixed-layout/playwright.config.ts`, `retries: 1`

4. `StackMemory` frontend clone
   - Path: `C:\Users\sonfi\Documents\Playground\.tmp-autoqa-github\StackMemory\frontend`
   - Why it matters: product repo surface with Playwright E2E setup
   - Limitation: temp clone; prefer the real working repo checkout if available

### External Canary Repos

Use 2 to 3 external repos only after internal baseline is stable.

Selection rules:

- public repo
- active in last 90 days
- Playwright confirmed
- Actions history available
- not a Playwright framework/tool/template repo
- enough CI/test complexity to produce maintenance pain

## 7-Day Plan

### Day 1 - Lock Repo Pack and Metrics

- choose 3 to 5 internal repos
- choose 2 to 3 external canaries
- create a repo table with:
  - repo
  - owner
  - internal/external
  - Playwright confirmed
  - CI available
  - recent failures seen
  - likely buyer
- lock success metrics before usage starts

### Day 2 - Baseline Existing Maintenance Loop

For each internal repo:

- inspect last 5 to 10 failed or retried runs
- note how test breakage is fixed today
- capture:
  - time to diagnosis
  - time to patch
  - number of reruns/retries
  - whether root cause was clear

### Day 3 - First Real Usage Pass

Run AutoQA on 3 internal repos using the normal maintenance chain:

- `scan`
- `impact`
- `suggest`
- `execute`
- `verify`
- `ci summary`

For each run, record:

- did it pick the right test surface
- did it propose a useful patch
- did verify increase confidence
- where human override was needed

### Day 4 - Habit Test

Force a second use on at least 2 internal repos.

Goal:

- prove this is not just a demo tool

Watch for:

- was AutoQA called again without prompting
- was PR summary actually read
- did a human trust the result enough to act on it

### Day 5 - External Canary Pass

Run 2 to 3 external repos in safe mode first:

- `report_only`
- or summary-only flow

Goal:

- validate generalization
- find repo-specific assumptions
- identify which heuristics break outside our own stack

### Day 6 - Messaging Test

Test three versions of the product story:

- QA: "we reduce Playwright maintenance work"
- EM: "we reduce red PRs and CI rerun waste"
- VP Eng: "we make test debt visible before it slows release velocity"

Use the same evidence, different language.

### Day 7 - Go / No-Go Review

Write one short decision memo:

- what worked
- what failed
- where habit formed
- where trust broke
- what the next sprint must focus on

Allowed outcomes:

- `Go`
- `Pilot Only`
- `Stop / Reframe`

## Success Metrics

### Activation

- AutoQA used end-to-end on at least 3 internal repos

### Habit

- at least 2 repos show second-use behavior in the same week

### Accuracy

- impact/run-plan selected a credible target in most cases

### Trust

- humans used the output to make a real maintenance decision

### Generalization

- at least 1 external repo produced a useful result without repo-specific tuning

## Failure Signals

- only first-run novelty, no repeat usage
- summaries are read but do not change decisions
- suggested fixes are ignored in favor of manual debugging
- external repos mostly expose brittle assumptions
- buyer story only resonates with QA and dies above that level

## Decision Threshold

### Go

- 3 or more internal repos used
- 2 or more repeat uses
- 1 or more external canary successes

### Pilot Only

- internal repos work
- external repos still require too much tuning

### Stop or Reframe

- no repeat usage
- no measurable trust gain
- product is perceived as "nice demo" rather than part of the workflow
