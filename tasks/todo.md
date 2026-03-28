# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `V3_EXECUTION_PLAN.md`
- `CURRENT_STATUS_AND_NEXT_SPRINT.md`

## Current Focus

V3 WS5 - Real Repo Pack + Nightly Dogfood Workflow

## Spec

Hedef:
Gercek repo cesitliliginde dogfood sinyalini artisli ve operasyonel hale getirmek.

Basari kosulu:

- `dogfood.repos.json` en az 10 public repo iceriyor
- nightly workflow dogfood calistirip artifact upload ediyor
- dogfood script repo-bazli structured failure raporu uretiyor
- failure durumunda tum kosu hard-crash olmadan rapor uretebiliyor

## Plan

1. `[x]` `dogfood.repos.json` listesini 10+ repo seviyesine genislet.
2. `[x]` `dogfood.mjs` akisini per-repo status + reasonCode + artifact modeline cevir.
3. `[x]` nightly workflow dosyasini ekle (`autoqa-dogfood-nightly.yml`).
4. `[x]` README/DOGFOOD ve package README dokumanlarini yeni akisla guncelle.
5. `[x]` `pnpm build`, `pnpm test`, `pnpm run v2:gate`, `pnpm dogfood -- --limit 1 --soft-fail` ile dogrula.

## Verification

- Calistirilacak:
  - `pnpm build`
  - `pnpm test`
  - `pnpm run v2:gate`
  - `pnpm dogfood -- --limit 1 --soft-fail`
- Beklenen kanit:
  - dogfood run sonunda `autoqa-dogfood-latest.md` ve `.json` dosyalari yazilmis olmali
  - raporda `status`/`reasonCode` dagilimi gorunmeli
  - workflow dosyasi syntax olarak gecmeli ve artifact upload adimi icermeli
  - build + smoke + gate komutlari yesil kalmali
- Gecen komutlar:
  - `pnpm build`
  - `pnpm test`
  - `pnpm run v2:gate`
  - `pnpm dogfood -- --limit 1 --soft-fail`

## Review

Durum:

- V2 hardening tamamlandi (onceki sprint).
- V3 WS1, WS2, WS3 ve WS4 tamamlandi.
- WS5 implementation ve dogrulama tamamlandi.
