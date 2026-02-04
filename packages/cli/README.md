# AutoQA CLI

The command-line interface for AutoQA - Automated testing made simple.

## Installation

```bash
npm install -g @autoqa/cli
```

Or use without installation:

```bash
npx @autoqa/cli init my-project
```

## Quick Start

Create a new AutoQA project:

```bash
npx autoqa init my-project
cd my-project
npm run test
```

## Commands

### `autoqa init [project-name]`

Create a new AutoQA project with templates and examples.

**Options:**

- `-t, --template <template>` - Project template (react, nextjs, vue, angular, ecommerce, saas, blog)
- `-y, --yes` - Skip interactive prompts
- `--url <url>` - Target URL for initial test generation
- `--deploy <target>` - Setup deployment (vercel, netlify)

**Examples:**

```bash
# Basic project
npx autoqa init my-tests

# React project with e-commerce template
npx autoqa init my-shop --template=ecommerce --url=https://myshop.com

# Quick setup without prompts
npx autoqa init my-tests --yes --template=basic
```

### `autoqa dev`

Start development mode with file watching and test runner.

**Options:**

- `-p, --port <port>` - Test runner port (default: 3333)
- `--headless` - Run tests in headless mode
- `--watch <pattern>` - Watch pattern for test files

**Examples:**

```bash
# Start dev mode
npx autoqa dev

# Custom port and headless mode
npx autoqa dev --port=4000 --headless
```

### `autoqa record <url>`

Record user interactions to generate tests automatically.

**Options:**

- `-o, --output <file>` - Output test file (default: recorded-test.spec.ts)
- `--browser <browser>` - Browser to use (chromium, firefox, webkit)
- `--device <device>` - Device to emulate

**Examples:**

```bash
# Record interactions on a website
npx autoqa record https://example.com

# Record with custom output file
npx autoqa record https://myapp.com --output=login-test.spec.ts
```

### `autoqa debug <test-name>`

Debug a specific test with headed browser and slow motion.

**Options:**

- `--browser <browser>` - Browser to use (default: chromium)
- `--device <device>` - Device to emulate
- `--slow-mo <ms>` - Slow down operations by milliseconds (default: 1000)

**Examples:**

```bash
# Debug a specific test
npx autoqa debug login-test

# Debug with custom browser and slow motion
npx autoqa debug checkout --browser=firefox --slow-mo=2000
```

### `autoqa generate <input>`

Generate tests using AI from URL or description.

**Options:**

- `-o, --output <file>` - Output test file
- `--type <type>` - Test type (e2e, api, visual)
- `--framework <framework>` - Test framework (playwright, cypress)

**Examples:**

```bash
# Generate test from URL
npx autoqa generate https://myapp.com

# Generate test from description
npx autoqa generate "User should be able to login with valid credentials"

# Generate API test
npx autoqa generate https://api.myapp.com --type=api
```

## Templates

AutoQA CLI comes with several built-in templates:

### Framework Templates

- **basic** - Simple Playwright setup with essential tests
- **react** - React application testing setup
- **nextjs** - Next.js application testing with SSR support
- **vue** - Vue.js application testing setup
- **angular** - Angular application testing setup

### Industry Templates

- **ecommerce** - E-commerce testing patterns (checkout, cart, products)
- **saas** - SaaS application testing (auth, billing, features)
- **blog** - Blog/CMS testing patterns

## Development Mode

The `autoqa dev` command starts a development server with:

- **File Watching** - Automatically runs tests when files change
- **Test Runner UI** - Web-based test runner at http://localhost:3333
- **Real-time Updates** - See test results in real-time
- **Interactive Controls** - Keyboard shortcuts for common actions

### Keyboard Shortcuts in Dev Mode

- `r` - Run all tests
- `c` - Clear console
- `q` - Quit dev mode

## Recording Tests

The `autoqa record` command launches a browser and records your interactions:

1. Browser opens to the specified URL
2. Interact with the page normally (click, type, navigate)
3. All actions are automatically recorded
4. Press Ctrl+C to stop recording
5. Test file is generated with your recorded actions

## AI Test Generation

The `autoqa generate` command uses AI to create tests:

- **From URLs** - Analyzes the webpage and generates appropriate tests
- **From Descriptions** - Converts natural language to test code
- **Smart Selectors** - Generates robust element selectors
- **Best Practices** - Follows testing best practices automatically

## Configuration

AutoQA CLI works with standard Playwright configuration files:

- `playwright.config.ts` - Main Playwright configuration
- `package.json` - Scripts and dependencies
- `tsconfig.json` - TypeScript configuration

## Examples

### Complete E-commerce Setup

```bash
# Create e-commerce project
npx autoqa init my-shop --template=ecommerce --url=https://myshop.com

# Start development mode
cd my-shop
npx autoqa dev

# Record a checkout flow
npx autoqa record https://myshop.com/checkout --output=checkout-flow.spec.ts

# Debug a failing test
npx autoqa debug checkout-flow --slow-mo=2000
```

### SaaS Application Testing

```bash
# Create SaaS project
npx autoqa init my-saas --template=saas --url=https://app.mycompany.com

# Generate authentication tests
npx autoqa generate "User registration and login flow" --output=auth.spec.ts

# Generate billing tests
npx autoqa generate https://app.mycompany.com/billing --output=billing.spec.ts
```

## Support

- [Documentation](https://docs.autoqa.dev)
- [GitHub Issues](https://github.com/autoqa/autoqa/issues)
- [Community Discord](https://discord.gg/autoqa)

## License

MIT
