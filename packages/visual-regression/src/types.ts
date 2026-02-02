export interface VisualRegressionConfig {
  baselineDir: string;
  outputDir: string;
  threshold: number; // 0-1, percentage of different pixels allowed
  includeAA: boolean; // Include anti-aliasing in comparison
  storage: {
    type: 'local' | 'minio' | 's3';
    endpoint?: string;
    accessKey?: string;
    secretKey?: string;
    bucket?: string;
  };
}

export interface BaselineImage {
  id: string;
  testId: string;
  name: string;
  version: number;
  filePath: string;
  metadata: {
    viewport: { width: number; height: number };
    browser: string;
    url: string;
    selector?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  hash: string;
}

export interface ComparisonResult {
  id: string;
  testId: string;
  baselineId: string;
  status: 'passed' | 'failed' | 'new';
  pixelDifference: number;
  percentageDifference: number;
  threshold: number;
  diffImagePath?: string;
  actualImagePath: string;
  baselineImagePath?: string;
  metadata: {
    comparedAt: Date;
    viewport: { width: number; height: number };
    browser: string;
    url: string;
  };
}

export interface VisualTestOptions {
  name: string;
  selector?: string;
  fullPage?: boolean;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mask?: string[];
  threshold?: number;
  ignoreRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface BaselineVersion {
  version: number;
  createdAt: Date;
  createdBy: string;
  description?: string;
  filePath: string;
  hash: string;
}

export interface VisualRegressionReport {
  testId: string;
  totalComparisons: number;
  passed: number;
  failed: number;
  new: number;
  results: ComparisonResult[];
  summary: {
    successRate: number;
    avgPixelDifference: number;
    maxPixelDifference: number;
  };
  generatedAt: Date;
}