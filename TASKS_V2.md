# AutoQA MCP V2 Backlog

Bu dosya V2 urunlesme backlog'udur.

V1 kapanis backlog'u `TASKS.md` icinde korunur.
Bu dosya yeni wedge'e odaklanir:

- PR icinde gorunen
- artifact okuyan
- repo hafizasi kullanan
- policy ile kontrollu
- Playwright maintenance copilot

Durum etiketleri:

- `[todo]`: baslanmadi
- `[doing]`: aktif calisiliyor
- `[done]`: tamamlandi ve yerel olarak dogrulandi
- `[blocked]`: dis bagimlilik veya kritik karar bekliyor

## V2 Basari Tanimi

V2 bitti denmesi icin su ciktilar gorunur olmalidir:

- GitHub PR icinde tek bir AutoQA yorumu olusur ve yeniden guncellenir.
- Playwright failure artifact'lerinden anlamli root-cause sinyali cikartilir.
- Ayni repo icinde onceki failures ve patch sonuclari sonraki kararlari etkiler.
- Auto patch ve targeted run kararlari repo policy kurallari ile sinirlanir.

## Kapsam Disi

Bu backlog icinde sunlar yoktur:

- dashboard
- billing
- hosted multi-tenant SaaS
- Playwright disi framework expansion
- manual tester yuzeyi
- genel-purpose QA platformu

## Kod Yuzeyi

V2 icin agirlikli dokunulacak alanlar:

- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/scripts/ci-impact.mjs`
- `packages/mcp-server/scripts/`
- `.github/workflows/`
- `docs/`

## Ortak Temel

1. `[todo]` Tum ana akislarda ortak bir `runId` ve `report envelope` tanimla.
   Cikti alanlari en az su bilgileri tasimak zorunda: `repoPath`, `changedFiles`, `confidenceLevel`, `status`, `runId`, `artifacts`.
2. `[todo]` `test-results`, `playwright-report`, `error-context.md`, screenshot ve console/network ciktilari icin fixture klasoru olustur.
3. `[todo]` PR bot, artifact parser, memory ve policy katmanlari icin ortak JSON schema dosyalari belirle.
4. `[todo]` V2 smoke test stratejisini ayir: unit fixture testleri + sample repo integration testleri.

## Epic 1: PR-Native QA Bot

Hedef:
Kod degisince kullanici ilk degeri PR icinde gorsun.

Teslim sonucu:
Tek bir AutoQA yorumu `impact + patch + verify + confidence` ozetini verir ve tekrar kosunca ayni yorumu update eder.

Gorevler:

1. `[todo]` GitHub comment cikti kontratini netlestir.
   Bolumler: `impact summary`, `affected tests`, `suggested patch`, `executed tests`, `verify result`, `confidence`, `blocked reasons`.
2. `[todo]` `autoqa_ci_summary` icindeki `github` formatini sabit marker'li bir comment body'ye cevir.
   Hedef: ikinci kosuda yeni yorum atmak yerine mevcut yorumu guncellemek.
3. `[todo]` Yeni script ekle: `packages/mcp-server/scripts/pr-bot.mjs`.
   Gorev: CLI argumanlari oku, summary uret, GitHub API veya `gh` ile yorumu create/update et.
4. `[todo]` Yeni npm script ekle: `pnpm pr:comment`.
5. `[todo]` `.github/workflows/autoqa-pr-bot.yml` ekle.
   Trigger: `pull_request`, `pull_request_target` karari netlestirilmis olmali.
6. `[todo]` Fork PR, secret yoklugu ve read-only token durumlari icin fallback davranisi ekle.
7. `[todo]` PR yorumunda artifact linkleri ve report path'leri desteklenir hale gelsin.
8. `[todo]` GitHub comment fixture testleri ekle.
9. `[todo]` Repo README ve docs icinde 5 dakikalik kurulum bolumu yaz.

Kabul kriterleri:

- Sample PR diff icin tek komutla comment olusur.
- Ikinci kosuda ayni yorum update edilir.
- Secret yoksa workflow fail olmak yerine acik bir `report-only` mesaji uretir.

## Epic 2: Artifact-Aware Repair

Hedef:
Diff tabanli tahmine ek olarak failure artifact'lerini okuyup daha dogru patch oner.

Teslim sonucu:
AutoQA bir failed Playwright kosusundan sonra `neden kirdi?` sorusuna artifact destekli cevap verir.

Gorevler:

1. `[todo]` Artifact input kontratini tanimla.
   Minimum kaynaklar: `error-context.md`, failed test title, screenshot path, stdout/stderr, report klasoru.
2. `[todo]` `test-results/**/error-context.md` ve Playwright failure metadata okuyucusu ekle.
3. `[todo]` Screenshot ve console log varligini sinyal olarak modele ekle.
4. `[todo]` `trace.zip` icin ilk asamada full parser degil, metadata-level detection ekle.
5. `[todo]` Mevcut failure siniflarini artifact sinyalleri ile zenginlestir.
   Ornek: `selector_drift`, `text_drift`, `navigation_drift`, `timing_issue`, `auth_issue`, `fixture_issue`.
6. `[todo]` `autoqa_suggest_patch` icinde artifact sinyali varsa patch target ranking'i buna gore yeniden agirliklandir.
7. `[todo]` Yeni rapor bolumu ekle: `evidence used`.
8. `[todo]` 5-10 fixture failure senaryosu ile unit test yaz.
9. `[todo]` `verify_patch` akisinda artifact path'leri rapora geri yaz.

Kabul kriterleri:

- En az bir selector drift ve bir text drift fixture'i artifact destekli dogru siniflanir.
- Artifact varken patch onerisi artifactsiz moda gore daha yuksek confidence alir.

## Epic 3: Repo Memory Layer

Hedef:
Ayni repo icinde tekrarlayan kirilmalarda AutoQA sifirdan dusunmesin.

Teslim sonucu:
Onceki failure, patch ve verify sonuclari sonraki impact ve patch kararlarina etki eder.

Gorevler:

1. `[todo]` Yerel memory storage formatini sec.
   Oneri: `.autoqa/state/memory.json`.
2. `[todo]` Memory schema tanimla.
   Alanlar: `repo fingerprint`, `known flaky tests`, `recent failures`, `accepted patches`, `rejected patches`, `selector history`, `route history`.
3. `[todo]` `verify_patch` sonrasinda memory write adimi ekle.
4. `[todo]` `impact_analysis` icinde gecmiste sik kirilan testlere ek agirlik ver.
5. `[todo]` `suggest_patch` icinde daha once basarili olan target file ve replacement pattern'lerini yeniden sirala.
6. `[todo]` Memory TTL ve max size kurallari ekle.
7. `[todo]` Memory reset ve inspect komutu ekle.
   Oneri script: `pnpm memory:inspect`, `pnpm memory:reset`.
8. `[todo]` `.gitignore` ve docs tarafinda local state davranisini dokumante et.
9. `[todo]` Ileride StackMemory veya harici store baglantisi icin adapter interface ayir.

Kabul kriterleri:

- Ayni fixture repo icinde ikinci kosu ilk kosuya gore daha iyi siralama uretir.
- Memory dosyasi bozulursa sistem hard fail olmak yerine temiz fallback ile calisir.

## Epic 4: Policy Engine

Hedef:
Auto patch ve test kosulari repo kurallarina bagli olsun; ajan guclu ama kontrolsuz olmasin.

Teslim sonucu:
Repo sahibi hangi dosyalara dokunulabilecegini, hangi confidence'ta apply yapilacagini ve hangi branchlerde report-only calisacagini tanimlar.

Gorevler:

1. `[todo]` `autoqa.config.json` schema'sini policy bolumu ile genislet.
2. `[todo]` Patch allow/deny glob destegi ekle.
3. `[todo]` Minimum confidence threshold ekle.
   Ayrik esikler: `suggest`, `apply`, `verify`.
4. `[todo]` Branch bazli mod tanimla.
   Ornek: `main` ve `release/*` icin `report_only`.
5. `[todo]` Max test budget kurali ekle.
   Ornek: `maxTests`, `maxMinutes`, `allowFullSuite`.
6. `[todo]` Protected file listesi ekle.
   Ornek: auth, billing, infra, secrets ile ilgili dosyalar.
7. `[todo]` Policy ihlalinde insanin okuyacagi acik `blocked reason` don.
8. `[todo]` Policy precedence kurali yaz.
   Sira: CLI override -> repo config -> default guvenlik kurali.
9. `[todo]` Policy fixture testleri ekle.
10. `[todo]` Docs icinde `safe-by-default` config ornekleri yayinla.

Kabul kriterleri:

- Protected file icin autopatch engellenir.
- Low confidence patch report'a duser ama apply edilmez.
- Branch policy aktifken verify calisir, apply devre disi kalir.

## Onerilen Ship Sirasi

1. `[todo]` Ortak temel + PR bot MVP
2. `[todo]` Artifact-aware repair
3. `[todo]` Policy engine
4. `[todo]` Repo memory layer

Not:
Memory katmani moat'tir ama ilk gorunen deger PR bot ve artifact-aware repair tarafindadir.
Bu yuzden memory'yi en basta degil, veri akisi olustuktan sonra ship etmek daha mantiklidir.

## Son Dogrulama

V2 milestone kapatmadan once asagidakiler gosterilmelidir:

- `pnpm build`
- `pnpm test`
- sample repo uzerinde PR bot smoke run
- sample failure artifact uzerinde repair smoke run
