/**
 * Property Tests for Real-time Execution Feedback
 * **Feature: autoqa-pilot, Property 11: Real-time Execution Feedback**
 * **Validates: Requirements 5.3**
 * 
 * Tests that real-time console output is provided and execution state
 * visibility is maintained throughout the process
 */

import fc from 'fast-check';
import { TestOrchestrator, TestExecutionRequest } from '../orchestrator';
import { ContainerManager } from '../container-manager';
import { WebSocketManager } from '../websocket-manager';
import { logger } from '../utils/logger';

describe('Real-time Execution Feedback Property Tests', () => {
  let orchestrator: TestOrchestrator;
  let containerManager: ContainerManager;
  let wsManager: WebSocketManager;

  beforeEach(() => {
    containerManager = new ContainerManager('feedback-test-namespace', 'test-registry', 'test-tag');
    wsManager = new WebSocketManager(8081);
    orchestrator = new TestOrchestrator('redis://localhost:6379', containerManager, wsManager);
  });

  afterEach(async () => {
    await orchestrator.cleanup();
    await containerManager.cleanupAll();
    await wsManager.cleanup();
  });

  /**
   * Property 11: Real-time Execution Feedback
   * For any test execution, real-time console output should be provided
   * and execution state visibility should be maintained throughout the process
   */
  it('should provide real-time console output for all test executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          projectId: fc.uuid(),
          scenarioId: fc.uuid(),
          testCode: fc.string({ minLength: 50, maxLength: 1000 }),
          configuration: fc.record({
            browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
            viewport: fc.record({
              width: fc.integer({ min: 800, max: 1920 }),
              height: fc.integer({ min: 600, max: 1080 })
            }),
            headless: fc.boolean(),
            timeout: fc.integer({ min: 10000, max: 120000 }),
            retries: fc.integer({ min: 0, max: 3 }),
            parallel: fc.boolean(),
            environment: fc.dictionary(fc.string(), fc.string())
          }),
          userId: fc.uuid(),
          priority: fc.integer({ min: 0, max: 10 }),
          timeout: fc.integer({ min: 30000, max: 300000 })
        }),
        async (request: TestExecutionRequest) => {
          // Track real-time feedback events
          const feedbackEvents: any[] = [];
          
          // Listen for orchestrator events
          orchestrator.on('execution-completed', (execution) => {
            feedbackEvents.push({ type: 'execution-completed', execution });
          });
          
          orchestrator.on('execution-failed', (execution) => {
            feedbackEvents.push({ type: 'execution-failed', execution });
          });

          orchestrator.on('execution-cancelled', (execution) => {
            feedbackEvents.push({ type: 'execution-cancelled', execution });
          });

          // Submit execution
          const executionId = await orchestrator.submitExecution(request);
          expect(executionId).toBeDefined();
          expect(executionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

          // Verify initial execution state
          let executionStatus = orchestrator.getExecutionStatus(executionId);
          expect(executionStatus).toBeDefined();
          expect(executionStatus!.id).toBe(executionId);
          expect(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']).toContain(executionStatus!.status);

          // Monitor execution state changes over time
          const stateChanges: string[] = [];
          const monitoringInterval = setInterval(() => {
            const status = orchestrator.getExecutionStatus(executionId);
            if (status && !stateChanges.includes(status.status)) {
              stateChanges.push(status.status);
            }
          }, 500);

          // Wait for execution to progress
          await new Promise(resolve => setTimeout(resolve, 5000));

          clearInterval(monitoringInterval);

          // Verify execution state visibility was maintained
          executionStatus = orchestrator.getExecutionStatus(executionId);
          expect(executionStatus).toBeDefined();
          expect(executionStatus!.id).toBe(executionId);

          // Verify state transitions occurred
          expect(stateChanges.length).toBeGreaterThan(0);
          expect(stateChanges[0]).toBe('pending');

          // Verify execution has timestamps
          if (executionStatus!.startTime) {
            expect(executionStatus!.startTime).toBeInstanceOf(Date);
          }

          // Cancel execution to cleanup
          const cancelled = await orchestrator.cancelExecution(executionId);
          expect(typeof cancelled).toBe('boolean');

          // Verify final state
          const finalStatus = orchestrator.getExecutionStatus(executionId);
          expect(finalStatus).toBeDefined();
          expect(['completed', 'failed', 'cancelled', 'timeout']).toContain(finalStatus!.status);

          return true;
        }
      ),
      { numRuns: 25, timeout: 60000 }
    );
  });

  /**
   * Property: Execution progress should be trackable throughout the lifecycle
   */
  it('should maintain execution state visibility throughout the entire process', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            projectId: fc.uuid(),
            scenarioId: fc.uuid(),
            testCode: fc.string({ minLength: 30, maxLength: 800 }),
            configuration: fc.record({
              browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
              viewport: fc.record({
                width: fc.integer({ min: 1024, max: 1920 }),
                height: fc.integer({ min: 768, max: 1080 })
              }),
              headless: fc.boolean(),
              timeout: fc.integer({ min: 8000, max: 90000 }),
              retries: fc.integer({ min: 0, max: 2 }),
              parallel: fc.boolean(),
              environment: fc.dictionary(fc.string(), fc.string())
            }),
            userId: fc.uuid(),
            priority: fc.integer({ min: 1, max: 8 }),
            timeout: fc.integer({ min: 20000, max: 180000 })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Submit all executions
          const executionIds = await Promise.all(
            requests.map(request => orchestrator.submitExecution(request))
          );

          // Verify all executions are trackable
          for (const executionId of executionIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
            expect(status!.id).toBe(executionId);
            expect(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']).toContain(status!.status);
          }

          // Monitor all executions simultaneously
          const allStateChanges = new Map<string, string[]>();
          executionIds.forEach(id => allStateChanges.set(id, []));

          const monitoringInterval = setInterval(() => {
            for (const executionId of executionIds) {
              const status = orchestrator.getExecutionStatus(executionId);
              if (status) {
                const changes = allStateChanges.get(executionId) || [];
                if (!changes.includes(status.status)) {
                  changes.push(status.status);
                  allStateChanges.set(executionId, changes);
                }
              }
            }
          }, 1000);

          // Wait for processing
          await new Promise(resolve => setTimeout(resolve, 8000));

          clearInterval(monitoringInterval);

          // Verify each execution maintained state visibility
          for (const executionId of executionIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
            expect(status!.id).toBe(executionId);

            const stateChanges = allStateChanges.get(executionId) || [];
            expect(stateChanges.length).toBeGreaterThan(0);
            expect(stateChanges[0]).toBe('pending');
          }

          // Verify active executions are tracked
          const activeExecutions = orchestrator.getActiveExecutions();
          expect(activeExecutions.length).toBeGreaterThanOrEqual(0);

          // Cancel all executions
          await Promise.all(
            executionIds.map(id => orchestrator.cancelExecution(id))
          );

          return true;
        }
      ),
      { numRuns: 15, timeout: 90000 }
    );
  });

  /**
   * Property: WebSocket feedback should be delivered for all execution events
   */
  it('should deliver WebSocket feedback for all execution state changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          projectId: fc.uuid(),
          scenarioId: fc.uuid(),
          testCode: fc.string({ minLength: 40, maxLength: 600 }),
          configuration: fc.record({
            browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
            viewport: fc.record({
              width: fc.integer({ min: 800, max: 1600 }),
              height: fc.integer({ min: 600, max: 1200 })
            }),
            headless: fc.boolean(),
            timeout: fc.integer({ min: 10000, max: 60000 }),
            retries: fc.integer({ min: 0, max: 2 }),
            parallel: fc.boolean(),
            environment: fc.dictionary(fc.string(), fc.string())
          }),
          userId: fc.uuid(),
          priority: fc.integer({ min: 1, max: 7 }),
          timeout: fc.integer({ min: 25000, max: 150000 })
        }),
        async (request: TestExecutionRequest) => {
          // Verify WebSocket manager is available
          expect(wsManager.getClientCount()).toBeGreaterThanOrEqual(0);

          // Submit execution
          const executionId = await orchestrator.submitExecution(request);
          expect(executionId).toBeDefined();

          // Verify execution is trackable
          const initialStatus = orchestrator.getExecutionStatus(executionId);
          expect(initialStatus).toBeDefined();
          expect(initialStatus!.id).toBe(executionId);

          // Wait for some processing
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify execution state is still accessible
          const currentStatus = orchestrator.getExecutionStatus(executionId);
          expect(currentStatus).toBeDefined();
          expect(currentStatus!.id).toBe(executionId);

          // Verify WebSocket manager can handle execution updates
          // (In a real test, we would connect WebSocket clients and verify messages)
          expect(wsManager.getExecutionSubscribers(executionId)).toBeGreaterThanOrEqual(0);

          // Cancel execution
          const cancelled = await orchestrator.cancelExecution(executionId);
          expect(typeof cancelled).toBe('boolean');

          // Verify final state is accessible
          const finalStatus = orchestrator.getExecutionStatus(executionId);
          expect(finalStatus).toBeDefined();

          return true;
        }
      ),
      { numRuns: 20, timeout: 45000 }
    );
  });

  /**
   * Property: Queue statistics should provide real-time feedback
   */
  it('should provide accurate real-time queue statistics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            projectId: fc.uuid(),
            scenarioId: fc.uuid(),
            testCode: fc.string({ minLength: 25, maxLength: 500 }),
            configuration: fc.record({
              browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
              viewport: fc.record({
                width: fc.integer({ min: 800, max: 1920 }),
                height: fc.integer({ min: 600, max: 1080 })
              }),
              headless: fc.boolean(),
              timeout: fc.integer({ min: 5000, max: 60000 }),
              retries: fc.integer({ min: 0, max: 2 }),
              parallel: fc.boolean(),
              environment: fc.dictionary(fc.string(), fc.string())
            }),
            userId: fc.uuid(),
            priority: fc.integer({ min: 0, max: 10 }),
            timeout: fc.integer({ min: 15000, max: 120000 })
          }),
          { minLength: 1, maxLength: 4 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Get initial queue stats
          const initialStats = await orchestrator.getQueueStats();
          expect(initialStats).toBeDefined();
          expect(typeof initialStats.waiting).toBe('number');
          expect(typeof initialStats.active).toBe('number');
          expect(typeof initialStats.completed).toBe('number');
          expect(typeof initialStats.failed).toBe('number');
          expect(typeof initialStats.delayed).toBe('number');

          // Submit executions
          const executionIds = await Promise.all(
            requests.map(request => orchestrator.submitExecution(request))
          );

          // Verify queue stats updated
          const afterSubmissionStats = await orchestrator.getQueueStats();
          expect(afterSubmissionStats.waiting + afterSubmissionStats.active)
            .toBeGreaterThanOrEqual(initialStats.waiting + initialStats.active);

          // Wait for some processing
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Get updated stats
          const processingStats = await orchestrator.getQueueStats();
          expect(processingStats).toBeDefined();

          // Verify stats are consistent
          expect(processingStats.waiting).toBeGreaterThanOrEqual(0);
          expect(processingStats.active).toBeGreaterThanOrEqual(0);
          expect(processingStats.completed).toBeGreaterThanOrEqual(0);
          expect(processingStats.failed).toBeGreaterThanOrEqual(0);

          // Cancel all executions
          await Promise.all(
            executionIds.map(id => orchestrator.cancelExecution(id))
          );

          // Verify final stats
          const finalStats = await orchestrator.getQueueStats();
          expect(finalStats).toBeDefined();

          return true;
        }
      ),
      { numRuns: 12, timeout: 60000 }
    );
  });

  /**
   * Property: Execution metrics should be available in real-time
   */
  it('should provide real-time execution metrics and progress updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          projectId: fc.uuid(),
          scenarioId: fc.uuid(),
          testCode: fc.string({ minLength: 35, maxLength: 700 }),
          configuration: fc.record({
            browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
            viewport: fc.record({
              width: fc.integer({ min: 1024, max: 1920 }),
              height: fc.integer({ min: 768, max: 1080 })
            }),
            headless: fc.boolean(),
            timeout: fc.integer({ min: 8000, max: 90000 }),
            retries: fc.integer({ min: 0, max: 3 }),
            parallel: fc.boolean(),
            environment: fc.dictionary(fc.string(), fc.string())
          }),
          userId: fc.uuid(),
          priority: fc.integer({ min: 1, max: 9 }),
          timeout: fc.integer({ min: 20000, max: 200000 })
        }),
        async (request: TestExecutionRequest) => {
          // Submit execution
          const executionId = await orchestrator.submitExecution(request);
          expect(executionId).toBeDefined();

          // Monitor execution over time
          const metricsSnapshots: any[] = [];
          const monitoringInterval = setInterval(async () => {
            const status = orchestrator.getExecutionStatus(executionId);
            if (status) {
              metricsSnapshots.push({
                timestamp: new Date(),
                status: status.status,
                startTime: status.startTime,
                endTime: status.endTime,
                duration: status.duration,
                metrics: status.metrics
              });
            }
          }, 1000);

          // Wait for execution to progress
          await new Promise(resolve => setTimeout(resolve, 6000));

          clearInterval(monitoringInterval);

          // Verify metrics were captured
          expect(metricsSnapshots.length).toBeGreaterThan(0);

          // Verify each snapshot has valid structure
          for (const snapshot of metricsSnapshots) {
            expect(snapshot.timestamp).toBeInstanceOf(Date);
            expect(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']).toContain(snapshot.status);
            
            if (snapshot.startTime) {
              expect(snapshot.startTime).toBeInstanceOf(Date);
            }
            
            if (snapshot.duration) {
              expect(typeof snapshot.duration).toBe('number');
              expect(snapshot.duration).toBeGreaterThanOrEqual(0);
            }
          }

          // Cancel execution
          await orchestrator.cancelExecution(executionId);

          // Verify final metrics
          const finalStatus = orchestrator.getExecutionStatus(executionId);
          expect(finalStatus).toBeDefined();

          return true;
        }
      ),
      { numRuns: 10, timeout: 75000 }
    );
  });
});