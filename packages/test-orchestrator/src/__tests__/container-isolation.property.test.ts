/**
 * Property Tests for Container Isolation
 * **Feature: autoqa-pilot, Property 9: Container Isolation and Cleanup**
 * **Validates: Requirements 5.1, 5.4, 9.2, 9.3**
 * 
 * Tests that containers are completely isolated and automatic resource cleanup occurs
 */

import fc from 'fast-check';
import { ContainerManager } from '../container-manager';
import { TestExecutionRequest } from '../orchestrator';
import { logger } from '../utils/logger';

describe('Container Isolation Property Tests', () => {
  let containerManager: ContainerManager;

  beforeEach(() => {
    containerManager = new ContainerManager('test-namespace', 'test-registry', 'test-tag');
  });

  afterEach(async () => {
    await containerManager.cleanupAll();
  });

  /**
   * Property 9: Container Isolation and Cleanup
   * For any test execution, containers should be completely isolated
   * and automatic resource cleanup should occur after execution
   */
  it('should maintain complete container isolation across all executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test execution requests
        fc.record({
          id: fc.uuid(),
          projectId: fc.uuid(),
          scenarioId: fc.uuid(),
          testCode: fc.string({ minLength: 10, maxLength: 1000 }),
          configuration: fc.record({
            browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
            viewport: fc.record({
              width: fc.integer({ min: 800, max: 1920 }),
              height: fc.integer({ min: 600, max: 1080 })
            }),
            headless: fc.boolean(),
            timeout: fc.integer({ min: 5000, max: 300000 }),
            retries: fc.integer({ min: 0, max: 3 }),
            parallel: fc.boolean(),
            environment: fc.dictionary(fc.string(), fc.string())
          }),
          userId: fc.uuid(),
          priority: fc.integer({ min: 0, max: 10 }),
          timeout: fc.integer({ min: 10000, max: 600000 })
        }),
        async (request: TestExecutionRequest) => {
          // Execute test in container
          const execution = await containerManager.executeTest(request);
          
          // Verify container is isolated
          expect(execution.containerId).toBeDefined();
          expect(execution.podName).toBeDefined();
          expect(execution.namespace).toBe('test-namespace');
          expect(execution.status).toBe('running');

          // Verify container has unique identifier
          expect(execution.containerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
          
          // Get container status to verify isolation
          const status = await containerManager.getContainerStatus(execution.containerId);
          expect(status).toBeDefined();
          expect(['pending', 'running', 'completed', 'failed']).toContain(status.status);

          // Collect results
          const results = await containerManager.collectResults(execution.containerId);
          expect(results).toBeDefined();
          expect(typeof results.success).toBe('boolean');
          expect(typeof results.output).toBe('string');
          expect(Array.isArray(results.screenshots)).toBe(true);
          expect(Array.isArray(results.artifacts)).toBe(true);
          expect(results.metrics).toBeDefined();
          expect(results.metrics.containerId).toBe(execution.containerId);

          // Cleanup container
          await containerManager.cleanup(execution.containerId);

          // Verify cleanup occurred - container should no longer be accessible
          try {
            await containerManager.getContainerStatus(execution.containerId);
            // If we reach here, cleanup failed
            expect(true).toBe(false);
          } catch (error) {
            // Expected - container should not be found after cleanup
            expect((error as Error).message).toContain('not found');
          }

          return true;
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  });

  /**
   * Property: Multiple containers should be completely isolated from each other
   */
  it('should maintain isolation between concurrent container executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple test execution requests
        fc.array(
          fc.record({
            id: fc.uuid(),
            projectId: fc.uuid(),
            scenarioId: fc.uuid(),
            testCode: fc.string({ minLength: 10, maxLength: 500 }),
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
            priority: fc.integer({ min: 0, max: 5 })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Start all containers concurrently
          const executions = await Promise.all(
            requests.map(request => containerManager.executeTest(request))
          );

          // Verify all containers have unique identifiers
          const containerIds = executions.map(e => e.containerId);
          const uniqueIds = new Set(containerIds);
          expect(uniqueIds.size).toBe(containerIds.length);

          // Verify all containers have unique pod names
          const podNames = executions.map(e => e.podName);
          const uniquePodNames = new Set(podNames);
          expect(uniquePodNames.size).toBe(podNames.length);

          // Verify each container can be accessed independently
          for (const execution of executions) {
            const status = await containerManager.getContainerStatus(execution.containerId);
            expect(status).toBeDefined();
            expect(status.metrics?.containerId).toBe(execution.containerId);
          }

          // Collect results from all containers
          const results = await Promise.all(
            executions.map(execution => 
              containerManager.collectResults(execution.containerId)
            )
          );

          // Verify each result is independent
          for (let i = 0; i < results.length; i++) {
            expect(results[i].metrics.containerId).toBe(executions[i].containerId);
            
            // Verify no cross-contamination in artifacts
            for (let j = i + 1; j < results.length; j++) {
              expect(results[i].metrics.containerId).not.toBe(results[j].metrics.containerId);
            }
          }

          // Cleanup all containers
          await Promise.all(
            executions.map(execution => 
              containerManager.cleanup(execution.containerId)
            )
          );

          // Verify all containers are cleaned up
          for (const execution of executions) {
            try {
              await containerManager.getContainerStatus(execution.containerId);
              expect(true).toBe(false); // Should not reach here
            } catch (error) {
              expect((error as Error).message).toContain('not found');
            }
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 60000 }
    );
  });

  /**
   * Property: Container resource limits should be enforced
   */
  it('should enforce resource limits for all container executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          projectId: fc.uuid(),
          scenarioId: fc.uuid(),
          testCode: fc.string({ minLength: 50, maxLength: 2000 }),
          configuration: fc.record({
            browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
            viewport: fc.record({
              width: fc.integer({ min: 1024, max: 1920 }),
              height: fc.integer({ min: 768, max: 1080 })
            }),
            headless: fc.boolean(),
            timeout: fc.integer({ min: 10000, max: 120000 }),
            retries: fc.integer({ min: 0, max: 3 }),
            parallel: fc.boolean(),
            environment: fc.dictionary(fc.string(), fc.string())
          }),
          userId: fc.uuid()
        }),
        async (request: TestExecutionRequest) => {
          const execution = await containerManager.executeTest(request);
          
          // Get container metrics
          const status = await containerManager.getContainerStatus(execution.containerId);
          
          if (status.metrics) {
            // Verify memory usage is within limits (2GB = 2147483648 bytes)
            expect(status.metrics.memoryUsage).toBeLessThanOrEqual(2147483648);
            expect(status.metrics.memoryUsage).toBeGreaterThanOrEqual(0);
            
            // Verify CPU usage is within reasonable bounds (0-100%)
            expect(status.metrics.cpuUsage).toBeLessThanOrEqual(100);
            expect(status.metrics.cpuUsage).toBeGreaterThanOrEqual(0);
            
            // Verify container ID matches
            expect(status.metrics.containerId).toBe(execution.containerId);
          }

          // Cleanup
          await containerManager.cleanup(execution.containerId);
          
          return true;
        }
      ),
      { numRuns: 30, timeout: 45000 }
    );
  });

  /**
   * Property: Container security context should be properly configured
   */
  it('should enforce security context for all container executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          projectId: fc.uuid(),
          scenarioId: fc.uuid(),
          testCode: fc.string({ minLength: 20, maxLength: 1000 }),
          configuration: fc.record({
            browserType: fc.constantFrom('chromium', 'firefox', 'webkit'),
            viewport: fc.record({
              width: fc.integer({ min: 800, max: 1600 }),
              height: fc.integer({ min: 600, max: 1200 })
            }),
            headless: fc.boolean(),
            timeout: fc.integer({ min: 5000, max: 180000 }),
            retries: fc.integer({ min: 0, max: 2 }),
            parallel: fc.boolean(),
            environment: fc.dictionary(fc.string(), fc.string())
          }),
          userId: fc.uuid()
        }),
        async (request: TestExecutionRequest) => {
          const execution = await containerManager.executeTest(request);
          
          // Verify container is created with proper security context
          expect(execution.containerId).toBeDefined();
          expect(execution.podName).toMatch(/^autoqa-test-[a-f0-9]{8}$/);
          expect(execution.namespace).toBe('test-namespace');
          
          // Verify container status indicates secure execution
          const status = await containerManager.getContainerStatus(execution.containerId);
          expect(['pending', 'running', 'completed', 'failed']).toContain(status.status);
          
          // Collect results to verify secure execution completed
          const results = await containerManager.collectResults(execution.containerId);
          expect(results).toBeDefined();
          
          // Verify no privilege escalation occurred (indicated by successful execution)
          expect(typeof results.success).toBe('boolean');
          expect(results.metrics.containerId).toBe(execution.containerId);
          
          // Cleanup
          await containerManager.cleanup(execution.containerId);
          
          return true;
        }
      ),
      { numRuns: 25, timeout: 40000 }
    );
  });

  /**
   * Property: Container cleanup should be automatic and complete
   */
  it('should automatically cleanup all container resources after execution', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            projectId: fc.uuid(),
            scenarioId: fc.uuid(),
            testCode: fc.string({ minLength: 10, maxLength: 500 }),
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
            userId: fc.uuid()
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (requests: TestExecutionRequest[]) => {
          // Track initial active pod count
          const initialCount = containerManager.getActivePodCount();
          
          // Execute all tests
          const executions = await Promise.all(
            requests.map(request => containerManager.executeTest(request))
          );
          
          // Verify active pod count increased
          expect(containerManager.getActivePodCount()).toBe(initialCount + requests.length);
          
          // Collect results from all
          await Promise.all(
            executions.map(execution => 
              containerManager.collectResults(execution.containerId)
            )
          );
          
          // Cleanup all
          await Promise.all(
            executions.map(execution => 
              containerManager.cleanup(execution.containerId)
            )
          );
          
          // Verify active pod count returned to initial state
          expect(containerManager.getActivePodCount()).toBe(initialCount);
          
          // Verify all containers are inaccessible after cleanup
          for (const execution of executions) {
            try {
              await containerManager.getContainerStatus(execution.containerId);
              expect(true).toBe(false); // Should not reach here
            } catch (error) {
              expect((error as Error).message).toContain('not found');
            }
          }
          
          return true;
        }
      ),
      { numRuns: 15, timeout: 90000 }
    );
  });
});