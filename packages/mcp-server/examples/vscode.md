# AutoQA MCP Server - VS Code Integration

## Setup

### 1. Install Extension

```bash
# Install MCP extension for VS Code
code --install-extension modelcontextprotocol.mcp
```

### 2. Configure MCP Server

Add to `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "autoqa": {
      "command": "npx",
      "args": ["@autoqa/mcp-server"],
      "env": {
        "AUTOQA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage Examples

### Example 1: Create Test from Chat

```
You: Create a test for the login page at https://myapp.com/login

AutoQA: ✅ Test created!

import { test, expect } from '@playwright/test';

test('Test login page', async ({ page }) => {
  await page.goto('https://myapp.com/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="login-button"]');
  await expect(page).toHaveURL('/dashboard');
});

Test ID: test_1234567890_abc123
```

### Example 2: Run Test

```
You: Run the test

AutoQA: ✅ Test passed!
Duration: 2.5s
Screenshot: [View]
```

### Example 3: Fix Failing Test

```
You: The test is failing with "Element not found"

AutoQA: 🔍 Analyzing...

Root Cause: The button selector changed from #login to [data-testid="login-button"]

You: Fix it automatically

AutoQA: 🔧 Applied self-healing!
Updated selector to use data-testid attribute.
Test now passes ✅
```

## Keyboard Shortcuts

- `Cmd/Ctrl + Shift + T` - Create new test
- `Cmd/Ctrl + Shift + R` - Run current test
- `Cmd/Ctrl + Shift + A` - Analyze failure

## Tips

1. **Use Natural Language**: Describe tests in plain English
2. **Be Specific**: Include URLs and expected behavior
3. **Iterate**: Ask AutoQA to refine tests based on feedback
4. **Visual Regression**: Request screenshot comparisons for UI changes

## Troubleshooting

### MCP Server Not Responding

```bash
# Check server status
npx @autoqa/mcp-server --debug

# Restart VS Code
# Cmd/Ctrl + Shift + P -> "Reload Window"
```

### Tests Not Running

```bash
# Verify Playwright installation
npx playwright install

# Check test configuration
cat autoqa.config.json
```
