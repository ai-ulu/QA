# Cursor Onboarding

Add AutoQA as an MCP server pointing at the built stdio entry:

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

Useful first flows:

- ask Cursor to run `autoqa_impact_analysis` on the working tree
- ask for `autoqa_suggest_patch` before code edits
- ask for `autoqa_verify_patch` after a UI rename lands
