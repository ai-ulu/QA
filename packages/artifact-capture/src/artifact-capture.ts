import { Page, Browser } from 'playwright';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { ArtifactConfig, TestArtifact, ArtifactCaptureResult, NetworkLogEntry } from './types';
import { StorageProvider } from './storage/storage-provider';
import { MinioStorageProvider } from './storage/minio-provider';
import { S3StorageProvider } from './storage/s3-provider';

export class ArtifactCaptureService {
  private config: ArtifactConfig;
  private storage: StorageProvider;
  private networkLogs: NetworkLogEntry[] = [];

  constructor(config: ArtifactConfig) {
    this.config = config;
    this.storage = this.createStorageProvider();
  }

  private createStorageProvider(): StorageProvider {
    switch (this.config.storage.type) {
      case 'minio':
        return new MinioStorageProvider(this.config.storage);
      case 's3':
        return new S3StorageProvider(this.config.storage);
      default:
        throw new Error(`Unsupported storage type: ${this.config.storage.type}`);
    }
  }

  async captureScreenshot(
    page: Page,
    testId: string,
    executionId: string,
    stepName: string
  ): Promise<TestArtifact | null> {
    if (!this.config.capture.screenshots) {
      return null;
    }

    try {
      const screenshot = await page.screenshot({
        fullPage: true,
        type: 'png',
      });

      let processedScreenshot = screenshot;
      if (this.config.capture.compression) {
        processedScreenshot = await sharp(screenshot)
          .png({ quality: 80, compressionLevel: 9 })
          .toBuffer();
      }

      const key = this.generateKey(testId, executionId, 'screenshot', 'png');
      await this.storage.uploadArtifact(
        processedScreenshot,
        key,
        'image/png',
        {
          testId,
          executionId,
          stepName,
          url: page.url(),
        }
      );

      const viewport = page.viewportSize();
      return {
        id: uuidv4(),
        testId,
        executionId,
        type: 'screenshot',
        timestamp: new Date(),
        metadata: {
          stepName,
          url: page.url(),
          viewport: viewport || { width: 1920, height: 1080 },
        },
        filePath: key,
        size: processedScreenshot.length,
      };
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      return null;
    }
  }

  async captureDOMSnapshot(
    page: Page,
    testId: string,
    executionId: string,
    error?: string
  ): Promise<TestArtifact | null> {
    if (!this.config.capture.domSnapshots) {
      return null;
    }

    try {
      const html = await page.content();
      const domSnapshot = Buffer.from(html, 'utf-8');

      let processedSnapshot = domSnapshot;
      if (this.config.capture.compression) {
        // For HTML, we can minify by removing extra whitespace
        const minified = html.replace(/>\s+</g, '><').trim();
        processedSnapshot = Buffer.from(minified, 'utf-8');
      }

      const key = this.generateKey(testId, executionId, 'dom-snapshot', 'html');
      await this.storage.uploadArtifact(
        processedSnapshot,
        key,
        'text/html',
        {
          testId,
          executionId,
          url: page.url(),
          ...(error && { error }),
        }
      );

      return {
        id: uuidv4(),
        testId,
        executionId,
        type: 'dom-snapshot',
        timestamp: new Date(),
        metadata: {
          url: page.url(),
          ...(error && { error }),
        },
        filePath: key,
        size: processedSnapshot.length,
      };
    } catch (error) {
      console.error('Failed to capture DOM snapshot:', error);
      return null;
    }
  }

  async startNetworkLogging(page: Page): Promise<void> {
    if (!this.config.capture.networkLogs) {
      return;
    }

    this.networkLogs = [];

    page.on('request', (request) => {
      const startTime = Date.now();
      request.response().then((response) => {
        if (response) {
          const endTime = Date.now();
          this.networkLogs.push({
            url: request.url(),
            method: request.method(),
            status: response.status(),
            requestHeaders: request.headers(),
            responseHeaders: response.headers(),
            requestBody: request.postData() || '',
            timestamp: startTime,
            duration: endTime - startTime,
          });
        }
      }).catch(() => {
        // Ignore failed requests for network logging
      });
    });
  }

  async captureNetworkLogs(
    testId: string,
    executionId: string
  ): Promise<TestArtifact | null> {
    if (!this.config.capture.networkLogs || this.networkLogs.length === 0) {
      return null;
    }

    try {
      const harData = {
        log: {
          version: '1.2',
          creator: {
            name: 'AutoQA Artifact Capture',
            version: '1.0.0',
          },
          entries: this.networkLogs.map(log => ({
            startedDateTime: new Date(log.timestamp).toISOString(),
            time: log.duration,
            request: {
              method: log.method,
              url: log.url,
              headers: Object.entries(log.requestHeaders).map(([name, value]) => ({ name, value })),
              ...(log.requestBody && { postData: { text: log.requestBody } }),
            },
            response: {
              status: log.status,
              headers: Object.entries(log.responseHeaders).map(([name, value]) => ({ name, value })),
            },
          })),
        },
      };

      const harBuffer = Buffer.from(JSON.stringify(harData, null, 2), 'utf-8');
      const key = this.generateKey(testId, executionId, 'network-log', 'har');
      
      await this.storage.uploadArtifact(
        harBuffer,
        key,
        'application/json',
        {
          testId,
          executionId,
          entryCount: this.networkLogs.length.toString(),
        }
      );

      return {
        id: uuidv4(),
        testId,
        executionId,
        type: 'network-log',
        timestamp: new Date(),
        metadata: {},
        filePath: key,
        size: harBuffer.length,
      };
    } catch (error) {
      console.error('Failed to capture network logs:', error);
      return null;
    }
  }

  async captureAllArtifacts(
    page: Page,
    testId: string,
    executionId: string,
    stepName: string,
    error?: string
  ): Promise<ArtifactCaptureResult> {
    const artifacts: TestArtifact[] = [];
    const errors: string[] = [];

    try {
      // Capture screenshot
      const screenshot = await this.captureScreenshot(page, testId, executionId, stepName);
      if (screenshot) artifacts.push(screenshot);

      // Capture DOM snapshot if there's an error
      if (error) {
        const domSnapshot = await this.captureDOMSnapshot(page, testId, executionId, error);
        if (domSnapshot) artifacts.push(domSnapshot);
      }

      // Capture network logs
      const networkLog = await this.captureNetworkLogs(testId, executionId);
      if (networkLog) artifacts.push(networkLog);

      return {
        success: true,
        artifacts,
        errors,
      };
    } catch (error) {
      errors.push(`Failed to capture artifacts: ${error}`);
      return {
        success: false,
        artifacts,
        errors,
      };
    }
  }

  async getArtifactUrl(filePath: string, expiresIn?: number): Promise<string> {
    return this.storage.getArtifactUrl(filePath, expiresIn);
  }

  async deleteArtifacts(testId: string, executionId: string): Promise<void> {
    const prefix = `artifacts/${testId}/${executionId}/`;
    const keys = await this.storage.listArtifacts(prefix);
    
    await Promise.all(keys.map(key => this.storage.deleteArtifact(key)));
  }

  private generateKey(testId: string, executionId: string, type: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `artifacts/${testId}/${executionId}/${type}/${timestamp}.${extension}`;
  }
}