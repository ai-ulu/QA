# Claude Desktop Onboarding

Point Claude Desktop at the AutoQA stdio server:

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

Recommended usage:

- `analyze my current branch diff and summarize QA impact`
- `find the highest-risk spec and suggest a safe patch`
- `apply the patch only if confidence is high, then verify it`
