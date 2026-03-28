# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `V3_EXECUTION_PLAN.md`
- `CURRENT_STATUS_AND_NEXT_SPRINT.md`

## Current Focus

V3 kickoff - WS1 Output Contract Unification

## Spec

Hedef:
`suggest`, `execute`, `verify` ve `ci_summary` ciktilarinda ortak reason-code sinyali ile daha deterministik tanilama yuzeyi olusturmak.

Basari kosulu:

- ortak reason-code taksonomisi tanimli ve dokumante
- `ci_summary` no-change ve warning durumlarini kodlu sekilde raporluyor
- mevcut policy reason-code kontrati korunuyor (geriye donuk uyumluluk)
- smoke test reason-code varligini assert ediyor

## Plan

1. `[x]` Ortak reason-code taksonomisini kod seviyesinde tanimla.
2. `[x]` `targeted_run_plan` warning sinyallerine reason code ekle.
3. `[x]` `ci_summary` sonucuna reason code alanini ekle (`no_changes` + warningler).
4. `[x]` Smoke testleri reason-code assertleri ile guncelle.
5. `[x]` Reason-code dokumani ve README referanslarini ekle.
6. `[x]` `pnpm test`, `pnpm build`, `pnpm run v2:gate` ile dogrula.

## Verification

- Calistirilacak:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`
- Beklenen kanit:
  - `ci_summary` payload'inda `reasonCodes` alaninin dolu geldigine dair smoke assert
  - no-change path icin reason code assert'i
  - build + smoke + gate komutlarinin yesil cikmasi
- Gecen komutlar:
  - `pnpm build`
  - `pnpm test`
  - `pnpm run v2:gate`

## Review

Durum:

- V2 hardening tamamlandi (onceki sprint).
- V3 WS1 reason-code standardizasyonu tamamlandi ve testlerle dogrulandi.
