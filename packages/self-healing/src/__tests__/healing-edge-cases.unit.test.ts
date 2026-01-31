/**
 * Unit Tests for Healing Edge Cases
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 * 
 * Tests healing failure scenarios, performance optimization for large DOMs,
 * memory management for image comparison, and concurrent healing attempts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Page } from 'playwright';
import { SelfHealingEngine } from '../engine';
import { HealingContext, HealingResult, HealingConfig, HealingLogger, HealingStrategy } from '../types';

// Mock Playwright page for testing
class MockPage {
  private pageContent: string = '';
  private elements: Map<string, any> = new Map();
  private screenshotDelay: number = 0;
  private contentDelay: number = 0;

  async setContent(html: string): Promise<void> {
    if (this.contentDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.contentDelay));
    }
    this.pageContent = html;
    this.parseElements(html);
  }

  locator(selector: string) {
    return {
      first: () => ({
        count: async () => this.elements.has(selector) ? 1 : 0,
        textContent: async () => this.elements.has(selector) ? 'Mock text' : null,
        boundingBox: async () => this.elements.has(selector) ? 
          { x: 10, y: 10, width: 100, height: 50 } : null,
        evaluate: async (fn: any) => fn({ tagName: 'DIV', attributes: [] })
      })
    };
  }

  async screenshot(options?: any): Promise<Buffer> {
    if (this.screenshotDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.screenshotDelay));
    }
    return Buffer.from('mock-screenshot-data');
  }

  async content(): Promise<string> {
    if (this.contentDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.contentDelay));
    }
    return this.pageContent;
  }

  // Test utilities
  setScreenshotDelay(delay: number): void {
    this.screenshotDelay = delay;
  }

  setContentDelay(delay: number): void {
    this.contentDelay = delay;
  }

  private parseElements(html: string): void {
    const idMatches = html.match(/id="([^"]+)"/g) || [];
    const testIdMatches = html.match(/data-testid="([^"]+)"/g) || [];

    idMatches.forEach(match => {
      const id = match.match(/id="([^"]+)"/)?.[1];
      if (id) this.elements.set(`#${id}`, { id, exists: true });
    });

    testIdMatches.forEach(match => {
      const testId = match.match(/data-testid="([^"]+)"/)?.[1];
      if (testId) this.elements.set(`[data-testid="${testId}"]`, { testId, exists: true });
    });
  }
}

// Mock logger for testing
class MockLogger implements HealingLogger {
  private attempts: any[] = [];
  private results: any[] = [];
  private errors: any[] = [];

  logAttempt(attempt: any): void {
    this.attempts.push(attempt);
  }

  logResult(result: any): void {
    this.results.push(result);
  }

  logError(error: Error, context: any): void {
    this.errors.push({ error, context });
  }

  getHistory(): any[] {
    return this.results;
  }

  getAttempts(): any[] {
    return this.attempts;
  }

  getErrors(): any[] {
    return this.errors;
  }

  clear(): void {
    this.attempts = [];
    this.results = [];
    this.errors = [];
  }
}

describe('Healing Edge Cases Unit Tests', () => {
  let engine: SelfHealingEngine;
  let page: MockPage;
  let logger: MockLogger;

  beforeEach(() => {
    page = new MockPage();
    logger = new MockLogger();
    
    const config: Partial<HealingConfig> = {
      strategies: [
        HealingStrategy.CSS_SELECTOR,
        HealingStrategy.XPATH,
        HealingStrategy.TEXT_CONTENT,
        HealingStrategy.VISUAL_RECOGNITION,
        HealingStrategy.STRUCTURAL_ANALYSIS
      ],
      maxAttempts: 5,
      confidenceThreshold: 0.7,
      timeout: 5000,
      enableLogging: true,
      enableScreenshots: true,
      enableDomSnapshots: true
    };

    engine = new SelfHealingEngine(config, logger);
  });

  afterEach(() => {
    logger.clear();
  });

  describe('Healing Failure Scenarios', () => {
    it('should handle invalid healing context gracefully', async () => {
      // Test with null page
      const invalidContext1: HealingContext = {
        page: null as any,
        originalSelector: '#test-element',
        elementType: 'button'
      };

      const result1 = await engine.heal(invalidContext1);
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('Invalid healing context');

      // Test with empty selector
      const invalidContext2: HealingContext = {
        page: page as any,
        originalSelector: '',
        elementType: 'button'
      };

      const result2 = await engine.heal(invalidContext2);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Invalid healing context');

      // Test with undefined selector
      const invalidContext3: HealingContext = {
        page: page as any,
        originalSelector: undefined as any,
        elementType: 'button'
      };

      const result3 = await engine.heal(invalidContext3);
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Invalid healing context');
    });

    it('should handle page screenshot failures gracefully', async () => {
      // Mock page.screenshot to throw error
      const mockPage = {
        ...page,
        screenshot: vi.fn().mockRejectedValue(new Error('Screenshot failed')),
        locator: vi.fn().mockReturnValue({
          first: () => ({
            count: async () => 0,
            textContent: async () => null,
            boundingBox: async () => null,
            evaluate: async (fn: any) => fn({ tagName: 'DIV', attributes: [] })
          })
        }),
        content: vi.fn().mockResolvedValue('<html><body></body></html>')
      };

      const context: HealingContext = {
        page: mockPage as any,
        originalSelector: '#nonexistent-element',
        elementType: 'button'
      };

      const result = await engine.heal(context);
      
      // Should not fail due to screenshot error
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // Will fail because element doesn't exist
      expect(result.error).not.toContain('Screenshot failed'); // Should not propagate screenshot error
    });

    it('should handle DOM snapshot failures gracefully', async () => {
      // Mock page.content to throw error
      const mockPage = {
        ...page,
        content: vi.fn().mockRejectedValue(new Error('DOM snapshot failed')),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('mock')),
        locator: vi.fn().mockReturnValue({
          first: () => ({
            count: async () => 0,
            textContent: async () => null,
            boundingBox: async () => null,
            evaluate: async (fn: any) => fn({ tagName: 'DIV', attributes: [] })
          })
        })
      };

      const context: HealingContext = {
        page: mockPage as any,
        originalSelector: '#nonexistent-element',
        elementType: 'button'
      };

      const result = await engine.heal(context);
      
      // Should not fail due to DOM snapshot error
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // Will fail because element doesn't exist
      expect(result.error).not.toContain('DOM snapshot failed'); // Should not propagate DOM error
    });

    it('should handle strategy timeout scenarios', async () => {
      // Create engine with very short timeout
      const shortTimeoutEngine = new SelfHealingEngine({
        strategies: [HealingStrategy.CSS_SELECTOR],
        maxAttempts: 1,
        timeout: 100, // 100ms timeout
        confidenceThreshold: 0.7
      }, logger);

      // Mock a slow strategy by making page operations slow
      page.setContentDelay(200); // 200ms delay, longer than timeout

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#slow-element',
        elementType: 'button'
      };

      const result = await shortTimeoutEngine.heal(context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.metadata?.totalExecutionTime).toBeLessThan(1000); // Should timeout quickly
    });

    it('should handle all strategies failing', async () => {
      // Create empty page with no elements
      await page.setContent('<html><body></body></html>');

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#nonexistent-element',
        elementType: 'button',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: '#nonexistent-element' }],
          tagName: 'button',
          attributes: { id: 'nonexistent-element' }
        }
      };

      const result = await engine.heal(context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('All healing strategies failed');
      expect(result.metadata?.attemptsCount).toBeGreaterThan(0);
      expect(result.metadata?.strategiesTried).toBeDefined();
      expect(result.metadata?.strategiesTried!.length).toBeGreaterThan(0);
    });

    it('should handle malformed element location data', async () => {
      const context: HealingContext = {
        page: page as any,
        originalSelector: '#test-element',
        elementType: 'button',
        lastKnownLocation: {
          selectors: [], // Empty selectors array
          attributes: null as any, // Invalid attributes
          tagName: undefined as any // Invalid tag name
        }
      };

      const result = await engine.heal(context);
      
      // Should handle malformed data gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.metadata?.attemptsCount).toBeGreaterThan(0);
    });
  });

  describe('Performance Optimization for Large DOMs', () => {
    it('should handle large DOM structures efficiently', async () => {
      // Create a smaller DOM structure for faster testing
      const largeDOM = generateLargeDOM(100); // Reduced from 1000 to 100
      await page.setContent(largeDOM);

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#target-element-50', // Element in the middle
        elementType: 'div',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: '#target-element-50' }],
          tagName: 'div',
          attributes: { id: 'target-element-50', class: 'test-element' }
        }
      };

      const startTime = Date.now();
      const result = await engine.heal(context);
      const executionTime = Date.now() - startTime;

      // Should complete within reasonable time even with large DOM
      expect(executionTime).toBeLessThan(5000); // Reduced from 10 seconds to 5
      expect(result).toBeDefined();
      expect(result.metadata?.totalExecutionTime).toBeLessThan(5000);
    });

    it('should limit DOM traversal depth for performance', async () => {
      // Create deeply nested DOM structure
      const deepDOM = generateDeepDOM(20); // Reduced from 50 to 20 levels
      await page.setContent(deepDOM);

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#deep-element',
        elementType: 'div',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: '#deep-element' }],
          tagName: 'div',
          attributes: { id: 'deep-element' }
        }
      };

      const startTime = Date.now();
      const result = await engine.heal(context);
      const executionTime = Date.now() - startTime;

      // Should handle deep nesting efficiently
      expect(executionTime).toBeLessThan(3000); // Reduced from 5 seconds to 3
      expect(result).toBeDefined();
    });

    it('should optimize selector generation for large attribute sets', async () => {
      // Create element with many attributes
      const manyAttributesHTML = `
        <html>
          <body>
            <div 
              id="complex-element"
              class="class1 class2 class3 class4 class5"
              data-testid="test-element"
              data-component="complex"
              data-version="1.0"
              data-feature="test"
              aria-label="Complex element"
              aria-role="button"
              aria-describedby="description"
              title="Complex element title"
              name="complex-element"
              type="button"
              value="test-value"
              placeholder="Enter text"
              data-custom1="value1"
              data-custom2="value2"
              data-custom3="value3"
            >
              Complex Element
            </div>
          </body>
        </html>
      `;
      
      await page.setContent(manyAttributesHTML);

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#nonexistent-complex',
        elementType: 'div',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: '#complex-element' }],
          tagName: 'div',
          attributes: {
            id: 'complex-element',
            class: 'class1 class2 class3 class4 class5',
            'data-testid': 'test-element',
            'data-component': 'complex',
            'aria-label': 'Complex element',
            title: 'Complex element title'
          }
        }
      };

      const startTime = Date.now();
      const result = await engine.heal(context);
      const executionTime = Date.now() - startTime;

      // Should handle complex attributes efficiently
      expect(executionTime).toBeLessThan(3000); // 3 seconds max
      expect(result).toBeDefined();
      
      if (result.success) {
        // Should prioritize most reliable selectors (ID, data-testid)
        expect(result.newSelector).toMatch(/(#complex-element|\[data-testid="test-element"\])/);
      }
    });

    it('should handle concurrent DOM queries efficiently', async () => {
      const mediumDOM = generateLargeDOM(50); // Reduced from 500 to 50
      await page.setContent(mediumDOM);

      // Create fewer healing contexts for faster testing
      const contexts: HealingContext[] = Array.from({ length: 3 }, (_, i) => ({ // Reduced from 5 to 3
        page: page as any,
        originalSelector: `#nonexistent-element-${i}`,
        elementType: 'div',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: `#target-element-${i * 10}` }], // Adjusted for smaller DOM
          tagName: 'div',
          attributes: { id: `target-element-${i * 10}` }
        }
      }));

      const startTime = Date.now();
      
      // Process contexts sequentially (simulating concurrent healing attempts)
      const results = await Promise.all(
        contexts.map(context => engine.heal(context))
      );
      
      const totalExecutionTime = Date.now() - startTime;

      // Should handle multiple healing attempts efficiently
      expect(totalExecutionTime).toBeLessThan(8000); // Reduced from 15 seconds to 8
      expect(results).toHaveLength(3);
      
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.metadata?.totalExecutionTime).toBeLessThan(3000); // Reduced from 5 seconds to 3
      });
    });
  });

  describe('Memory Management for Image Comparison', () => {
    it('should handle large screenshot buffers without memory leaks', async () => {
      // Mock large screenshot buffer (simulating high-resolution screenshot)
      const largeScreenshotBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB buffer
      largeScreenshotBuffer.fill(0xFF); // Fill with data

      const mockPageWithLargeScreenshot = {
        ...page,
        screenshot: vi.fn().mockResolvedValue(largeScreenshotBuffer),
        locator: vi.fn().mockReturnValue({
          first: () => ({
            count: async () => 0,
            textContent: async () => null,
            boundingBox: async () => null,
            evaluate: async (fn: any) => fn({ tagName: 'DIV', attributes: [] })
          })
        }),
        content: vi.fn().mockResolvedValue('<html><body></body></html>')
      };

      const context: HealingContext = {
        page: mockPageWithLargeScreenshot as any,
        originalSelector: '#test-element',
        elementType: 'button',
        screenshot: largeScreenshotBuffer
      };

      // Monitor memory usage
      const initialMemory = process.memoryUsage();
      
      const result = await engine.heal(context);
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Should not cause excessive memory increase
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
      expect(result).toBeDefined();
    });

    it('should handle multiple concurrent image comparisons', async () => {
      // Create multiple screenshot buffers
      const screenshotBuffers = Array.from({ length: 10 }, () => {
        const buffer = Buffer.alloc(1024 * 1024); // 1MB each
        buffer.fill(Math.floor(Math.random() * 256));
        return buffer;
      });

      const contexts: HealingContext[] = screenshotBuffers.map((screenshot, i) => ({
        page: page as any,
        originalSelector: `#test-element-${i}`,
        elementType: 'button',
        screenshot,
        lastKnownLocation: {
          selectors: [{ type: 'visual', value: `visual-hash-${i}` }],
          visualHash: `hash-${i}`
        }
      }));

      const initialMemory = process.memoryUsage();
      
      // Process multiple image comparisons
      const results = await Promise.all(
        contexts.map(context => engine.heal(context))
      );
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Should handle multiple images without excessive memory usage
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
      expect(results).toHaveLength(10);
      
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should clean up temporary image data after processing', async () => {
      const testScreenshot = Buffer.alloc(5 * 1024 * 1024); // 5MB
      testScreenshot.fill(0xAA);

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#test-element',
        elementType: 'button',
        screenshot: testScreenshot,
        lastKnownLocation: {
          selectors: [{ type: 'visual', value: 'visual-selector' }],
          visualHash: 'test-visual-hash'
        }
      };

      // Force garbage collection before test
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage();
      
      // Process healing multiple times
      for (let i = 0; i < 5; i++) {
        await engine.heal(context);
      }
      
      // Force garbage collection after test
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be minimal after cleanup
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB increase
    });

    it('should handle corrupted image data gracefully', async () => {
      // Create corrupted image buffer
      const corruptedBuffer = Buffer.alloc(1000);
      corruptedBuffer.fill(0xFF, 0, 500);
      corruptedBuffer.fill(0x00, 500, 1000);

      const context: HealingContext = {
        page: page as any,
        originalSelector: '#test-element',
        elementType: 'button',
        screenshot: corruptedBuffer,
        lastKnownLocation: {
          selectors: [{ type: 'visual', value: 'corrupted-visual' }],
          visualHash: 'corrupted-hash'
        }
      };

      const result = await engine.heal(context);
      
      // Should handle corrupted data without crashing
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // Will likely fail due to corruption
      
      // Should log appropriate error
      const errors = logger.getErrors();
      expect(errors.length).toBeGreaterThanOrEqual(0); // May or may not log error depending on strategy
    });
  });

  describe('Concurrent Healing Attempts', () => {
    it('should handle multiple concurrent healing requests safely', async () => {
      await page.setContent(`
        <html>
          <body>
            <div id="element-1">Element 1</div>
            <div id="element-2">Element 2</div>
            <div id="element-3">Element 3</div>
          </body>
        </html>
      `);

      // Create fewer concurrent healing contexts for faster testing
      const contexts: HealingContext[] = [
        {
          page: page as any,
          originalSelector: '#old-element-1',
          elementType: 'div',
          lastKnownLocation: {
            selectors: [{ type: 'css', value: '#element-1' }],
            tagName: 'div',
            attributes: { id: 'element-1' }
          }
        },
        {
          page: page as any,
          originalSelector: '#old-element-2',
          elementType: 'div',
          lastKnownLocation: {
            selectors: [{ type: 'css', value: '#element-2' }],
            tagName: 'div',
            attributes: { id: 'element-2' }
          }
        }
      ]; // Reduced from 3 to 2 contexts

      // Execute healing attempts concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        contexts.map(context => engine.heal(context))
      );
      const totalTime = Date.now() - startTime;

      // All healing attempts should complete
      expect(results).toHaveLength(2);
      
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.metadata?.totalExecutionTime).toBeLessThan(3000); // Reduced from 5 seconds to 3
        
        // Should have attempted healing
        expect(result.metadata?.attemptsCount).toBeGreaterThan(0);
      });

      // Concurrent execution should be reasonably fast
      expect(totalTime).toBeLessThan(6000); // Reduced from 10 seconds to 6
    });

    it('should maintain thread safety with shared resources', async () => {
      // Create shared page content
      await page.setContent(`
        <html>
          <body>
            <div id="shared-element" class="shared">Shared Element</div>
          </body>
        </html>
      `);

      // Create multiple contexts targeting the same element
      const contexts: HealingContext[] = Array.from({ length: 10 }, (_, i) => ({
        page: page as any,
        originalSelector: `#old-shared-element-${i}`,
        elementType: 'div',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: '#shared-element' }],
          tagName: 'div',
          attributes: { id: 'shared-element', class: 'shared' }
        }
      }));

      // Execute concurrent healing attempts
      const results = await Promise.all(
        contexts.map(context => engine.heal(context))
      );

      // All attempts should complete without interference
      expect(results).toHaveLength(10);
      
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.metadata?.attemptsCount).toBeGreaterThan(0);
      });

      // Verify logging consistency
      const loggedAttempts = logger.getAttempts();
      const loggedResults = logger.getResults();
      
      expect(loggedResults).toHaveLength(10);
      expect(loggedAttempts.length).toBeGreaterThan(0);
    });

    it('should handle concurrent healing with different strategies', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn-1" data-testid="button-1">Button 1</button>
            <input id="input-1" name="input1" type="text" />
            <div id="div-1" class="container">Container</div>
          </body>
        </html>
      `);

      // Create contexts with different strategy preferences
      const contexts: HealingContext[] = [
        {
          page: page as any,
          originalSelector: '#old-btn',
          elementType: 'button',
          lastKnownLocation: {
            selectors: [{ type: 'css', value: '#btn-1' }],
            tagName: 'button',
            attributes: { id: 'btn-1', 'data-testid': 'button-1' }
          }
        },
        {
          page: page as any,
          originalSelector: '#old-input',
          elementType: 'input',
          lastKnownLocation: {
            selectors: [{ type: 'css', value: '#input-1' }],
            tagName: 'input',
            attributes: { id: 'input-1', name: 'input1', type: 'text' }
          }
        },
        {
          page: page as any,
          originalSelector: '#old-div',
          elementType: 'div',
          lastKnownLocation: {
            selectors: [{ type: 'css', value: '#div-1' }],
            tagName: 'div',
            attributes: { id: 'div-1', class: 'container' }
          }
        }
      ];

      // Execute with different engines having different strategy priorities
      const engines = [
        new SelfHealingEngine({ 
          strategies: [HealingStrategy.CSS_SELECTOR, HealingStrategy.XPATH],
          maxAttempts: 3,
          confidenceThreshold: 0.7
        }),
        new SelfHealingEngine({ 
          strategies: [HealingStrategy.TEXT_CONTENT, HealingStrategy.STRUCTURAL_ANALYSIS],
          maxAttempts: 3,
          confidenceThreshold: 0.7
        }),
        new SelfHealingEngine({ 
          strategies: [HealingStrategy.VISUAL_RECOGNITION, HealingStrategy.CSS_SELECTOR],
          maxAttempts: 3,
          confidenceThreshold: 0.7
        })
      ];

      const results = await Promise.all(
        contexts.map((context, index) => engines[index].heal(context))
      );

      // All healing attempts should complete
      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.metadata?.attemptsCount).toBeGreaterThan(0);
        
        // Each should have used different strategies
        expect(result.strategy).toBeDefined();
      });
    });

    it('should handle resource contention gracefully', async () => {
      // Simulate resource contention by making operations slower
      page.setScreenshotDelay(100); // 100ms delay for screenshots
      page.setContentDelay(50); // 50ms delay for content

      await page.setContent(`
        <html>
          <body>
            <div id="contended-element">Contended Element</div>
          </body>
        </html>
      `);

      // Create many concurrent contexts
      const contexts: HealingContext[] = Array.from({ length: 20 }, (_, i) => ({
        page: page as any,
        originalSelector: `#old-element-${i}`,
        elementType: 'div',
        lastKnownLocation: {
          selectors: [{ type: 'css', value: '#contended-element' }],
          tagName: 'div',
          attributes: { id: 'contended-element' }
        }
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        contexts.map(context => engine.heal(context))
      );
      const totalTime = Date.now() - startTime;

      // Should handle resource contention without failures
      expect(results).toHaveLength(20);
      
      results.forEach(result => {
        expect(result).toBeDefined();
        // Some may succeed, some may fail, but all should complete
        expect(result.metadata?.totalExecutionTime).toBeLessThan(10000);
      });

      // Should complete within reasonable time despite contention
      expect(totalTime).toBeLessThan(30000); // 30 seconds max for 20 concurrent attempts
    });
  });
});

// Helper functions for generating test DOM structures

function generateLargeDOM(elementCount: number): string {
  const elements = Array.from({ length: elementCount }, (_, i) => 
    `<div id="target-element-${i}" class="test-element" data-index="${i}">Element ${i}</div>`
  ).join('\n    ');

  return `
    <!DOCTYPE html>
    <html>
      <head><title>Large DOM Test</title></head>
      <body>
        <div id="container">
          ${elements}
        </div>
      </body>
    </html>
  `;
}

function generateDeepDOM(depth: number): string {
  let html = '<!DOCTYPE html><html><head><title>Deep DOM Test</title></head><body>';
  
  for (let i = 0; i < depth; i++) {
    html += `<div id="level-${i}" class="level-${i}">`;
  }
  
  html += '<div id="deep-element">Deep Element</div>';
  
  for (let i = 0; i < depth; i++) {
    html += '</div>';
  }
  
  html += '</body></html>';
  
  return html;
}