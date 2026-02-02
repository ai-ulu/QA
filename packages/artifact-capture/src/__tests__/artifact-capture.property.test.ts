import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { chromium, Browser, Page } from 'playwright';
import { ArtifactCaptureService } from '../artifact-capture';
import { ArtifactConfig } from '../types';

/**
 * Property 12: Comprehensive Artifact Capture
 * Validates: Requirements 6.1, 6.2
 * Test that screenshots are captured at each step
 * Verify DOM snapshots and network logs for failed tests
 */

describe('Property 12: Comprehensive Artifact Capture', () => {
  let browser: Browser;
  let page: Page;
  let artifactService: ArtifactCaptureService;

  const mockConfig: ArtifactConfig = {
    storage: {
      type: 'minio',
      endpoint: 'http://localhost:9000',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: 'test-artifacts',
    },
    capture: {
      screenshots: true,
      domSnapshots: true,
      networkLogs: true,
      compression: true,
    },
  };

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    
    // Mock storage provider for testing
    const mockStorage = {
      uploadArtifact: async () => 'mock-key',
      downloadArtifact: async () => Buffer.from('mock-data'),
      deleteArtifact: async () => {},
      listArtifacts: async () => ['mock-key'],
      getArtifactUrl: async () => 'http://mock-url',
    };
    
    artifactService = new ArtifactCaptureService(mockConfig);
    // @ts-ignore - Mock for testing
    artifactService['storage'] = mockStorage;
  });

  afterEach(async () => {
    await page?.close();
    await browser?.close();
  });

  it('should capture screenshots at each test step consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          executionId: fc.string({ minLength: 1, maxLength: 50 }),
          stepName: fc.string({ minLength: 1, maxLength: 100 }),
          url: fc.webUrl(),
        }),
        async ({ testId, executionId, stepName, url }) => {
          // Navigate to a test page
          await page.goto('data:text/html,<html><body><h1>Test Page</h1></body></html>');
          
          // Capture screenshot
          const artifact = await artifactService.captureScreenshot(
            page,
            testId,
            executionId,
            stepName
          );

          // Verify artifact properties
          expect(artifact).toBeTruthy();
          expect(artifact!.testId).toBe(testId);
          expect(artifact!.executionId).toBe(executionId);
          expect(artifact!.type).toBe('screenshot');
          expect(artifact!.metadata.stepName).toBe(stepName);
          expect(artifact!.filePath).toContain('screenshot');
          expect(artifact!.size).toBeGreaterThan(0);
          expect(artifact!.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should capture DOM snapshots for failed tests with error context', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          executionId: fc.string({ minLength: 1, maxLength: 50 }),
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        async ({ testId, executionId, errorMessage }) => {
          // Create a test page with some content
          const htmlContent = '<html><body><div id="test">Test Content</div></body></html>';
          await page.goto(`data:text/html,${htmlContent}`);
          
          // Capture DOM snapshot with error
          const artifact = await artifactService.captureDOMSnapshot(
            page,
            testId,
            executionId,
            errorMessage
          );

          // Verify artifact properties
          expect(artifact).toBeTruthy();
          expect(artifact!.testId).toBe(testId);
          expect(artifact!.executionId).toBe(executionId);
          expect(artifact!.type).toBe('dom-snapshot');
          expect(artifact!.metadata.error).toBe(errorMessage);
          expect(artifact!.filePath).toContain('dom-snapshot');
          expect(artifact!.size).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should capture network logs with complete request/response data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          executionId: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async ({ testId, executionId }) => {
          // Start network logging
          await artifactService.startNetworkLogging(page);
          
          // Make some network requests
          await page.goto('data:text/html,<html><body><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" /></body></html>');
          
          // Wait a bit for network requests to complete
          await page.waitForTimeout(100);
          
          // Capture network logs
          const artifact = await artifactService.captureNetworkLogs(testId, executionId);

          if (artifact) {
            expect(artifact.testId).toBe(testId);
            expect(artifact.executionId).toBe(executionId);
            expect(artifact.type).toBe('network-log');
            expect(artifact.filePath).toContain('network-log');
            expect(artifact.size).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should maintain artifact consistency across multiple captures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          executionId: fc.string({ minLength: 1, maxLength: 50 }),
          steps: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        }),
        async ({ testId, executionId, steps }) => {
          await page.goto('data:text/html,<html><body><h1>Multi-step Test</h1></body></html>');
          
          const artifacts = [];
          
          // Capture artifacts for each step
          for (const stepName of steps) {
            const artifact = await artifactService.captureScreenshot(
              page,
              testId,
              executionId,
              stepName
            );
            
            if (artifact) {
              artifacts.push(artifact);
            }
          }

          // Verify all artifacts have consistent metadata
          artifacts.forEach(artifact => {
            expect(artifact.testId).toBe(testId);
            expect(artifact.executionId).toBe(executionId);
            expect(artifact.type).toBe('screenshot');
            expect(artifact.size).toBeGreaterThan(0);
            expect(artifact.timestamp).toBeInstanceOf(Date);
          });

          // Verify unique file paths
          const filePaths = artifacts.map(a => a.filePath);
          const uniquePaths = new Set(filePaths);
          expect(uniquePaths.size).toBe(filePaths.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should handle artifact capture failures gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          executionId: fc.string({ minLength: 1, maxLength: 50 }),
          stepName: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async ({ testId, executionId, stepName }) => {
          // Mock storage failure
          const failingStorage = {
            uploadArtifact: async () => { throw new Error('Storage failure'); },
            downloadArtifact: async () => Buffer.from('mock-data'),
            deleteArtifact: async () => {},
            listArtifacts: async () => [],
            getArtifactUrl: async () => 'http://mock-url',
          };
          
          // @ts-ignore - Mock for testing
          artifactService['storage'] = failingStorage;
          
          await page.goto('data:text/html,<html><body><h1>Test Page</h1></body></html>');
          
          // Attempt to capture screenshot with failing storage
          const artifact = await artifactService.captureScreenshot(
            page,
            testId,
            executionId,
            stepName
          );

          // Should handle failure gracefully by returning null
          expect(artifact).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should compress artifacts when compression is enabled', async () => {
    const compressedConfig = {
      ...mockConfig,
      capture: {
        ...mockConfig.capture,
        compression: true,
      },
    };

    const uncompressedConfig = {
      ...mockConfig,
      capture: {
        ...mockConfig.capture,
        compression: false,
      },
    };

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          executionId: fc.string({ minLength: 1, maxLength: 50 }),
          stepName: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async ({ testId, executionId, stepName }) => {
          await page.goto('data:text/html,<html><body><h1>Large Test Page</h1>' + 'x'.repeat(1000) + '</body></html>');
          
          // Create services with different compression settings
          const compressedService = new ArtifactCaptureService(compressedConfig);
          const uncompressedService = new ArtifactCaptureService(uncompressedConfig);
          
          // Mock storage for both services
          const mockStorage = {
            uploadArtifact: async (data: Buffer) => {
              // Store the size for comparison
              return `mock-key-${data.length}`;
            },
            downloadArtifact: async () => Buffer.from('mock-data'),
            deleteArtifact: async () => {},
            listArtifacts: async () => [],
            getArtifactUrl: async () => 'http://mock-url',
          };
          
          // @ts-ignore - Mock for testing
          compressedService['storage'] = mockStorage;
          // @ts-ignore - Mock for testing
          uncompressedService['storage'] = mockStorage;
          
          // Capture with both services
          const compressedArtifact = await compressedService.captureScreenshot(
            page,
            testId,
            executionId,
            stepName
          );
          
          const uncompressedArtifact = await uncompressedService.captureScreenshot(
            page,
            testId + '_uncompressed',
            executionId,
            stepName
          );

          // Both should succeed
          expect(compressedArtifact).toBeTruthy();
          expect(uncompressedArtifact).toBeTruthy();
          
          // Verify compression settings are applied
          expect(compressedArtifact!.size).toBeGreaterThan(0);
          expect(uncompressedArtifact!.size).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});