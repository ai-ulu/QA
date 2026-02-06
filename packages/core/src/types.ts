import { Page, Browser, BrowserContext } from 'playwright';

export interface TestConfig {
  baseURL?: string;
  headless?: boolean;
  timeout?: number;
  retries?: number;
  workers?: number;
  reporter?: 'list' | 'json' | 'html' | 'junit';
  use?: {
    screenshot?: 'on' | 'off' | 'only-on-failure';
    video?: 'on' | 'off' | 'retain-on-failure';
    trace?: 'on' | 'off' | 'retain-on-failure';
  };
}

export interface TestContext {
  page: Page;
  browser: Browser;
  context: BrowserContext;
}

export type TestFunction = (context: TestContext) => Promise<void>;
export type HookFunction = (context?: TestContext) => Promise<void>;

export interface Test {
  id: string;
  name: string;
  fn: TestFunction;
  suite?: string;
  timeout?: number;
  retries?: number;
}

export interface TestResult {
  test: Test;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: Error;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
}

export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

export interface Plugin {
  name: string;
  version: string;
  beforeAll?(config: TestConfig): Promise<void>;
  beforeEach?(test: Test): Promise<void>;
  afterEach?(test: Test, result: TestResult): Promise<void>;
  afterAll?(results: TestResults): Promise<void>;
}

export interface Hook {
  type: 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll';
  fn: HookFunction;
}
