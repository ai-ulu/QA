import { AIService } from '../ai-service';
import { AIServiceConfig, CodeGenerationRequest } from '../types';

// Example configuration
const config: AIServiceConfig = {
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key',
      model: 'gpt-4-turbo-preview',
      maxTokens: 2000,
      temperature: 0.3
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || 'your-claude-api-key',
      model: 'claude-3-sonnet-20240229',
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
  defaultProvider: 'openai',
  fallbackProvider: 'claude'
};

async function demonstrateBasicUsage() {
  console.log('🚀 Initializing AI Service...');
  const aiService = new AIService(config);

  // Example 1: Basic code generation
  console.log('\n📝 Example 1: Basic Code Generation');
  try {
    const basicRequest: CodeGenerationRequest = {
      naturalLanguage: 'Create a test that logs into a website using email and password',
      context: {
        url: 'https://example.com/login',
        framework: 'playwright',
        language: 'typescript'
      }
    };

    const result = await aiService.convertNaturalLanguageToCode(basicRequest);
    console.log('Generated Code:');
    console.log(result.code);
    console.log(`\nConfidence: ${result.confidence}`);
    console.log(`Tokens Used: ${result.tokensUsed}`);
    console.log(`Syntax Valid: ${result.syntaxValid}`);
  } catch (error) {
    console.error('Error in basic code generation:', error);
  }

  // Example 2: Complex scenario
  console.log('\n🔧 Example 2: Complex E-commerce Scenario');
  try {
    const complexRequest: CodeGenerationRequest = {
      naturalLanguage: `
        Navigate to an e-commerce website.
        Search for "laptop".
        Filter results by price range $500-$1000.
        Sort by customer rating.
        Click on the first product.
        Add to cart.
        Verify cart contains the item.
        Proceed to checkout.
        Fill in shipping information.
        Verify order summary is correct.
      `,
      context: {
        url: 'https://shop.example.com',
        framework: 'playwright',
        language: 'typescript'
      }
    };

    const result = await aiService.convertNaturalLanguageToCode(complexRequest);
    console.log('Generated Complex Test:');
    console.log(result.code);
    
    if (result.scenario) {
      console.log(`\nScenario: ${result.scenario.name}`);
      console.log(`Steps: ${result.scenario.steps.length}`);
      console.log(`Assertions: ${result.scenario.assertions.length}`);
    }
  } catch (error) {
    console.error('Error in complex scenario generation:', error);
  }

  // Example 3: Code optimization
  console.log('\n⚡ Example 3: Code Optimization');
  try {
    const badCode = `
test('login test', async ({ page }) => {
  await page.goto('https://example.com');
  await page.click('button');
  await page.fill('input', 'test@example.com');
  await page.click('#submit');
});
    `;

    const issues = [
      'Selectors are too generic and fragile',
      'Missing assertions to verify login success',
      'No error handling for failed login',
      'Missing waits for dynamic content'
    ];

    const optimizedResult = await aiService.optimizeCode(badCode, issues);
    console.log('Optimized Code:');
    console.log(optimizedResult.code);
  } catch (error) {
    console.error('Error in code optimization:', error);
  }

  // Example 4: Service status monitoring
  console.log('\n📊 Example 4: Service Status');
  try {
    const providerStatus = aiService.getProviderStatus();
    console.log('Provider Status:', JSON.stringify(providerStatus, null, 2));

    const rateLimitStatus = await aiService.getRateLimitStatus();
    if (rateLimitStatus) {
      console.log('Rate Limit Status:', rateLimitStatus);
    }
  } catch (error) {
    console.error('Error getting service status:', error);
  }

  console.log('\n✅ Demo completed!');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateBasicUsage().catch(console.error);
}

export { demonstrateBasicUsage };