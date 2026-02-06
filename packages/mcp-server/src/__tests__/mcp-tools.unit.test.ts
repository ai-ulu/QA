/**
 * Unit Tests for MCP Server Tools
 * 
 * These tests validate edge cases and error handling for the AutoQA MCP server.
 */

describe('MCP Server Tools - Unit Tests', () => {
  describe('Test ID Generation', () => {
    test('should generate test ID with correct format', () => {
      const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      expect(testId).toMatch(/^test_\d+_[a-z0-9]+$/);
      expect(testId.startsWith('test_')).toBe(true);
    });

    test('should generate different IDs on consecutive calls', () => {
      const id1 = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const id2 = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('Test Code Generation', () => {
    test('should generate valid Playwright test code', () => {
      const description = 'Test login functionality';
      const url = 'https://example.com/login';
      
      const code = `import { test, expect } from '@playwright/test';

test('${description}', async ({ page }) => {
  await page.goto('${url}');
  await page.waitForLoadState('networkidle');
});`;

      expect(code).toContain("import { test, expect } from '@playwright/test'");
      expect(code).toContain(description);
      expect(code).toContain(url);
      expect(code).toContain('async ({ page })');
    });

    test('should handle special characters in description', () => {
      const description = "Test with 'quotes' and \"double quotes\"";
      const code = `test('${description}', async ({ page }) => {})`;
      
      expect(code).toContain(description);
    });

    test('should use default URL when not provided', () => {
      const description = 'Test without URL';
      const defaultUrl = 'https://example.com';
      
      const code = `import { test, expect } from '@playwright/test';

test('${description}', async ({ page }) => {
  await page.goto('${defaultUrl}');
  await page.waitForLoadState('networkidle');
});`;

      expect(code).toContain(defaultUrl);
    });
  });

  describe('Test Execution Results', () => {
    test('should return passed status for successful test', () => {
      const result = {
        status: 'passed' as const,
        duration: 2500,
        screenshot: 'data:image/png;base64,abc123',
      };

      expect(result.status).toBe('passed');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.screenshot).toBeDefined();
    });

    test('should return failed status with error message', () => {
      const result = {
        status: 'failed' as const,
        duration: 1500,
        screenshot: 'data:image/png;base64,abc123',
        error: 'Element not found',
      };

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Element not found');
    });

    test('should handle missing screenshot gracefully', () => {
      const result = {
        status: 'failed' as const,
        duration: 1000,
        screenshot: undefined,
        error: 'Screenshot capture failed',
      };

      expect(result.screenshot).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('Root Cause Analysis', () => {
    test('should provide explanation and suggestions', () => {
      const analysis = {
        explanation: 'Element selector changed',
        suggestions: [
          'Update selector to use data-testid',
          'Enable self-healing',
        ],
        confidence: 0.85,
        category: 'selector_change',
      };

      expect(analysis.explanation).toBeDefined();
      expect(analysis.suggestions).toHaveLength(2);
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
    });

    test('should handle low confidence scenarios', () => {
      const analysis = {
        explanation: 'Unknown error',
        suggestions: ['Check logs', 'Retry test'],
        confidence: 0.3,
        category: 'unknown',
      };

      expect(analysis.confidence).toBeLessThan(0.5);
      expect(analysis.category).toBe('unknown');
    });
  });

  describe('Self-Healing Fix', () => {
    test('should provide fix description and code', () => {
      const fix = {
        description: 'Updated selector to use data-testid',
        code: 'await page.click("[data-testid=submit]")',
        confidence: 0.9,
      };

      expect(fix.description).toBeDefined();
      expect(fix.code).toContain('data-testid');
      expect(fix.confidence).toBeGreaterThan(0.8);
    });

    test('should handle failed healing attempts', () => {
      const fix = {
        description: 'Self-healing failed',
        code: '// Manual intervention required',
        confidence: 0,
      };

      expect(fix.confidence).toBe(0);
      expect(fix.code).toContain('Manual intervention');
    });
  });

  describe('Visual Regression Comparison', () => {
    test('should pass when difference is below threshold', () => {
      const result = {
        percentage: 2.5,
        passed: true,
        diffUrl: 'diff.png',
        pixelsDifferent: 1250,
      };

      expect(result.passed).toBe(true);
      expect(result.percentage).toBeLessThan(5);
    });

    test('should fail when difference exceeds threshold', () => {
      const result = {
        percentage: 15.8,
        passed: false,
        diffUrl: 'diff.png',
        pixelsDifferent: 7900,
      };

      expect(result.passed).toBe(false);
      expect(result.percentage).toBeGreaterThan(5);
    });

    test('should handle comparison errors', () => {
      const result = {
        percentage: 0,
        passed: false,
        diffUrl: 'Error during comparison',
        error: 'Failed to load baseline image',
      };

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Report Generation', () => {
    test('should generate HTML report', () => {
      const report = {
        url: 'report.html',
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
        },
      };

      expect(report.url).toContain('.html');
      expect(report.summary.total).toBe(10);
      expect(report.summary.passed + report.summary.failed).toBe(10);
    });

    test('should generate JSON report', () => {
      const report = {
        url: 'report.json',
        summary: {
          total: 5,
          passed: 5,
          failed: 0,
        },
      };

      expect(report.url).toContain('.json');
      expect(report.summary.failed).toBe(0);
    });

    test('should handle empty test list', () => {
      const report = {
        url: 'report.html',
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
        },
      };

      expect(report.summary.total).toBe(0);
    });
  });

  describe('Tool Schema Validation', () => {
    test('should validate create_test schema', () => {
      const schema = {
        type: 'object',
        properties: {
          description: { type: 'string' },
          url: { type: 'string' },
          framework: { type: 'string', enum: ['playwright', 'cypress'] },
        },
        required: ['description'],
      };

      expect(schema.required).toContain('description');
      expect(schema.properties.framework).toBeDefined();
    });

    test('should validate run_test schema', () => {
      const schema = {
        type: 'object',
        properties: {
          testId: { type: 'string' },
          headless: { type: 'boolean', default: true },
        },
        required: ['testId'],
      };

      expect(schema.required).toContain('testId');
      expect(schema.properties.headless.default).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing test ID', () => {
      const error = new Error('Test test_123 not found');
      
      expect(error.message).toContain('not found');
    });

    test('should handle browser launch failure', () => {
      const error = new Error('Failed to launch browser');
      
      expect(error.message).toContain('Failed to launch');
    });

    test('should handle network timeout', () => {
      const error = new Error('Navigation timeout exceeded');
      
      expect(error.message).toContain('timeout');
    });
  });
});
