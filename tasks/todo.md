# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `V3_EXECUTION_PLAN.md`
- `CURRENT_STATUS_AND_NEXT_SPRINT.md`

## Current Focus

Pilot Day 3 - run lanes execution next

## Spec

Hedef:
AutoQA icin 1 haftalik pilotu soyut fikir olmaktan cikarip repo-secimi, mesajlama ve karar esikleri ile uygulanabilir hale getirmek.

Basari kosulu:

- ic repo adaylari netlesmis olmali
- dis repo sourcing rubrigi yazilmis olmali
- QA / EM / VP Eng buyer messaging ayrismis olmali
- 7 gunluk pilot plani ve go/no-go sablonu hazir olmali

## Plan

1. `[x]` Workspace icinde Playwright kullanan ic repo adaylarini tara ve sinifla.
2. `[x]` 7 gunluk pilot plani ve karar esiklerini yaz.
3. `[x]` dis repo sourcing rubrigi ve buyer messaging matrisini yaz.
4. `[x]` repo takip / gunluk log / go-no-go sablonlarini ekle.
5. `[x]` dokumanlari gozden gecir, commit et, push et.
6. `[x]` Day 1 icin secilen repo pack uzerinden baseline toplama adimini baslat.
7. `[x]` Day 2 baseline'i 5-10 failure/retry run detay analizi ile derinlestir.
8. `[ ]` Day 3 icin bir maintenance-lane (`tmp_flowgram`) ve iki report-only lane (`QA`, `frontend`) calistir.

## Verification

- Calistirilacak:
  - local repo scan
  - docs review
- Beklenen kanit:
  - `docs/pilot-plan.md` icinde 7 gunluk plan ve ic repo listesi olmali
  - `docs/pilot-sourcing-and-messaging.md` icinde sourcing ve buyer ayrimi olmali
  - `docs/pilot-templates.md` icinde takip ve go/no-go sablonlari olmali
  - `docs/pilot-day2-baseline.md` icinde ic repo CI baseline snapshot olmali
  - `docs/pilot-day2-deep-dive.md` icinde run bazli siniflandirma olmali
- Gecen komutlar:
  - local workspace Playwright scan

## Review

Durum:

- Teknik V3 workstream'leri kapanmis durumda.
- Sonraki asama feature degil, pilot ve distribution planini netlestirmek.
