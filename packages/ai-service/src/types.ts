export interface AIProvider {
  name: string;
  generateCode(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;
  validateCode(code: string): Promise<ValidationResult>;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeout?: number;
}

export interface GenerationResult {
  code: string;
  explanation?: string | undefined;
  confidence: number;
  tokensUsed: number;
  model: string;
  provider: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface AIServiceConfig {
  providers: {
    openai?: {
      apiKey: string;
      model?: string;
      maxTokens?: number;
      temperature?: number;
    };
    claude?: {
      apiKey: string;
      model?: string;
      maxTokens?: number;
      temperature?: number;
    };
  };
  circuitBreaker?: {
    failureThreshold?: number;
    resetTimeout?: number;
    monitoringPeriod?: number;
  };
  rateLimiter?: {
    tokensPerMinute?: number;
    requestsPerMinute?: number;
  };
  defaultProvider?: 'openai' | 'claude';
  fallbackProvider?: 'openai' | 'claude';
}

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
  assertions: TestAssertion[];
}

export interface TestStep {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'custom';
  selector?: string | undefined;
  value?: string | undefined;
  description: string;
  timeout?: number | undefined;
}

export interface TestAssertion {
  id: string;
  type: 'visible' | 'text' | 'attribute' | 'count' | 'url' | 'custom';
  selector?: string | undefined;
  expected: string;
  description: string;
}

export interface ConversionResult extends GenerationResult {
  scenario?: TestScenario | undefined;
  syntaxValid: boolean;
  suggestions: string[];
}

export interface CodeGenerationRequest {
  naturalLanguage: string;
  context?: {
    url?: string;
    framework?: 'playwright' | 'selenium' | 'cypress';
    language?: 'javascript' | 'typescript' | 'python';
    existingCode?: string;
  };
  options?: GenerationOptions;
}