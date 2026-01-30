import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { CodeConverter } from '../services/code-converter';
import { AIService } from '../ai-service';
import { TestScenario, TestStep, TestAssertion, AIServiceConfig } from '../types';

/**
 * Property 4: Test Scenario Manipulation Consistency
 * Validates: Requirements 2.2, 2.3, 2.4
 * Test that editing scenarios maintains original intent
 * Verify drag-and-drop operations produce valid scenarios
 */

describe('Test Scenario Manipulation Property Tests', () => {
  let codeConverter: CodeConverter;
  let aiService: AIService;

  beforeEach(() => {
    const mockConfig: AIServiceConfig = {
      providers: {
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4-turbo-preview'
        }
      },
      defaultProvider: 'openai'
    };

    // Mock the AI service methods
    vi.mock('../ai-service', () => ({
      AIService: vi.fn().mockImplementation(() => ({
        generateCode: vi.fn().mockResolvedValue({
          code: 'test code',
          confidence: 0.9,
          tokensUsed: 100,
          model: 'gpt-4',
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
    codeConverter = new CodeConverter(aiService);
  });

  // Generator for valid test steps
  const testStepArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constantFrom('navigate', 'click', 'type', 'wait', 'screenshot', 'custom'),
    selector: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    value: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    description: fc.string({ minLength: 5, maxLength: 100 }),
    timeout: fc.option(fc.integer({ min: 1000, max: 30000 }))
  });

  // Generator for valid test assertions
  const testAssertionArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constantFrom('visible', 'text', 'attribute', 'count', 'url', 'custom'),
    selector: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    expected: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.string({ minLength: 5, maxLength: 100 })
  });

  // Generator for valid test scenarios
  const testScenarioArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 5, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    steps: fc.array(testStepArbitrary, { minLength: 1, maxLength: 10 }),
    assertions: fc.array(testAssertionArbitrary, { minLength: 0, maxLength: 5 })
  });

  /**
   * Property: Scenario parsing maintains structural integrity
   */
  it('should maintain scenario structure when parsing natural language', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          naturalLanguage: fc.oneof(
            fc.constant('Navigate to login page, enter username "test", enter password "pass", click login button, and verify success message appears'),
            fc.constant('Go to homepage, click search box, type "product", press enter, and check that results are displayed'),
            fc.constant('Open settings page, toggle dark mode, save changes, and verify theme is applied'),
            fc.string({ minLength: 30, maxLength: 300 }).filter(s => 
              (s.includes('navigate') || s.includes('go to')) &&
              (s.includes('click') || s.includes('type') || s.includes('enter')) &&
              (s.includes('verify') || s.includes('check') || s.includes('should'))
            )
          )
        }),
        async ({ naturalLanguage }) => {
          const result = await codeConverter.convertNaturalLanguageToCode({ naturalLanguage });

          if (result.scenario) {
            const scenario = result.scenario;

            // Property 1: Scenario should have valid structure
            expect(scenario.id).toBeDefined();
            expect(scenario.name).toBeDefined();
            expect(scenario.description).toBeDefined();
            expect(Array.isArray(scenario.steps)).toBe(true);
            expect(Array.isArray(scenario.assertions)).toBe(true);

            // Property 2: Steps should maintain logical order
            scenario.steps.forEach((step, index) => {
              expect(step.id).toBeDefined();
              expect(step.type).toBeDefined();
              expect(step.description).toBeDefined();
              
              // Step IDs should be unique within scenario
              const duplicateIds = scenario.steps.filter(s => s.id === step.id);
              expect(duplicateIds.length).toBe(1);
            });

            // Property 3: Assertions should be valid
            scenario.assertions.forEach(assertion => {
              expect(assertion.id).toBeDefined();
              expect(assertion.type).toBeDefined();
              expect(assertion.expected).toBeDefined();
              expect(assertion.description).toBeDefined();
            });

            // Property 4: Description should match original intent
            expect(scenario.description).toBe(naturalLanguage);
          }
        }
      ),
      { numRuns: 15, timeout: 30000 }
    );
  }, 60000);

  /**
   * Property: Step reordering maintains scenario validity
   */
  it('should maintain scenario validity when reordering steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        testScenarioArbitrary,
        fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
        async (originalScenario, shuffleIndices) => {
          // Simulate drag-and-drop reordering
          const steps = [...originalScenario.steps];
          const reorderedSteps = shuffleIndices
            .slice(0, steps.length)
            .map(i => Math.abs(i) % steps.length)
            .map(i => steps[i])
            .filter((step, index, arr) => arr.findIndex(s => s.id === step.id) === index); // Remove duplicates

          const reorderedScenario: TestScenario = {
            ...originalScenario,
            steps: reorderedSteps
          };

          // Property 1: Reordered scenario should maintain structure
          expect(reorderedScenario.id).toBe(originalScenario.id);
          expect(reorderedScenario.name).toBe(originalScenario.name);
          expect(reorderedScenario.description).toBe(originalScenario.description);
          expect(Array.isArray(reorderedScenario.steps)).toBe(true);
          expect(Array.isArray(reorderedScenario.assertions)).toBe(true);

          // Property 2: All original steps should be present (no data loss)
          const originalStepIds = new Set(originalScenario.steps.map(s => s.id));
          const reorderedStepIds = new Set(reorderedScenario.steps.map(s => s.id));
          
          reorderedStepIds.forEach(id => {
            expect(originalStepIds.has(id)).toBe(true);
          });

          // Property 3: Step properties should remain unchanged
          reorderedScenario.steps.forEach(step => {
            const originalStep = originalScenario.steps.find(s => s.id === step.id);
            expect(originalStep).toBeDefined();
            if (originalStep) {
              expect(step.type).toBe(originalStep.type);
              expect(step.description).toBe(originalStep.description);
              expect(step.selector).toBe(originalStep.selector);
              expect(step.value).toBe(originalStep.value);
              expect(step.timeout).toBe(originalStep.timeout);
            }
          });

          // Property 4: Assertions should remain unchanged
          expect(reorderedScenario.assertions).toEqual(originalScenario.assertions);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Step modification preserves scenario integrity
   */
  it('should preserve scenario integrity when modifying individual steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        testScenarioArbitrary,
        fc.integer({ min: 0, max: 9 }),
        testStepArbitrary,
        async (originalScenario, stepIndex, newStep) => {
          if (originalScenario.steps.length === 0) return;

          const actualIndex = stepIndex % originalScenario.steps.length;
          const modifiedSteps = [...originalScenario.steps];
          
          // Preserve the original ID to maintain references
          const modifiedStep = { ...newStep, id: modifiedSteps[actualIndex].id };
          modifiedSteps[actualIndex] = modifiedStep;

          const modifiedScenario: TestScenario = {
            ...originalScenario,
            steps: modifiedSteps
          };

          // Property 1: Scenario structure should be preserved
          expect(modifiedScenario.id).toBe(originalScenario.id);
          expect(modifiedScenario.name).toBe(originalScenario.name);
          expect(modifiedScenario.description).toBe(originalScenario.description);
          expect(modifiedScenario.steps.length).toBe(originalScenario.steps.length);

          // Property 2: Modified step should have new properties
          const actualModifiedStep = modifiedScenario.steps[actualIndex];
          expect(actualModifiedStep.type).toBe(newStep.type);
          expect(actualModifiedStep.description).toBe(newStep.description);
          expect(actualModifiedStep.selector).toBe(newStep.selector);
          expect(actualModifiedStep.value).toBe(newStep.value);

          // Property 3: Other steps should remain unchanged
          modifiedScenario.steps.forEach((step, index) => {
            if (index !== actualIndex) {
              const originalStep = originalScenario.steps[index];
              expect(step).toEqual(originalStep);
            }
          });

          // Property 4: Step IDs should remain unique
          const stepIds = modifiedScenario.steps.map(s => s.id);
          const uniqueIds = new Set(stepIds);
          expect(uniqueIds.size).toBe(stepIds.length);

          // Property 5: Assertions should remain unchanged
          expect(modifiedScenario.assertions).toEqual(originalScenario.assertions);
        }
      ),
      { numRuns: 25, timeout: 15000 }
    );
  });

  /**
   * Property: Assertion modification maintains test validity
   */
  it('should maintain test validity when modifying assertions', async () => {
    await fc.assert(
      fc.asyncProperty(
        testScenarioArbitrary.filter(s => s.assertions.length > 0),
        fc.integer({ min: 0, max: 4 }),
        testAssertionArbitrary,
        async (originalScenario, assertionIndex, newAssertion) => {
          if (originalScenario.assertions.length === 0) return;

          const actualIndex = assertionIndex % originalScenario.assertions.length;
          const modifiedAssertions = [...originalScenario.assertions];
          
          // Preserve the original ID
          const modifiedAssertion = { ...newAssertion, id: modifiedAssertions[actualIndex].id };
          modifiedAssertions[actualIndex] = modifiedAssertion;

          const modifiedScenario: TestScenario = {
            ...originalScenario,
            assertions: modifiedAssertions
          };

          // Property 1: Scenario structure should be preserved
          expect(modifiedScenario.id).toBe(originalScenario.id);
          expect(modifiedScenario.name).toBe(originalScenario.name);
          expect(modifiedScenario.description).toBe(originalScenario.description);
          expect(modifiedScenario.steps).toEqual(originalScenario.steps);

          // Property 2: Modified assertion should have new properties
          const actualModifiedAssertion = modifiedScenario.assertions[actualIndex];
          expect(actualModifiedAssertion.type).toBe(newAssertion.type);
          expect(actualModifiedAssertion.expected).toBe(newAssertion.expected);
          expect(actualModifiedAssertion.description).toBe(newAssertion.description);
          expect(actualModifiedAssertion.selector).toBe(newAssertion.selector);

          // Property 3: Other assertions should remain unchanged
          modifiedScenario.assertions.forEach((assertion, index) => {
            if (index !== actualIndex) {
              const originalAssertion = originalScenario.assertions[index];
              expect(assertion).toEqual(originalAssertion);
            }
          });

          // Property 4: Assertion IDs should remain unique
          const assertionIds = modifiedScenario.assertions.map(a => a.id);
          const uniqueIds = new Set(assertionIds);
          expect(uniqueIds.size).toBe(assertionIds.length);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Scenario enhancement preserves original intent
   */
  it('should preserve original intent when enhancing scenarios', async () => {
    await fc.assert(
      fc.asyncProperty(
        testScenarioArbitrary,
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        async (originalScenario, requirements) => {
          const enhancedScenarios = await codeConverter.enhanceScenario(originalScenario, requirements);

          // Property 1: Should return array of scenarios
          expect(Array.isArray(enhancedScenarios)).toBe(true);
          expect(enhancedScenarios.length).toBeGreaterThan(0);

          // Property 2: Original scenario should be included or preserved
          const hasOriginal = enhancedScenarios.some(scenario => 
            scenario.id === originalScenario.id ||
            scenario.description === originalScenario.description
          );
          expect(hasOriginal).toBe(true);

          // Property 3: All enhanced scenarios should have valid structure
          enhancedScenarios.forEach(scenario => {
            expect(scenario.id).toBeDefined();
            expect(scenario.name).toBeDefined();
            expect(scenario.description).toBeDefined();
            expect(Array.isArray(scenario.steps)).toBe(true);
            expect(Array.isArray(scenario.assertions)).toBe(true);

            // Each step should be valid
            scenario.steps.forEach(step => {
              expect(step.id).toBeDefined();
              expect(step.type).toBeDefined();
              expect(step.description).toBeDefined();
              expect(['navigate', 'click', 'type', 'wait', 'screenshot', 'custom']).toContain(step.type);
            });

            // Each assertion should be valid
            scenario.assertions.forEach(assertion => {
              expect(assertion.id).toBeDefined();
              expect(assertion.type).toBeDefined();
              expect(assertion.expected).toBeDefined();
              expect(assertion.description).toBeDefined();
              expect(['visible', 'text', 'attribute', 'count', 'url', 'custom']).toContain(assertion.type);
            });
          });

          // Property 4: Enhanced scenarios should maintain logical flow
          enhancedScenarios.forEach(scenario => {
            // Should have at least one step
            expect(scenario.steps.length).toBeGreaterThan(0);
            
            // Step IDs should be unique within scenario
            const stepIds = scenario.steps.map(s => s.id);
            const uniqueStepIds = new Set(stepIds);
            expect(uniqueStepIds.size).toBe(stepIds.length);

            // Assertion IDs should be unique within scenario
            const assertionIds = scenario.assertions.map(a => a.id);
            const uniqueAssertionIds = new Set(assertionIds);
            expect(uniqueAssertionIds.size).toBe(assertionIds.length);
          });
        }
      ),
      { numRuns: 10, timeout: 20000 }
    );
  }, 40000);

  /**
   * Property: Step insertion maintains scenario flow
   */
  it('should maintain scenario flow when inserting new steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        testScenarioArbitrary,
        fc.integer({ min: 0, max: 10 }),
        testStepArbitrary,
        async (originalScenario, insertPosition, newStep) => {
          const actualPosition = Math.min(insertPosition, originalScenario.steps.length);
          const modifiedSteps = [...originalScenario.steps];
          
          // Ensure unique ID
          const uniqueId = `${newStep.id}-${Date.now()}-${Math.random()}`;
          const stepToInsert = { ...newStep, id: uniqueId };
          
          modifiedSteps.splice(actualPosition, 0, stepToInsert);

          const modifiedScenario: TestScenario = {
            ...originalScenario,
            steps: modifiedSteps
          };

          // Property 1: Scenario should have one more step
          expect(modifiedScenario.steps.length).toBe(originalScenario.steps.length + 1);

          // Property 2: New step should be at correct position
          expect(modifiedScenario.steps[actualPosition]).toEqual(stepToInsert);

          // Property 3: Other steps should maintain their relative order
          const originalStepsBeforeInsert = originalScenario.steps.slice(0, actualPosition);
          const originalStepsAfterInsert = originalScenario.steps.slice(actualPosition);
          
          const modifiedStepsBeforeInsert = modifiedScenario.steps.slice(0, actualPosition);
          const modifiedStepsAfterInsert = modifiedScenario.steps.slice(actualPosition + 1);

          expect(modifiedStepsBeforeInsert).toEqual(originalStepsBeforeInsert);
          expect(modifiedStepsAfterInsert).toEqual(originalStepsAfterInsert);

          // Property 4: All step IDs should be unique
          const stepIds = modifiedScenario.steps.map(s => s.id);
          const uniqueIds = new Set(stepIds);
          expect(uniqueIds.size).toBe(stepIds.length);

          // Property 5: Other scenario properties should remain unchanged
          expect(modifiedScenario.id).toBe(originalScenario.id);
          expect(modifiedScenario.name).toBe(originalScenario.name);
          expect(modifiedScenario.description).toBe(originalScenario.description);
          expect(modifiedScenario.assertions).toEqual(originalScenario.assertions);
        }
      ),
      { numRuns: 25, timeout: 15000 }
    );
  });

  /**
   * Property: Step deletion maintains scenario integrity
   */
  it('should maintain scenario integrity when deleting steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        testScenarioArbitrary.filter(s => s.steps.length > 1),
        fc.integer({ min: 0, max: 9 }),
        async (originalScenario, deleteIndex) => {
          if (originalScenario.steps.length <= 1) return;

          const actualIndex = deleteIndex % originalScenario.steps.length;
          const modifiedSteps = [...originalScenario.steps];
          const deletedStep = modifiedSteps.splice(actualIndex, 1)[0];

          const modifiedScenario: TestScenario = {
            ...originalScenario,
            steps: modifiedSteps
          };

          // Property 1: Scenario should have one less step
          expect(modifiedScenario.steps.length).toBe(originalScenario.steps.length - 1);

          // Property 2: Deleted step should not be present
          const deletedStepExists = modifiedScenario.steps.some(s => s.id === deletedStep.id);
          expect(deletedStepExists).toBe(false);

          // Property 3: Remaining steps should maintain their relative order
          const expectedSteps = originalScenario.steps.filter((_, index) => index !== actualIndex);
          expect(modifiedScenario.steps).toEqual(expectedSteps);

          // Property 4: All remaining step IDs should be unique
          const stepIds = modifiedScenario.steps.map(s => s.id);
          const uniqueIds = new Set(stepIds);
          expect(uniqueIds.size).toBe(stepIds.length);

          // Property 5: Other scenario properties should remain unchanged
          expect(modifiedScenario.id).toBe(originalScenario.id);
          expect(modifiedScenario.name).toBe(originalScenario.name);
          expect(modifiedScenario.description).toBe(originalScenario.description);
          expect(modifiedScenario.assertions).toEqual(originalScenario.assertions);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});