/**
 * Unit Tests for Cost Optimization
 * **Validates: Cost optimization**
 * 
 * Tests resource cleanup automation, cost tagging consistency,
 * and auto-shutdown mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CloudResourceTaggingManager,
  UnusedResourceCleanupManager,
  DataTransferOptimizer,
  AutoShutdownManager,
  ResourceTag,
  CostCenter,
  ResourceCleanupRule,
  DataTransferRule,
  AutoShutdownConfig,
} from '../utils/cost-optimization';
import { logger } from '../utils/logger';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Cost Optimization Unit Tests', () => {
  let taggingManager: CloudResourceTaggingManager;
  let cleanupManager: UnusedResourceCleanupManager;
  let transferOptimizer: DataTransferOptimizer;
  let shutdownManager: AutoShutdownManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    taggingManager = new CloudResourceTaggingManager();
    cleanupManager = new UnusedResourceCleanupManager();
    transferOptimizer = new DataTransferOptimizer();
    shutdownManager = new AutoShutdownManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    shutdownManager.stopAllScheduledJobs();
  });

  describe('Resource Cleanup Automation', () => {
    it('should register and apply cleanup rules correctly', async () => {
      const cleanupRule: ResourceCleanupRule = {
        resourceType: 'ec2-instance',
        maxIdleTime: 24 * 60 * 60 * 1000, // 24 hours
        conditions: [
          { metric: 'cpu_utilization', operator: '<', value: 5, timeWindow: 60 * 60 * 1000 },
          { metric: 'network_in', operator: '<', value: 100, timeWindow: 60 * 60 * 1000 },
        ],
        dryRun: false,
        excludeTags: ['production', 'critical'],
      };

      cleanupManager.registerCleanupRule(cleanupRule);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered cleanup rule for ec2-instance'),
        expect.objectContaining({
          maxIdleTime: 24 * 60 * 60 * 1000,
          conditions: 2,
          dryRun: false,
        })
      );
    });

    it('should scan for unused resources and identify candidates', async () => {
      const cleanupRule: ResourceCleanupRule = {
        resourceType: 'rds-instance',
        maxIdleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
        conditions: [
          { metric: 'cpu_utilization', operator: '<', value: 10, timeWindow: 24 * 60 * 60 * 1000 },
        ],
        dryRun: true,
        excludeTags: ['production'],
      };

      cleanupManager.registerCleanupRule(cleanupRule);

      const scanResult = await cleanupManager.scanUnusedResources('rds-instance');

      expect(scanResult.scanId).toBeDefined();
      expect(scanResult.timestamp).toBeGreaterThan(0);
      expect(scanResult.resourceTypes).toHaveLength(1);
      expect(scanResult.totalScanned).toBeGreaterThan(0);
      expect(scanResult.potentialSavings).toBeGreaterThanOrEqual(0);

      const typeResult = scanResult.resourceTypes[0];
      expect(typeResult.resourceType).toBe('rds-instance');
      expect(typeResult.scanned).toBeGreaterThan(0);
      expect(Array.isArray(typeResult.unused)).toBe(true);
    });

    it('should cleanup unused resources and track results', async () => {
      const cleanupRule: ResourceCleanupRule = {
        resourceType: 'load-balancer',
        maxIdleTime: 3 * 24 * 60 * 60 * 1000, // 3 days
        conditions: [
          { metric: 'network_in', operator: '<', value: 50, timeWindow: 24 * 60 * 60 * 1000 },
        ],
        dryRun: false,
        excludeTags: [],
      };

      cleanupManager.registerCleanupRule(cleanupRule);

      // First scan for unused resources
      const scanResult = await cleanupManager.scanUnusedResources('load-balancer');
      
      // Then cleanup some resources
      const resourceIds = ['load-balancer-1', 'load-balancer-2'];
      const cleanupResult = await cleanupManager.cleanupUnusedResources(scanResult.scanId, resourceIds);

      expect(cleanupResult.operationId).toBeDefined();
      expect(cleanupResult.successCount + cleanupResult.failureCount).toBe(resourceIds.length);
      expect(cleanupResult.totalSavings).toBeGreaterThanOrEqual(0);
      expect(cleanupResult.duration).toBeGreaterThan(0);

      // Check cleanup history
      const history = cleanupManager.getCleanupHistory(scanResult.scanId);
      expect(history).toHaveLength(1);
      expect(history[0].scanId).toBe(scanResult.scanId);
      expect(history[0].resourceIds).toEqual(resourceIds);
    });

    it('should handle cleanup failures gracefully', async () => {
      const cleanupRule: ResourceCleanupRule = {
        resourceType: 's3-bucket',
        maxIdleTime: 30 * 24 * 60 * 60 * 1000, // 30 days
        conditions: [],
        dryRun: false,
        excludeTags: [],
      };

      cleanupManager.registerCleanupRule(cleanupRule);

      // Mock cleanup failure
      vi.spyOn(cleanupManager as any, 'cleanupResource').mockImplementation(async (resourceId: string) => {
        if (resourceId === 'failing-resource') {
          throw new Error('Cleanup failed');
        }
        return { resourceId, success: true, monthlySavings: 10 };
      });

      const scanResult = await cleanupManager.scanUnusedResources('s3-bucket');
      const resourceIds = ['working-resource', 'failing-resource'];

      const cleanupResult = await cleanupManager.cleanupUnusedResources(scanResult.scanId, resourceIds);

      expect(cleanupResult.successCount).toBe(1);
      expect(cleanupResult.failureCount).toBe(1);
    });

    it('should scan all resource types when no specific type is provided', async () => {
      const rules: ResourceCleanupRule[] = [
        {
          resourceType: 'ec2-instance',
          maxIdleTime: 24 * 60 * 60 * 1000,
          conditions: [],
          dryRun: true,
          excludeTags: [],
        },
        {
          resourceType: 'rds-instance',
          maxIdleTime: 7 * 24 * 60 * 60 * 1000,
          conditions: [],
          dryRun: true,
          excludeTags: [],
        },
      ];

      for (const rule of rules) {
        cleanupManager.registerCleanupRule(rule);
      }

      const scanResult = await cleanupManager.scanUnusedResources();

      expect(scanResult.resourceTypes).toHaveLength(2);
      expect(scanResult.resourceTypes.map(r => r.resourceType)).toEqual(['ec2-instance', 'rds-instance']);
    });
  });

  describe('Cost Tagging Consistency', () => {
    it('should register cost centers and apply tags correctly', () => {
      const costCenter: CostCenter = {
        id: 'dev-team',
        name: 'Development Team',
        budget: 10000,
        currentSpend: 5000,
        alertThreshold: 80,
        owner: 'dev-lead@company.com',
        tags: [
          { key: 'Department', value: 'Engineering' },
          { key: 'Team', value: 'Development' },
        ],
      };

      taggingManager.registerCostCenter(costCenter);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered cost center: Development Team'),
        expect.objectContaining({
          id: 'dev-team',
          budget: 10000,
          alertThreshold: 80,
          owner: 'dev-lead@company.com',
        })
      );
    });

    it('should define and enforce tagging policies', () => {
      const requiredTags: ResourceTag[] = [
        { key: 'Environment', value: '', required: true },
        { key: 'Project', value: '', required: true },
        { key: 'Owner', value: '', required: true },
        { key: 'CostCenter', value: '', required: false },
      ];

      taggingManager.defineTaggingPolicy('ec2-instance', requiredTags);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Defined tagging policy for ec2-instance'),
        expect.objectContaining({
          requiredTags: 4,
        })
      );
    });

    it('should tag resources and validate against policies', () => {
      // Define policy
      const requiredTags: ResourceTag[] = [
        { key: 'Environment', value: '', required: true },
        { key: 'Project', value: '', required: true },
      ];

      taggingManager.defineTaggingPolicy('ec2-instance', requiredTags);

      // Register cost center
      const costCenter: CostCenter = {
        id: 'test-team',
        name: 'Test Team',
        budget: 5000,
        currentSpend: 2000,
        alertThreshold: 75,
        owner: 'test-lead@company.com',
        tags: [{ key: 'Department', value: 'QA' }],
      };

      taggingManager.registerCostCenter(costCenter);

      // Tag resource with all required tags
      const resourceTags: ResourceTag[] = [
        { key: 'Environment', value: 'development' },
        { key: 'Project', value: 'AutoQA-Pilot' },
      ];

      taggingManager.tagResource('i-1234567890', 'ec2-instance', resourceTags, 'test-team');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully tagged resource i-1234567890'),
        expect.any(Object)
      );
    });

    it('should detect tagging violations', () => {
      // Define policy with required tags
      const requiredTags: ResourceTag[] = [
        { key: 'Environment', value: '', required: true },
        { key: 'Project', value: '', required: true },
        { key: 'Owner', value: '', required: true },
      ];

      taggingManager.defineTaggingPolicy('rds-instance', requiredTags);

      // Tag resource with missing required tags
      const incompleteTags: ResourceTag[] = [
        { key: 'Environment', value: 'production' },
        // Missing Project and Owner tags
      ];

      taggingManager.tagResource('db-instance-1', 'rds-instance', incompleteTags);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Resource tagging violations for db-instance-1'),
        expect.objectContaining({
          violations: expect.arrayContaining([
            'Missing required tag: Project',
            'Missing required tag: Owner',
          ]),
        })
      );

      // Check violations
      const violatedResources = taggingManager.getResourcesWithViolations();
      expect(violatedResources).toHaveLength(1);
      expect(violatedResources[0].id).toBe('db-instance-1');
      expect(violatedResources[0].violations).toHaveLength(2);
    });

    it('should generate cost reports by cost center', () => {
      // Register cost centers
      const costCenters: CostCenter[] = [
        {
          id: 'frontend-team',
          name: 'Frontend Team',
          budget: 8000,
          currentSpend: 6000,
          alertThreshold: 80,
          owner: 'frontend-lead@company.com',
          tags: [],
        },
        {
          id: 'backend-team',
          name: 'Backend Team',
          budget: 12000,
          currentSpend: 15000, // Over budget
          alertThreshold: 85,
          owner: 'backend-lead@company.com',
          tags: [],
        },
      ];

      for (const costCenter of costCenters) {
        taggingManager.registerCostCenter(costCenter);
      }

      // Tag some resources
      taggingManager.tagResource('resource-1', 'ec2-instance', [], 'frontend-team');
      taggingManager.tagResource('resource-2', 'rds-instance', [], 'backend-team');
      taggingManager.tagResource('resource-3', 's3-bucket', []); // No cost center

      const report = taggingManager.generateCostReport();

      expect(report.totalResources).toBe(3);
      expect(report.costCenters).toHaveLength(2);
      expect(report.untaggedResources).toBe(1);

      // Check cost center details
      const frontendReport = report.costCenters.find(c => c.id === 'frontend-team');
      const backendReport = report.costCenters.find(c => c.id === 'backend-team');

      expect(frontendReport).toBeDefined();
      expect(frontendReport!.isOverBudget).toBe(false);
      expect(frontendReport!.utilizationPercentage).toBe(75);

      expect(backendReport).toBeDefined();
      expect(backendReport!.isOverBudget).toBe(true);
      expect(backendReport!.utilizationPercentage).toBe(125);
    });

    it('should update resource costs and trigger budget alerts', () => {
      const costCenter: CostCenter = {
        id: 'alert-test',
        name: 'Alert Test Team',
        budget: 1000,
        currentSpend: 0,
        alertThreshold: 80,
        owner: 'test@company.com',
        tags: [],
      };

      taggingManager.registerCostCenter(costCenter);
      taggingManager.tagResource('expensive-resource', 'ec2-instance', [], 'alert-test');

      // Update cost to trigger alert
      taggingManager.updateResourceCost('expensive-resource', 850);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cost center Alert Test Team approaching budget limit'),
        expect.objectContaining({
          currentSpend: 850,
          budget: 1000,
          utilization: 85,
        })
      );
    });
  });

  describe('Auto-Shutdown Mechanisms', () => {
    it('should register auto-shutdown configurations', () => {
      const config: AutoShutdownConfig = {
        environment: 'dev',
        schedule: {
          shutdown: '0 18 * * 1-5', // Weekdays 6 PM
          startup: '0 8 * * 1-5',   // Weekdays 8 AM
        },
        resources: ['dev-server-1', 'dev-server-2', 'dev-database'],
        gracePeriod: 5 * 60 * 1000, // 5 minutes
        notifications: ['dev-team@company.com'],
      };

      shutdownManager.registerAutoShutdown('dev-environment', config);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered auto-shutdown configuration: dev-environment'),
        expect.objectContaining({
          environment: 'dev',
          resources: 3,
        })
      );
    });

    it('should execute shutdown operations for non-production environments', async () => {
      const config: AutoShutdownConfig = {
        environment: 'test',
        schedule: {
          shutdown: '0 20 * * *',
          startup: '0 7 * * *',
        },
        resources: ['test-app-1', 'test-app-2'],
        gracePeriod: 1000, // 1 second for testing
        notifications: ['test-team@company.com'],
      };

      shutdownManager.registerAutoShutdown('test-env', config);

      // Manually trigger shutdown
      await shutdownManager['executeShutdown']('test-env');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting auto-shutdown operation'),
        expect.any(Object)
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Auto-shutdown completed'),
        expect.any(Object)
      );

      // Check history
      const history = shutdownManager.getShutdownHistory('test-env');
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('shutdown');
      expect(history[0].resources).toEqual(['test-app-1', 'test-app-2']);
    });

    it('should skip shutdown for production environments', async () => {
      const config: AutoShutdownConfig = {
        environment: 'prod',
        schedule: {
          shutdown: '0 22 * * *',
          startup: '0 6 * * *',
        },
        resources: ['prod-server-1'],
        gracePeriod: 0,
        notifications: [],
      };

      shutdownManager.registerAutoShutdown('prod-env', config);

      // Manually trigger shutdown
      await shutdownManager['executeShutdown']('prod-env');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping auto-shutdown for production environment'),
        expect.any(Object)
      );

      // Should not have any shutdown operations
      const history = shutdownManager.getShutdownHistory('prod-env');
      expect(history).toHaveLength(0);
    });

    it('should execute startup operations', async () => {
      const config: AutoShutdownConfig = {
        environment: 'staging',
        schedule: {
          shutdown: '0 19 * * *',
          startup: '0 9 * * *',
        },
        resources: ['staging-app', 'staging-db'],
        gracePeriod: 0,
        notifications: ['staging-team@company.com'],
      };

      shutdownManager.registerAutoShutdown('staging-env', config);

      // Manually trigger startup
      await shutdownManager['executeStartup']('staging-env');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting auto-startup operation'),
        expect.any(Object)
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Auto-startup completed'),
        expect.any(Object)
      );

      // Check history
      const history = shutdownManager.getShutdownHistory('staging-env');
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('startup');
    });

    it('should handle shutdown failures gracefully', async () => {
      const config: AutoShutdownConfig = {
        environment: 'dev',
        schedule: {
          shutdown: '0 18 * * *',
          startup: '0 8 * * *',
        },
        resources: ['failing-resource'],
        gracePeriod: 0,
        notifications: [],
      };

      shutdownManager.registerAutoShutdown('failing-env', config);

      // Mock shutdown failure
      vi.spyOn(shutdownManager as any, 'shutdownResource').mockRejectedValue(
        new Error('Resource shutdown failed')
      );

      await shutdownManager['executeShutdown']('failing-env');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Auto-shutdown failed'),
        expect.any(Object)
      );
    });

    it('should send notifications before shutdown and after startup', async () => {
      const config: AutoShutdownConfig = {
        environment: 'dev',
        schedule: {
          shutdown: '0 18 * * *',
          startup: '0 8 * * *',
        },
        resources: ['notification-test'],
        gracePeriod: 100,
        notifications: ['team@company.com', 'admin@company.com'],
      };

      shutdownManager.registerAutoShutdown('notification-test', config);

      // Test shutdown notifications
      await shutdownManager['executeShutdown']('notification-test');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Notification sent to team@company.com'),
        expect.any(Object)
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Notification sent to admin@company.com'),
        expect.any(Object)
      );

      // Test startup notifications
      await shutdownManager['executeStartup']('notification-test');

      // Should have sent notifications for both shutdown and startup
      const notificationCalls = (logger.info as any).mock.calls.filter((call: any) => 
        call[0].includes('Notification sent')
      );
      expect(notificationCalls.length).toBe(4); // 2 for shutdown + 2 for startup
    });

    it('should maintain shutdown history across multiple operations', async () => {
      const config: AutoShutdownConfig = {
        environment: 'test',
        schedule: {
          shutdown: '0 20 * * *',
          startup: '0 8 * * *',
        },
        resources: ['history-test'],
        gracePeriod: 0,
        notifications: [],
      };

      shutdownManager.registerAutoShutdown('history-test', config);

      // Execute multiple operations
      await shutdownManager['executeShutdown']('history-test');
      await shutdownManager['executeStartup']('history-test');
      await shutdownManager['executeShutdown']('history-test');

      const history = shutdownManager.getShutdownHistory('history-test');
      expect(history).toHaveLength(3);
      expect(history[0].type).toBe('shutdown'); // Most recent first
      expect(history[1].type).toBe('startup');
      expect(history[2].type).toBe('shutdown');

      // Test getting all history
      const allHistory = shutdownManager.getShutdownHistory();
      expect(allHistory.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Data Transfer Cost Optimization', () => {
    it('should register data transfer rules', () => {
      const rule: DataTransferRule = {
        sourceRegion: 'us-east-1',
        targetRegion: 'eu-west-1',
        costPerGB: 0.09,
        optimizationStrategy: 'compress',
        scheduledTransfer: {
          enabled: true,
          schedule: '0 2 * * *', // 2 AM daily
          offPeakMultiplier: 0.5,
        },
      };

      transferOptimizer.registerTransferRule('us-to-eu', rule);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered data transfer rule: us-to-eu'),
        expect.objectContaining({
          sourceRegion: 'us-east-1',
          targetRegion: 'eu-west-1',
          costPerGB: 0.09,
          strategy: 'compress',
        })
      );
    });

    it('should optimize data transfer with compression', async () => {
      const rule: DataTransferRule = {
        sourceRegion: 'us-west-2',
        targetRegion: 'ap-southeast-1',
        costPerGB: 0.12,
        optimizationStrategy: 'compress',
      };

      transferOptimizer.registerTransferRule('compress-test', rule);

      const optimization = await transferOptimizer.optimizeDataTransfer('compress-test', 100); // 100 GB

      expect(optimization.ruleId).toBe('compress-test');
      expect(optimization.originalSize).toBe(100);
      expect(optimization.optimizedSize).toBe(30); // 70% compression
      expect(optimization.originalCost).toBe(12); // 100 * 0.12
      expect(optimization.optimizedCost).toBe(3.6); // 30 * 0.12
      expect(optimization.strategy).toBe('compress');
      expect(optimization.recommendations).toContain('Data compressed before transfer');
    });

    it('should apply off-peak pricing for scheduled transfers', async () => {
      const rule: DataTransferRule = {
        sourceRegion: 'us-east-1',
        targetRegion: 'us-west-2',
        costPerGB: 0.02,
        optimizationStrategy: 'direct',
        scheduledTransfer: {
          enabled: true,
          schedule: '0 3 * * *',
          offPeakMultiplier: 0.6,
        },
      };

      transferOptimizer.registerTransferRule('off-peak-test', rule);

      // Mock off-peak time
      vi.spyOn(transferOptimizer as any, 'isOffPeakTime').mockReturnValue(true);

      const optimization = await transferOptimizer.optimizeDataTransfer('off-peak-test', 50, 'medium');

      expect(optimization.optimizedCost).toBe(0.6); // 50 * 0.02 * 0.6
      expect(optimization.recommendations).toContain(
        expect.stringContaining('Off-peak transfer discount applied')
      );
    });

    it('should handle cache optimization strategy', async () => {
      const rule: DataTransferRule = {
        sourceRegion: 'eu-central-1',
        targetRegion: 'eu-west-1',
        costPerGB: 0.05,
        optimizationStrategy: 'cache',
      };

      transferOptimizer.registerTransferRule('cache-test', rule);

      // Mock cache hit
      vi.spyOn(transferOptimizer as any, 'isDataCached').mockReturnValue(true);

      const optimization = await transferOptimizer.optimizeDataTransfer('cache-test', 200);

      expect(optimization.optimizedSize).toBe(0); // Served from cache
      expect(optimization.optimizedCost).toBe(0);
      expect(optimization.recommendations).toContain('Data served from cache, no transfer needed');
    });

    it('should generate transfer analytics', async () => {
      const rule: DataTransferRule = {
        sourceRegion: 'us-east-1',
        targetRegion: 'us-west-1',
        costPerGB: 0.01,
        optimizationStrategy: 'compress',
      };

      transferOptimizer.registerTransferRule('analytics-test', rule);

      // Perform multiple transfers
      await transferOptimizer.optimizeDataTransfer('analytics-test', 100, 'high');
      await transferOptimizer.optimizeDataTransfer('analytics-test', 200, 'medium');
      await transferOptimizer.optimizeDataTransfer('analytics-test', 150, 'low');

      const analytics = transferOptimizer.getTransferAnalytics('analytics-test');

      expect(analytics.totalTransfers).toBe(3);
      expect(analytics.totalDataTransferred).toBe(450); // 100 + 200 + 150
      expect(analytics.totalCostSavings).toBeGreaterThan(0);
      expect(analytics.averageOptimizationRatio).toBe(0.3); // 70% compression
      expect(analytics.strategyBreakdown.compress).toBe(3);
    });

    it('should handle transfer rule not found error', async () => {
      await expect(
        transferOptimizer.optimizeDataTransfer('non-existent-rule', 100)
      ).rejects.toThrow('Transfer rule not found: non-existent-rule');
    });

    it('should estimate transfer duration based on priority', async () => {
      const rule: DataTransferRule = {
        sourceRegion: 'us-east-1',
        targetRegion: 'us-west-2',
        costPerGB: 0.02,
        optimizationStrategy: 'direct',
      };

      transferOptimizer.registerTransferRule('duration-test', rule);

      const highPriority = await transferOptimizer.optimizeDataTransfer('duration-test', 100, 'high');
      const mediumPriority = await transferOptimizer.optimizeDataTransfer('duration-test', 100, 'medium');
      const lowPriority = await transferOptimizer.optimizeDataTransfer('duration-test', 100, 'low');

      // High priority should be fastest
      expect(highPriority.estimatedDuration).toBeLessThan(mediumPriority.estimatedDuration);
      expect(mediumPriority.estimatedDuration).toBeLessThan(lowPriority.estimatedDuration);
    });
  });

  describe('Integration Tests', () => {
    it('should integrate tagging with cleanup for cost optimization', async () => {
      // Set up cost center and tagging
      const costCenter: CostCenter = {
        id: 'integration-test',
        name: 'Integration Test Team',
        budget: 5000,
        currentSpend: 0,
        alertThreshold: 80,
        owner: 'integration@company.com',
        tags: [{ key: 'Department', value: 'Testing' }],
      };

      taggingManager.registerCostCenter(costCenter);

      // Tag resources
      taggingManager.tagResource('resource-1', 'ec2-instance', [
        { key: 'Environment', value: 'test' },
      ], 'integration-test');

      taggingManager.tagResource('resource-2', 'ec2-instance', [
        { key: 'Environment', value: 'dev' },
      ], 'integration-test');

      // Set up cleanup rule that excludes production resources
      const cleanupRule: ResourceCleanupRule = {
        resourceType: 'ec2-instance',
        maxIdleTime: 24 * 60 * 60 * 1000,
        conditions: [],
        dryRun: true,
        excludeTags: ['production'],
      };

      cleanupManager.registerCleanupRule(cleanupRule);

      // Scan for unused resources
      const scanResult = await cleanupManager.scanUnusedResources('ec2-instance');

      // Generate cost report
      const costReport = taggingManager.generateCostReport();

      expect(scanResult.totalScanned).toBeGreaterThan(0);
      expect(costReport.costCenters).toHaveLength(1);
      expect(costReport.costCenters[0].id).toBe('integration-test');
    });

    it('should coordinate auto-shutdown with cost tracking', async () => {
      // Set up cost center
      const costCenter: CostCenter = {
        id: 'shutdown-cost-test',
        name: 'Shutdown Cost Test',
        budget: 2000,
        currentSpend: 1500,
        alertThreshold: 75,
        owner: 'test@company.com',
        tags: [],
      };

      taggingManager.registerCostCenter(costCenter);

      // Tag resources that will be shut down
      const resources = ['dev-server-1', 'dev-server-2'];
      for (const resource of resources) {
        taggingManager.tagResource(resource, 'ec2-instance', [
          { key: 'Environment', value: 'dev' },
        ], 'shutdown-cost-test');
        
        // Set initial cost
        taggingManager.updateResourceCost(resource, 300);
      }

      // Set up auto-shutdown
      const shutdownConfig: AutoShutdownConfig = {
        environment: 'dev',
        schedule: {
          shutdown: '0 18 * * *',
          startup: '0 8 * * *',
        },
        resources,
        gracePeriod: 0,
        notifications: [],
      };

      shutdownManager.registerAutoShutdown('cost-test', shutdownConfig);

      // Execute shutdown
      await shutdownManager['executeShutdown']('cost-test');

      // Check that shutdown was executed
      const history = shutdownManager.getShutdownHistory('cost-test');
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('shutdown');

      // Check cost report
      const costReport = taggingManager.generateCostReport();
      const testCostCenter = costReport.costCenters.find(c => c.id === 'shutdown-cost-test');
      expect(testCostCenter).toBeDefined();
      expect(testCostCenter!.currentSpend).toBe(600); // 2 resources * 300 each
    });
  });
});