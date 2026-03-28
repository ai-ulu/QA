# AutoQA Reason Codes (V3)

Bu dokuman V3 kapsaminda ortak tanilama kontratini tanimlar.

Amac:

- tool ciktilarinda stable, parse-edilebilir reason-code sinyali vermek
- serbest metin nedenleri (human-readable) kodlu sinyallerle eslemek

## Taxonomy

Policy odakli reason code'lar:

- `not_in_allow_list`: target file patch allow list disinda
- `matched_deny_rule`: target file deny rule ile eslesti
- `protected_file`: target file protected-file policy ile eslesti
- `branch_report_only`: legacy branch report-only veya CLI report-only etkisi
- `below_apply_threshold`: confidence apply esiginin altinda
- `below_verify_threshold`: confidence verify esiginin altinda
- `test_budget_capped`: istenen test sayisi policy test butcesini asti
- `automation_mode_blocked`: aktif automation mode ilgili aksiyonu engelledi

Flow/summary odakli reason code'lar:

- `no_changes`: secilen diff kapsaminda degisiklik yok
- `no_patch_suggestion`: diff'ten otomatik patch onerisi cikmadi
- `no_affected_tests`: affected test cikarimi yok, manual QA review gerekli

## Safety Modes (WS4)

Repo config:

- `policy.automation.mode`: `report_only | suggest_only | guarded_apply | auto_apply`
- `policy.automation.branchOverrides`: branch pattern bazli mode override

Trace alanlari:

- `policy.automationMode`
- `policy.automationSource`
- `policy.automationPattern` (varsa)

Beklenen davranis:

- `report_only`: patch apply ve run/verify execution bloklanir
- `suggest_only`: patch apply ve run/verify execution bloklanir
- `guarded_apply`: normal policy threshold + protected-file kurallariyla calisir
- `auto_apply`: apply istegi verilmemis olsa da patch apply denemesi yapar, ama protected-file ve threshold kurallarini asamaz

## Output Contract

V3 itibariyla:

- `autoqa_suggest_patch`, `autoqa_execute_run_plan`, `autoqa_verify_patch`:
  - `blockedReasonCodes` alanini policy reason-code seti ile doner
  - `policy` altinda automation trace alanlarini doner
- `autoqa_targeted_run_plan`:
  - `warningCodes` alanini flow reason-code seti ile doner
- `autoqa_ci_summary`:
  - `reasonCodes` alanini doner
  - `memorySummary.confidenceHint` ve `memorySummary.confidenceExplanation` alanlarini doner
  - `metricsSummary` alaninda accept/verify/re-break/skipped oranlarini doner
  - `status: "no_changes"` durumunda en az `["no_changes"]` beklenir

Not:

- `blockedReasons` ve `warnings` gibi serbest metin alanlari backward compatibility icin korunur.
- Kodlar makine-tuketimi icin primary sinyaldir, metinler operator okunabilirligi icindir.
