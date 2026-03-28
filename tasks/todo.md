# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `V3_EXECUTION_PLAN.md`
- `CURRENT_STATUS_AND_NEXT_SPRINT.md`

## Current Focus

V3 WS4 - Safety Modes (config + branch override + explicit trace)

## Spec

Hedef:
Config seviyesinden enforce edilen safety mode davranisi eklemek:
`report_only`, `suggest_only`, `guarded_apply`, `auto_apply`.

Basari kosulu:

- safety mode ayari `autoqa.config.json` icinden calisiyor
- branch pattern bazli override deterministic calisiyor
- `suggest`, `execute`, `verify` ciktilarinda automation trace gorunuyor
- `auto_apply` protected-file ve threshold kurallarini bypass etmiyor
- smoke test mode matrisini assert ediyor

## Plan

1. `[x]` Policy modeline `automation.mode` ve `automation.branchOverrides` ekle.
2. `[x]` `suggest_patch` akisina safety mode uygulamasi ve automation trace ekle.
3. `[x]` `execute_run_plan` ve `verify_patch` akislarinda mode bloklama ve trace'i uygula.
4. `[x]` Smoke fixture'da `suggest_only`, `auto_apply`, branch override ve bypass guard assertlerini ekle.
5. `[x]` Reason-code/operator dokumanlarini safety mode bilgisiyle guncelle.
6. `[x]` `pnpm build`, `pnpm test`, `pnpm run v2:gate` ile dogrula.

## Verification

- Calistirilacak:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`
- Beklenen kanit:
  - `suggest_only` modunda apply ve run execution bloklanmasi
  - `auto_apply` modunda apply denemesi + protected/threshold guard'larin calismasi
  - payload `policy.automationMode|automationSource|automationPattern` alanlari
  - build + smoke + gate komutlarinin yesil cikmasi
- Gecen komutlar:
  - `pnpm build`
  - `pnpm test`
  - `pnpm run v2:gate`

## Review

Durum:

- V2 hardening tamamlandi (onceki sprint).
- V3 WS1 tamamlandi.
- V3 WS4 implementation tamamlandi ve dogrulandi.
