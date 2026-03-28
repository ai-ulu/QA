# AutoQA Lessons

Bu dosya tekrar eden hatalari azaltmak icin kalici calisma derslerini tutar.

## Active Lessons

1. Plani dosyada tut.
   3+ adimli, mimari kararli veya dogrulama gerektiren islerde aktif plan `tasks/todo.md` icinde tutulmali; sadece mesaj hafizasina birakilmamali.

2. V1 backlog ile aktif uygulama planini ayir.
   Kapanmis veya tarihsel backlog dosyalari korunmali; aktif uygulama adimlari ayri bir `tasks/` klasorunde izlenmeli.

3. Tamamlandi demeden once kanit uret.
   Kod degisikligi, ilgili checkler veya testler ile dogrulanmadan tamamlandi sayilmaz.

4. Kullanici duzeltmesini surece cevir.
   Kullanici calisma tarzini netlestirdiginde bunu bir sonraki oturumda tekrar soylemek zorunda kalmasin; ilgili ders `tasks/lessons.md` icine yazilsin.

5. Ortak sonuc katmani eklerken backward compatibility koru.
   MCP tool payload'larina yeni envelope eklenirken mevcut ust seviye alanlar korunmali; aksi halde smoke test, CLI ve diger tuketiciler gereksiz yere kirilir.

6. PR yorumu icin sabit marker sozlesmesi kullan.
   Yorumu daha sonra update edebilmek icin github-format summary icinde marker bloklari sabit kalmali; parser veya bot bu markerlara gore mevcut yorumu bulur.

7. CLI JSON secimi icin kirilgan `jq` filtrelerine baglanma.
   Marker gibi ozel karakter iceren filtrelerde `gh api` cevabini Node tarafinda parse etmek daha guvenli ve tasinabilir bir yoldur.

8. CI bot akislarinda fail-open fallback tasarla.
   PR yorumu gibi yardimci otomasyonlarda auth/permission sorunu cikabilir; bu durumda hard fail yerine report-only fallback daha guvenli bir varsayimdir.

9. Tip genisletirken rapor yazim yollarini unutma.
   Result tipine yeni alan eklendiginde bu tipi kullanan tum yazim/rapor fonksiyonlari ayni anda guncellenmeli; aksi halde derleme hatasi ile yakalanir.

10. Smoke testte yeni sinyal eklerken deterministic fixture sec.
    Verify gibi birden fazla asamali akislarda fixture state'i hizla degisir; artifact sinyal dogrulamasi icin en stabil nokta `suggest_patch` fixture adimidir.

11. Kalici memory katmaninda parse/write hatalarini ana akistan izole et.
    Repo memory dosyasi bozuk veya gecici olarak yazilamaz durumda olabilir; verify/suggest/impact gibi cekirdek akislar hard fail olmadan fallback memory ile devam etmelidir.

12. Config cache olan akislarda fixture testte cache etkisini kontrol et.
    `autoqa.config.json` ayni test akisi icinde degistiriliyorsa TTL cache nedeniyle eski deger okunabilir; deterministic sonuc icin cache invalidation veya kisa bekleme adimi eklenmelidir.

13. Workspace scriptlerinde `INIT_CWD` yerine hedef cwd'yi net sec.
    Ozellikle package-level scriptler icinde nested komut zinciri kurarken `INIT_CWD` root path'e donup goreli script yollarini bozabilir; scriptin gercek calisma dizinini baz almak daha guvenlidir.

14. CLI option parser'da tekrar eden flag'lerde son degeri kullan.
    NPM scriptleri sabit argumanlarla gelebilir (`--repo .` gibi); kullanici `-- --repo <path>` eklediginde override icin `lastIndexOf` yaklasimi daha dogrudur.

15. Selected CI flows icin "no diff" durumunu error yerine ozet olarak ele al.
    `ci_summary` ve PR comment gibi operator-facing akislar clean repo durumunda hard fail olmamali; `no_changes` status'u ile okunabilir ozet donmek daha guvenilir bir davranistir.

16. Policy kararlarinda sadece metin degil kaynak ve kod da don.
    `blockedReasons` tek basina yeterli degil; `source` ve stable `blockedReasonCodes` alanlari olmadan kullanici "bu karar nereden geldi?" sorusunu net cevaplayamaz.

17. Smoke fixture'da `auto_apply` mode etkisini izole etmeden sonraki adima gecme.
    `auto_apply`, `apply: false` cagrilarinda bile dosya mutate edebilecegi icin fixture adimlarinin sonraki beklentilerini bozabilir; bu moddan sonra config'i `guarded_apply`'a cekmek veya fixture dosyasini explicit resetlemek gerekir.

18. Conditional object literal union'larinda literal status alanini genisletme.
    `const result = condition ? { status: 'skipped' } : existingTypedResult` gibi kaliplarda TypeScript `status` alanini `string`e genisletebilir; bu tip kirilmasini onlemek icin degiskeni hedef tipe (`RunPlanExecution`) annotate et veya literal alanlari `as const` ile sabitle.

19. Multi-repo dogfood kosularini fail-fast yerine per-repo fail-safe tasarla.
    Tek bir repo clone/ci-impact hatasi tum kosuyu dusururse nightly sinyal kaybolur; repo bazli `status` + `reasonCode` kaydi ile ilerlemek ve sonunda toplu artifact uretmek daha guvenilir operasyon modeli saglar.

20. Bu repo'da GitHub Actions `uses:` adimlarini dogrudan varsayma.
    `actions/checkout` gibi standart gorunen `uses:` adimlari startup_failure uretebildigi icin workflow'u once shell-only olarak ayağa kaldir, sonra tek tek adim ekleyerek bisection yap.
