# Developer Experience Excellence Design Document - Faz 23

## Sistem Mimarisi

### Developer Experience Ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoQA Developer Ecosystem              │
├─────────────────────────────────────────────────────────────┤
│  VS Code    │    CLI Tool    │  Test Runner  │    Docs     │
│ Extension   │   (Terminal)   │  (Browser)    │  (Website)  │
├─────────────────────────────────────────────────────────────┤
│              AutoQA Core Engine (Shared)                   │
├─────────────────────────────────────────────────────────────┤
│  Test Gen   │   Execution    │   Reporting   │  Templates  │
└─────────────────────────────────────────────────────────────┘
```

## Detaylı Tasarım

### 1. VS Code Extension Architecture

#### 1.1 Extension Structure

```typescript
// packages/vscode-extension/
├── src/
│   ├── extension.ts           // Main extension entry
│   ├── providers/
│   │   ├── testProvider.ts    // Test tree view
│   │   ├── snippetProvider.ts // Code snippets
│   │   └── selectorProvider.ts // Playwright selectors
│   ├── webview/
│   │   ├── testPreview.ts     // Inline test preview
│   │   └── selectorPlayground.ts // Interactive selector
│   ├── ai/
│   │   ├── commentParser.ts   // Parse test comments
│   │   └── testGenerator.ts   // AI test generation
│   └── debugger/
│       └── playwrightDebugger.ts // Debug integration
├── package.json               // Extension manifest
└── README.md                 // Extension documentation
```

#### 1.2 Core Features Implementation

**Inline Test Preview:**

```typescript
class TestPreviewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.html = this.getTestPreviewHtml();

    // Listen for code changes
    vscode.workspace.onDidChangeTextDocument(event => {
      if (this.isTestFile(event.document)) {
        this.updatePreview(event.document);
      }
    });
  }

  private updatePreview(document: vscode.TextDocument) {
    const testCode = this.extractTestCode(document.getText());
    const preview = this.generatePreview(testCode);
    this.webview.postMessage({ type: 'updatePreview', preview });
  }
}
```

**AI-Powered Test Generation:**

```typescript
class AITestGenerator {
  async generateFromComment(comment: string): Promise<string> {
    // Parse comment: "// Test: User can login with valid credentials"
    const intent = this.parseTestIntent(comment);

    // Generate Playwright test
    const testCode = await this.aiService.generateTest({
      intent,
      framework: 'playwright',
      language: 'typescript',
    });

    return this.formatTestCode(testCode);
  }

  private parseTestIntent(comment: string): TestIntent {
    const match = comment.match(/\/\/\s*Test:\s*(.+)/);
    return {
      description: match?.[1] || '',
      type: this.inferTestType(match?.[1] || ''),
      elements: this.extractElements(match?.[1] || ''),
    };
  }
}
```

**Playwright Selector Generator:**

```typescript
class SelectorGenerator {
  async generateSelector(element: ElementInfo): Promise<string> {
    const selectors = [
      `[data-testid="${element.testId}"]`,
      `#${element.id}`,
      `.${element.className}`,
      `${element.tagName}:has-text("${element.text}")`,
      this.generateXPath(element),
    ];

    // Test each selector for uniqueness
    for (const selector of selectors) {
      if (await this.isUniqueSelector(selector)) {
        return selector;
      }
    }

    return this.generateFallbackSelector(element);
  }
}
```

### 2. CLI Tool Architecture

#### 2.1 CLI Structure

```typescript
// packages/cli/
├── src/
│   ├── index.ts              // CLI entry point
│   ├── commands/
│   │   ├── init.ts           // npx autoqa init
│   │   ├── dev.ts            // npx autoqa dev
│   │   ├── record.ts         // npx autoqa record
│   │   ├── debug.ts          // npx autoqa debug
│   │   └── generate.ts       // npx autoqa generate
│   ├── templates/
│   │   ├── react.ts          // React template
│   │   ├── nextjs.ts         // Next.js template
│   │   └── vue.ts            // Vue template
│   ├── ui/
│   │   ├── spinner.ts        // Loading spinners
│   │   ├── progress.ts       // Progress bars
│   │   └── prompts.ts        // Interactive prompts
│   └── utils/
│       ├── fileSystem.ts     // File operations
│       └── packageManager.ts // npm/yarn detection
├── bin/
│   └── autoqa.js            // Executable
└── package.json             // CLI package
```

#### 2.2 Command Implementations

**Init Command:**

```typescript
class InitCommand {
  async execute(projectName: string, options: InitOptions) {
    const spinner = ora('Creating AutoQA project...').start();

    try {
      // 1. Create project directory
      await this.createProjectDirectory(projectName);

      // 2. Install template
      const template = options.template || 'basic';
      await this.installTemplate(template, projectName);

      // 3. Install dependencies
      spinner.text = 'Installing dependencies...';
      await this.installDependencies(projectName);

      // 4. Generate first test
      spinner.text = 'Generating first test...';
      await this.generateFirstTest(projectName);

      spinner.succeed('AutoQA project created successfully!');

      // 5. Show next steps
      this.showNextSteps(projectName);
    } catch (error) {
      spinner.fail('Failed to create project');
      throw error;
    }
  }

