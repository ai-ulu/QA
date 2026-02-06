# AutoQA MCP Server - Cursor Integration

## Why Cursor + AutoQA = 🔥

Cursor is an AI-first IDE. Combined with AutoQA MCP, you get:

- **AI writes code** → **AutoQA writes tests**
- **Instant feedback** → **Self-healing fixes**
- **Zero context switching** → **Everything in one place**

## Setup

### 1. Install AutoQA MCP

```bash
npm install -g @autoqa/mcp-server
```

### 2. Configure Cursor

Add to Cursor settings (`Cmd/Ctrl + ,`):

```json
{
  "mcp.servers": {
    "autoqa": {
      "command": "autoqa-mcp"
    }
  }
}
```

## Workflow Examples

### Workflow 1: Feature Development

```
1. You: "Build a user registration form"
   Cursor: [Generates React component]

2. You: "@autoqa Create tests for this registration form"
   AutoQA: [Generates E2E tests]

3. You: "@autoqa Run the tests"
   AutoQA: ✅ All tests passed!

4. You: "Add email validation"
   Cursor: [Updates code]
   AutoQA: [Auto-updates tests]

5. You: "@autoqa Run tests again"
   AutoQA: ✅ Tests still passing!
```

### Workflow 2: Bug Fixing

```
1. User reports: "Login button doesn't work"

2. You: "@autoqa Create a test that reproduces the login bug"
   AutoQA: [Creates failing test]

3. You: "@autoqa Why is this failing?"
   AutoQA: "Button selector changed. Expected #login, found [data-testid='login-btn']"

4. You: "Fix the code"
   Cursor: [Updates button ID]

5. You: "@autoqa Run test"
   AutoQA: ✅ Test now passes!
```

### Workflow 3: Refactoring

```
1. You: "Refactor this component to use hooks"
   Cursor: [Refactors code]

2. You: "@autoqa Run all tests"
   AutoQA: ❌ 3 tests failing

3. You: "@autoqa Fix failing tests automatically"
   AutoQA: 🔧 Applied self-healing to all 3 tests
   ✅ All tests now passing!
```

## Advanced Features

### Continuous Testing

Enable auto-run on file save:

```json
{
  "autoqa.autoRun": true,
  "autoqa.runOnSave": ["**/*.tsx", "**/*.ts"]
}
```

### AI Test Generation

```
You: "@autoqa Generate tests for all components in src/components"

AutoQA:
✅ Generated 15 tests
- Button.test.tsx (3 tests)
- Form.test.tsx (5 tests)
- Modal.test.tsx (4 tests)
- Card.test.tsx (3 tests)

All tests passing! 🎉
```

### Visual Regression

```
You: "@autoqa Compare homepage before and after my changes"

AutoQA:
📸 Visual Regression Results
- Header: No changes ✅
- Hero section: 2.3% difference ⚠️
- Footer: No changes ✅

[View Diff Image]
```

## Pro Tips

1. **Use @autoqa prefix** for all AutoQA commands
2. **Combine with Cursor's AI** for full automation
3. **Enable auto-run** for instant feedback
4. **Use visual regression** for UI changes
5. **Let self-healing** fix broken tests automatically

## Cursor + AutoQA = Superpowers 🦸

- Write code faster
- Test automatically
- Fix issues instantly
- Ship with confidence
