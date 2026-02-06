import { TestRunner, Plugin, TestConfig, Test, TestResult, TestResults } from '@autoqa/core';

// Create a custom plugin
const loggingPlugin: Plugin = {
  name: 'logging-plugin',
  version: '1.0.0',

  async beforeAll(config: TestConfig) {
    console.log('🚀 Starting test suite');
    console.log(`Base URL: ${config.baseURL}`);
    console.log(`Headless: ${config.headless}`);
  },

  async beforeEach(test: Test) {
    console.log(`\n▶️  Running: ${test.name}`);
  },

  async afterEach(test: Test, result: TestResult) {
    const icon = result.status === 'passed' ? '✅' : '❌';
    console.log(`${icon} ${test.name} - ${result.duration}ms`);
    if (result.error) {
      console.log(`   Error: ${result.error.message}`);
    }
  },

  async afterAll(results: TestResults) {
    console.log('\n📊 Test Summary:');
    console.log(`   Total: ${results.total}`);
    console.log(`   Passed: ${results.passed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Duration: ${results.duration}ms`);
  },
};

// Create test runner with plugin
const runner = new TestRunner({
  baseURL: 'https://example.com',
  headless: true,
});

runner.use(loggingPlugin);

// Define tests
runner.test('Homepage loads', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1');
});

runner.test('Navigation works', async ({ page }) => {
  await page.goto('/');
  const links = await page.locator('a').count();
  if (links === 0) {
    throw new Error('No links found');
  }
});

// Run tests
runner.run();
