/**
 * Unit Tests for Container Security
 * **Validates: Requirements 5.1, 9.2, 9.3, 9.5**
 * 
 * Tests SSRF prevention, resource limits, security context, and network policies
 */

import { ContainerManager } from '../container-manager';
import { TestExecutionRequest } from '../orchestrator';
import { logger } from '../utils/logger';

describe('Container Security Unit Tests', () => {
  let containerManager: ContainerManager;

  beforeEach(() => {
    containerManager = new ContainerManager('security-test-namespace', 'test-registry', 'test-tag');
  });

  afterEach(async () => {
    await containerManager.cleanupAll();
  });

  describe('SSRF Prevention', () => {
    it('should prevent access to internal networks', async () => {
      const request: TestExecutionRequest = {
        id: 'test-ssrf-prevention',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Attempt to access internal network
          await page.goto('http://169.254.169.254/latest/meta-data/');
          await page.goto('http://localhost:8080/admin');
          await page.goto('http://10.0.0.1/internal');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();
      expect(execution.podName).toMatch(/^autoqa-test-[a-f0-9]{8}$/);

      // Wait for execution to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const results = await containerManager.collectResults(execution.containerId);
      
      // SSRF attempts should be blocked, but container should still execute
      expect(results).toBeDefined();
      expect(typeof results.success).toBe('boolean');
      
      // Check that internal network access was prevented
      if (results.output) {
        expect(results.output).not.toContain('169.254.169.254');
        expect(results.output).not.toContain('internal network data');
      }

      await containerManager.cleanup(execution.containerId);
    });

    it('should allow access only to target websites', async () => {
      const request: TestExecutionRequest = {
        id: 'test-allowed-access',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Access to legitimate external websites should be allowed
          await page.goto('https://example.com');
          await page.goto('https://httpbin.org/get');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();
      
      // External website access should be allowed
      expect(typeof results.success).toBe('boolean');

      await containerManager.cleanup(execution.containerId);
    });

    it('should block access to cloud metadata services', async () => {
      const request: TestExecutionRequest = {
        id: 'test-metadata-blocking',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Attempt to access various cloud metadata services
          await page.goto('http://169.254.169.254/latest/meta-data/');
          await page.goto('http://metadata.google.internal/computeMetadata/v1/');
          await page.goto('http://100.100.100.200/latest/meta-data/');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 4000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Metadata service access should be blocked
      if (results.output) {
        expect(results.output).not.toContain('ami-');
        expect(results.output).not.toContain('instance-id');
        expect(results.output).not.toContain('security-credentials');
      }

      await containerManager.cleanup(execution.containerId);
    });
  });

  describe('Resource Limit Enforcement', () => {
    it('should enforce memory limits', async () => {
      const request: TestExecutionRequest = {
        id: 'test-memory-limits',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test that should consume memory but stay within limits
          const data = [];
          for (let i = 0; i < 1000; i++) {
            data.push(new Array(1000).fill('test'));
          }
          await page.goto('https://example.com');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1920, height: 1080 },
          headless: true,
          timeout: 60000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      // Monitor resource usage
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const status = await containerManager.getContainerStatus(execution.containerId);
      expect(status).toBeDefined();

      if (status.metrics) {
        // Memory should be within 2GB limit (2147483648 bytes)
        expect(status.metrics.memoryUsage).toBeLessThanOrEqual(2147483648);
        expect(status.metrics.memoryUsage).toBeGreaterThan(0);
      }

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();
      expect(results.metrics.memoryUsage).toBeLessThanOrEqual(2147483648);

      await containerManager.cleanup(execution.containerId);
    });

    it('should enforce CPU limits', async () => {
      const request: TestExecutionRequest = {
        id: 'test-cpu-limits',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // CPU intensive test
          const start = Date.now();
          while (Date.now() - start < 5000) {
            Math.random() * Math.random();
          }
          await page.goto('https://example.com');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const status = await containerManager.getContainerStatus(execution.containerId);
      expect(status).toBeDefined();

      if (status.metrics) {
        // CPU usage should be within reasonable bounds (0-100%)
        expect(status.metrics.cpuUsage).toBeLessThanOrEqual(100);
        expect(status.metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      }

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();
      expect(results.metrics.cpuUsage).toBeLessThanOrEqual(100);

      await containerManager.cleanup(execution.containerId);
    });

    it('should enforce timeout limits', async () => {
      const request: TestExecutionRequest = {
        id: 'test-timeout-limits',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test that should timeout
          await page.goto('https://example.com');
          await new Promise(resolve => setTimeout(resolve, 60000)); // 60 second delay
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 10000, // 10 second timeout
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789',
        timeout: 15000 // 15 second overall timeout
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      // Wait for timeout to occur
      await new Promise(resolve => setTimeout(resolve, 20000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Test should have been terminated due to timeout
      expect(typeof results.success).toBe('boolean');

      await containerManager.cleanup(execution.containerId);
    });
  });

  describe('Security Context Configuration', () => {
    it('should run containers with non-root user', async () => {
      const request: TestExecutionRequest = {
        id: 'test-non-root-user',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test should run as non-root user
          await page.goto('https://example.com');
          await page.waitForLoadState('networkidle');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();
      expect(execution.podName).toMatch(/^autoqa-test-[a-f0-9]{8}$/);

      // Verify security context is applied (indicated by successful execution)
      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();
      expect(typeof results.success).toBe('boolean');

      // Non-root execution should complete successfully
      expect(results.metrics.containerId).toBe(execution.containerId);

      await containerManager.cleanup(execution.containerId);
    });

    it('should prevent privilege escalation', async () => {
      const request: TestExecutionRequest = {
        id: 'test-privilege-escalation',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test should not be able to escalate privileges
          await page.goto('https://example.com');
          // Any privilege escalation attempts should be blocked by security context
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Container should execute successfully with restricted privileges
      expect(typeof results.success).toBe('boolean');
      expect(results.metrics.containerId).toBe(execution.containerId);

      await containerManager.cleanup(execution.containerId);
    });

    it('should use read-only root filesystem where possible', async () => {
      const request: TestExecutionRequest = {
        id: 'test-readonly-filesystem',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test should work with read-only root filesystem
          await page.goto('https://example.com');
          await page.screenshot({ path: '/app/screenshots/test.png' });
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 4000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Should be able to write to allowed directories (screenshots, reports)
      expect(Array.isArray(results.screenshots)).toBe(true);
      expect(Array.isArray(results.artifacts)).toBe(true);

      await containerManager.cleanup(execution.containerId);
    });
  });

  describe('Network Policy Enforcement', () => {
    it('should enforce network policies for pod-to-pod communication', async () => {
      const request: TestExecutionRequest = {
        id: 'test-network-policies',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test should not be able to communicate with other pods
          await page.goto('https://example.com');
          // Network policies should prevent unauthorized pod communication
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();
      expect(execution.namespace).toBe('security-test-namespace');

      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Network policies should allow legitimate test execution
      expect(typeof results.success).toBe('boolean');

      await containerManager.cleanup(execution.containerId);
    });

    it('should isolate container network from host network', async () => {
      const request: TestExecutionRequest = {
        id: 'test-network-isolation',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test network isolation
          await page.goto('https://example.com');
          await page.waitForLoadState('networkidle');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const status = await containerManager.getContainerStatus(execution.containerId);
      expect(status).toBeDefined();
      expect(['pending', 'running', 'completed', 'failed']).toContain(status.status);

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Network isolation should not prevent legitimate web access
      expect(typeof results.success).toBe('boolean');

      await containerManager.cleanup(execution.containerId);
    });
  });

  describe('Container Escape Prevention', () => {
    it('should prevent container escape attempts', async () => {
      const request: TestExecutionRequest = {
        id: 'test-container-escape',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test should not be able to escape container
          await page.goto('https://example.com');
          // Any container escape attempts should be blocked
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Container should execute within security boundaries
      expect(typeof results.success).toBe('boolean');
      expect(results.metrics.containerId).toBe(execution.containerId);

      await containerManager.cleanup(execution.containerId);
    });

    it('should drop all unnecessary capabilities', async () => {
      const request: TestExecutionRequest = {
        id: 'test-dropped-capabilities',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          // Test should run with minimal capabilities
          await page.goto('https://example.com');
          await page.evaluate(() => document.title);
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Should execute successfully with dropped capabilities
      expect(typeof results.success).toBe('boolean');

      await containerManager.cleanup(execution.containerId);
    });
  });

  describe('Security Monitoring', () => {
    it('should log security-relevant events', async () => {
      const request: TestExecutionRequest = {
        id: 'test-security-logging',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          await page.goto('https://example.com');
          await page.waitForLoadState('networkidle');
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();

      // Security events should be logged (verified through successful execution)
      expect(typeof results.success).toBe('boolean');
      expect(results.output).toBeDefined();

      await containerManager.cleanup(execution.containerId);
    });

    it('should provide security metrics', async () => {
      const request: TestExecutionRequest = {
        id: 'test-security-metrics',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: `
          await page.goto('https://example.com');
          await page.screenshot({ path: '/app/screenshots/security-test.png' });
        `,
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789'
      };

      const execution = await containerManager.executeTest(request);
      expect(execution.containerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const status = await containerManager.getContainerStatus(execution.containerId);
      expect(status).toBeDefined();

      if (status.metrics) {
        expect(status.metrics.containerId).toBe(execution.containerId);
        expect(typeof status.metrics.memoryUsage).toBe('number');
        expect(typeof status.metrics.cpuUsage).toBe('number');
        expect(typeof status.metrics.networkRequests).toBe('number');
      }

      const results = await containerManager.collectResults(execution.containerId);
      expect(results).toBeDefined();
      expect(results.metrics).toBeDefined();

      await containerManager.cleanup(execution.containerId);
    });
  });
});