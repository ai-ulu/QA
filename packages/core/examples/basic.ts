import { TestRunner, defineConfig } from '@autoqa/core';

// Define configuration
const config = defineConfig({
  baseURL: 'https://example.com',
  headless: true,
  timeout: 30000,
});

// Create test runner
const runner = new TestRunner(config);

// Define tests
runner.describe('Homepage', () => {
  runner.test('loads correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1');
    const title = await page.textContent('h1');
    if (title !== 'Example Domain') {
      throw new Error(`Expected "Example Domain", got "${title}"`);
    }
  });

  runner.test('has correct meta description', async ({ page }) => {
    await page.goto('/');
    const description = await page.getAttribute('meta[name="description"]', 'content');
    if (!description) {
      throw new Error('Meta description not found');
    }
  });
});

// Run tests
runner.run().then((results) => {
  console.log(`Tests completed: ${results.passed}/${results.total} passed`);
  process.exit(results.failed > 0 ? 1 : 0);
});
