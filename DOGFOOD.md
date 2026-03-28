# AutoQA Dogfood

AutoQA dogfood akisi artik 12 repoluk curated bir Playwright pack uzerinde calisir.

## Repo Pack

Kaynak dosya: `dogfood.repos.json`

Kapsam:

1. `microsoft/playwright`
2. `microsoft/playwright-examples`
3. `checkly/playwright-examples`
4. `ortoniKC/Playwright_Cucumber_TS`
5. `microsoft/playwright-mcp`
6. `microsoft/playwright-cli`
7. `microsoft/playwright-vscode`
8. `akshayp7/playwright-typescript-playwright-test`
9. `vitalets/playwright-bdd`
10. `Tallyb/cucumber-playwright`
11. `playwright-community/jest-playwright`
12. `microsoft/playwright.dev`

## Komutlar

Yerel:

```bash
pnpm dogfood
pnpm dogfood -- --limit 3
pnpm dogfood -- --soft-fail
```

Nightly CI:

- Workflow: `.github/workflows/autoqa-dogfood-nightly.yml`
- Varsayilan calisma: `pnpm dogfood:nightly`
- Manual run icin opsiyonel limit: `workflow_dispatch.inputs.limit`

## Artifactlar

Her calisma sonunda su dosyalar yazilir:

- `packages/mcp-server/reports/autoqa-dogfood-latest.md`
- `packages/mcp-server/reports/autoqa-dogfood-latest.json`

Ek olarak timestampli kopyalar da tutulur:

- `packages/mcp-server/reports/autoqa-dogfood-<timestamp>.md`
- `packages/mcp-server/reports/autoqa-dogfood-<timestamp>.json`

## Son Dogrulama

- Tarih: 2026-03-29
- Komut: `pnpm dogfood -- --soft-fail`
- Secilen repo: 12
- Sonuc: 12 passed / 0 failed
- Kanit: `packages/mcp-server/reports/autoqa-dogfood-latest.md` ve `.json`

## Failure Model

Dogfood artik repo bazinda hard-crash olmaz; her repo sonucu ayri kaydedilir:

- `status: passed | failed`
- `reasonCode` (ornek: `clone_failed`, `candidate_file_not_found`, `marker_write_failed`, `ci_impact_failed`, `timeout`, `unexpected_error`)

Nightly workflow bu artifactlari upload eder ve step summary'ye markdown raporunu yazar.
