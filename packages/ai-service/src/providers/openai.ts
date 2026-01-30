import OpenAI from 'openai';
import { z } from 'zod';
import { AIProvider, GenerationOptions, GenerationResult, ValidationResult } from '../types';
import { logger } from '../utils/logger';

const CodeGenerationSchema = z.object({
  code: z.string(),
  explanation: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export class OpenAIProvider implements AIProvider {
  public readonly name = 'openai';
  private client: OpenAI;
  private defaultModel: string;

  constructor(
    apiKey: string,
    defaultModel: string = 'gpt-4-turbo-preview'
  ) {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateCode(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: [
          {
            role: 'system',
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
            - confidence: Your confidence level (0-1) in the generated code`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options?.maxTokens || 2000,
        temperature: options?.temperature || 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const parsed = CodeGenerationSchema.parse(JSON.parse(content));
      
      const result: GenerationResult = {
        code: parsed.code,
        explanation: parsed.explanation || undefined,
        confidence: parsed.confidence,
        tokensUsed: response.usage?.total_tokens || 0,
        model: response.model,
        provider: this.name
      };

      logger.info('OpenAI code generation completed', {
        tokensUsed: result.tokensUsed,
        confidence: result.confidence,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('OpenAI code generation failed', { error: (error as Error).message, prompt });
      throw new Error(`OpenAI generation failed: ${(error as Error).message}`);
    }
  }

  async validateCode(code: string): Promise<ValidationResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
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
            - suggestions: array of improvement recommendations`
          },
          {
            role: 'user',
            content: `Please validate this Playwright test code:\n\n${code}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No validation response from OpenAI');
      }

      const result = JSON.parse(content);
      
      return {
        isValid: result.isValid || false,
        errors: result.errors || [],
        warnings: result.warnings || [],
        suggestions: result.suggestions || []
      };
    } catch (error) {
      logger.error('OpenAI code validation failed', { error: (error as Error).message, code: code.substring(0, 100) });
      return {
        isValid: false,
        errors: [`Validation failed: ${(error as Error).message}`],
        warnings: [],
        suggestions: []
      };
    }
  }
}