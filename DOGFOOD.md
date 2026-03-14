# AutoQA Dogfood

AutoQA `ci-impact` akisi uc gercek Playwright repo uzerinde dogfood edildi.

## Repos

1. `microsoft/playwright`
2. `checkly/playwright-examples`
3. `ortoniKC/Playwright_Cucumber_TS`

## Ozet

### 1. microsoft/playwright

- Degisen dosya: `.github/actions/run-test/action.yml`
- Sonuc: `Working tree QA summary (unstaged)`
- Guven: `medium`
- Cikarim: test disi infra degisikliklerinde arac dogrudan test hedeflemek yerine `manual review` davranisina yakin kalmali.

### 2. checkly/playwright-examples

- Degisen dosya: `404-detection/tests/no-404s.spec.ts`
- Sonuc: degisen test dosyasini dogrudan yuksek risk olarak hedefledi.
- Guven: `high`
- Cikarim: repo-aware ve path-aware hedefleme ozellikle dogrudan spec degisikliklerinde guclu.

### 3. ortoniKC/Playwright_Cucumber_TS

- Degisen dosya: `src/helper/util/test-data/registerUser.json`
- Sonuc: ilgili step dosyasini etkilenmis yuzey olarak cikardi.
- Guven: `medium`
- Cikarim: fixture/data degisikliklerinde de arac kullanisli sinyal verebiliyor, ama hala `manual review` tavrini korumali.

## Urun Karari

Dogfood sonrasi en net sonuc:

- En yuksek deger repo-aware diff analizi, patch onerisi, targeted run ve CI summary zincirinde.
- Stored-test odakli eski yuzey (`create_test`, `run_test`) MCP kontratindan cikarildi.
- Ana urun cumlesi `change-aware Playwright maintenance copilot` olarak kalmali.