  private showNextSteps(projectName: string) {
    console.log(
      boxen(
        `
      🎉 AutoQA project created!
      
      Next steps:
      cd ${projectName}
      npm run test
      
      Happy testing! 🚀
    `,
        { padding: 1, borderColor: 'green' }
      )
    );
  }
}
```

**Dev Command (Watch Mode):**

```typescript
class DevCommand {
  async execute(options: DevOptions) {
    const spinner = ora('Starting AutoQA dev server...').start();

    // Start file watcher
    const watcher = chokidar.watch(['**/*.test.ts', '**/*.spec.ts']);

    watcher.on('change', async filePath => {
      spinner.text = `Running tests for ${filePath}...`;
      await this.runTests(filePath);
      spinner.succeed(`Tests completed for ${filePath}`);
    });

    // Start localhost test runner
    await this.startTestRunner(options.port || 3333);

    spinner.succeed(
      `AutoQA dev server running on http://localhost:${options.port || 3333}`
    );
  }
}
```

**Record Command:**

```typescript
class RecordCommand {
  async execute(url: string, options: RecordOptions) {
    const browser = await playwright.chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Enable recording
    const recorder = new PlaywrightRecorder();
    await recorder.start(page);

    console.log(chalk.green(`🎬 Recording started for ${url}`));
    console.log(chalk.yellow('Interact with the page, press Ctrl+C to stop'));

    await page.goto(url);

    // Wait for user to stop recording
    process.on('SIGINT', async () => {
      const testCode = await recorder.stop();
      await this.saveRecording(testCode, options.output);
      await browser.close();
      process.exit(0);
    });
  }
}
```

### 3. Localhost Test Runner Architecture

#### 3.1 Web UI Structure

```typescript
// packages/test-runner/
├── src/
│   ├── server/
│   │   ├── app.ts            // Express server
│   │   ├── websocket.ts      // Socket.io server
│   │   └── testExecutor.ts   // Test execution
│   ├── client/
│   │   ├── components/
│   │   │   ├── TestList.tsx      // Test file list
│   │   │   ├── TestRunner.tsx    // Test execution view
│   │   │   ├── VideoPlayer.tsx   // Test video
│   │   │   ├── DOMViewer.tsx     // DOM snapshots
│   │   │   └── SelectorPlayground.tsx // Interactive selector
│   │   ├── hooks/
│   │   │   ├── useTestExecution.ts // Test execution state
│   │   │   └── useWebSocket.ts     // WebSocket connection
│   │   └── utils/
│   │       ├── testParser.ts       // Parse test files
│   │       └── domSnapshot.ts      // DOM snapshot utils
│   └── shared/
│       └── types.ts          // Shared types
└── public/
    └── index.html           // Web app entry
```

#### 3.2 Real-time Test Execution

**Test Execution Engine:**

```typescript
class TestExecutionEngine {
  async executeTest(testFile: string, testName: string): Promise<TestResult> {
    const browser = await playwright.chromium.launch({
      headless: false,
      args: ['--enable-automation'],
    });

    const context = await browser.newContext({
      recordVideo: { dir: 'test-results/videos' },
    });

    const page = await context.newPage();

    // Enable DOM snapshot capture
    await this.enableDOMCapture(page);

    // Execute test with step-by-step tracking
    const result = await this.executeWithTracking(page, testFile, testName);

    await browser.close();
    return result;
  }

  private async executeWithTracking(
    page: Page,
    testFile: string,
    testName: string
  ) {
    const steps: TestStep[] = [];

    // Intercept Playwright actions
    page.on('console', msg => {
      if (msg.text().startsWith('AUTOQA_STEP:')) {
        const stepData = JSON.parse(msg.text().replace('AUTOQA_STEP:', ''));
        steps.push(stepData);
        this.emitStep(stepData);
      }
    });

    // Run the actual test
    const testResult = await this.runPlaywrightTest(testFile, testName);

    return { ...testResult, steps };
  }
}
```

**Time-Travel Debugging:**

```typescript
class TimeTravelDebugger {
  private snapshots: DOMSnapshot[] = [];
  private currentStep = 0;

