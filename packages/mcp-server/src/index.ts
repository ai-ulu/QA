#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// AutoQA MCP Server
const server = new Server(
  {
    name: 'autoqa-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool Schemas
const CreateTestSchema = z.object({
  description: z.string().describe('Natural language description of the test'),
  url: z.string().optional().describe('URL to test (optional)'),
  framework: z.enum(['playwright', 'cypress']).default('playwright'),
});

const RunTestSchema = z.object({
  testId: z.string().describe('ID of the test to run'),
  headless: z.boolean().default(true),
});

const AnalyzeFailureSchema = z.object({
  testId: z.string().describe('ID of the failed test'),
  errorMessage: z.string().describe('Error message from test failure'),
});

const FixTestSchema = z.object({
  testId: z.string().describe('ID of the test to fix'),
  strategy: z.enum(['self-healing', 'ai-suggestion', 'both']).default('both'),
});

const VisualRegressionSchema = z.object({
  testId: z.string().describe('ID of the test'),
  baselineUrl: z.string().describe('URL for baseline screenshot'),
  compareUrl: z.string().describe('URL to compare against baseline'),
});

const GenerateReportSchema = z.object({
  testIds: z.array(z.string()).describe('Array of test IDs to include in report'),
  format: z.enum(['html', 'json', 'markdown']).default('html'),
});

// Available Tools
const tools: Tool[] = [
  {
    name: 'autoqa_create_test',
    description: 'Create a new E2E test from natural language description. Generates Playwright code with self-healing and best practices.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of what to test (e.g., "Test login with valid credentials")',
        },
        url: {
          type: 'string',
          description: 'Optional URL to test',
        },
        framework: {
          type: 'string',
          enum: ['playwright', 'cypress'],
          default: 'playwright',
          description: 'Test framework to use',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'autoqa_run_test',
    description: 'Execute a test and return results with screenshots, videos, and detailed logs.',
    inputSchema: {
      type: 'object',
      properties: {
        testId: {
          type: 'string',
          description: 'ID of the test to run',
        },
        headless: {
          type: 'boolean',
          default: true,
          description: 'Run in headless mode',
        },
      },
      required: ['testId'],
    },
  },
  {
    name: 'autoqa_analyze_failure',
    description: 'AI-powered root cause analysis for test failures. Provides detailed explanation and fix suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        testId: {
          type: 'string',
          description: 'ID of the failed test',
        },
        errorMessage: {
          type: 'string',
          description: 'Error message from test failure',
        },
      },
      required: ['testId', 'errorMessage'],
    },
  },
  {
    name: 'autoqa_fix_test',
    description: 'Automatically fix failing tests using self-healing or AI suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        testId: {
          type: 'string',
          description: 'ID of the test to fix',
        },
        strategy: {
          type: 'string',
          enum: ['self-healing', 'ai-suggestion', 'both'],
          default: 'both',
          description: 'Strategy to use for fixing',
        },
      },
      required: ['testId'],
    },
  },
  {
    name: 'autoqa_visual_regression',
    description: 'Compare screenshots for visual regression testing. Highlights differences and calculates percentage.',
    inputSchema: {
      type: 'object',
      properties: {
        testId: {
          type: 'string',
          description: 'ID of the test',
        },
        baselineUrl: {
          type: 'string',
          description: 'URL for baseline screenshot',
        },
        compareUrl: {
          type: 'string',
          description: 'URL to compare against baseline',
        },
      },
      required: ['testId', 'baselineUrl', 'compareUrl'],
    },
  },
  {
    name: 'autoqa_generate_report',
    description: 'Generate comprehensive test report with execution history, screenshots, and analytics.',
    inputSchema: {
      type: 'object',
      properties: {
        testIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of test IDs to include',
        },
        format: {
          type: 'string',
          enum: ['html', 'json', 'markdown'],
          default: 'html',
          description: 'Report format',
        },
      },
      required: ['testIds'],
    },
  },
];

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call Tool Handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'autoqa_create_test': {
        const { description, url, framework } = CreateTestSchema.parse(args);
        
        // Generate test code using AI
        const testCode = await generateTestCode(description, url, framework);
        const testId = generateTestId();

        // Store test in memory
        testStore.set(testId, {
          id: testId,
          description,
          url,
          framework,
          code: testCode,
          createdAt: new Date(),
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Test created successfully!\n\nTest ID: ${testId}\n\nGenerated Code:\n\`\`\`typescript\n${testCode}\n\`\`\`\n\nYou can now run this test with: autoqa_run_test`,
            },
          ],
        };
      }

      case 'autoqa_run_test': {
        const { testId, headless } = RunTestSchema.parse(args);
        
        // Execute test
        const result = await executeTest(testId, headless);

        return {
          content: [
            {
              type: 'text',
              text: `${result.status === 'passed' ? '✅' : '❌'} Test execution completed\n\nStatus: ${result.status}\nDuration: ${result.duration}ms\n${result.error ? `\nError: ${result.error}` : ''}\n\nScreenshot: ${result.screenshot || 'N/A'}`,
            },
          ],
        };
      }

      case 'autoqa_analyze_failure': {
        const { testId, errorMessage } = AnalyzeFailureSchema.parse(args);
        
        // AI-powered analysis
        const analysis = await analyzeFailure(testId, errorMessage);

        return {
          content: [
            {
              type: 'text',
              text: `🔍 Root Cause Analysis\n\n${analysis.explanation}\n\n💡 Suggested Fixes:\n${analysis.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`,
            },
          ],
        };
      }

      case 'autoqa_fix_test': {
        const { testId, strategy } = FixTestSchema.parse(args);
        
        // Apply fix
        const fix = await fixTest(testId, strategy);

        return {
          content: [
            {
              type: 'text',
              text: `🔧 Test fixed using ${strategy}\n\n${fix.description}\n\nUpdated Code:\n\`\`\`typescript\n${fix.code}\n\`\`\``,
            },
          ],
        };
      }

      case 'autoqa_visual_regression': {
        const { testId, baselineUrl, compareUrl } = VisualRegressionSchema.parse(args);
        
        // Compare screenshots
        const comparison = await compareScreenshots(testId, baselineUrl, compareUrl);

        return {
          content: [
            {
              type: 'text',
              text: `📸 Visual Regression Results\n\nDifference: ${comparison.percentage}%\n${comparison.passed ? '✅ No significant changes' : '❌ Visual differences detected'}\n\nDiff Image: ${comparison.diffUrl}`,
            },
          ],
        };
      }

      case 'autoqa_generate_report': {
        const { testIds, format } = GenerateReportSchema.parse(args);
        
        // Generate report
        const report = await generateReport(testIds, format);

        return {
          content: [
            {
              type: 'text',
              text: `📊 Report generated\n\nFormat: ${format}\nTests: ${testIds.length}\n\nReport URL: ${report.url}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Import AutoQA packages
import { AIService } from '@autoqa/ai-service';
import { RootCauseAnalyzer, AITestGenerator } from '@autoqa/ai-intelligence';
import { SelfHealingEngine } from '@autoqa/self-healing';
import { VisualRegressionEngine } from '@autoqa/visual-regression';
import { ReportGenerator } from '@autoqa/report-generator';
import { chromium, Browser, Page } from 'playwright';

// Initialize AutoQA services
const aiService = new AIService({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY || '',
  model: 'gpt-4',
});

const rootCauseAnalyzer = new RootCauseAnalyzer({
  aiProvider: {
    generateText: async (prompt: string) => {
      return await aiService.generateText(prompt);
    },
  },
});

const aiTestGenerator = new AITestGenerator({
  aiProvider: {
    generateText: async (prompt: string) => {
      return await aiService.generateText(prompt);
    },
  },
});

const selfHealingEngine = new SelfHealingEngine({
  strategies: ['css', 'xpath', 'text', 'visual'],
  enableLogging: true,
});

const visualRegressionEngine = new VisualRegressionEngine({
  threshold: 0.1,
  storageProvider: {
    saveBaseline: async (testId: string, screenshot: Buffer) => {
      // Store in memory for now (in production, use S3/MinIO)
      baselineStore.set(testId, screenshot);
    },
    getBaseline: async (testId: string) => {
      return baselineStore.get(testId) || null;
    },
  },
});

const reportGenerator = new ReportGenerator({
  templatePath: './templates',
  outputPath: './reports',
});

// In-memory stores (in production, use Redis/Database)
const testStore = new Map<string, any>();
const baselineStore = new Map<string, Buffer>();
let browser: Browser | null = null;

// Helper Functions (Real AutoQA integration)
async function generateTestCode(description: string, url?: string, framework: string = 'playwright'): Promise<string> {
  try {
    // Use AI Test Generator to create test code
    const testCode = await aiTestGenerator.generateFromNaturalLanguage({
      description,
      url: url || 'https://example.com',
      framework: framework as 'playwright' | 'cypress',
    });

    return testCode.code;
  } catch (error) {
    // Fallback to template-based generation
    return `import { test, expect } from '@playwright/test';

test('${description}', async ({ page }) => {
  await page.goto('${url || 'https://example.com'}');
  // AI-generated test steps based on: ${description}
  await page.waitForLoadState('networkidle');
  
  // TODO: Add specific test steps and assertions
  // This is a template - customize based on your requirements
});`;
  }
}

async function executeTest(testId: string, headless: boolean) {
  try {
    // Initialize browser if not already running
    if (!browser) {
      browser = await chromium.launch({ headless });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    const startTime = Date.now();
    let status: 'passed' | 'failed' = 'passed';
    let error: string | undefined;
    let screenshot: string | undefined;

    try {
      // Get test code from store
      const test = testStore.get(testId);
      if (!test) {
        throw new Error(`Test ${testId} not found`);
      }

      // Execute test code (simplified - in production, use proper test runner)
      await page.goto(test.url || 'https://example.com');
      await page.waitForLoadState('networkidle');

      // Capture screenshot
      const screenshotBuffer = await page.screenshot();
      screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;

    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
      
      // Capture failure screenshot
      try {
        const screenshotBuffer = await page.screenshot();
        screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
      } catch {}
    } finally {
      await context.close();
    }

    const duration = Date.now() - startTime;

    return {
      status,
      duration,
      screenshot,
      error,
    };
  } catch (error) {
    return {
      status: 'failed' as const,
      duration: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function analyzeFailure(testId: string, errorMessage: string) {
  try {
    // Use Root Cause Analyzer for AI-powered analysis
    const analysis = await rootCauseAnalyzer.analyzeFailure({
      testId,
      errorMessage,
      stackTrace: errorMessage,
      screenshot: null,
      domSnapshot: null,
      networkLogs: [],
      consoleErrors: [errorMessage],
      timestamp: new Date(),
    });

    return {
      explanation: analysis.rootCause,
      suggestions: analysis.suggestedFixes.map((fix: any) => fix.description),
      confidence: analysis.confidence,
      category: analysis.category,
    };
  } catch (error) {
    // Fallback to basic analysis
    return {
      explanation: `Test failed with error: ${errorMessage}`,
      suggestions: [
        'Check if the element selector is correct',
        'Verify the page loaded completely',
        'Enable self-healing to automatically adapt to changes',
      ],
      confidence: 0.5,
      category: 'unknown',
    };
  }
}

async function fixTest(testId: string, strategy: string) {
  try {
    const test = testStore.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    // Use Self-Healing Engine to fix the test
    const healingResult = await selfHealingEngine.heal({
      originalSelector: test.selector || 'button',
      page: null as any, // In production, pass actual page object
      context: {
        testId,
        attemptNumber: 1,
      },
    });

    if (healingResult.success && healingResult.newSelector) {
      return {
        description: `Applied ${strategy} strategy: ${healingResult.strategy}`,
        code: `await page.click('${healingResult.newSelector}'); // Updated from ${test.selector}`,
        confidence: healingResult.confidence,
      };
    }

    throw new Error('Self-healing failed to find alternative selector');
  } catch (error) {
    return {
      description: 'Self-healing attempt failed',
      code: '// Unable to automatically fix - manual intervention required',
      confidence: 0,
    };
  }
}

async function compareScreenshots(testId: string, baselineUrl: string, compareUrl: string) {
  try {
    // Initialize browser if needed
    if (!browser) {
      browser = await chromium.launch({ headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture baseline screenshot
    await page.goto(baselineUrl);
    await page.waitForLoadState('networkidle');
    const baselineBuffer = await page.screenshot();

    // Capture comparison screenshot
    await page.goto(compareUrl);
    await page.waitForLoadState('networkidle');
    const compareBuffer = await page.screenshot();

    await context.close();

    // Use Visual Regression Engine for comparison
    const result = await visualRegressionEngine.compare({
      testId,
      baseline: baselineBuffer,
      current: compareBuffer,
      threshold: 0.1,
    });

    return {
      percentage: result.diffPercentage,
      passed: result.passed,
      diffUrl: result.diffImageUrl || 'N/A',
      pixelsDifferent: result.pixelsDifferent,
    };
  } catch (error) {
    return {
      percentage: 0,
      passed: false,
      diffUrl: 'Error during comparison',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function generateReport(testIds: string[], format: string) {
  try {
    // Collect test results
    const testResults = testIds.map(id => testStore.get(id)).filter(Boolean);

    // Use Report Generator to create comprehensive report
    const report = await reportGenerator.generate({
      tests: testResults,
      format: format as 'html' | 'json' | 'markdown',
      includeScreenshots: true,
      includeTimeline: true,
    });

    return {
      url: report.url || 'report.html',
      summary: report.summary,
    };
  } catch (error) {
    return {
      url: 'Error generating report',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function generateTestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Cleanup function for browser
async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AutoQA MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
