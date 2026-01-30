import { AIService } from '../ai-service';
import { 
  CodeGenerationRequest, 
  GenerationResult, 
  TestScenario, 
  TestStep, 
  TestAssertion,
  ConversionResult
} from '../types';
import { logger } from '../utils/logger';

export class CodeConverter {
  constructor(private aiService: AIService) {}

  async convertNaturalLanguageToCode(request: CodeGenerationRequest): Promise<ConversionResult> {
    try {
      // Generate code using AI service
      const result = await this.aiService.generatePlaywrightCode(request);
      
      // Validate the generated code
      const validation = await this.aiService.validateCode(result.code);
      
      // Parse scenario if possible
      const scenario = this.parseScenario(request.naturalLanguage);
      
      return {
        ...result,
        scenario: scenario || undefined,
        syntaxValid: validation.isValid,
        suggestions: validation.suggestions
      };
    } catch (error) {
      logger.error('Code conversion failed', { error: (error as Error).message });
      throw new Error(`Code conversion failed: ${(error as Error).message}`);
    }
  }

  private parseScenario(naturalLanguage: string): TestScenario | undefined {
    // Simple scenario parsing - can be enhanced with NLP
    const steps = this.extractSteps(naturalLanguage);
    const assertions = this.extractAssertions(naturalLanguage);
    
    if (steps.length === 0) return undefined;
    
    return {
      id: `scenario-${Date.now()}`,
      name: this.extractScenarioName(naturalLanguage),
      description: naturalLanguage,
      steps,
      assertions
    };
  }

  private extractSteps(text: string): TestStep[] {
    const steps: TestStep[] = [];
    const stepPatterns = [
      { pattern: /navigate to (.+)/i, type: 'navigate' as const },
      { pattern: /click (?:on )?(.+)/i, type: 'click' as const },
      { pattern: /type "(.+)" (?:in|into) (.+)/i, type: 'type' as const },
      { pattern: /wait (?:for )?(.+)/i, type: 'wait' as const },
      { pattern: /take (?:a )?screenshot/i, type: 'screenshot' as const }
    ];

    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    
    sentences.forEach((sentence, index) => {
      for (const { pattern, type } of stepPatterns) {
        const match = sentence.match(pattern);
        if (match) {
          steps.push({
            id: `step-${index}`,
            type,
            selector: (type === 'navigate' ? undefined : match[2] || match[1]) || undefined,
            value: type === 'type' ? match[1] : undefined,
            description: sentence.trim(),
            timeout: type === 'wait' ? 5000 : undefined
          });
          break;
        }
      }
    });

    return steps;
  }

  private extractAssertions(text: string): TestAssertion[] {
    const assertions: TestAssertion[] = [];
    const assertionPatterns = [
      { pattern: /should (?:be )?visible (.+)/i, type: 'visible' as const },
      { pattern: /should (?:contain|have) (?:text )?["'](.+)["']/i, type: 'text' as const },
      { pattern: /should have (\d+) (.+)/i, type: 'count' as const },
      { pattern: /should be (?:on|at) (.+)/i, type: 'url' as const }
    ];

    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    
    sentences.forEach((sentence, index) => {
      for (const { pattern, type } of assertionPatterns) {
        const match = sentence.match(pattern);
        if (match) {
          assertions.push({
            id: `assertion-${index}`,
            type,
            selector: (type === 'url' ? undefined : match[2] || match[1]) || undefined,
            expected: match[1] || '',
            description: sentence.trim()
          });
          break;
        }
      }
    });

    return assertions;
  }

  private extractScenarioName(text: string): string {
    // Extract first sentence as scenario name
    const firstSentence = text.split(/[.!?]/)[0]?.trim();
    return firstSentence || 'Generated Test Scenario';
  }

  async optimizeCode(code: string, issues: string[]): Promise<GenerationResult> {
    const prompt = `Optimize this Playwright test code to fix the following issues:

Issues to fix:
${issues.map(issue => `- ${issue}`).join('\n')}

Current code:
\`\`\`typescript
${code}
\`\`\`

Please provide the optimized version that:
1. Fixes all identified issues
2. Maintains the original test intent
3. Follows Playwright best practices
4. Is more maintainable and reliable
5. Includes proper error handling`;

    return this.aiService.generateCode(prompt);
  }

  async enhanceScenario(scenario: TestScenario, requirements: string[]): Promise<TestScenario[]> {
    const prompt = `Enhance this test scenario with additional test cases and edge cases:

Base scenario: ${scenario.description}

Additional requirements:
${requirements.map(req => `- ${req}`).join('\n')}

Generate a comprehensive test suite that covers:
1. Happy path scenarios
2. Error conditions and edge cases
3. Boundary value testing
4. Accessibility testing considerations
5. Performance considerations
6. Cross-browser compatibility notes

Provide multiple test cases in a well-structured format.`;

    const result = await this.aiService.generateCode(prompt);
    
    // Parse the enhanced scenarios from the result
    // This is a simplified implementation - could be enhanced with better parsing
    return [scenario]; // Return original for now
  }
}