  async captureSnapshot(page: Page, stepIndex: number) {
    const snapshot = await page.evaluate(() => ({
      html: document.documentElement.outerHTML,
      url: window.location.href,
      timestamp: Date.now(),
      stepIndex,
    }));

    this.snapshots[stepIndex] = snapshot;
  }

  async goToStep(stepIndex: number): Promise<DOMSnapshot> {
    this.currentStep = stepIndex;
    return this.snapshots[stepIndex];
  }

  async playFromStep(stepIndex: number) {
    // Restore DOM state and continue execution
    const snapshot = this.snapshots[stepIndex];
    await this.restoreSnapshot(snapshot);
    await this.continueExecution(stepIndex);
  }
}
```

### 4. Quick-start Templates System

#### 4.1 Template Architecture

```typescript
// packages/templates/
├── src/
│   ├── base/
│   │   ├── package.json.template
│   │   ├── playwright.config.ts.template
│   │   └── tsconfig.json.template
│   ├── frameworks/
│   │   ├── react/
│   │   │   ├── template.json      // Template metadata
│   │   │   ├── src/
│   │   │   └── tests/
│   │   ├── nextjs/
│   │   ├── vue/
│   │   └── angular/
│   ├── industries/
│   │   ├── ecommerce/
│   │   │   ├── tests/
│   │   │   │   ├── checkout.spec.ts
│   │   │   │   ├── product.spec.ts
│   │   │   │   └── auth.spec.ts
│   │   │   └── fixtures/
│   │   ├── saas/
│   │   └── blog/
│   └── examples/
│       ├── login-flows/
│       ├── form-validation/
│       └── api-testing/
```

#### 4.2 Template Engine

```typescript
class TemplateEngine {
  async generateProject(
    templateName: string,
    projectName: string,
    options: TemplateOptions
  ) {
    const template = await this.loadTemplate(templateName);

    // 1. Copy template files
    await this.copyTemplateFiles(template, projectName);

    // 2. Process template variables
    await this.processTemplateVariables(projectName, {
      projectName,
      ...options,
    });

    // 3. Install dependencies
    await this.installDependencies(projectName, template.dependencies);

    // 4. Generate example tests
    await this.generateExampleTests(projectName, template.testExamples);

    // 5. Setup deployment (if requested)
    if (options.deploy) {
      await this.setupDeployment(projectName, options.deployTarget);
    }
  }

  private async processTemplateVariables(
    projectPath: string,
    variables: Record<string, any>
  ) {
    const files = await glob(`${projectPath}/**/*.template`);

    for (const file of files) {
      let content = await fs.readFile(file, 'utf-8');

      // Replace template variables
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      // Write processed file
      const outputFile = file.replace('.template', '');
      await fs.writeFile(outputFile, content);
      await fs.unlink(file); // Remove template file
    }
  }
}
```

### 5. Interactive Documentation System

#### 5.1 Documentation Architecture

```typescript
// packages/docs/
├── pages/
│   ├── index.mdx             // Homepage
│   ├── getting-started/
│   │   ├── installation.mdx
│   │   ├── first-test.mdx
│   │   └── cli-usage.mdx
│   ├── guides/
│   │   ├── testing-patterns.mdx
│   │   ├── best-practices.mdx
│   │   └── migration.mdx
│   ├── api/
│   │   ├── cli-reference.mdx
│   │   └── extension-api.mdx
│   └── examples/
│       ├── react-testing.mdx
│       ├── vue-testing.mdx
│       └── api-testing.mdx
├── components/
│   ├── CodeSandbox.tsx       // Runnable examples
│   ├── VideoTutorial.tsx     // Embedded videos
│   ├── InteractiveDemo.tsx   // Live demos
│   └── SearchBox.tsx         // AI-powered search
├── lib/
│   ├── search.ts             // Algolia integration
│   └── examples.ts           // Example management
└── public/
    ├── videos/               // Tutorial videos
    └── examples/             // Code examples
