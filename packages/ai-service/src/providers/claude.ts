import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AIProvider, GenerationOptions, GenerationResult, ValidationResult } from '../types';
import { logger } from '../utils/logger';

const CodeGenerationSchema = z.object({
  code: z.string(),
  explanation: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export class ClaudeProvider implements AIProvider {
  public readonly name = 'claude';
  private client: Anthropic;
  private defaultModel: string;

  constructor(
    apiKey: string,
    defaultModel: string = 'claude-3-sonnet-20240229'
  ) {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateCode(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 2000,
        temperature: options?.temperature || 0.3,
        messages: [
          {
            role: 'user',
            content: `You are an expert test automation engineer. Generate clean, production-ready Playwright test code based on natural language descriptions.

Rules:
1. Always use TypeScript
2. Include proper error handling
3. Use descriptive selectors
4. Add meaningful assertions
5. Include comments for complex logic
6. Follow Playwright best practices
7. Return only valid, executable code

Respond with a JSON object containing:
- code: The generated Playwright test code
- explanation: Brief explanation of what the test does
- confidence: Your confidence level (0-1) in the generated code

User request: ${prompt}`
          }
        ]
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response (Claude might wrap it in markdown)
      const textContent = 'text' in content ? content.text : '';
      const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/) || 
                       textContent.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = CodeGenerationSchema.parse(JSON.parse(jsonMatch[1] || jsonMatch[0]));
      
      const result: GenerationResult = {
        code: parsed.code,
        explanation: parsed.explanation || undefined,
        confidence: parsed.confidence,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: response.model,
        provider: this.name
      };

      logger.info('Claude code generation completed', {
        tokensUsed: result.tokensUsed,
        confidence: result.confidence,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Claude code generation failed', { error: (error as Error).message, prompt });
      throw new Error(`Claude generation failed: ${(error as Error).message}`);
    }
  }

  async validateCode(code: string): Promise<ValidationResult> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307', // Use faster model for validation
        max_tokens: 1000,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: `You are a code reviewer specializing in Playwright test automation. 
Analyze the provided code for:
1. Syntax errors
2. Playwright API usage issues
3. Best practice violations
4. Potential runtime errors
5. Performance concerns

Respond with a JSON object containing:
- isValid: boolean indicating if code is syntactically correct
- errors: array of critical issues that prevent execution
- warnings: array of non-critical issues
- suggestions: array of improvement recommendations

Code to validate:
\`\`\`typescript
${code}
\`\`\``
          }
        ]
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response
      const textContent = 'text' in content ? content.text : '';
      const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/) || 
                       textContent.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude validation response');
      }

      const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      
      return {
        isValid: result.isValid || false,
        errors: result.errors || [],
        warnings: result.warnings || [],
        suggestions: result.suggestions || []
      };
    } catch (error) {
      logger.error('Claude code validation failed', { error: (error as Error).message, code: code.substring(0, 100) });
      return {
        isValid: false,
        errors: [`Validation failed: ${(error as Error).message}`],
        warnings: [],
        suggestions: []
      };
    }
  }
}