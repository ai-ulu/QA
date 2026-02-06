import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  TestConfig,
  TestContext,
  TestFunction,
  HookFunction,
  Test,
  TestResult,
  TestResults,
  Plugin,
  Hook,
} from './types';

export class TestRunner {
  private config: TestConfig;
  private tests: Test[] = [];
  private hooks: Hook[] = [];
  private plugins: Plugin[] = [];
  private currentSuite?: string;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(config: TestConfig = {}) {
    this.config = {
      headless: true,
      timeout: 30000,
      retries: 0,
      workers: 1,
      reporter: 'list',
      ...config,
    };
  }

  /**
   * Define a test
   */
  test(name: string, fn: TestFunction): void {
    const test: Test = {
      id: `${this.currentSuite ? `${this.currentSuite}-` : ''}${this.tests.length}`,
      name,
      fn,
      suite: this.currentSuite,
      timeout: this.config.timeout,
      retries: this.config.retries,
    };
    this.tests.push(test);
  }

  /**
   * Group tests in a suite
   */
  describe(name: string, fn: () => void): void {
    const previousSuite = this.currentSuite;
    this.currentSuite = name;
    fn();
    this.currentSuite = previousSuite;
  }

  /**
   * Run before all tests
   */
  beforeAll(fn: HookFunction): void {
    this.hooks.push({ type: 'beforeAll', fn });
  }

  /**
   * Run before each test
   */
  beforeEach(fn: HookFunction): void {
    this.hooks.push({ type: 'beforeEach', fn });
  }

  /**
   * Run after each test
   */
  afterEach(fn: HookFunction): void {
    this.hooks.push({ type: 'afterEach', fn });
  }

  /**
   * Run after all tests
   */
  afterAll(fn: HookFunction): void {
    this.hooks.push({ type: 'afterAll', fn });
  }

  /**
   * Register a plugin
   */
  use(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  /**
   * Run all tests
   */
  async run(): Promise<TestResults> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    try {
      // Initialize browser
      this.browser = await chromium.launch({ headless: this.config.headless });
      this.context = await this.browser.newContext({
        baseURL: this.config.baseURL,
      });
      this.page = await this.context.newPage();

      // Run plugin beforeAll hooks
      for (const plugin of this.plugins) {
        if (plugin.beforeAll) {
          await plugin.beforeAll(this.config);
        }
      }

      // Run beforeAll hooks
      for (const hook of this.hooks.filter((h) => h.type === 'beforeAll')) {
        await hook.fn(this.getTestContext());
      }

      // Run each test
      for (const test of this.tests) {
        const result = await this.runTest(test);
        results.push(result);
      }

      // Run afterAll hooks
      for (const hook of this.hooks.filter((h) => h.type === 'afterAll')) {
        await hook.fn(this.getTestContext());
      }

      // Run plugin afterAll hooks
      const testResults = this.buildResults(results, startTime);
      for (const plugin of this.plugins) {
        if (plugin.afterAll) {
          await plugin.afterAll(testResults);
        }
      }

      return testResults;
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  /**
   * Run a single test
   */
  private async runTest(test: Test): Promise<TestResult> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts <= (test.retries || 0)) {
      try {
        // Run plugin beforeEach hooks
        for (const plugin of this.plugins) {
          if (plugin.beforeEach) {
            await plugin.beforeEach(test);
          }
        }

        // Run beforeEach hooks
        for (const hook of this.hooks.filter((h) => h.type === 'beforeEach')) {
          await hook.fn(this.getTestContext());
        }

        // Run the test with timeout
        await Promise.race([
          test.fn(this.getTestContext()),
          this.timeout(test.timeout || this.config.timeout!),
        ]);

        // Test passed
        const result: TestResult = {
          test,
          status: 'passed',
          duration: Date.now() - startTime,
        };

        // Run afterEach hooks
        for (const hook of this.hooks.filter((h) => h.type === 'afterEach')) {
          await hook.fn(this.getTestContext());
        }

        // Run plugin afterEach hooks
        for (const plugin of this.plugins) {
          if (plugin.afterEach) {
            await plugin.afterEach(test, result);
          }
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;

        if (attempts > (test.retries || 0)) {
          // Test failed after all retries
          const result: TestResult = {
            test,
            status: 'failed',
            duration: Date.now() - startTime,
            error: lastError,
          };

          // Run afterEach hooks
          for (const hook of this.hooks.filter((h) => h.type === 'afterEach')) {
            try {
              await hook.fn(this.getTestContext());
            } catch (hookError) {
              console.error('Hook error:', hookError);
            }
          }

          // Run plugin afterEach hooks
          for (const plugin of this.plugins) {
            if (plugin.afterEach) {
              try {
                await plugin.afterEach(test, result);
              } catch (pluginError) {
                console.error('Plugin error:', pluginError);
              }
            }
          }

          return result;
        }

        // Retry - create new page
        await this.page?.close();
        this.page = await this.context!.newPage();
      }
    }

    // Should never reach here
    throw new Error('Unexpected test execution state');
  }

  /**
   * Get test context
   */
  private getTestContext(): TestContext {
    if (!this.browser || !this.context || !this.page) {
      throw new Error('Browser not initialized');
    }
    return {
      browser: this.browser,
      context: this.context,
      page: this.page,
    };
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Test timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Build test results
   */
  private buildResults(results: TestResult[], startTime: number): TestResults {
    return {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      duration: Date.now() - startTime,
      results,
    };
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      await this.page?.close();
      await this.context?.close();
      await this.browser?.close();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}
