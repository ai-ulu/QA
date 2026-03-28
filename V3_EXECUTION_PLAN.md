# AutoQA V3 Execution Plan

Date: 2026-03-28
Owner: AutoQA core
Horizon: 2 weeks

## Objective

Move AutoQA from "working and hardened" to "measurably better and easier to adopt" by shipping:

- standardized diagnostics across tool outputs
- memory-driven quality signals
- safer automation modes
- baseline analytics for value proof

## Success Criteria

V3 is complete when all conditions hold:

1. Reason codes are consistent across `suggest`, `execute`, `verify`, and CI summary outputs.
2. `policy` decisions include precedence source and are visible in all execution outcomes.
3. CI and PR summary include compact memory + outcome analytics signals.
4. Safety modes are enforceable from config with deterministic behavior.
5. Real repo pack validation runs on at least 10 public Playwright repos.

## Non-goals

- Playwright-disi framework expansion
- hosted multi-tenant backend
- full BI dashboard product

## Scope by Workstream

### WS1 - Output Contract Unification

Deliverables:

- Add shared `reasonCode` taxonomy and mapping layer.
- Add `decisionSource` in all policy-enforced actions.
- Return structured block metadata for all no-op and skipped paths.

Acceptance:

- No tool emits free-text-only block reasons without reason codes.
- Smoke tests assert reason code presence for all blocked flows.

### WS2 - Learning Loop from Memory

Deliverables:

- Track patch acceptance and re-break rates by pattern.
- Weight ranking using recent success/failure pattern performance.
- Add memory confidence hints to summaries.

Acceptance:

- Same fixture run twice shows improved ranking or explicit confidence signal.
- Memory corruption fallback behavior remains fail-safe.

### WS3 - Outcome Analytics (Lightweight)

Deliverables:

- Local metrics file under `.autoqa/state/metrics.json`.
- Metrics summary in CI output:
  - accepted suggestion rate
  - verify pass rate
  - re-break rate
  - skipped-by-policy ratio

Acceptance:

- Metrics are updated after verify and run-plan execution.
- CI summary shows metrics block when available, degrades cleanly when empty.

### WS4 - Safety Modes

Deliverables:

- Config-level automation mode:
  - `report_only`
  - `suggest_only`
  - `guarded_apply`
  - `auto_apply`
- Branch-aware mode override with explicit trace in outputs.

Acceptance:

- Mode behavior is deterministic in fixture tests.
- `auto_apply` never bypasses protected file and threshold rules.

### WS5 - Real Repo Pack

Deliverables:

- Curated repo list (`dogfood.repos.json`) expanded to >= 10 repos.
- Nightly workflow for dogfood smoke run and report artifact upload.

Acceptance:

- Nightly job exits green or reports structured failure without hard crash.
- Results include per-repo status and top failure reason codes.

## Sprint Timeline (2 Weeks)

### Week 1

1. Day 1-2: WS1 contract unification + tests
2. Day 3-4: WS4 safety modes + config schema updates
3. Day 5: WS2 first-pass learning loop

### Week 2

1. Day 1-2: WS3 analytics + CI/PR summary integration
2. Day 3-4: WS5 real repo pack + nightly workflow
3. Day 5: hardening, docs refresh, final gate

## Verification Plan

Required local checks:

- `pnpm build`
- `pnpm test`
- `pnpm v2:gate`

Additional V3 checks:

- dogfood run with expanded repo set
- policy-mode matrix smoke run
- memory/metrics fallback corruption test

## Deliverables Checklist

- [x] reason code taxonomy documented
- [x] output contract updated in tool docs
- [x] safety modes implemented and tested
- [x] metrics file + summary output integrated
- [x] nightly dogfood workflow added
- [x] operator guide updated with V3 controls

## Rollout Strategy

1. Internal canary on 2 repos for 48 hours.
2. Controlled rollout to 5 external-friendly repos.
3. Default enable for all MCP-first Playwright repos after stable canary.

## Risks and Mitigations

Risk: reason code drift between tools.
Mitigation: shared constants + fixture assertions on all outputs.

Risk: metrics noise from small sample sizes.
Mitigation: surface sample counts beside each metric.

Risk: real repo pack false negatives.
Mitigation: classify failures with stable reason codes, not binary pass/fail only.
