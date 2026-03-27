# AutoQA V1 vs V2

Date: 2026-03-27

## Executive Difference

- V1: useful MCP tooling baseline, mostly stateless and operator-driven.
- V2: production-shaped maintenance copilot with memory, policy, and PR-native execution surface.

## Comparison Table

| Area | V1 | V2 |
|---|---|---|
| Product focus | Tool collection | Narrow MCP maintenance copilot wedge |
| PR integration | Basic summary flows | Marker-based PR comment upsert bot |
| Artifact usage | Limited | Artifact-aware patch logic (`reportDir`, `artifactPaths`) |
| Patch evidence | Minimal | `evidenceUsed` in suggest/verify + report section |
| Memory | None / ad-hoc | Local repo memory with schema and retention caps |
| Safety controls | Confidence-only style checks | Policy engine (allow/deny/protected/thresholds/branch/test budget) |
| Output contract | Mixed fields | Envelope + structured policy output |
| Operator controls | Basic CLI args | Policy mode precedence and threshold overrides |
| Verification flow | Smoke + local checks | Smoke + `v2:gate` milestone command |
| CI behavior | Partial | PR-native dry-run/comment flow integrated |
| Operational docs | Fragmented | Clearer onboarding + release notes + task continuity |

## What V2 Solves That V1 Could Not

1. Repeated break/fix loops are reduced by memory and ranked targeting.
2. Unsafe autopatch behavior is constrained by explicit policy controls.
3. PR value is visible immediately through native summary/comment flows.
4. Teams can reason about "why blocked" with structured policy fields.

## Trade-offs in V2

- More configuration surface (`policy`, memory files, gate command).
- Slightly higher implementation complexity than V1.
- Requires discipline for CI check enforcement to maximize value.

## Practical Positioning

- V1 = prototype tooling baseline.
- V2 = usable product foundation for:
  - internal QA automation teams
  - AI builder / vibe coding maintenance workflows
  - repositories needing safe semi-autonomous test maintenance

## Recommendation

Treat V2 as the operational baseline moving forward.

Keep V1 only as historical context, not as the primary working model.
