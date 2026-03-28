# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `V3_EXECUTION_PLAN.md`
- `CURRENT_STATUS_AND_NEXT_SPRINT.md`

## Current Focus

V3 WS3 - Outcome Analytics (lightweight metrics) [completed]

## Spec

Hedef:
Local metrics katmani ile CI/PR ciktilarina olculebilir outcome sinyali eklemek.

Basari kosulu:

- `.autoqa/state/metrics.json` dosyasi uretiliyor
- execute/verify sonrasi metrik sayaclari guncelleniyor
- `ci_summary` metrics oranlarini (`accept`, `verify`, `re-break`, `skipped`) donduruyor
- metrics yoksa summary graceful fallback veriyor

## Plan

1. `[x]` Local metrics modeli ve state persistence katmanini ekle.
2. `[x]` `execute_run_plan` ve `verify_patch` sonrasi metrics guncellemesini bagla.
3. `[x]` `ci_summary` icine metrics summary blok/alanlarini ekle.
4. `[x]` Smoke testte metrics dosyasi + summary assertlerini ekle.
5. `[x]` Operator/README dokumanlarini metrics davranisiyla guncelle.
6. `[x]` `pnpm build`, `pnpm test`, `pnpm run v2:gate` ile dogrula.

## Verification

- Calistirilacak:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`
- Beklenen kanit:
  - `.autoqa/state/metrics.json` dosyasinda sayaclarin artmasi
  - summary metninde `Metrics:` satiri ve payload `metricsSummary` alanlari
  - smoke assertlerinde metrics dosyasi + oran dogrulamalari
  - build + smoke + gate komutlarinin yesil cikmasi
- Gecen komutlar:
  - `pnpm build`
  - `pnpm test`
  - `pnpm run v2:gate`

## Review

Durum:

- V2 hardening tamamlandi (onceki sprint).
- V3 WS1, WS2, WS3 ve WS4 tamamlandi.
- WS3 metrik katmani build/test/gate ile dogrulandi; bir sonraki adim V3 sonrasi paketleme/positioning calismasi.
