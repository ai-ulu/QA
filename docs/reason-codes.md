# AutoQA Reason Codes (V3 WS1)

Bu dokuman, V3 kapsaminda ortak tanilama kontratini tanimlar.

Amaç:

- tool ciktilarinda stable, parse-edilebilir reason-code sinyali vermek
- serbest metin nedenleri (human-readable) kodlu sinyallerle eslemek

## Taxonomy

Policy odakli reason code'lar:

- `not_in_allow_list`: target file patch allow list disinda
- `matched_deny_rule`: target file deny rule ile eslesti
- `protected_file`: target file protected-file policy ile eslesti
- `branch_report_only`: branch veya CLI policy mode apply'i report-only'e cekti
- `below_apply_threshold`: confidence apply esiginin altinda
- `below_verify_threshold`: confidence verify esiginin altinda
- `test_budget_capped`: istenen test sayisi policy test butcesini asti

Flow/summary odakli reason code'lar:

- `no_changes`: secilen diff kapsaminda degisiklik yok
- `no_patch_suggestion`: diff'ten otomatik patch onerisi cikmadi
- `no_affected_tests`: affected test cikarimi yok, manual QA review gerekli

## Output Contract

V3 WS1 itibariyla:

- `autoqa_suggest_patch`, `autoqa_execute_run_plan`, `autoqa_verify_patch`:
  - `blockedReasonCodes` alanini policy reason-code seti ile doner
- `autoqa_targeted_run_plan`:
  - `warningCodes` alanini flow reason-code seti ile doner
- `autoqa_ci_summary`:
  - `reasonCodes` alanini doner
  - `status: "no_changes"` durumunda en az `["no_changes"]` beklenir

Not:

- `blockedReasons` ve `warnings` gibi serbest metin alanlari backward compatibility icin korunur.
- Kodlar makine-tuketimi icin primary sinyaldir, metinler operator okunabilirligi icindir.
