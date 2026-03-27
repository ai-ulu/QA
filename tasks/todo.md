# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `CURRENT_STATUS_AND_NEXT_SPRINT.md`
- `TASKS_V2.md`

## Current Focus

V2 hardening sprint:

- structured policy diagnostics
- clean-diff graceful CI behavior
- memory visibility
- required quality gates
- operator docs

## Spec

Hedef:
V2'yi broad rollout oncesi daha guvenilir ve daha okunabilir hale getirmek.

Basari kosulu:

- policy kararlarinda stable reason code + precedence source gorunur
- clean diff / no-change durumunda `ci_summary` ve PR bot hard fail olmaz
- CI summary icinde compact memory sinyali gorunur
- GitHub workflow tarafinda required quality gate akisi vardir
- operator icin kisa kullanim rehberi yazilidir

## Plan

1. `[x]` Policy output contract'ina structured reason code ve precedence source ekle.
2. `[x]` `execute_run_plan` ve `verify_patch` ciktilarinda policy trace gorunur hale getir.
3. `[x]` `ci_summary` icine compact memory summary ekle.
4. `[x]` Clean-diff durumunda graceful `no_changes` summary don.
5. `[x]` Smoke test fixture'larina protected-file ve apply-threshold policy edge case'leri ekle.
6. `[x]` Required quality gate GitHub workflow'u ekle.
7. `[x]` 5 dakikalik operator guide yaz.
8. `[x]` `pnpm test`, `pnpm build`, `pnpm v2:gate` ile dogrula.

## Verification

- Calistirilacak:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`
- Beklenen kanit:
  - smoke icinde yeni policy assert'leri
  - clean-diff `no_changes` summary assert'i
  - memory summary assert'i
  - workflow ve docs dosyalarinin repoda olmasi
- Gecen komutlar:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`

## Review

Durum:

- Hardening sprint tamamlandi ve kanitlandi.
- V2 artik broad rollout icin daha guvenli:
  - required quality gates var
  - clean-diff graceful summary var
  - structured policy diagnostics var
  - operator guide var
