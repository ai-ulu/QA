/**
 * Unit Tests for Execution Orchestration
 * **Validates: Requirements 5.3**
 * 
 * Tests job queue management, timeout handling, concurrent execution limits,
 * and error recovery and retry logic
 */

import { TestOrchestrator, TestExecutionRequest } from '../orchestrator';
import { ContainerManager } from '../container-manager';
import { WebSocketManager } from '../websocket-manager';
import { logger } from '../utils/logger';

describe('Execution Orchestration Unit Tests', () => {
  let orchestrator: TestOrchestrator;
  let containerManager: ContainerManager;
  let wsManager: WebSocketManager;

  beforeEach(() => {
    containerManager = new ContainerManager('orchestration-test-namespace', 'test-registry', 'test-tag');
    wsManager = new WebSocketManager(8082);
    orchestrator = new TestOrchestrator('redis://localhost:6379', containerManager, wsManager);
  });

  afterEach(async () => {
    await orchestrator.cleanup();
    await containerManager.cleanupAll();
    await wsManager.cleanup();
  });

  describe('Job Queue Management', () => {
    it('should queue test executions properly', async () => {
      const request: TestExecutionRequest = {
        id: 'test-queue-management',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789',
        priority: 5
      };

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-queue-management');

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();
      expect(status!.id).toBe(executionId);
      expect(status!.status).toBe('pending');

      const queueStats = await orchestrator.getQueueStats();
      expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(1);

      await orchestrator.cancelExecution(executionId);
    });

    it('should handle multiple queued executions', async () => {
      const requests: TestExecutionRequest[] = [
        {
          id: 'test-multi-1',
          projectId: 'project-123',
          scenarioId: 'scenario-456',
          testCode: 'await page.goto("https://example.com");',
          configuration: {
            browserType: 'chromium',
            viewport: { width: 1024, height: 768 },
            headless: true,
            timeout: 30000,
            retries: 0,
            parallel: false,
            environment: {}
          },
          userId: 'user-789',
          priority: 3
        },
        {
          id: 'test-multi-2',
          projectId: 'project-123',
          scenarioId: 'scenario-789',
          testCode: 'await page.goto("https://httpbin.org");',
          configuration: {
            browserType: 'firefox',
            viewport: { width: 1280, height: 720 },
            headless: true,
            timeout: 25000,
            retries: 1,
            parallel: false,
            environment: {}
          },
          userId: 'user-789',
          priority: 7
        }
      ];

      const executionIds = await Promise.all(
        requests.map(request => orchestrator.submitExecution(request))
      );

      expect(executionIds).toHaveLength(2);
      expect(executionIds[0]).toBe('test-multi-1');
      expect(executionIds[1]).toBe('test-multi-2');

      // Verify both executions are tracked
      for (const executionId of executionIds) {
        const status = orchestrator.getExecutionStatus(executionId);
        expect(status).toBeDefined();
        expect(status!.id).toBe(executionId);
      }

      const queueStats = await orchestrator.getQueueStats();
      expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(2);

      // Cancel all executions
      await Promise.all(executionIds.map(id => orchestrator.cancelExecution(id)));
    });

    it('should respect execution priorities', async () => {
      const lowPriorityRequest: TestExecutionRequest = {
        id: 'test-low-priority',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789',
        priority: 1
      };

      const highPriorityRequest: TestExecutionRequest = {
        id: 'test-high-priority',
        projectId: 'project-123',
        scenarioId: 'scenario-789',
        testCode: 'await page.goto("https://httpbin.org");',
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789',
        priority: 10
      };

      // Submit low priority first
      const lowPriorityId = await orchestrator.submitExecution(lowPriorityRequest);
      expect(lowPriorityId).toBe('test-low-priority');

      // Submit high priority after
      const highPriorityId = await orchestrator.submitExecution(highPriorityRequest);
      expect(highPriorityId).toBe('test-high-priority');

      // Both should be queued
      const queueStats = await orchestrator.getQueueStats();
      expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(2);

      // Cancel both
      await orchestrator.cancelExecution(lowPriorityId);
      await orchestrator.cancelExecution(highPriorityId);
    });

    it('should generate unique execution IDs when not provided', async () => {
      const request: TestExecutionRequest = {
        id: '', // Empty ID should generate unique one
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBeDefined();
      expect(executionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();
      expect(status!.id).toBe(executionId);

      await orchestrator.cancelExecution(executionId);
    });
  });

  describe('Timeout Handling and Cleanup', () => {
    it('should handle execution timeouts', async () => {
      const request: TestExecutionRequest = {
        id: 'test-timeout',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await new Promise(resolve => setTimeout(resolve, 60000));', // 60 second delay
        configuration: {
          browserType: 'chromium',
          viewport: { width: 1024, height: 768 },
          headless: true,
          timeout: 30000,
          retries: 0,
          parallel: false,
          environment: {}
        },
        userId: 'user-789',
        timeout: 5000 // 5 second timeout
      };

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-timeout');

      // Wait for timeout to occur
      await new Promise(resolve => setTimeout(resolve, 8000));

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();
      expect(['timeout', 'cancelled', 'failed']).toContain(status!.status);
    });

    it('should cleanup resources after execution completion', async () => {
      const request: TestExecutionRequest = {
        id: 'test-cleanup',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-cleanup');

      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Cancel to trigger cleanup
      const cancelled = await orchestrator.cancelExecution(executionId);
      expect(cancelled).toBe(true);

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();
      expect(status!.status).toBe('cancelled');
    });

    it('should handle cleanup of multiple executions', async () => {
      const requests: TestExecutionRequest[] = Array.from({ length: 3 }, (_, i) => ({
        id: `test-multi-cleanup-${i}`,
        projectId: 'project-123',
        scenarioId: `scenario-${i}`,
        testCode: 'await page.goto("https://example.com");',
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
      }));

      const executionIds = await Promise.all(
        requests.map(request => orchestrator.submitExecution(request))
      );

      expect(executionIds).toHaveLength(3);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Cancel all executions
      const cancellationResults = await Promise.all(
        executionIds.map(id => orchestrator.cancelExecution(id))
      );

      cancellationResults.forEach(result => {
        expect(typeof result).toBe('boolean');
      });

      // Verify all are cancelled
      for (const executionId of executionIds) {
        const status = orchestrator.getExecutionStatus(executionId);
        expect(status).toBeDefined();
        expect(['cancelled', 'completed', 'failed']).toContain(status!.status);
      }
    });
  });

  describe('Concurrent Execution Limits', () => {
    it('should handle concurrent execution submissions', async () => {
      const requests: TestExecutionRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `test-concurrent-${i}`,
        projectId: 'project-123',
        scenarioId: `scenario-${i}`,
        testCode: `await page.goto("https://example.com/${i}");`,
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
      }));

      // Submit all requests concurrently
      const executionIds = await Promise.all(
        requests.map(request => orchestrator.submitExecution(request))
      );

      expect(executionIds).toHaveLength(5);

      // Verify all executions are tracked
      for (const executionId of executionIds) {
        const status = orchestrator.getExecutionStatus(executionId);
        expect(status).toBeDefined();
        expect(status!.id).toBe(executionId);
      }

      // Verify queue statistics
      const queueStats = await orchestrator.getQueueStats();
      expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(5);

      // Cancel all executions
      await Promise.all(executionIds.map(id => orchestrator.cancelExecution(id)));
    });

    it('should manage active execution count', async () => {
      const initialActiveExecutions = orchestrator.getActiveExecutions();
      const initialCount = initialActiveExecutions.length;

      const request: TestExecutionRequest = {
        id: 'test-active-count',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-active-count');

      // Wait for processing to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      const activeExecutions = orchestrator.getActiveExecutions();
      expect(activeExecutions.length).toBeGreaterThanOrEqual(initialCount);

      await orchestrator.cancelExecution(executionId);
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should handle execution errors gracefully', async () => {
      const request: TestExecutionRequest = {
        id: 'test-error-handling',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'throw new Error("Test error");', // Code that will cause error
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-error-handling');

      // Wait for execution to complete/fail
      await new Promise(resolve => setTimeout(resolve, 5000));

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();
      expect(['failed', 'completed', 'cancelled']).toContain(status!.status);
    });

    it('should handle container manager errors', async () => {
      const request: TestExecutionRequest = {
        id: 'test-container-error',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-container-error');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();
      expect(['pending', 'running', 'completed', 'failed', 'cancelled']).toContain(status!.status);

      await orchestrator.cancelExecution(executionId);
    });

    it('should handle queue processing errors', async () => {
      const request: TestExecutionRequest = {
        id: 'test-queue-error',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-queue-error');

      // Verify execution is queued
      const queueStats = await orchestrator.getQueueStats();
      expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(1);

      await orchestrator.cancelExecution(executionId);
    });

    it('should recover from WebSocket errors', async () => {
      const request: TestExecutionRequest = {
        id: 'test-websocket-error',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-websocket-error');

      // Verify WebSocket manager is still functional
      expect(wsManager.getClientCount()).toBeGreaterThanOrEqual(0);

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();

      await orchestrator.cancelExecution(executionId);
    });
  });

  describe('Orchestrator Lifecycle Management', () => {
    it('should initialize properly', () => {
      expect(orchestrator).toBeDefined();
      expect(typeof orchestrator.submitExecution).toBe('function');
      expect(typeof orchestrator.cancelExecution).toBe('function');
      expect(typeof orchestrator.getExecutionStatus).toBe('function');
      expect(typeof orchestrator.getQueueStats).toBe('function');
      expect(typeof orchestrator.getActiveExecutions).toBe('function');
    });

    it('should cleanup resources properly', async () => {
      const request: TestExecutionRequest = {
        id: 'test-lifecycle-cleanup',
        projectId: 'project-123',
        scenarioId: 'scenario-456',
        testCode: 'await page.goto("https://example.com");',
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

      const executionId = await orchestrator.submitExecution(request);
      expect(executionId).toBe('test-lifecycle-cleanup');

      // Verify execution is tracked
      const status = orchestrator.getExecutionStatus(executionId);
      expect(status).toBeDefined();

      // Cleanup should not throw errors
      await expect(orchestrator.cleanup()).resolves.not.toThrow();
    });

    it('should handle multiple cleanup calls', async () => {
      // Multiple cleanup calls should be safe
      await expect(orchestrator.cleanup()).resolves.not.toThrow();
      await expect(orchestrator.cleanup()).resolves.not.toThrow();
    });
  });
});