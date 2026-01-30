import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { AIService } from '../ai-service';
import { AIServiceConfig, CodeGenerationRequest } from '../types';

/**
 * Property 3: Natural Language to Code Generation
 * Validates: Requirements 2.1, 2.5
 * Test that generated code is syntactically valid Playwright code
 * Verify all generated code can be executed without compilation errors
 */

describe('AI Code Generation Property Tests', () => {
  let aiService: AIService;
  let mockConfig: AIServiceConfig;

  beforeEach(() => {
    // Mock configuration for testing
    mockConfig = {
      providers: {
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4-turbo-preview',
          maxTokens: 2000,
          temperature: 0.3
        }
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 60000
      },
      rateLimiter: {
        tokensPerMinute: 1000,
        requestsPerMinute: 60
      },
      defaultProvider: 'openai'
    };

    // Mock the OpenAI provider to avoid actual API calls
    vi.mock('../providers/openai', () => ({
      OpenAIProvider: vi.fn().mockImplementation(() => ({
        name: 'openai',
        generateCode: vi.fn().mockResolvedValue({
          code: `import { test, expect } from '@playwright/test';

test('generated test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`,
          explanation: 'A basic Playwright test',
          confidence: 0.9,
          tokensUsed: 150,
          model: 'gpt-4-turbo-preview',
          provider: 'openai'
        }),
        validateCode: vi.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          warnings: [],
          suggestions: []
        })
      }))
    }));

    aiService = new AIService(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property: Generated code is syntactically valid TypeScript/Playwright code
   */
  it('should generate syntactically valid Playwright code for any natural language input', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate various natural language test descriptions
        fc.record({
          naturalLanguage: fc.oneof(
            fc.constant('Navigate to homepage and check title'),
            fc.constant('Click login button and verify redirect'),
            fc.constant('Fill form and submit'),
            fc.constant('Search for product and verify results'),
            fc.constant('Test responsive navigation menu'),
            fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5)
          ),
          context: fc.record({
            url: fc.option(fc.webUrl()),
            framework: fc.constantFrom('playwright', 'selenium', 'cypress'),
            language: fc.constantFrom('javascript', 'typescript', 'python')
          }, { requiredKeys: [] })
        }),
        async (request: CodeGenerationRequest) => {
          // Generate code using AI service
          const result = await aiService.convertNaturalLanguageToCode(request);

          // Property 1: Generated code should be non-empty string
          expect(result.code).toBeDefined();
          expect(typeof result.code).toBe('string');
          expect(result.code.trim().length).toBeGreaterThan(0);

          // Property 2: Generated code should contain Playwright imports
          expect(result.code).toMatch(/import.*@playwright\/test/);

          // Property 3: Generated code should contain test function
          expect(result.code).toMatch(/test\s*\(/);

          // Property 4: Generated code should contain page parameter
          expect(result.code).toMatch(/\{\s*page\s*\}/);

          // Property 5: Generated code should be syntactically valid
          expect(result.syntaxValid).toBe(true);

          // Property 6: Confidence should be between 0 and 1
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);

          // Property 7: Provider should be specified
          expect(result.provider).toBeDefined();
          expect(typeof result.provider).toBe('string');

          // Property 8: Tokens used should be positive
          expect(result.tokensUsed).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  }, 60000);

  /**
   * Property: Code validation is consistent and reliable
   */
  it('should consistently validate generated code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.oneof(
            // Valid Playwright code samples
            fc.constant(`import { test, expect } from '@playwright/test';
test('valid test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`),
            // Invalid code samples
            fc.constant(`invalid javascript code { { {`),
            fc.constant(`import { test } from '@playwright/test';
test('incomplete test', async ({ page }) => {
  await page.goto(
});`)
          )
        }),
        async ({ code }) => {
          const validation = await aiService.validateCode(code);

          // Property 1: Validation result should have required fields
          expect(validation).toHaveProperty('isValid');
          expect(validation).toHaveProperty('errors');
          expect(validation).toHaveProperty('warnings');
          expect(validation).toHaveProperty('suggestions');

          // Property 2: isValid should be boolean
          expect(typeof validation.isValid).toBe('boolean');

          // Property 3: Arrays should be arrays
          expect(Array.isArray(validation.errors)).toBe(true);
          expect(Array.isArray(validation.warnings)).toBe(true);
          expect(Array.isArray(validation.suggestions)).toBe(true);

          // Property 4: If code is invalid, there should be errors
          if (!validation.isValid) {
            expect(validation.errors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 15, timeout: 20000 }
    );
  }, 40000);

  /**
   * Property: Scenario parsing is consistent
   */
  it('should consistently parse test scenarios from natural language', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          naturalLanguage: fc.oneof(
            fc.constant('Navigate to login page, click login button, and verify success message'),
            fc.constant('Go to homepage, search for "test", and check results'),
            fc.constant('Open settings page, change theme to dark, and save changes'),
            fc.string({ minLength: 20, maxLength: 200 }).filter(s => 
              s.includes('click') || s.includes('navigate') || s.includes('type') || s.includes('verify')
            )
          )
        }),
        async ({ naturalLanguage }) => {
          const result = await aiService.convertNaturalLanguageToCode({ naturalLanguage });

          if (result.scenario) {
            // Property 1: Scenario should have required fields
            expect(result.scenario).toHaveProperty('id');
            expect(result.scenario).toHaveProperty('name');
            expect(result.scenario).toHaveProperty('description');
            expect(result.scenario).toHaveProperty('steps');
            expect(result.scenario).toHaveProperty('assertions');

            // Property 2: ID should be non-empty string
            expect(typeof result.scenario.id).toBe('string');
            expect(result.scenario.id.length).toBeGreaterThan(0);

            // Property 3: Steps should be array
            expect(Array.isArray(result.scenario.steps)).toBe(true);

            // Property 4: Each step should have required fields
            result.scenario.steps.forEach(step => {
              expect(step).toHaveProperty('id');
              expect(step).toHaveProperty('type');
              expect(step).toHaveProperty('description');
              expect(typeof step.id).toBe('string');
              expect(typeof step.type).toBe('string');
              expect(typeof step.description).toBe('string');
            });

            // Property 5: Assertions should be array
            expect(Array.isArray(result.scenario.assertions)).toBe(true);

            // Property 6: Each assertion should have required fields
            result.scenario.assertions.forEach(assertion => {
              expect(assertion).toHaveProperty('id');
              expect(assertion).toHaveProperty('type');
              expect(assertion).toHaveProperty('expected');
              expect(assertion).toHaveProperty('description');
            });
          }
        }
      ),
      { numRuns: 10, timeout: 25000 }
    );
  }, 50000);

  /**
   * Property: Rate limiting works correctly
   */
  it('should respect rate limits consistently', async () => {
    // Create service with very low rate limits for testing
    const limitedConfig = {
      ...mockConfig,
      rateLimiter: {
        tokensPerMinute: 100,
        requestsPerMinute: 2
      }
    };

    const limitedService = new AIService(limitedConfig);

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 3, maxLength: 5 }),
        async (requests) => {
          const results: Array<{ success: boolean; error?: string }> = [];

          for (const request of requests) {
            try {
              await limitedService.convertNaturalLanguageToCode({ naturalLanguage: request });
              results.push({ success: true });
            } catch (error) {
              results.push({ 
                success: false, 
                error: (error as Error).message 
              });
            }
          }

          // Property 1: Some requests should succeed
          const successCount = results.filter(r => r.success).length;
          expect(successCount).toBeGreaterThan(0);

          // Property 2: Rate limit errors should mention rate limiting
          const rateLimitErrors = results.filter(r => 
            !r.success && r.error?.includes('rate limit')
          );

          // Property 3: If we exceed limits, we should get rate limit errors
          if (requests.length > 2) {
            expect(rateLimitErrors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  }, 30000);

  /**
   * Property: Circuit breaker activates on failures
   */
  it('should activate circuit breaker on consecutive failures', async () => {
    // Mock provider to always fail
    const failingConfig = { ...mockConfig };
    
    vi.doMock('../providers/openai', () => ({
      OpenAIProvider: vi.fn().mockImplementation(() => ({
        name: 'openai',
        generateCode: jest.fn().mockRejectedValue(new Error('API Error')),
        validateCode: jest.fn().mockRejectedValue(new Error('API Error'))
      }))
    }));

    const failingService = new AIService(failingConfig);

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 5, maxLength: 30 }), { minLength: 6, maxLength: 8 }),
        async (requests) => {
          const results: Array<{ success: boolean; error?: string }> = [];

          for (const request of requests) {
            try {
              await failingService.convertNaturalLanguageToCode({ naturalLanguage: request });
              results.push({ success: true });
            } catch (error) {
              results.push({ 
                success: false, 
                error: (error as Error).message 
              });
            }
          }

          // Property 1: All requests should fail
          const failureCount = results.filter(r => !r.success).length;
          expect(failureCount).toBe(requests.length);

          // Property 2: Later failures should mention circuit breaker
          const circuitBreakerErrors = results.filter(r => 
            !r.success && r.error?.includes('Circuit breaker')
          );

          // After enough failures, circuit breaker should activate
          if (requests.length >= 5) {
            expect(circuitBreakerErrors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 3, timeout: 20000 }
    );
  }, 40000);
});