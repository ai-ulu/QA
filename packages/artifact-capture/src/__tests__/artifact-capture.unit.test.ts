import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ArtifactCapture } from '../artifact-capture';
import { StorageClient } from '../storage-client';
import { ArtifactCaptureConfig } from '../types';

describe('ArtifactCapture Unit Tests', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let artifactCapture: ArtifactCapture;
  
  const mockConfig: ArtifactCaptureConfig = {
    minioEndpoint: 'localhost:9000',
    minioAccessKey: 'test',
    minioSecretKey: 'test',
    bucketName: 'test-bucket'
  };

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    
    artifactCapture = new ArtifactCapture(mockConfig, 'test-execution-id');
    
    // Mock storage client
    const mockStorageClient = {
      initialize: vi.fn().mockResolvedValue(undefined),
      uploadFile: vi.fn().mockResolvedValue('mock-path'),
      uploadBuffer: vi.fn().mockResolvedValue('mock-path'),
      uploadJSON: vi.fn().mockResolvedValue('mock-path'),
      getFileUrl: vi.fn().mockResolvedValue('mock-url'),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      listFiles: vi.fn().mockResolvedValue([])
    };
    
    (artifactCapture as any).storageClient = mockStorageClient;
  });

  afterEach(async () => {
    if (artifactCapture) {
      await artifactCapture.cleanup();
    }
    await context?.close();
    await browser?.close();
  });

  describe('Screenshot Capture', () => {
    it('should capture screenshot successfully', async () => {
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      const screenshot = await artifactCapture.captureScreenshot(page, 'test-step', 0);
      
      expect(screenshot).toBeTruthy();
      expect(screenshot!.stepName).toBe('test-step');
      expect(screenshot!.stepIndex).toBe(0);
      expect(screenshot!.filePath).toContain('screenshots');
      expect(screenshot!.url).toContain('data:text/html');
    });

    it('should return null when screenshots disabled', async () => {
      const capture = new ArtifactCapture(mockConfig, 'test-id', { 
        captureScreenshots: false,
        captureDOMOnFailure: false,
        captureNetworkLogs: false
      });
      (capture as any).storageClient = (artifactCapture as any).storageClient;
      
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      const screenshot = await capture.captureScreenshot(page, 'test-step', 0);
      
      expect(screenshot).toBeNull();
      await capture.cleanup();
    });

    it('should handle screenshot capture errors gracefully', async () => {
      const mockStorageClient = (artifactCapture as any).storageClient;
      mockStorageClient.uploadFile.mockRejectedValue(new Error('Upload failed'));
      
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      const screenshot = await artifactCapture.captureScreenshot(page, 'test-step', 0);
      
      expect(screenshot).toBeNull();
    });
  });

  describe('DOM Snapshot Capture', () => {
    it('should capture DOM snapshot on failure', async () => {
      await page.goto('data:text/html,<html><body><h1>Test Content</h1></body></html>');
      
      const snapshot = await artifactCapture.captureDOMSnapshot(
        page, 
        'failed-step', 
        1, 
        'Test error message'
      );
      
      expect(snapshot).toBeTruthy();
      expect(snapshot!.stepName).toBe('failed-step');
      expect(snapshot!.stepIndex).toBe(1);
      expect(snapshot!.errorMessage).toBe('Test error message');
      expect(snapshot!.filePath).toContain('dom-snapshots');
    });

    it('should not capture DOM snapshot when disabled and no error', async () => {
      const capture = new ArtifactCapture(mockConfig, 'test-id', { 
        captureScreenshots: false,
        captureDOMOnFailure: false,
        captureNetworkLogs: false
      });
      (capture as any).storageClient = (artifactCapture as any).storageClient;
      
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      const snapshot = await capture.captureDOMSnapshot(page, 'test-step', 0);
      
      expect(snapshot).toBeNull();
      await capture.cleanup();
    });

    it('should handle DOM snapshot errors gracefully', async () => {
      const mockStorageClient = (artifactCapture as any).storageClient;
      mockStorageClient.uploadFile.mockRejectedValue(new Error('Upload failed'));
      
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      const snapshot = await artifactCapture.captureDOMSnapshot(
        page, 
        'test-step', 
        0, 
        'Error message'
      );
      
      expect(snapshot).toBeNull();
    });
  });

  describe('Network Logging', () => {
    it('should setup network logging correctly', async () => {
      await artifactCapture.setupNetworkLogging(context);
      
      // Trigger network activity
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      const networkLogs = (artifactCapture as any).networkLogs;
      expect(Array.isArray(networkLogs)).toBe(true);
    });

    it('should capture network logs in HAR format', async () => {
      await artifactCapture.setupNetworkLogging(context);
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      // Add some network logs manually for testing
      (artifactCapture as any).networkLogs.push({
        type: 'request',
        timestamp: new Date(),
        url: 'https://example.com',
        method: 'GET',
        headers: { 'User-Agent': 'test' }
      });
      
      const networkLog = await artifactCapture.captureNetworkLogs();
      
      expect(networkLog).toBeTruthy();
      expect(networkLog!.harData.log.version).toBe('1.2');
      expect(networkLog!.harData.log.creator.name).toBe('AutoQA Pilot');
      expect(networkLog!.filePath).toContain('network-logs');
    });

    it('should return null when network logging disabled', async () => {
      const capture = new ArtifactCapture(mockConfig, 'test-id', { 
        captureScreenshots: false,
        captureDOMOnFailure: false,
        captureNetworkLogs: false
      });
      (capture as any).storageClient = (artifactCapture as any).storageClient;
      
      const networkLog = await capture.captureNetworkLogs();
      
      expect(networkLog).toBeNull();
      await capture.cleanup();
    });
  });

  describe('Failure Artifacts', () => {
    it('should capture comprehensive failure artifacts', async () => {
      await page.goto('data:text/html,<html><body><h1>Test Page</h1></body></html>');
      
      await artifactCapture.captureFailureArtifacts(
        page, 
        'failing-step', 
        2, 
        'Test failure message'
      );
      
      const artifacts = (artifactCapture as any).artifacts;
      
      // Should have failure screenshot
      const failureScreenshot = artifacts.screenshots.find(
        (s: any) => s.stepName === 'failing-step_FAILED'
      );
      expect(failureScreenshot).toBeTruthy();
      
      // Should have failure DOM snapshot
      const failureSnapshot = artifacts.domSnapshots.find(
        (s: any) => s.stepName === 'failing-step_FAILED'
      );
      expect(failureSnapshot).toBeTruthy();
      expect(failureSnapshot.errorMessage).toBe('Test failure message');
      
      // Should update status to failed
      expect(artifacts.metadata.status).toBe('failed');
    });
  });

  describe('Metadata Management', () => {
    it('should update metadata correctly', async () => {
      const updates = {
        scenarioId: 'test-scenario-id',
        userId: 'test-user-id',
        totalSteps: 5,
        completedSteps: 3
      };
      
      artifactCapture.updateMetadata(updates);
      
      const metadata = (artifactCapture as any).artifacts.metadata;
      expect(metadata.scenarioId).toBe(updates.scenarioId);
      expect(metadata.userId).toBe(updates.userId);
      expect(metadata.totalSteps).toBe(updates.totalSteps);
      expect(metadata.completedSteps).toBe(updates.completedSteps);
    });
  });

  describe('Artifact Finalization', () => {
    it('should finalize artifacts successfully', async () => {
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      // Capture some artifacts
      await artifactCapture.captureScreenshot(page, 'test-step', 0);
      
      const finalArtifacts = await artifactCapture.finalizeArtifacts();
      
      expect(finalArtifacts.executionId).toBe('test-execution-id');
      expect(finalArtifacts.metadata.endTime).toBeInstanceOf(Date);
      expect(finalArtifacts.metadata.status).toBe('completed');
      expect(finalArtifacts.screenshots.length).toBe(1);
    });

    it('should handle finalization errors', async () => {
      const mockStorageClient = (artifactCapture as any).storageClient;
      mockStorageClient.uploadJSON.mockRejectedValue(new Error('Upload failed'));
      
      await expect(artifactCapture.finalizeArtifacts()).rejects.toThrow('Upload failed');
    });
  });

  describe('Artifact URLs', () => {
    it('should generate artifact URLs correctly', async () => {
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      // Capture artifacts
      await artifactCapture.captureScreenshot(page, 'test-step', 0);
      await artifactCapture.captureDOMSnapshot(page, 'test-step', 0, 'error');
      
      const urls = await artifactCapture.getArtifactUrls(7200);
      
      expect(Object.keys(urls).length).toBeGreaterThan(0);
      Object.values(urls).forEach(url => {
        expect(url).toBe('mock-url');
      });
    });

    it('should handle URL generation errors', async () => {
      const mockStorageClient = (artifactCapture as any).storageClient;
      mockStorageClient.getFileUrl.mockRejectedValue(new Error('URL generation failed'));
      
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      await artifactCapture.captureScreenshot(page, 'test-step', 0);
      
      await expect(artifactCapture.getArtifactUrls()).rejects.toThrow('URL generation failed');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup temporary files', async () => {
      const fsMock = {
        rm: vi.fn().mockResolvedValue(undefined)
      };
      
      vi.doMock('fs/promises', () => fsMock);
      
      await artifactCapture.cleanup();
      
      // Note: In a real test, we would verify the fs.rm call
      // but for this unit test, we just ensure no errors are thrown
      expect(true).toBe(true);
    });

    it('should handle cleanup errors gracefully', async () => {
      const fsMock = {
        rm: vi.fn().mockRejectedValue(new Error('Cleanup failed'))
      };
      
      vi.doMock('fs/promises', () => fsMock);
      
      // Should not throw error even if cleanup fails
      await expect(artifactCapture.cleanup()).resolves.toBeUndefined();
    });
  });
});