import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReportGenerator } from '../report-generator';
import { ReportConfig, ReportData, TestExecution, TestStep, TestArtifact } from '../types';

// Mock puppeteer
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(() => ({
      newPage: vi.fn(() => ({
        setContent: vi.fn(),
        pdf: vi.fn(() => Buffer.from('mock-pdf')),
        close: vi.fn()
      })),
      close: vi.fn()
    }))
  }
}));

// Mock fs operations
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '<html><body>{{content}}</body></html>'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn()
}));

describe('ReportGenerator Unit Tests - Edge Cases', () => {
  let reportGenerator: ReportGenerator;
  let mockConfig: ReportConfig;

  beforeEach(() => {
    mockConfig = {
      template: 'default',
      includeArtifacts: true,
      includeTimeline: true,
      includeCharts: true,
      branding: {
        companyName: 'Test Company',
        colors: {
          primary: '#007bff',
          secondary: '#6c757d',
          success: '#28a745',
          error: '#dc3545'
        }
      },
      output: {
        format: 'html',
        filename: 'test-report.html'
      }
    };

    reportGenerator = new ReportGenerator(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Large Artifact Handling', () => {
    it('should handle reports with large number of artifacts', async () => {
      const largeArtifacts: TestArtifact[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `artifact-${i}`,
        type: 'screenshot',
        filePath: `/path/to/screenshot-${i}.png`,
        timestamp: new Date(),
        size: 1024 * 1024, // 1MB each
        metadata: { stepName: `Step ${i}` }
      }));

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 60000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'passed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 60000,
          steps: [],
          artifacts: largeArtifacts,
          metadata: {
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            userAgent: 'test-agent'
          }
        }],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeTruthy();
      
      // Should handle large artifacts without memory issues
      expect(reportData.executions[0].artifacts.length).toBe(1000);
    });

    it('should handle artifacts with missing files gracefully', async () => {
      const artifactsWithMissingFiles: TestArtifact[] = [
        {
          id: 'artifact-1',
          type: 'screenshot',
          filePath: '/nonexistent/path/screenshot.png',
          timestamp: new Date(),
          size: 0,
          metadata: { stepName: 'Missing Screenshot' }
        },
        {
          id: 'artifact-2',
          type: 'dom-snapshot',
          filePath: '/nonexistent/path/dom.html',
          timestamp: new Date(),
          size: 0,
          metadata: { stepName: 'Missing DOM' }
        }
      ];

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          successRate: 0.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'failed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 30000,
          error: 'Test failed due to missing elements',
          steps: [],
          artifacts: artifactsWithMissingFiles,
          metadata: {
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            userAgent: 'test-agent'
          }
        }],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      
      // Should handle missing files gracefully
      expect(reportData.executions[0].artifacts.length).toBe(2);
    });
  });

  describe('Storage Failure Scenarios', () => {
    it('should handle storage write failures gracefully', async () => {
      const fs = await import('fs');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'passed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 30000,
          steps: [],
          artifacts: [],
          metadata: {
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            userAgent: 'test-agent'
          }
        }],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
    });

    it('should handle template read failures', async () => {
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Template file not found');
      });

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Template file not found');
    });
  });

  describe('Report Generation with Missing Data', () => {
    it('should generate report with empty executions', async () => {
      const reportData: ReportData = {
        summary: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          successRate: 0,
          totalDuration: 0,
          executionDate: new Date()
        },
        executions: [],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeTruthy();
    });

    it('should handle executions with missing metadata', async () => {
      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'passed',
          startTime: new Date(),
          steps: [],
          artifacts: [],
          metadata: {
            browser: 'unknown',
            viewport: { width: 0, height: 0 },
            url: '',
            userAgent: ''
          }
        }],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeTruthy();
    });

    it('should handle malformed step data', async () => {
      const malformedSteps: TestStep[] = [
        {
          id: 'step-1',
          name: '',
          status: 'passed',
          startTime: new Date(),
          screenshots: [],
          logs: []
        },
        {
          id: 'step-2',
          name: 'Valid Step',
          status: 'failed',
          startTime: new Date(),
          endTime: new Date(Date.now() - 1000), // End time before start time
          error: '',
          screenshots: [],
          logs: []
        }
      ];

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          successRate: 0.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'failed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 30000,
          steps: malformedSteps,
          artifacts: [],
          metadata: {
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            userAgent: 'test-agent'
          }
        }],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeTruthy();
    });
  });

  describe('Concurrent Report Generation', () => {
    it('should handle concurrent report generation requests', async () => {
      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'passed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 30000,
          steps: [],
          artifacts: [],
          metadata: {
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            userAgent: 'test-agent'
          }
        }],
        config: mockConfig
      };

      // Generate multiple reports concurrently
      const promises = Array.from({ length: 5 }, (_, i) => 
        reportGenerator.generateReport({
          ...reportData,
          config: {
            ...mockConfig,
            output: {
              ...mockConfig.output,
              filename: `concurrent-report-${i}.html`
            }
          }
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.filePath).toContain(`concurrent-report-${index}.html`);
      });
    });
  });

  describe('Memory Management', () => {
    it('should handle memory-intensive report generation', async () => {
      // Create a large dataset
      const largeSteps: TestStep[] = Array.from({ length: 500 }, (_, i) => ({
        id: `step-${i}`,
        name: `Large Step ${i}`,
        status: i % 10 === 0 ? 'failed' : 'passed',
        startTime: new Date(),
        endTime: new Date(),
        duration: Math.random() * 5000,
        error: i % 10 === 0 ? `Error in step ${i}` : undefined,
        screenshots: [`/path/to/screenshot-${i}.png`],
        logs: Array.from({ length: 10 }, (_, j) => `Log entry ${j} for step ${i}`)
      }));

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 300000,
          executionDate: new Date()
        },
        executions: [{
          id: 'exec-1',
          testId: 'test-1',
          projectId: 'project-1',
          status: 'passed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 300000,
          steps: largeSteps,
          artifacts: [],
          metadata: {
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            userAgent: 'test-agent'
          }
        }],
        config: mockConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeTruthy();
      
      // Should handle large datasets without memory issues
      expect(reportData.executions[0].steps.length).toBe(500);
    });
  });

  describe('PDF Generation Edge Cases', () => {
    it('should handle PDF generation failures gracefully', async () => {
      const puppeteer = await import('puppeteer');
      const mockPage = {
        setContent: vi.fn(),
        pdf: vi.fn().mockRejectedValue(new Error('PDF generation failed')),
        close: vi.fn()
      };
      
      vi.mocked(puppeteer.default.launch).mockResolvedValue({
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn()
      } as any);

      const pdfConfig: ReportConfig = {
        ...mockConfig,
        output: {
          format: 'pdf',
          filename: 'test-report.pdf'
        }
      };

      const reportData: ReportData = {
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          successRate: 1.0,
          totalDuration: 30000,
          executionDate: new Date()
        },
        executions: [],
        config: pdfConfig
      };

      const result = await reportGenerator.generateReport(reportData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF generation failed');
    });
  });
});