```

#### 5.2 Runnable Examples System

```typescript
class RunnableExampleManager {
  async createSandbox(exampleCode: string, framework: string): Promise<string> {
    const sandboxConfig = {
      files: {
        'package.json': {
          content: this.generatePackageJson(framework),
        },
        'src/test.spec.ts': {
          content: exampleCode,
        },
        'playwright.config.ts': {
          content: this.generatePlaywrightConfig(),
        },
      },
      template: this.getTemplate(framework),
    };

    // Create CodeSandbox
    const response = await fetch(
      'https://codesandbox.io/api/v1/sandboxes/define',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sandboxConfig),
      }
    );

    const { sandbox_id } = await response.json();
    return `https://codesandbox.io/s/${sandbox_id}`;
  }

  generatePackageJson(framework: string): string {
    const dependencies = {
      '@playwright/test': '^1.40.0',
      ...this.getFrameworkDependencies(framework),
    };

    return JSON.stringify(
      {
        name: 'autoqa-example',
        scripts: {
          test: 'playwright test',
        },
        dependencies,
      },
      null,
      2
    );
  }
}
```

#### 5.3 AI-Powered Search

```typescript
class AIDocumentationSearch {
  async search(query: string): Promise<SearchResult[]> {
    // 1. Traditional search with Algolia
    const traditionalResults = await this.algoliaSearch(query);

    // 2. AI-enhanced search
    const aiResults = await this.aiSearch(query);

    // 3. Combine and rank results
    return this.combineResults(traditionalResults, aiResults);
  }

  private async aiSearch(query: string): Promise<SearchResult[]> {
    const response = await this.aiService.search({
      query,
      context: 'AutoQA documentation',
      type: 'semantic_search',
    });

    return response.results.map(result => ({
      title: result.title,
      content: result.snippet,
      url: result.url,
      relevance: result.score,
      type: 'ai_enhanced',
    }));
  }
}
```

## Performance Optimizations

### VS Code Extension Performance

```typescript
// Lazy loading for heavy operations
class LazyTestProvider {
  private _testCache = new Map<string, TestInfo[]>();

  async getTests(document: vscode.TextDocument): Promise<TestInfo[]> {
    const uri = document.uri.toString();

    if (this._testCache.has(uri)) {
      return this._testCache.get(uri)!;
    }

    // Parse tests in background
    const tests = await this.parseTestsAsync(document);
    this._testCache.set(uri, tests);

    return tests;
  }
}
```

### CLI Tool Performance

```typescript
// Parallel template processing
class ParallelTemplateProcessor {
  async processTemplate(templatePath: string, outputPath: string) {
    const files = await this.getTemplateFiles(templatePath);

    // Process files in parallel
    await Promise.all(files.map(file => this.processFile(file, outputPath)));
  }
}
```

### Test Runner Performance

```typescript
// Efficient DOM snapshot storage
class DOMSnapshotManager {
  private snapshots = new Map<number, CompressedSnapshot>();

  async storeSnapshot(stepIndex: number, html: string) {
    // Compress HTML for storage
    const compressed = await this.compressHTML(html);
    this.snapshots.set(stepIndex, compressed);
  }

  private async compressHTML(html: string): Promise<CompressedSnapshot> {
    // Use LZ compression for HTML
    const compressed = LZString.compress(html);
    return { data: compressed, size: compressed.length };
  }
}
```

## Monitoring ve Analytics

### Usage Analytics

```typescript
interface DeveloperExperienceMetrics {
  // VS Code Extension
  extensionActivations: number;
  testGenerationsFromComments: number;
  selectorGenerations: number;
  debugSessions: number;

  // CLI Tool
  projectInits: number;
  devModeUsage: number;
  recordingSessions: number;
  templateUsage: Record<string, number>;

  // Test Runner
  testExecutions: number;
  timeTravelUsage: number;
  selectorPlaygroundUsage: number;

  // Documentation
  pageViews: number;
  exampleRuns: number;
  searchQueries: number;
  videoViews: number;
}
```

### Performance Monitoring

```typescript
class PerformanceMonitor {
  trackExtensionPerformance() {
    // Track VS Code extension performance
    const startTime = performance.now();

    return {
      end: () => {
        const duration = performance.now() - startTime;
        this.recordMetric('extension.operation.duration', duration);
      },
    };
  }

  trackCLIPerformance(command: string) {
    // Track CLI command performance
    const timer = this.trackExtensionPerformance();

    return {
      end: () => {
        timer.end();
        this.recordMetric(`cli.${command}.duration`, timer.duration);
      },
    };
  }
}
```

Bu design document Faz 23'ün teknik implementasyonunu detaylandırıyor. Şimdi tasks.md dosyasını oluşturayım:
