# @autoqa/core

Open source core test execution engine for AutoQA. Run tests locally without cloud services.

## Features

- 🚀 **Standalone Execution**: Run tests locally without cloud dependencies
- 🔌 **Plugin Architecture**: Extend functionality with custom plugins
- 📦 **Self-Hosted**: Deploy on your own infrastructure
- 🎯 **Playwright Integration**: Built on top of Playwright for reliable testing
- 🔧 **CLI Support**: Command-line interface for automation
- 🐳 **Docker Ready**: Run in containers with Docker Compose

## Installation

```bash
npm install @autoqa/core
```

## Quick Start

```typescript
import { TestRunner, TestConfig } from '@autoqa/core';

const config: TestConfig = {
  baseURL: 'https://example.com',
  headless: true,
  timeout: 30000,
};

const runner = new TestRunner(config);

// Define a test
runner.test('Homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1');
  const title = await page.textContent('h1');
  expect(title).toBe('Welcome');
});

// Run all tests
await runner.run();
```

## CLI Usage

```bash
# Initialize a new project
npx @autoqa/core init

# Run tests
npx @autoqa/core run

# Run in watch mode
npx @autoqa/core dev

# Run specific test file
npx @autoqa/core run tests/login.test.ts
```

## Configuration

Create an `autoqa.config.ts` file:

```typescript
import { defineConfig } from '@autoqa/core';

export default defineConfig({
  baseURL: 'https://example.com',
  headless: true,
  timeout: 30000,
  retries: 2,
  workers: 4,
  reporter: 'html',
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

## Plugin System

Create custom plugins to extend functionality:

```typescript
import { Plugin } from '@autoqa/core';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',

  async beforeAll(config) {
    console.log('Setup before all tests');
  },

  async beforeEach(test) {
    console.log(`Running test: ${test.name}`);
  },

  async afterEach(test, result) {
    console.log(`Test ${test.name}: ${result.status}`);
  },

  async afterAll(results) {
    console.log(`Total tests: ${results.length}`);
  },
};

// Use the plugin
runner.use(myPlugin);
```

## Docker Deployment

```bash
# Build Docker image
docker build -t autoqa-core .

# Run with Docker Compose
docker-compose up
```

Example `docker-compose.yml`:

```yaml
version: '3.8'
services:
  autoqa:
    image: autoqa-core
    volumes:
      - ./tests:/app/tests
      - ./reports:/app/reports
    environment:
      - BASE_URL=https://example.com
      - HEADLESS=true
```

## Self-Hosted Deployment

Deploy on your own infrastructure:

```bash
# Clone the repository
git clone https://github.com/agiulucom42-del/QA.git
cd QA/packages/core

# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

## API Reference

### TestRunner

Main test execution engine.

```typescript
class TestRunner {
  constructor(config: TestConfig);
  test(name: string, fn: TestFunction): void;
  describe(name: string, fn: () => void): void;
  beforeAll(fn: HookFunction): void;
  beforeEach(fn: HookFunction): void;
  afterEach(fn: HookFunction): void;
  afterAll(fn: HookFunction): void;
  use(plugin: Plugin): void;
  run(): Promise<TestResults>;
}
```

### TestConfig

Configuration options for test execution.

```typescript
interface TestConfig {
  baseURL?: string;
  headless?: boolean;
  timeout?: number;
  retries?: number;
  workers?: number;
  reporter?: 'list' | 'json' | 'html' | 'junit';
  use?: {
    screenshot?: 'on' | 'off' | 'only-on-failure';
    video?: 'on' | 'off' | 'retain-on-failure';
    trace?: 'on' | 'off' | 'retain-on-failure';
  };
}
```

### Plugin

Plugin interface for extending functionality.

```typescript
interface Plugin {
  name: string;
  version: string;
  beforeAll?(config: TestConfig): Promise<void>;
  beforeEach?(test: Test): Promise<void>;
  afterEach?(test: Test, result: TestResult): Promise<void>;
  afterAll?(results: TestResults): Promise<void>;
}
```

## Examples

See the [examples](./examples) directory for more usage examples:

- [Basic test](./examples/basic.ts)
- [Custom plugin](./examples/plugin.ts)
- [Docker deployment](./examples/docker)
- [CI/CD integration](./examples/ci-cd)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Support

- 📖 [Documentation](https://docs.autoqa.dev)
- 💬 [Discord Community](https://discord.gg/autoqa)
- 🐛 [Issue Tracker](https://github.com/agiulucom42-del/QA/issues)
- 📧 [Email Support](mailto:support@autoqa.dev)

## Related Packages

- [@autoqa/cli](../cli) - Command-line interface
- [@autoqa/plugins](../plugins) - Official plugin collection
- [@autoqa/vscode](../vscode-extension) - VS Code extension
