# Codex Onboarding

Fast path:

```bash
pnpm onboard:mcp
```

Use the built server entry:

```json
{
  "mcpServers": {
    "autoqa": {
      "command": "node",
      "args": [
        "C:/Users/sonfi/Documents/Playground/QA/packages/mcp-server/dist/index.js"
      ]
    }
  }
}
```

Recommended first prompts:

- `scan this repo and tell me the highest-value Playwright test targets`
- `analyze the current working tree and produce a ci summary`
- `suggest a safe patch for the latest selector drift`
