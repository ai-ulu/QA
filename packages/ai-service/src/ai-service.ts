import { 
  AIProvider, 
  AIServiceConfig, 
  GenerationOptions, 
  GenerationResult, 
  ValidationResult,
  CodeGenerationRequest,
  ConversionResult,
  TestScenario
} from './types';
import { OpenAIProvider } from './providers/openai';
import { ClaudeProvider } from './providers/claude';
import { CodeConverter } from './services/code-converter';
import { CircuitBreaker, CircuitBreakerOptions } from './utils/circuit-breaker';
import { RateLimiter, RateLimiterOptions } from './utils/rate-limiter';
import { logger } from './utils/logger';
import { PlaywrightPrompts } from './prompts/playwright';

export class AIService {
  private providers: Map<string, AIProvider> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private rateLimiter?: RateLimiter;
  private config: AIServiceConfig;
  private prompts: PlaywrightPrompts;
  private codeConverter: CodeConverter;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.prompts = new PlaywrightPrompts();
    this.initializeProviders();
    this.initializeRateLimiter();
    this.initializeCircuitBreakers();
    this.codeConverter = new CodeConverter(this);
  }

  private initializeProviders(): void {
    if (this.config.providers.openai) {
      const provider = new OpenAIProvider(
        this.config.providers.openai.apiKey,
        this.config.providers.openai.model
      );
      this.providers.set('openai', provider);
    }

    if (this.config.providers.claude) {
      const provider = new ClaudeProvider(
        this.config.providers.claude.apiKey,
        this.config.providers.claude.model
      );
      this.providers.set('claude', provider);
    }

    if (this.providers.size === 0) {
      throw new Error('At least one AI provider must be configured');
    }
  }

  private initializeRateLimiter(): void {
    if (this.config.rateLimiter) {
      const options: RateLimiterOptions = {
        tokensPerMinute: this.config.rateLimiter.tokensPerMinute || 1000,
        requestsPerMinute: this.config.rateLimiter.requestsPerMinute || 60
      };
      this.rateLimiter = new RateLimiter(options);
    }
  }

  private initializeCircuitBreakers(): void {
    const cbConfig: CircuitBreakerOptions = {
      failureThreshold: this.config.circuitBreaker?.failureThreshold || 5,
      resetTimeout: this.config.circuitBreaker?.resetTimeout || 60000,
      monitoringPeriod: this.config.circuitBreaker?.monitoringPeriod || 60000
    };

    for (const providerName of this.providers.keys()) {
      const circuitBreaker = new CircuitBreaker(cbConfig);
      this.circuitBreakers.set(providerName, circuitBreaker);
      
      circuitBreaker.on('opened', () => {
        logger.warn(`Circuit breaker opened for provider: ${providerName}`);
      });
      
      circuitBreaker.on('closed', () => {
        logger.info(`Circuit breaker closed for provider: ${providerName}`);
      });
    }
  }

  async generatePlaywrightCode(request: CodeGenerationRequest): Promise<GenerationResult> {
    const prompt = this.prompts.buildTestGenerationPrompt(
      request.naturalLanguage,
      request.context
    );

    return this.generateCode(prompt, request.options);
  }

  async generateCode(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    // Check rate limits
    if (this.rateLimiter) {
      await this.rateLimiter.checkRequestLimit();
      
      const estimatedTokens = Math.ceil(prompt.length / 4) + (options?.maxTokens || 2000);
      await this.rateLimiter.checkTokenLimit(estimatedTokens);
    }

    const primaryProvider = this.config.defaultProvider || 'openai';
    const fallbackProvider = this.config.fallbackProvider;

    // Try primary provider first
    try {
      return await this.executeWithProvider(primaryProvider, prompt, options);
    } catch (error) {
      logger.warn(`Primary provider ${primaryProvider} failed`, { error: (error as Error).message });

      // Try fallback provider if available
      if (fallbackProvider && fallbackProvider !== primaryProvider) {
        try {
          logger.info(`Attempting fallback to ${fallbackProvider}`);
          return await this.executeWithProvider(fallbackProvider, prompt, options);
        } catch (fallbackError) {
          logger.error(`Fallback provider ${fallbackProvider} also failed`, { error: fallbackError });
        }
      }

      throw error;
    }
  }

  private async executeWithProvider(
    providerName: string, 
    prompt: string, 
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const circuitBreaker = this.circuitBreakers.get(providerName);
    if (!circuitBreaker) {
      throw new Error(`Circuit breaker for ${providerName} not found`);
    }

    return circuitBreaker.execute(async () => {
      const startTime = Date.now();
      
      try {
        const result = await provider.generateCode(prompt, options);
        
        logger.info('Code generation successful', {
          provider: providerName,
          tokensUsed: result.tokensUsed,
          confidence: result.confidence,
          duration: Date.now() - startTime
        });

        return result;
      } catch (error) {
        logger.error('Code generation failed', {
          provider: providerName,
          error: (error as Error).message,
          duration: Date.now() - startTime
        });
        throw error;
      }
    });
  }

  async validateCode(code: string, providerName?: string): Promise<ValidationResult> {
    const provider = providerName 
      ? this.providers.get(providerName)
      : this.providers.get(this.config.defaultProvider || 'openai');

    if (!provider) {
      throw new Error(`Provider ${providerName || 'default'} not found`);
    }

    const circuitBreaker = this.circuitBreakers.get(provider.name);
    if (!circuitBreaker) {
      throw new Error(`Circuit breaker for ${provider.name} not found`);
    }

    return circuitBreaker.execute(() => provider.validateCode(code));
  }

  getProviderStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [name, provider] of this.providers) {
      const circuitBreaker = this.circuitBreakers.get(name);
      status[name] = {
        available: true,
        circuitState: circuitBreaker?.getState(),
        failureCount: circuitBreaker?.getFailureCount()
      };
    }

    return status;
  }

  async getRateLimitStatus(): Promise<{ remainingTokens: number; remainingRequests: number } | null> {
    if (!this.rateLimiter) return null;

    return {
      remainingTokens: await this.rateLimiter.getRemainingTokens(),
      remainingRequests: await this.rateLimiter.getRemainingRequests()
    };
  }

  resetCircuitBreakers(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }

  resetRateLimiter(): void {
    this.rateLimiter?.reset();
  }

  // Code Converter Methods
  async convertNaturalLanguageToCode(request: CodeGenerationRequest): Promise<ConversionResult> {
    return this.codeConverter.convertNaturalLanguageToCode(request);
  }

  async optimizeCode(code: string, issues: string[]): Promise<GenerationResult> {
    return this.codeConverter.optimizeCode(code, issues);
  }

  async enhanceScenario(scenario: TestScenario, requirements: string[]): Promise<TestScenario[]> {
    return this.codeConverter.enhanceScenario(scenario, requirements);
  }

  // Utility Methods for Code Generation
  async generateAssertions(action: string, element: string): Promise<GenerationResult> {
    const prompt = this.prompts.buildAssertionGenerationPrompt(action, element);
    return this.generateCode(prompt);
  }

  async optimizeSelector(selector: string, context: string): Promise<GenerationResult> {
    const prompt = this.prompts.buildSelectorOptimizationPrompt(selector, context);
    return this.generateCode(prompt);
  }
}