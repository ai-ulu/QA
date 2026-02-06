import { TestRunner } from '../test-runner';
import { defineConfig, mergeConfig } from '../config';
import { Plugin } from '../types';

describe('Core Engine Edge Cases', () => {
  describe('Test execution edge cases', () => {
    it('should handle empty test suite', async () => {
      const runner = new TestRunner({ headless: true });
      const results = await runner.run();

      expect(results.total).toBe(0);
      expect(results.passed).toBe(0);
      expect(results.failed).toBe(0);
    });

    it('should handle test timeout', async () => {
      const runner = new TestRunner({
        headless: true,
        timeout: 100,
      });

      runner.test('timeout test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      const results = await runner.run();

      expect(results.failed).toBe(1);
      expect(results.results[0].error?.message).toContain('timeout');
    });

    it('should handle test throwing non-Error objects', async () => {
      const runner = new TestRunner({ headless: true });

      runner.test('throws string', async () => {
        throw 'string error';
      });

      const results = await runner.run();

      expect(results.failed).toBe(1);
    });

    it('should handle browser initialization failure gracefully', async () => {
      // This test verifies cleanup happens even if browser fails
      const runner = new TestRunner({
        headless: true,
      });

      runner.test('test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      const results = await runner.run();
      expect(results.total).toBe(1);
    });
  });

  describe('Plugin edge cases', () => {
    it('should handle plugin errors without crashing', async () => {
      const plugin: Plugin = {
        name: 'error-plugin',
        version: '1.0.0',
        async beforeEach() {
          throw new Error('Plugin error');
        },
      };

      const runner = new TestRunner({ headless: true });
      runner.use(plugin);

      runner.test('test with failing plugin', async ({ page }) => {
        expect(page).toBeDefined();
      });

      // Should not throw, plugin errors are caught
      const results = await runner.run();
      expect(results.failed).toBe(1);
    });

    it('should handle plugin with missing hooks', async () => {
      const plugin: Plugin = {
        name: 'minimal-plugin',
        version: '1.0.0',
        // No hooks defined
      };

      const runner = new TestRunner({ headless: true });
      runner.use(plugin);

      runner.test('test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      const results = await runner.run();
      expect(results.passed).toBe(1);
    });

    it('should handle multiple plugins with same name', async () => {
      const plugin1: Plugin = {
        name: 'duplicate',
        version: '1.0.0',
      };

      const plugin2: Plugin = {
        name: 'duplicate',
        version: '2.0.0',
      };

      const runner = new TestRunner({ headless: true });
      runner.use(plugin1);
      runner.use(plugin2);

      runner.test('test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      const results = await runner.run();
      expect(results.passed).toBe(1);
    });
  });

  describe('Configuration edge cases', () => {
    it('should handle undefined configuration', () => {
      const config = defineConfig({});
      expect(config).toEqual({});
    });

    it('should handle merging with empty configurations', () => {
      const merged = mergeConfig({}, {});
      expect(merged).toEqual({ use: {} });
    });

    it('should handle merging with undefined use property', () => {
      const base = { headless: true };
      const override = { timeout: 5000 };
      const merged = mergeConfig(base, override);

      expect(merged.headless).toBe(true);
      expect(merged.timeout).toBe(5000);
      expect(merged.use).toEqual({});
    });

    it('should handle invalid timeout values', async () => {
      const runner = new TestRunner({
        headless: true,
        timeout: 0, // Invalid but should not crash
      });

      runner.test('test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      const results = await runner.run();
      expect(results.total).toBe(1);
    });

    it('should handle negative retry values', async () => {
      const runner = new TestRunner({
        headless: true,
        retries: -1, // Invalid but should be treated as 0
      });

      runner.test('test', async () => {
        throw new Error('fail');
      });

      const results = await runner.run();
      expect(results.failed).toBe(1);
    });
  });

  describe('Test suite organization edge cases', () => {
    it('should handle nested describe blocks', async () => {
      const runner = new TestRunner({ headless: true });

      runner.describe('outer', () => {
        runner.describe('inner', () => {
          runner.test('nested test', async ({ page }) => {
            expect(page).toBeDefined();
          });
        });
      });

      const results = await runner.run();
      expect(results.total).toBe(1);
      expect(results.results[0].test.suite).toBe('inner');
    });

    it('should handle tests outside describe blocks', async () => {
      const runner = new TestRunner({ headless: true });

      runner.test('standalone test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      runner.describe('suite', () => {
        runner.test('suite test', async ({ page }) => {
          expect(page).toBeDefined();
        });
      });

      const results = await runner.run();
      expect(results.total).toBe(2);
      expect(results.results[0].test.suite).toBeUndefined();
      expect(results.results[1].test.suite).toBe('suite');
    });

    it('should handle empty describe blocks', async () => {
      const runner = new TestRunner({ headless: true });

      runner.describe('empty suite', () => {
        // No tests
      });

      const results = await runner.run();
      expect(results.total).toBe(0);
    });
  });

  describe('Hook edge cases', () => {
    it('should handle hook errors without stopping execution', async () => {
      const runner = new TestRunner({ headless: true });

      runner.beforeEach(async () => {
        throw new Error('Hook error');
      });

      runner.test('test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      const results = await runner.run();
      expect(results.failed).toBe(1);
    });

    it('should execute multiple hooks of same type', async () => {
      const executions: string[] = [];
      const runner = new TestRunner({ headless: true });

      runner.beforeEach(async () => {
        executions.push('hook1');
      });

      runner.beforeEach(async () => {
        executions.push('hook2');
      });

      runner.test('test', async ({ page }) => {
        executions.push('test');
      });

      await runner.run();

      expect(executions).toEqual(['hook1', 'hook2', 'test']);
    });

    it('should handle async hook errors', async () => {
      const runner = new TestRunner({ headless: true });

      runner.beforeAll(async () => {
        await Promise.reject(new Error('Async hook error'));
      });

      runner.test('test', async ({ page }) => {
        expect(page).toBeDefined();
      });

      // Should handle error gracefully
      await expect(runner.run()).rejects.toThrow();
    });
  });
});
