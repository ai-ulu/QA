export interface ArtifactConfig {
  storage: {
    type: 'minio' | 's3';
    endpoint?: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region?: string;
  };
  capture: {
    screenshots: boolean;
    domSnapshots: boolean;
    networkLogs: boolean;
    compression: boolean;
  };
}

export interface TestArtifact {
  id: string;
  testId: string;
  executionId: string;
  type: 'screenshot' | 'dom-snapshot' | 'network-log';
  timestamp: Date;
  metadata: {
    stepName?: string;
    url?: string;
    viewport?: { width: number; height: number };
    error?: string;
  };
  filePath: string;
  size: number;
}

export interface ArtifactCaptureResult {
  success: boolean;
  artifacts: TestArtifact[];
  errors: string[];
}

export interface NetworkLogEntry {
  url: string;
  method: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string;
  responseBody?: string;
  timestamp: number;
  duration: number;
}