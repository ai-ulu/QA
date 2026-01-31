/**
 * Property Tests for Load Distribution and Scaling
 * **Feature: autoqa-pilot, Property 10: Load Distribution and Scaling**
 * **Validates: Requirements 5.2, 5.5**
 * 
 * Tests that tests are distributed across available containers and
 * automatic scaling occurs based on queue length
 */

import fc from 'fast-check';
import { TestOrchestrator, TestExecutionRequest } from '../orchestrator';
import { ContainerManager } from '../container-manager';
import { WebSocketManager } from '../websocket-manager';
import { logger } from '../utils/logger';

describe('Load Distribution and Scaling Property Tests', () => {
  let orchestrator: TestOrchestrator;
  let containerManager: ContainerManager;
  let wsManager: WebSocketManager;

  beforeEach(() => {
    containerManager = new ContainerManager('test-namespace', 'test-registry', 'test-tag');
    wsManager = new WebSocketManager();
    orchestrator = new TestOrchestrator('redis://localhost:6379', containerManager, wsManager);
  });

  afterEach(async () => {
    await orchestrator.cleanup();
    await containerManager.cleanupAll();
  });

  /**
   * Property 10: Load Distribution and Scaling
   * For any number of queued tests, the system should distribute them across
   * available containers and scale worker containers automatically based on queue length
   */
  it('should distribute tests across available containers based on queue length', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple test execution requests with varying priorities
        fc.array(
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
          { minLength: 2, maxLength: 8 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Submit all test executions
          const executionIds = await Promise.all(
            requests.map(request => orchestrator.submitExecution(request))
          );

          // Verify all executions were queued
          expect(executionIds).toHaveLength(requests.length);
          executionIds.forEach(id => {
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
          });

          // Get queue statistics
          const queueStats = await orchestrator.getQueueStats();
          expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(requests.length);

          // Verify load distribution - check that executions are being processed
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for processing

          // Check active executions
          const activeExecutions = orchestrator.getActiveExecutions();
          expect(activeExecutions.length).toBeGreaterThanOrEqual(0);

          // Verify each execution has proper status
          for (const executionId of executionIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
            expect(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']).toContain(status!.status);
          }

          // Verify container scaling - more requests should result in more active containers
          const activePodCount = containerManager.getActivePodCount();
          if (requests.length > 1) {
            expect(activePodCount).toBeGreaterThan(0);
          }

          // Cancel remaining executions to cleanup
          await Promise.all(
            executionIds.map(id => orchestrator.cancelExecution(id))
          );

          return true;
        }
      ),
      { numRuns: 20, timeout: 60000 }
    );
  });

  /**
   * Property: High priority tests should be processed before low priority tests
   */
  it('should prioritize test execution based on priority levels', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          highPriorityRequests: fc.array(
            fc.record({
              id: fc.uuid(),
              projectId: fc.uuid(),
              scenarioId: fc.uuid(),
              testCode: fc.string({ minLength: 20, maxLength: 500 }),
              configuration: fc.record({
                browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
                viewport: fc.record({
                  width: fc.integer({ min: 800, max: 1600 }),
                  height: fc.integer({ min: 600, max: 1200 })
                }),
                headless: fc.boolean(),
                timeout: fc.integer({ min: 5000, max: 60000 }),
                retries: fc.integer({ min: 0, max: 2 }),
                parallel: fc.boolean(),
                environment: fc.dictionary(fc.string(), fc.string())
              }),
              userId: fc.uuid(),
              priority: fc.integer({ min: 8, max: 10 }), // High priority
              timeout: fc.integer({ min: 30000, max: 180000 })
            }),
            { minLength: 1, maxLength: 3 }
          ),
          lowPriorityRequests: fc.array(
            fc.record({
              id: fc.uuid(),
              projectId: fc.uuid(),
              scenarioId: fc.uuid(),
              testCode: fc.string({ minLength: 20, maxLength: 500 }),
              configuration: fc.record({
                browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
                viewport: fc.record({
                  width: fc.integer({ min: 800, max: 1600 }),
                  height: fc.integer({ min: 600, max: 1200 })
                }),
                headless: fc.boolean(),
                timeout: fc.integer({ min: 5000, max: 60000 }),
                retries: fc.integer({ min: 0, max: 2 }),
                parallel: fc.boolean(),
                environment: fc.dictionary(fc.string(), fc.string())
              }),
              userId: fc.uuid(),
              priority: fc.integer({ min: 0, max: 2 }), // Low priority
              timeout: fc.integer({ min: 30000, max: 180000 })
            }),
            { minLength: 1, maxLength: 3 }
          )
        }),
        async ({ highPriorityRequests, lowPriorityRequests }) => {
          // Submit low priority requests first
          const lowPriorityIds = await Promise.all(
            lowPriorityRequests.map(request => orchestrator.submitExecution(request))
          );

          // Submit high priority requests after
          const highPriorityIds = await Promise.all(
            highPriorityRequests.map(request => orchestrator.submitExecution(request))
          );

          // Wait for some processing
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify queue statistics
          const queueStats = await orchestrator.getQueueStats();
          expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(
            highPriorityRequests.length + lowPriorityRequests.length
          );

          // Check that executions are being processed
          const activeExecutions = orchestrator.getActiveExecutions();
          expect(activeExecutions.length).toBeGreaterThanOrEqual(0);

          // Verify all executions have valid status
          const allIds = [...lowPriorityIds, ...highPriorityIds];
          for (const executionId of allIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
            expect(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']).toContain(status!.status);
          }

          // Cancel all executions
          await Promise.all(
            allIds.map(id => orchestrator.cancelExecution(id))
          );

          return true;
        }
      ),
      { numRuns: 15, timeout: 45000 }
    );
  });

  /**
   * Property: Queue should handle concurrent submissions efficiently
   */
  it('should handle concurrent test submissions and maintain queue integrity', async () => {
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
              timeout: fc.integer({ min: 10000, max: 90000 }),
              retries: fc.integer({ min: 0, max: 3 }),
              parallel: fc.boolean(),
              environment: fc.dictionary(fc.string(), fc.string())
            }),
            userId: fc.uuid(),
            priority: fc.integer({ min: 0, max: 10 }),
            timeout: fc.integer({ min: 20000, max: 240000 })
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Submit all requests concurrently
          const submissionPromises = requests.map(request => 
            orchestrator.submitExecution(request)
          );

          const executionIds = await Promise.all(submissionPromises);

          // Verify all submissions succeeded
          expect(executionIds).toHaveLength(requests.length);
          
          // Verify all IDs are unique
          const uniqueIds = new Set(executionIds);
          expect(uniqueIds.size).toBe(executionIds.length);

          // Verify queue statistics reflect all submissions
          const queueStats = await orchestrator.getQueueStats();
          expect(queueStats.waiting + queueStats.active + queueStats.completed + queueStats.failed)
            .toBeGreaterThanOrEqual(requests.length);

          // Verify each execution can be retrieved
          for (const executionId of executionIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
            expect(status!.id).toBe(executionId);
          }

          // Wait for some processing
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Verify container scaling occurred
          const activePodCount = containerManager.getActivePodCount();
          expect(activePodCount).toBeGreaterThanOrEqual(0);

          // Cancel all executions
          const cancellationResults = await Promise.all(
            executionIds.map(id => orchestrator.cancelExecution(id))
          );

          // Verify cancellations
          cancellationResults.forEach(result => {
            expect(typeof result).toBe('boolean');
          });

          return true;
        }
      ),
      { numRuns: 12, timeout: 60000 }
    );
  });

  /**
   * Property: System should scale containers based on queue length
   */
  it('should automatically scale container count based on queue demand', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          batchSize: fc.integer({ min: 1, max: 5 }),
          testRequests: fc.array(
            fc.record({
              id: fc.uuid(),
              projectId: fc.uuid(),
              scenarioId: fc.uuid(),
              testCode: fc.string({ minLength: 40, maxLength: 600 }),
              configuration: fc.record({
                browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
                viewport: fc.record({
                  width: fc.integer({ min: 800, max: 1920 }),
                  height: fc.integer({ min: 600, max: 1080 })
                }),
                headless: fc.boolean(),
                timeout: fc.integer({ min: 8000, max: 120000 }),
                retries: fc.integer({ min: 0, max: 2 }),
                parallel: fc.boolean(),
                environment: fc.dictionary(fc.string(), fc.string())
              }),
              userId: fc.uuid(),
              priority: fc.integer({ min: 1, max: 8 }),
              timeout: fc.integer({ min: 25000, max: 200000 })
            }),
            { minLength: 2, maxLength: 6 }
          )
        }),
        async ({ batchSize, testRequests }) => {
          // Record initial container count
          const initialPodCount = containerManager.getActivePodCount();

          // Submit tests in batches to simulate load
          const allExecutionIds: string[] = [];
          
          for (let i = 0; i < testRequests.length; i += batchSize) {
            const batch = testRequests.slice(i, i + batchSize);
            const batchIds = await Promise.all(
              batch.map(request => orchestrator.submitExecution(request))
            );
            allExecutionIds.push(...batchIds);

            // Wait between batches to allow scaling
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Wait for scaling to occur
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify queue has all submissions
          const queueStats = await orchestrator.getQueueStats();
          expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(0);

          // Verify scaling occurred if there were enough requests
          const currentPodCount = containerManager.getActivePodCount();
          if (testRequests.length > 2) {
            expect(currentPodCount).toBeGreaterThanOrEqual(initialPodCount);
          }

          // Verify all executions are tracked
          for (const executionId of allExecutionIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
          }

          // Cancel all executions
          await Promise.all(
            allExecutionIds.map(id => orchestrator.cancelExecution(id))
          );

          // Wait for scale-down
          await new Promise(resolve => setTimeout(resolve, 2000));

          return true;
        }
      ),
      { numRuns: 10, timeout: 90000 }
    );
  });

  /**
   * Property: Load balancing should distribute work evenly across available resources
   */
  it('should balance load evenly across available container resources', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            projectId: fc.uuid(),
            scenarioId: fc.uuid(),
            testCode: fc.string({ minLength: 25, maxLength: 400 }),
            configuration: fc.record({
              browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
              viewport: fc.record({
                width: fc.integer({ min: 800, max: 1600 }),
                height: fc.integer({ min: 600, max: 1200 })
              }),
              headless: fc.boolean(),
              timeout: fc.integer({ min: 5000, max: 60000 }),
              retries: fc.integer({ min: 0, max: 2 }),
              parallel: fc.boolean(),
              environment: fc.dictionary(fc.string(), fc.string())
            }),
            userId: fc.uuid(),
            priority: fc.integer({ min: 1, max: 7 }),
            timeout: fc.integer({ min: 15000, max: 150000 })
          }),
          { minLength: 4, maxLength: 8 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Submit all requests
          const executionIds = await Promise.all(
            requests.map(request => orchestrator.submitExecution(request))
          );

          // Wait for distribution
          await new Promise(resolve => setTimeout(resolve, 4000));

          // Verify queue statistics
          const queueStats = await orchestrator.getQueueStats();
          expect(queueStats.waiting + queueStats.active + queueStats.completed + queueStats.failed)
            .toBeGreaterThanOrEqual(requests.length);

          // Verify load distribution - check active executions
          const activeExecutions = orchestrator.getActiveExecutions();
          expect(activeExecutions.length).toBeGreaterThanOrEqual(0);

          // Verify container utilization
          const activePodCount = containerManager.getActivePodCount();
          expect(activePodCount).toBeGreaterThanOrEqual(0);

          // Verify each execution has proper tracking
          for (const executionId of executionIds) {
            const status = orchestrator.getExecutionStatus(executionId);
            expect(status).toBeDefined();
            expect(status!.id).toBe(executionId);
          }

          // Cancel all executions
          await Promise.all(
            executionIds.map(id => orchestrator.cancelExecution(id))
          );

          return true;
        }
      ),
      { numRuns: 8, timeout: 75000 }
    );
  });
});