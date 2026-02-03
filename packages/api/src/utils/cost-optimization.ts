/**
 * Cost Optimization and Resource Management
 * **Validates: Cost & Optimization**
 * 
 * Implements cloud resource tagging, unused resource cleanup,
 * data transfer cost optimization, and auto-shutdown mechanisms.
 */

import { logger } from './logger';

export interface ResourceTag {
  key: string;
  value: string;
  required?: boolean;
}

export interface CostCenter {
  id: string;
  name: string;
  budget: number;
  currentSpend: number;
  alertThreshold: number; // percentage
  owner: string;
  tags: ResourceTag[];
}

export interface ResourceCleanupRule {
  resourceType: string;
  maxIdleTime: number; // milliseconds
  conditions: CleanupCondition[];
  dryRun: boolean;
  excludeTags: string[];
}

export interface CleanupCondition {
  metric: string;
  operator: '<' | '>' | '=' | '!=' | '<=' | '>=';
  value: number;
  timeWindow: number; // milliseconds
}

export interface DataTransferRule {
  sourceRegion: string;
  targetRegion: string;
  costPerGB: number;
  optimizationStrategy: 'compress' | 'cache' | 'cdn' | 'direct';
  scheduledTransfer?: {
    enabled: boolean;
    schedule: string; // cron expression
    offPeakMultiplier: number;
  };
}

export interface AutoShutdownConfig {
  environment: 'dev' | 'test' | 'staging' | 'prod';
  schedule: {
    shutdown: string; // cron expression
    startup: string; // cron expression
  };
  resources: string[];
  gracePeriod: number; // milliseconds
  notifications: string[]; // email addresses
}

/**
 * Cloud Resource Tagging Manager
 */
export class CloudResourceTaggingManager {
  private costCenters = new Map<string, CostCenter>();
  private tagPolicies = new Map<string, ResourceTag[]>();
  private resourceInventory = new Map<string, TaggedResource>();

  /**
   * Register cost center
   */
  registerCostCenter(costCenter: CostCenter): void {
    this.costCenters.set(costCenter.id, costCenter);
    
    logger.info(`Registered cost center: ${costCenter.name}`, {
      id: costCenter.id,
      budget: costCenter.budget,
      alertThreshold: costCenter.alertThreshold,
      owner: costCenter.owner,
    });
  }

  /**
   * Define tagging policy for resource type
   */
  defineTaggingPolicy(resourceType: string, requiredTags: ResourceTag[]): void {
    this.tagPolicies.set(resourceType, requiredTags);
    
    logger.info(`Defined tagging policy for ${resourceType}`, {
      requiredTags: requiredTags.length,
      tags: requiredTags.map(t => ({ key: t.key, required: t.required })),
    });
  }

  /**
   * Tag resource with cost center and metadata
   */
  tagResource(resourceId: string, resourceType: string, tags: ResourceTag[], costCenterId?: string): void {
    const policy = this.tagPolicies.get(resourceType);
    const violations: string[] = [];

    // Validate against tagging policy
    if (policy) {
      for (const requiredTag of policy) {
        if (requiredTag.required) {
          const hasTag = tags.some(tag => tag.key === requiredTag.key);
          if (!hasTag) {
            violations.push(`Missing required tag: ${requiredTag.key}`);
          }
        }
      }
    }

    // Add cost center tags if specified
    if (costCenterId) {
      const costCenter = this.costCenters.get(costCenterId);
      if (costCenter) {
        tags.push(...costCenter.tags);
        tags.push({ key: 'CostCenter', value: costCenter.id });
        tags.push({ key: 'Owner', value: costCenter.owner });
      }
    }

    // Add standard tags
    tags.push(
      { key: 'Environment', value: process.env.NODE_ENV || 'development' },
      { key: 'Project', value: 'AutoQA-Pilot' },
      { key: 'CreatedAt', value: new Date().toISOString() },
      { key: 'ManagedBy', value: 'AutoQA-System' }
    );

    const taggedResource: TaggedResource = {
      id: resourceId,
      type: resourceType,
      tags,
      costCenterId,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      violations,
    };

    this.resourceInventory.set(resourceId, taggedResource);

    if (violations.length > 0) {
      logger.warn(`Resource tagging violations for ${resourceId}`, {
        resourceType,
        violations,
      });
    } else {
      logger.info(`Successfully tagged resource ${resourceId}`, {
        resourceType,
        tagCount: tags.length,
        costCenterId,
      });
    }
  }

