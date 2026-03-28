# Pilot Sourcing And Messaging

## Why Pilot List Generation Must Be Targeted

Do not start with random outreach.

The opening message should look like:

- "We saw Playwright in your repo."
- "Your CI/test surface looks active."
- "We think you have maintenance debt or rerun noise in this area."
- "We built a tool that diagnoses impact and proposes safe fixes."

That means the list must come from repo signals first, not generic lead lists.

## Two-Stage Sourcing Model

### Stage 1 - Repo Signal

Use GitHub to build a 30 to 50 repo candidate pool.

Required signals:

- Playwright exists
- repo active in last 90 days
- Actions history available
- recent failures/cancelled/timed_out runs exist
- repo is a real application or product, not a framework/tool/template

Useful signals:

- retries configured in Playwright
- multi-browser matrix
- PR workflows with test jobs
- open issues mentioning flaky tests, retries, or CI pain

### Stage 2 - Team And Buyer Enrichment

GitHub alone is not enough for buyer fit.

Validate manually:

- likely team size
- whether QA / automation exists
- whether the likely entry point is QA lead, EM, or founder/CTO
- whether the repo owner looks reachable

## Internal Repo Prioritization

Internal pilot order should be:

1. one repo that is already close to AutoQA
2. one real app repo with Playwright and CI retries
3. one repo with a separate E2E package
4. one repo that is messy or flaky

The goal is not "best demo." The goal is to test different failure surfaces.

## Buyer Messaging Matrix

### QA Engineer

Primary pain:

- broken tests
- selector drift
- fixture drift
- route and text changes

Message:

- "AutoQA shortens the loop from failing Playwright test to verified fix."

What they need to see:

- useful patch proposal
- fewer blind reruns
- faster diagnosis

### Engineering Manager

Primary pain:

- red PRs
- wasted CI cycles
- maintenance drag on delivery

Message:

- "AutoQA reduces red PRs and CI rerun waste by making Playwright breakage diagnosable and fixable earlier."

What they need to see:

- PR summary visibility
- fewer noisy failures
- measurable maintenance reduction

### VP Engineering

Primary pain:

- release velocity drag
- invisible test debt
- quality cost without clear reporting

Message:

- "AutoQA makes test debt visible and reduces maintenance drag that slows release velocity."

What they need to see:

- trend reporting
- nightly signal
- repeat usage across repos

## Outreach Qualification Questions

Before outreach, answer these for each target:

1. Is this a real application repo using Playwright, not a tooling repo?
2. Is there CI evidence that tests actually fail or churn?
3. Is there a likely human owner reachable through GitHub, company page, or social profile?
4. If the repo adopted AutoQA, would the result be visible in PRs or CI?

If any answer is "no", it is not a first-wave pilot target.

## GitHub-Native Distribution Wedge

The fastest distribution path is not "download our MCP server."

It is:

- visible GitHub Action
- visible PR comment/summary
- safe report-only mode
- easy install in one workflow file

If AutoQA appears directly in PRs, teams notice it without a separate sales motion.

## Platform Risk Framing

Assume Microsoft can improve native Playwright assistance over time.

The defensible wedge is not:

- test generation
- browser control

The defensible wedge is:

- preserving and recovering existing Playwright suites
- repo-aware diagnosis
- CI-visible maintenance loop
- repeat usage inside team workflow

The most important pilot question is not "did they like it once?"

It is:

- "did it become part of how they resolve Playwright breakage?"
