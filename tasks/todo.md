# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `V3_EXECUTION_PLAN.md`
- `CURRENT_STATUS_AND_NEXT_SPRINT.md`

## Current Focus

V3 WS2 - Learning Loop from Memory

## Spec

Hedef:
Memory tabanli ogrenme sinyallerini guclendirmek:
- patch acceptance/re-break istatistiklerini pattern bazinda takip et
- hedef siralamayi memory pattern performansiyla agirliklandir
- CI summary icinde memory confidence hint sagla

Basari kosulu:

- memory state dosyasinda pattern-level ogrenme istatistikleri var (`patternStats`)
- ranking path'inde memory pattern performansi puanlamayi etkiliyor
- CI summary payload ve metninde confidence hint sinyali var
- smoke test memory confidence ve pattern-stat assertleri iceriyor

## Plan

1. `[x]` Memory modeline pattern-level istatistik alanlarini ekle.
2. `[x]` Verification sonrasi memory yaziminda acceptance/re-break pattern guncellemesi ekle.
3. `[x]` Patch target ranking'e pattern performans agirligi ekle.
4. `[x]` `ci_summary` memory confidence hint sinyalini ekle.
5. `[x]` Smoke testlerde confidence hint + pattern stat assertlerini ekle.
6. `[x]` `pnpm build`, `pnpm test`, `pnpm run v2:gate` ile dogrula.

## Verification

- Calistirilacak:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`
- Beklenen kanit:
  - memory dosyasinda `patternStats` dolu
  - summary metninde `Memory confidence` sinyali
  - smoke assertlerinde confidenceHint ve pattern stat dogrulamasi
  - build + smoke + gate komutlarinin yesil cikmasi
- Gecen komutlar:
  - `pnpm build`
  - `pnpm test`
  - `pnpm run v2:gate`
  - `pnpm test`
  - `pnpm run v2:gate`

## Review

Durum:

- V2 hardening tamamlandi (onceki sprint).
- V3 WS1 ve WS4 tamamlandi.
- V3 WS2 implementation tamamlandi ve dogrulandi.
