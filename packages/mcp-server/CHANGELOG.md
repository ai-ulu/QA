# Changelog

## 2.0.0

- Narrowed the public MCP contract to the change-aware maintenance flow.
- Removed the legacy stored-test tools from the exposed MCP surface.
- Added auto merge-base analysis for current-branch diffs.
- Added working tree analysis for staged, unstaged, and untracked changes.
- Added semantic diff extraction for selector, text, route, href, aria-label, and role changes.
- Added confidence levels, apply gating, and rollback payloads.
- Added targeted Playwright execution and patch verification flows.
- Added CI summary script and GitHub Actions example workflow.
- Synced the MCP server version with the published package version.
- Added root-friendly path resolution via `INIT_CWD` for `ci-impact` and `dogfood`.
- Added working-tree fallback for `ci-impact` when auto merge-base yields no committed diff.
- Added default dogfood clone cleanup with an opt-in `--keep-clones` escape hatch.
- Ignored temporary analysis directories like `.dogfood`, `.tmp-fixtures`, and `reports`.
- Added `.autoqaignore` and `autoqa.config.json` support.
