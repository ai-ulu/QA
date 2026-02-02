export interface TestExecution {
  id: string;
  testId: string;
  projectId: string;
  status: 'passed' | 'failed' | 'skipped' | 'running';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  steps: TestStep[];
  artifacts: TestArtifact[];
  metadata: {
    browser: string;
    viewport: { width: number; height: number };
    url: string;
    userAgent: string;
  };
}

export interface TestStep {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  screenshots: string[];
  logs: string[];
}

export interface TestArtifact {
  id: string;
  type: 'screenshot' | 'dom-snapshot' | 'network-log';
  filePath: string;
  url?: string;
  timestamp: Date;
  size: number;
  metadata: Record<string, any>;
}

export interface ReportConfig {
  template: 'default' | 'detailed' | 'executive';
  includeArtifacts: boolean;
  includeTimeline: boolean;
  includeCharts: boolean;
  branding: {
    logo?: string;
    companyName?: string;
    colors: {
      primary: string;
      secondary: string;
      success: string;
      error: string;
    };
  };
  output: {
    format: 'html' | 'pdf' | 'json';
    filename?: string;
  };
}

export interface ReportData {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    successRate: number;
    totalDuration: number;
    executionDate: Date;
  };
  executions: TestExecution[];
  historical?: HistoricalData[];
  config: ReportConfig;
}

export interface HistoricalData {
  date: Date;
  totalTests: number;
  passed: number;
  failed: number;
  successRate: number;
  avgDuration: number;
}

export interface ReportResult {
  success: boolean;
  filePath?: string;
  url?: string;
  error?: string;
}