  /**
   * Get resources by cost center
   */
  getResourcesByCostCenter(costCenterId: string): TaggedResource[] {
    return Array.from(this.resourceInventory.values())
      .filter(resource => resource.costCenterId === costCenterId);
  }

  /**
   * Get resources with tagging violations
   */
  getResourcesWithViolations(): TaggedResource[] {
    return Array.from(this.resourceInventory.values())
      .filter(resource => resource.violations.length > 0);
  }

  /**
   * Generate cost report by cost center
   */
  generateCostReport(): CostReport {
    const report: CostReport = {
      generatedAt: Date.now(),
      totalResources: this.resourceInventory.size,
      costCenters: [],
      untaggedResources: 0,
      violationCount: 0,
    };

    // Process each cost center
    for (const costCenter of this.costCenters.values()) {
      const resources = this.getResourcesByCostCenter(costCenter.id);
      const isOverBudget = costCenter.currentSpend > costCenter.budget;
      const isNearThreshold = (costCenter.currentSpend / costCenter.budget) >= (costCenter.alertThreshold / 100);

      report.costCenters.push({
        id: costCenter.id,
        name: costCenter.name,
        budget: costCenter.budget,
        currentSpend: costCenter.currentSpend,
        resourceCount: resources.length,
        isOverBudget,
        isNearThreshold,
        utilizationPercentage: (costCenter.currentSpend / costCenter.budget) * 100,
      });
    }

    // Count untagged and violation resources
    for (const resource of this.resourceInventory.values()) {
      if (!resource.costCenterId) {
        report.untaggedResources++;
      }
      if (resource.violations.length > 0) {
        report.violationCount++;
      }
    }

    return report;
  }

  /**
   * Update resource cost
   */
  updateResourceCost(resourceId: string, cost: number): void {
    const resource = this.resourceInventory.get(resourceId);
    if (!resource) {
      logger.warn(`Resource not found for cost update: ${resourceId}`);
      return;
    }

    resource.currentCost = cost;
    resource.lastUpdated = Date.now();

    // Update cost center spend
    if (resource.costCenterId) {
      const costCenter = this.costCenters.get(resource.costCenterId);
      if (costCenter) {
        // Recalculate total spend for cost center
        const resources = this.getResourcesByCostCenter(resource.costCenterId);
        costCenter.currentSpend = resources.reduce((total, r) => total + (r.currentCost || 0), 0);

        // Check for budget alerts
        const utilizationPercentage = (costCenter.currentSpend / costCenter.budget) * 100;
        if (utilizationPercentage >= costCenter.alertThreshold) {
          logger.warn(`Cost center ${costCenter.name} approaching budget limit`, {
            currentSpend: costCenter.currentSpend,
            budget: costCenter.budget,
            utilization: utilizationPercentage,
          });
        }
      }
    }
  }
}

/**
 * Unused Resource Cleanup Manager
 */
export class UnusedResourceCleanupManager {
  private cleanupRules = new Map<string, ResourceCleanupRule>();
  private cleanupHistory = new Map<string, CleanupOperation[]>();

  /**
   * Register cleanup rule
   */
  registerCleanupRule(rule: ResourceCleanupRule): void {
    this.cleanupRules.set(rule.resourceType, rule);
    
    logger.info(`Registered cleanup rule for ${rule.resourceType}`, {
      maxIdleTime: rule.maxIdleTime,
      conditions: rule.conditions.length,
      dryRun: rule.dryRun,
    });
  }

