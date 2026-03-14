# AutoQA MCP V1 Backlog

Bu dosya V1 kapanis backlog'udur. Kapsam disi is eklenmez.

Durum etiketleri:

- `[todo]`: baslanmadi
- `[doing]`: aktif calisiliyor
- `[done]`: tamamlandi ve yerel olarak dogrulandi
- `[blocked]`: dis bagimlilik veya kritik karar bekliyor

## Kapsam Kurali

Bu backlog disinda sunlar eklenmez:

- dashboard
- billing
- SaaS backend
- multi-framework expansion
- genel QA platform yuzeyleri

## Kritik Yol

1. `[done]` Merge-base otomasyonu eklendi. `autoBase` ile mevcut branch icin otomatik karsilastirma noktasi cozuluyor.
2. `[done]` `workingTree` analizine `untracked` dosya destegi eklendi. Yeni eklenen dosyalar etki analizine giriyor.
3. `[done]` Diff parser genisletildi. `className`, `data-testid`, gorunur metin, `page.goto`, `href`, `aria-label`, `role` degisiklikleri semantik olarak cikariliyor.
4. `[done]` Test dosyasi skorlama mantigi guclendirildi. Test icerigi okunup locator/text/assertion sinyalleriyle skorlama yapiliyor.
5. `[done]` `autoqa_suggest_patch` icin gercek `apply` akis eklendi. Yuksek guvenli patch'ler uygulanabiliyor.
6. `[done]` `autoqa_patch_file` rollback bilgisi uretir hale geldi.
7. `[done]` `targeted_run_plan` ciktiisi gercek Playwright komutuna baglandi. `autoqa_execute_run_plan` ile onerilen testler calistirilabiliyor.
8. `[done]` Patch sonrasi otomatik dogrulama eklendi: `autoqa_verify_patch` ile `suggest -> apply -> run selected tests -> report` akisi calisiyor.

## Urunlesme

9. `[done]` Failure analizi siniflari buyutuldu: `selector_drift`, `text_drift`, `navigation_drift`, `assertion_drift`, `network_issue`, `auth_issue`, `fixture_issue`.
10. `[done]` Confidence sistemi eklendi. Etki analizi, patch ve run plan icin `low/medium/high` seviyeleri uretiliyor.
11. `[done]` Guven esigi kurallari eklendi. Yuksek guvenli patch uygulanuyor, daha dusuk guven otomatik `dry_run` oluyor.
12. `[done]` `.autoqaignore` destegi eklendi.
13. `[done]` `autoqa.config.json` destegi eklendi.
14. `[done]` `autoqa_ci_summary` ciktilari `markdown`, `github comment`, `plain log` modlarina ayrildi.

## Sertlestirme

15. `[done]` GitHub Actions ornek workflow eklendi: `.github/workflows/autoqa-impact.yml`.
16. `[done]` MCP onboarding dokumanlari eklendi: Codex, Cursor, Claude Desktop.
17. `[done]` Smoke test matrisi buyutuldu: locator rename, text rename, staged diff, unstaged diff, manual changedFiles, auto merge-base, untracked file, run plan execution, patch verification.
18. `[done]` Tekrarlayan `scan_repo`, repo ayarlari ve diff analizi icin kisa omurlu cache/index mantigi eklendi.
19. `[done]` Paketleme ve release temizligi yapildi: surum `2.0.0`, changelog, publish hazirligi, `prepack`, `release:check`, package README.
20. `[done]` Urun 3 gercek Playwright reposunda dogfood edildi. Dusuk degerli stored-test yuzeyi ana mesajdan cikarildi; repo-aware diff bakim copilot'u ana yuzey olarak tutuldu.

## Son Dogrulama

- `pnpm build`
- `pnpm test`
