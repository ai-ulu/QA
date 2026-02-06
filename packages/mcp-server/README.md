# @autoqa/mcp-server

🚀 **Universal MCP Server for AutoQA** - AI-powered testing for any IDE!

Use AutoQA directly from VS Code, Cursor, Kiro IDE, Claude Desktop, or any MCP-compatible tool.

## Features

- 🤖 **AI-Powered Test Generation** - Write tests in natural language
- 🔧 **Self-Healing Tests** - Automatically fix broken selectors
- 📸 **Visual Regression** - Screenshot comparison with diff highlighting
- 🔍 **Root Cause Analysis** - AI explains why tests fail
- 📊 **Comprehensive Reports** - HTML, JSON, Markdown formats
- 🌍 **Universal** - Works with any IDE or AI agent

## Installation

```bash
npm install -g @autoqa/mcp-server
```

## Quick Start

### 1. Configure MCP Client

#### VS Code / Cursor

Add to your `settings.json`:

```json
{
  "mcp.servers": {
    "autoqa": {
      "command": "autoqa-mcp",
      "args": []
    }
  }
}
```

#### Kiro IDE

Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "autoqa": {
      "command": "autoqa-mcp",
      "args": [],
      "disabled": false
    }
  }
}
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "autoqa": {
      "command": "autoqa-mcp",
      "args": []
    }
  }
}
```

### 2. Use in Your IDE

````
You: "Create a test for the login page"

AutoQA MCP: ✅ Test created successfully!

Test ID: test_1234567890_abc123

Generated Code:
```typescript
import { test, expect } from '@playwright/test';

test('Test login page', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="login-button"]');
  await expect(page).toHaveURL('/dashboard');
});
````

You can now run this test with: autoqa_run_test

```

## Available Tools

### 1. `autoqa_create_test`

Create a new E2E test from natural language.

**Parameters:**
- `description` (required): What to test
- `url` (optional): URL to test
- `framework` (optional): 'playwright' or 'cypress'

**Example:**
```

Create a test that verifies the checkout flow with a discount code

```

### 2. `autoqa_run_test`

Execute a test and get results.

**Parameters:**
- `testId` (required): Test ID to run
- `headless` (optional): Run in headless mode (default: true)

**Example:**
```

Run test test_1234567890_abc123

```

### 3. `autoqa_analyze_failure`

AI-powered root cause analysis for failures.

**Parameters:**
- `testId` (required): Failed test ID
- `errorMessage` (required): Error message

**Example:**
```

Analyze why test test_1234567890_abc123 failed with error "Element not found"

```

### 4. `autoqa_fix_test`

Automatically fix failing tests.

**Parameters:**
- `testId` (required): Test ID to fix
- `strategy` (optional): 'self-healing', 'ai-suggestion', or 'both'

**Example:**
```

Fix test test_1234567890_abc123 using self-healing

```

### 5. `autoqa_visual_regression`

Compare screenshots for visual changes.

**Parameters:**
- `testId` (required): Test ID
- `baselineUrl` (required): Baseline URL
- `compareUrl` (required): URL to compare

**Example:**
```

Compare screenshots between staging and production for the homepage

```

### 6. `autoqa_generate_report`

Generate comprehensive test reports.

**Parameters:**
- `testIds` (required): Array of test IDs
- `format` (optional): 'html', 'json', or 'markdown'

**Example:**
```

Generate an HTML report for all tests

````

## Use Cases

### 1. VS Code Developer

```typescript
// Developer types in chat:
"Create a test for user registration"

// AutoQA generates test
// Developer reviews and runs
"Run the test"

// Test fails
"Why did it fail?"

// AutoQA analyzes
"Fix it automatically"

// AutoQA applies self-healing ✅
````

### 2. Cursor AI Coding

```typescript
// Cursor builds a feature
// AutoQA automatically generates tests
// Tests run in background
// Self-healing fixes any issues
// Developer gets notification: "Feature tested ✅"
```

### 3. Devin Autonomous Agent

```typescript
// Devin: "Build login feature"
// Devin writes code
// AutoQA MCP: Generates tests automatically
// AutoQA MCP: Runs tests
// AutoQA MCP: Reports results to Devin
// Devin: Fixes issues based on feedback
// Loop until all tests pass ✅
```

### 4. Claude Desktop

```typescript
// User: "Help me test my website"
// Claude: Uses AutoQA MCP to create tests
// Claude: Runs tests and analyzes results
// Claude: Provides detailed feedback
// User: "Fix the failing tests"
// Claude: Uses AutoQA to apply fixes ✅
```

## Configuration

Create `autoqa.config.json` in your project root:

```json
{
  "baseURL": "https://example.com",
  "headless": true,
  "timeout": 30000,
  "retries": 2,
  "screenshot": "only-on-failure",
  "video": "retain-on-failure"
}
```

## Advanced Usage

### Custom Test Templates

```typescript
// Create test with custom template
{
  "description": "Test checkout flow",
  "template": "ecommerce-checkout",
  "data": {
    "product": "iPhone 15",
    "quantity": 2,
    "coupon": "SAVE20"
  }
}
```

### Parallel Execution

```typescript
// Run multiple tests in parallel
{
  "testIds": ["test_1", "test_2", "test_3"],
  "parallel": true,
  "workers": 4
}
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Run AutoQA Tests
  run: |
    autoqa-mcp run --all
    autoqa-mcp report --format html
```

## Troubleshooting

### MCP Server Not Found

```bash
# Verify installation
which autoqa-mcp

# Reinstall if needed
npm install -g @autoqa/mcp-server
```

### Connection Issues

```bash
# Check MCP server logs
autoqa-mcp --debug
```

### Test Failures

```bash
# Enable verbose logging
autoqa-mcp run --verbose

# Run in headed mode
autoqa-mcp run --headed
```

## Examples

See [examples](./examples) directory:

- [VS Code Integration](./examples/vscode.md)
- [Cursor Workflow](./examples/cursor.md)
- [Devin Agent](./examples/devin.md)
- [Claude Desktop](./examples/claude.md)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT License - see [LICENSE](../../LICENSE).

## Links

- 📖 [Documentation](https://docs.autoqa.dev/mcp)
- 💬 [Discord Community](https://discord.gg/autoqa)
- 🐛 [Issue Tracker](https://github.com/ai-ulu/QA/issues)
- 🌟 [GitHub](https://github.com/ai-ulu/QA)

## Support

- Email: support@autoqa.dev
- Discord: https://discord.gg/autoqa
- Twitter: @autoqa_dev

---

**Made with ❤️ for the developer community**

**Works with:** VS Code • Cursor • Kiro IDE • Claude Desktop • Devin • Any MCP-compatible tool