  /**
   * Scan for unused resources
   */
  async scanUnusedResources(resourceType?: string): Promise<UnusedResourceScanResult> {
    const scanResult: UnusedResourceScanResult = {
      scanId: this.generateScanId(),
      timestamp: Date.now(),
      resourceTypes: [],
      totalScanned: 0,
      unusedFound: 0,
      potentialSavings: 0,
    };

    const rulesToProcess = resourceType 
      ? [this.cleanupRules.get(resourceType)].filter(Boolean) as ResourceCleanupRule[]
      : Array.from(this.cleanupRules.values());

    for (const rule of rulesToProcess) {
      const typeResult = await this.scanResourceType(rule);
      scanResult.resourceTypes.push(typeResult);
      scanResult.totalScanned += typeResult.scanned;
      scanResult.unusedFound += typeResult.unused.length;
      scanResult.potentialSavings += typeResult.potentialSavings;
    }

    logger.info(`Unused resource scan completed`, {
      scanId: scanResult.scanId,
      totalScanned: scanResult.totalScanned,
      unusedFound: scanResult.unusedFound,
      potentialSavings: scanResult.potentialSavings,
    });

    return scanResult;
  }

  /**
   * Scan specific resource type
   */
  private async scanResourceType(rule: ResourceCleanupRule): Promise<ResourceTypeScanResult> {
    logger.info(`Scanning ${rule.resourceType} for unused resources`);

    // In production, this would query actual cloud resources
    const mockResources = this.generateMockResources(rule.resourceType, 10);
    const unusedResources: UnusedResource[] = [];

    for (const resource of mockResources) {
      const isUnused = await this.evaluateResourceUsage(resource, rule);
      
      if (isUnused) {
        const estimatedCost = this.estimateResourceCost(resource);
        unusedResources.push({
          id: resource.id,
          type: resource.type,
          lastActivity: resource.lastActivity,
          estimatedMonthlyCost: estimatedCost,
          idleDuration: Date.now() - resource.lastActivity,
          tags: resource.tags,
        });
      }
    }

    const potentialSavings = unusedResources.reduce((total, r) => total + r.estimatedMonthlyCost, 0);

    return {
      resourceType: rule.resourceType,
      scanned: mockResources.length,
      unused: unusedResources,
      potentialSavings,
    };
  }

