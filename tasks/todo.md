# AutoQA Active Todo

Bu dosya aktif uygulama planidir.

Kaynak backlog:

- `TASKS_V2.md`

## Current Focus

V2 closeout ve ship hazirligi.

## Spec

Hedef:
V2 kapsamindaki PR-native + artifact-aware + memory + policy katmanlarini tek gate ile dogrulayip ship-ready checklist'e gecmek.

Basari kosulu:

- `pnpm run v2:gate` green
- `pnpm test` green
- `pnpm build` green
- docs tarafinda policy + memory + gate komutlari yazili

## Plan

1. `[x]` Epic 1: PR-native comment upsert bot
2. `[x]` Epic 2: artifact-aware repair
3. `[x]` Epic 3: repo memory layer
4. `[x]` Epic 4: policy engine enforcement
5. `[x]` Policy precedence (`policyMode`) + structured policy output
6. `[x]` V2 milestone gate script (`pnpm v2:gate`)
7. `[x]` Final local verification (`pnpm test`, `pnpm build`, `pnpm v2:gate`)

## Verification

- Gecen komutlar:
  - `pnpm test`
  - `pnpm build`
  - `pnpm run v2:gate`
- Kanit:
  - smoke: `MCP smoke test passed`
  - gate: `all checks passed`
  - gate adimlari: build + smoke + ci-summary + pr-comment dry-run

## Review

Durum:

- V2 teknik kapsam tamamlandi ve local gate ile dogrulandi.
- Sonraki is artik delivery operasyonu:
  - release tag/notes
  - npm publish (istenirse)
  - GitHub workflow branch policy netlestirme
