# AutoQA MCP v2.1.0

<p align="center">
  <strong>AI-Powered Quality Assurance & Web Security Scanner</strong><br>
  <em>Scan repos, analyze impact, suggest patches, run Playwright tests, audit web security — all via MCP</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-blue?style=for-the-badge" alt="Version 2.1.0">
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-green?style=for-the-badge" alt="MCP Streamable HTTP">
  <img src="https://img.shields.io/badge/Cloudflare-Pages-orange?style=for-the-badge" alt="Cloudflare Pages">
  <img src="https://img.shields.io/badge/License-MIT-success?style=for-the-badge" alt="MIT License">
</p>

---

## 🚀 Live Endpoint

```
https://autoqa-mcp.pages.dev/mcp
```

Connect any MCP-compatible client (Claude Desktop, Cursor, VS Code Copilot, etc.) using **Streamable HTTP** transport.

## 🛠️ Tools (10)

| # | Tool | Description |
|---|------|-------------|
| 1 | `autoqa_scan_repo` | Scan repository structure and identify quality issues |
| 2 | `autoqa_patch_file` | Apply a patch to a specific file in the repo |
| 3 | `autoqa_suggest_patch` | Get AI-suggested patch recommendations for issues |
| 4 | `autoqa_impact_analysis` | Analyze the impact of code changes across the codebase |
| 5 | `autoqa_pr_summary` | Generate a comprehensive PR summary with risk assessment |
| 6 | `autoqa_targeted_run_plan` | Create a targeted test run plan based on changed files |
| 7 | `autoqa_execute_run_plan` | Execute a Playwright test run plan and collect results |
| 8 | `autoqa_verify_patch` | Verify that a patch resolves the intended issue |
| 9 | `autoqa_ci_summary` | Generate CI/CD pipeline summary and status report |
| 10 | `autoqa_web_audit` | Perform comprehensive web security and performance audit |

## 📦 Installation

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "autoqa": {
      "url": "https://autoqa-mcp.pages.dev/mcp"
    }
  }
}
```

### Cursor / VS Code

Add to your MCP settings:
```json
{
  "mcp": {
    "servers": {
      "autoqa": {
        "url": "https://autoqa-mcp.pages.dev/mcp",
        "transport": "streamable-http"
      }
    }
  }
}
```

## 🔧 Local Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Deploy to Cloudflare Pages
pnpm deploy

# Run locally
pnpm start
```

## 🏗️ Architecture

- **Runtime**: Cloudflare Workers (Edge)
- **Database**: Cloudflare D1 (SQLite)
- **Transport**: MCP Streamable HTTP
- **Protocol**: JSON-RPC 2.0

## 📋 Version History

| Version | Changes |
|---------|---------|
| v2.1.0 | Added `autoqa_web_audit` (Web Bekçisi) — OWASP Top 10 scanning, performance audit, SEO analysis |
| v2.0.0 | Migrated to Cloudflare Pages, streamable-http transport, D1 database |
| v1.0.0 | Initial release with core QA tools |

---

<p align="center">
  Built by <a href="https://github.com/ai-ulu">ai-ulu</a> · Part of the MCP Toolkit
</p>