  /**
   * Evaluate if resource is unused based on rule conditions
   */
  private async evaluateResourceUsage(resource: MockResource, rule: ResourceCleanupRule): Promise<boolean> {
    // Check idle time
    const idleTime = Date.now() - resource.lastActivity;
    if (idleTime < rule.maxIdleTime) {
      return false;
    }

    // Check exclude tags
    for (const excludeTag of rule.excludeTags) {
      if (resource.tags.some(tag => tag.key === excludeTag)) {
        return false;
      }
    }

    // Evaluate conditions
    for (const condition of rule.conditions) {
      const metricValue = this.getResourceMetric(resource, condition.metric);
      const conditionMet = this.evaluateCondition(metricValue, condition.operator, condition.value);
      
      if (!conditionMet) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get resource metric value
   */
  private getResourceMetric(resource: MockResource, metric: string): number {
    // In production, this would query actual metrics from CloudWatch, etc.
    switch (metric) {
      case 'cpu_utilization':
        return Math.random() * 100;
      case 'memory_utilization':
        return Math.random() * 100;
      case 'network_in':
        return Math.random() * 1000;
      case 'network_out':
        return Math.random() * 1000;
      case 'disk_read_ops':
        return Math.random() * 100;
      case 'disk_write_ops':
        return Math.random() * 100;
      default:
        return 0;
    }
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '<': return value < threshold;
      case '>': return value > threshold;
      case '=': return value === threshold;
      case '!=': return value !== threshold;
      case '<=': return value <= threshold;
      case '>=': return value >= threshold;
      default: return false;
    }
  }

  /**
   * Cleanup unused resources
   */
  async cleanupUnusedResources(scanId: string, resourceIds: string[]): Promise<CleanupResult> {
    const operation: CleanupOperation = {
      id: this.generateOperationId(),
      scanId,
      timestamp: Date.now(),
      resourceIds,
      status: 'running',
      results: [],
    };

    logger.info(`Starting cleanup operation ${operation.id}`, {
      scanId,
      resourceCount: resourceIds.length,
    });

    try {
      for (const resourceId of resourceIds) {
        const result = await this.cleanupResource(resourceId);
        operation.results.push(result);
      }

      operation.status = 'completed';
      operation.endTime = Date.now();

      // Store operation in history
      const history = this.cleanupHistory.get(scanId) || [];
      history.push(operation);
      this.cleanupHistory.set(scanId, history);

      const successCount = operation.results.filter(r => r.success).length;
      const totalSavings = operation.results.reduce((total, r) => total + (r.monthlySavings || 0), 0);

      logger.info(`Cleanup operation completed`, {
        operationId: operation.id,
        successCount,
        totalResources: resourceIds.length,
        totalSavings,
      });

      return {
        operationId: operation.id,
        successCount,
        failureCount: resourceIds.length - successCount,
        totalSavings,
        duration: operation.endTime - operation.timestamp,
      };

    } catch (error) {
      operation.status = 'failed';
      operation.error = (error as Error).message;
      operation.endTime = Date.now();

      logger.error(`Cleanup operation failed`, {
        operationId: operation.id,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Cleanup individual resource
   */
  private async cleanupResource(resourceId: string): Promise<ResourceCleanupResult> {
    try {
      // In production, this would call actual cloud APIs to delete resources
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API call

      const estimatedSavings = Math.random() * 100; // Mock savings

      logger.info(`Successfully cleaned up resource ${resourceId}`, {
        monthlySavings: estimatedSavings,
      });

      return {
        resourceId,
        success: true,
        monthlySavings: estimatedSavings,
      };

    } catch (error) {
      logger.error(`Failed to cleanup resource ${resourceId}`, {
        error: (error as Error).message,
      });

      return {
        resourceId,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generate mock resources for testing
   */
  private generateMockResources(resourceType: string, count: number): MockResource[] {
    const resources: MockResource[] = [];
    
    for (let i = 0; i < count; i++) {
      resources.push({
        id: `${resourceType}-${i}`,
        type: resourceType,
        lastActivity: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random within last week
        tags: [
          { key: 'Environment', value: Math.random() > 0.5 ? 'dev' : 'test' },
          { key: 'Project', value: 'AutoQA-Pilot' },
        ],
      });
    }

    return resources;
  }

  /**
   * Estimate resource cost
   */
  private estimateResourceCost(resource: MockResource): number {
    // Mock cost estimation based on resource type
    const baseCosts: Record<string, number> = {
      'ec2-instance': 50,
      'rds-instance': 100,
      'load-balancer': 25,
      's3-bucket': 10,
      'lambda-function': 5,
    };

    return baseCosts[resource.type] || 20;
  }

  /**
   * Generate scan ID
   */
  private generateScanId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate operation ID
   */
  private generateOperationId(): string {
    return `cleanup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get cleanup history
   */
  getCleanupHistory(scanId?: string): CleanupOperation[] {
    if (scanId) {
      return this.cleanupHistory.get(scanId) || [];
    }

    const allHistory: CleanupOperation[] = [];
    for (const history of this.cleanupHistory.values()) {
      allHistory.push(...history);
    }

    return allHistory.sort((a, b) => b.timestamp - a.timestamp);
  }
}

/**
 * Data Transfer Cost Optimization
 */
export class DataTransferOptimizer {
  private transferRules = new Map<string, DataTransferRule>();
  private transferHistory = new Map<string, DataTransferRecord[]>();

  /**
   * Register data transfer rule
   */
  registerTransferRule(ruleId: string, rule: DataTransferRule): void {
    this.transferRules.set(ruleId, rule);
    
    logger.info(`Registered data transfer rule: ${ruleId}`, {
      sourceRegion: rule.sourceRegion,
      targetRegion: rule.targetRegion,
      costPerGB: rule.costPerGB,
      strategy: rule.optimizationStrategy,
    });
  }

  /**
   * Optimize data transfer
   */
  async optimizeDataTransfer(
    ruleId: string,
    dataSize: number,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<DataTransferOptimization> {
    const rule = this.transferRules.get(ruleId);
    if (!rule) {
      throw new Error(`Transfer rule not found: ${ruleId}`);
    }

    const optimization: DataTransferOptimization = {
      ruleId,
      originalSize: dataSize,
      optimizedSize: dataSize,
      originalCost: dataSize * rule.costPerGB,
      optimizedCost: 0,
      strategy: rule.optimizationStrategy,
      estimatedDuration: 0,
      recommendations: [],
    };

    // Apply optimization strategy
    switch (rule.optimizationStrategy) {
      case 'compress':
        optimization.optimizedSize = dataSize * 0.3; // 70% compression
        optimization.recommendations.push('Data compressed before transfer');
        break;
      
      case 'cache':
        if (this.isDataCached(ruleId, dataSize)) {
          optimization.optimizedSize = 0;
          optimization.recommendations.push('Data served from cache, no transfer needed');
        }
        break;
      
      case 'cdn':
        optimization.optimizedSize = dataSize * 0.8; // CDN edge caching reduces transfer
        optimization.recommendations.push('CDN edge caching reduces origin transfer');
        break;
      
      case 'direct':
        // No optimization, direct transfer
        optimization.recommendations.push('Direct transfer without optimization');
        break;
    }

    // Calculate optimized cost
    optimization.optimizedCost = optimization.optimizedSize * rule.costPerGB;

    // Apply scheduled transfer discount if applicable
    if (rule.scheduledTransfer?.enabled && priority !== 'high') {
      const isOffPeak = this.isOffPeakTime();
      if (isOffPeak) {
        optimization.optimizedCost *= rule.scheduledTransfer.offPeakMultiplier;
        optimization.recommendations.push(`Off-peak transfer discount applied (${rule.scheduledTransfer.offPeakMultiplier}x)`);
      }
    }

    // Estimate duration based on size and priority
    optimization.estimatedDuration = this.estimateTransferDuration(optimization.optimizedSize, priority);

    // Record transfer
    this.recordTransfer(ruleId, {
      timestamp: Date.now(),
      originalSize: dataSize,
      optimizedSize: optimization.optimizedSize,
      originalCost: optimization.originalCost,
      optimizedCost: optimization.optimizedCost,
      strategy: rule.optimizationStrategy,
      priority,
      savings: optimization.originalCost - optimization.optimizedCost,
    });

    logger.info(`Data transfer optimized`, {
      ruleId,
      originalSize: dataSize,
      optimizedSize: optimization.optimizedSize,
      savings: optimization.originalCost - optimization.optimizedCost,
      strategy: rule.optimizationStrategy,
    });

    return optimization;
  }

  /**
   * Check if data is cached
   */
  private isDataCached(ruleId: string, dataSize: number): boolean {
    // In production, this would check actual cache
    return Math.random() > 0.7; // 30% cache hit rate
  }

  /**
   * Check if current time is off-peak
   */
  private isOffPeakTime(): boolean {
    const hour = new Date().getHours();
    return hour >= 22 || hour <= 6; // 10 PM to 6 AM
  }

  /**
   * Estimate transfer duration
   */
  private estimateTransferDuration(sizeGB: number, priority: 'high' | 'medium' | 'low'): number {
    const baseSpeed = priority === 'high' ? 100 : priority === 'medium' ? 50 : 25; // MB/s
    return (sizeGB * 1024) / baseSpeed; // seconds
  }

  /**
   * Record transfer
   */
  private recordTransfer(ruleId: string, record: DataTransferRecord): void {
    const history = this.transferHistory.get(ruleId) || [];
    history.push(record);
    
    // Keep only last 1000 records
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
    
    this.transferHistory.set(ruleId, history);
  }

  /**
   * Get transfer analytics
   */
  getTransferAnalytics(ruleId?: string): DataTransferAnalytics {
    const records = ruleId 
      ? this.transferHistory.get(ruleId) || []
      : Array.from(this.transferHistory.values()).flat();

    if (records.length === 0) {
      return {
        totalTransfers: 0,
        totalDataTransferred: 0,
        totalCostSavings: 0,
        averageOptimizationRatio: 0,
        strategyBreakdown: {},
      };
    }

    const totalTransfers = records.length;
    const totalDataTransferred = records.reduce((sum, r) => sum + r.originalSize, 0);
    const totalCostSavings = records.reduce((sum, r) => sum + r.savings, 0);
    const averageOptimizationRatio = records.reduce((sum, r) => sum + (r.optimizedSize / r.originalSize), 0) / totalTransfers;

    const strategyBreakdown: Record<string, number> = {};
    for (const record of records) {
      strategyBreakdown[record.strategy] = (strategyBreakdown[record.strategy] || 0) + 1;
    }

    return {
      totalTransfers,
      totalDataTransferred,
      totalCostSavings,
      averageOptimizationRatio,
      strategyBreakdown,
    };
  }
}

/**
 * Auto-Shutdown Manager for Dev/Test Environments
 */
export class AutoShutdownManager {
  private shutdownConfigs = new Map<string, AutoShutdownConfig>();
  private scheduledJobs = new Map<string, NodeJS.Timeout>();
  private shutdownHistory = new Map<string, ShutdownOperation[]>();

  /**
   * Register auto-shutdown configuration
   */
  registerAutoShutdown(configId: string, config: AutoShutdownConfig): void {
    this.shutdownConfigs.set(configId, config);
    this.scheduleShutdownJobs(configId, config);
    
    logger.info(`Registered auto-shutdown configuration: ${configId}`, {
      environment: config.environment,
      resources: config.resources.length,
      shutdownSchedule: config.schedule.shutdown,
      startupSchedule: config.schedule.startup,
    });
  }

  /**
   * Schedule shutdown and startup jobs
   */
  private scheduleShutdownJobs(configId: string, config: AutoShutdownConfig): void {
    // Clear existing jobs
    const existingJob = this.scheduledJobs.get(configId);
    if (existingJob) {
      clearInterval(existingJob);
    }

    // For simplicity, using fixed intervals based on common patterns
    const shutdownInterval = this.parseCronToInterval(config.schedule.shutdown);
    const startupInterval = this.parseCronToInterval(config.schedule.startup);

    // Schedule shutdown
    const shutdownJob = setInterval(() => {
      this.executeShutdown(configId);
    }, shutdownInterval);

    // Schedule startup
    const startupJob = setInterval(() => {
      this.executeStartup(configId);
    }, startupInterval);

    this.scheduledJobs.set(`${configId}_shutdown`, shutdownJob);
    this.scheduledJobs.set(`${configId}_startup`, startupJob);
  }

  /**
   * Parse cron expression to interval (simplified)
   */
  private parseCronToInterval(cronExpression: string): number {
    // Simplified cron parsing
    if (cronExpression.includes('0 18 * * 1-5')) return 24 * 60 * 60 * 1000; // Weekday 6 PM
    if (cronExpression.includes('0 8 * * 1-5')) return 24 * 60 * 60 * 1000; // Weekday 8 AM
    return 60 * 60 * 1000; // Default: hourly
  }

  /**
   * Execute shutdown
   */
  async executeShutdown(configId: string): Promise<void> {
    const config = this.shutdownConfigs.get(configId);
    if (!config) {
      return;
    }

    // Skip production environments
    if (config.environment === 'prod') {
      logger.warn(`Skipping auto-shutdown for production environment: ${configId}`);
      return;
    }

    const operation: ShutdownOperation = {
      id: this.generateOperationId(),
      configId,
      type: 'shutdown',
      timestamp: Date.now(),
      resources: config.resources,
      status: 'running',
      results: [],
    };

    logger.info(`Starting auto-shutdown operation: ${operation.id}`, {
      configId,
      environment: config.environment,
      resourceCount: config.resources.length,
    });

    try {
      // Send notifications before shutdown
      await this.sendNotifications(config, 'shutdown', operation.id);

      // Wait for grace period
      if (config.gracePeriod > 0) {
        logger.info(`Waiting for grace period: ${config.gracePeriod}ms`);
        await new Promise(resolve => setTimeout(resolve, config.gracePeriod));
      }

      // Shutdown resources
      for (const resourceId of config.resources) {
        const result = await this.shutdownResource(resourceId);
        operation.results.push(result);
      }

      operation.status = 'completed';
      operation.endTime = Date.now();

      // Record operation
      this.recordOperation(configId, operation);

      const successCount = operation.results.filter(r => r.success).length;
      logger.info(`Auto-shutdown completed`, {
        operationId: operation.id,
        successCount,
        totalResources: config.resources.length,
      });

    } catch (error) {
      operation.status = 'failed';
      operation.error = (error as Error).message;
      operation.endTime = Date.now();

      logger.error(`Auto-shutdown failed`, {
        operationId: operation.id,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Execute startup
   */
  async executeStartup(configId: string): Promise<void> {
    const config = this.shutdownConfigs.get(configId);
    if (!config) {
      return;
    }

    const operation: ShutdownOperation = {
      id: this.generateOperationId(),
      configId,
      type: 'startup',
      timestamp: Date.now(),
      resources: config.resources,
      status: 'running',
      results: [],
    };

    logger.info(`Starting auto-startup operation: ${operation.id}`, {
      configId,
      environment: config.environment,
      resourceCount: config.resources.length,
    });

    try {
      // Startup resources
      for (const resourceId of config.resources) {
        const result = await this.startupResource(resourceId);
        operation.results.push(result);
      }

      operation.status = 'completed';
      operation.endTime = Date.now();

      // Record operation
      this.recordOperation(configId, operation);

      // Send notifications after startup
      await this.sendNotifications(config, 'startup', operation.id);

      const successCount = operation.results.filter(r => r.success).length;
      logger.info(`Auto-startup completed`, {
        operationId: operation.id,
        successCount,
        totalResources: config.resources.length,
      });

    } catch (error) {
      operation.status = 'failed';
      operation.error = (error as Error).message;
      operation.endTime = Date.now();

      logger.error(`Auto-startup failed`, {
        operationId: operation.id,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Shutdown resource
   */
  private async shutdownResource(resourceId: string): Promise<ResourceOperationResult> {
    try {
      // In production, this would call actual cloud APIs
      await new Promise(resolve => setTimeout(resolve, 100));

      logger.info(`Successfully shut down resource: ${resourceId}`);

      return {
        resourceId,
        success: true,
        estimatedSavings: Math.random() * 50, // Mock savings
      };

    } catch (error) {
      logger.error(`Failed to shutdown resource: ${resourceId}`, {
        error: (error as Error).message,
      });

      return {
        resourceId,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Startup resource
   */
  private async startupResource(resourceId: string): Promise<ResourceOperationResult> {
    try {
      // In production, this would call actual cloud APIs
      await new Promise(resolve => setTimeout(resolve, 150));

      logger.info(`Successfully started up resource: ${resourceId}`);

      return {
        resourceId,
        success: true,
      };

    } catch (error) {
      logger.error(`Failed to startup resource: ${resourceId}`, {
        error: (error as Error).message,
      });

      return {
        resourceId,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Send notifications
   */
  private async sendNotifications(
    config: AutoShutdownConfig,
    type: 'shutdown' | 'startup',
    operationId: string
  ): Promise<void> {
    if (config.notifications.length === 0) {
      return;
    }

    const subject = `AutoQA ${config.environment} Environment ${type} - ${operationId}`;
    const message = `Auto-${type} operation initiated for ${config.environment} environment. Resources: ${config.resources.join(', ')}`;

    for (const email of config.notifications) {
      try {
        // In production, this would send actual emails
        logger.info(`Notification sent to ${email}`, {
          subject,
          type,
          operationId,
        });
      } catch (error) {
        logger.error(`Failed to send notification to ${email}`, {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Record operation
   */
  private recordOperation(configId: string, operation: ShutdownOperation): void {
    const history = this.shutdownHistory.get(configId) || [];
    history.push(operation);
    
    // Keep only last 100 operations
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    this.shutdownHistory.set(configId, history);
  }

  /**
   * Generate operation ID
   */
  private generateOperationId(): string {
    return `shutdown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get shutdown history
   */
  getShutdownHistory(configId?: string): ShutdownOperation[] {
    if (configId) {
      return this.shutdownHistory.get(configId) || [];
    }

    const allHistory: ShutdownOperation[] = [];
    for (const history of this.shutdownHistory.values()) {
      allHistory.push(...history);
    }

    return allHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Stop all scheduled jobs
   */
  stopAllScheduledJobs(): void {
    for (const job of this.scheduledJobs.values()) {
      clearInterval(job);
    }
    this.scheduledJobs.clear();
  }
}

// Interfaces
interface TaggedResource {
  id: string;
  type: string;
  tags: ResourceTag[];
  costCenterId?: string;
  createdAt: number;
  lastUpdated: number;
  violations: string[];
  currentCost?: number;
}

interface CostReport {
  generatedAt: number;
  totalResources: number;
  costCenters: CostCenterReport[];
  untaggedResources: number;
  violationCount: number;
}

interface CostCenterReport {
  id: string;
  name: string;
  budget: number;
  currentSpend: number;
  resourceCount: number;
  isOverBudget: boolean;
  isNearThreshold: boolean;
  utilizationPercentage: number;
}

interface MockResource {
  id: string;
  type: string;
  lastActivity: number;
  tags: ResourceTag[];
}

interface UnusedResourceScanResult {
  scanId: string;
  timestamp: number;
  resourceTypes: ResourceTypeScanResult[];
  totalScanned: number;
  unusedFound: number;
  potentialSavings: number;
}

interface ResourceTypeScanResult {
  resourceType: string;
  scanned: number;
  unused: UnusedResource[];
  potentialSavings: number;
}

interface UnusedResource {
  id: string;
  type: string;
  lastActivity: number;
  estimatedMonthlyCost: number;
  idleDuration: number;
  tags: ResourceTag[];
}

interface CleanupOperation {
  id: string;
  scanId: string;
  timestamp: number;
  endTime?: number;
  resourceIds: string[];
  status: 'running' | 'completed' | 'failed';
  results: ResourceCleanupResult[];
  error?: string;
}

interface ResourceCleanupResult {
  resourceId: string;
  success: boolean;
  monthlySavings?: number;
  error?: string;
}

interface CleanupResult {
  operationId: string;
  successCount: number;
  failureCount: number;
  totalSavings: number;
  duration: number;
}

interface DataTransferOptimization {
  ruleId: string;
  originalSize: number;
  optimizedSize: number;
  originalCost: number;
  optimizedCost: number;
  strategy: string;
  estimatedDuration: number;
  recommendations: string[];
}

interface DataTransferRecord {
  timestamp: number;
  originalSize: number;
  optimizedSize: number;
  originalCost: number;
  optimizedCost: number;
  strategy: string;
  priority: string;
  savings: number;
}

interface DataTransferAnalytics {
  totalTransfers: number;
  totalDataTransferred: number;
  totalCostSavings: number;
  averageOptimizationRatio: number;
  strategyBreakdown: Record<string, number>;
}

interface ShutdownOperation {
  id: string;
  configId: string;
  type: 'shutdown' | 'startup';
  timestamp: number;
  endTime?: number;
  resources: string[];
  status: 'running' | 'completed' | 'failed';
  results: ResourceOperationResult[];
  error?: string;
}

interface ResourceOperationResult {
  resourceId: string;
  success: boolean;
  estimatedSavings?: number;
  error?: string;
}