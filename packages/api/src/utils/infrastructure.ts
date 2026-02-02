/**
 * Infrastructure Resilience
 * **Validates: Infrastructure & DevOps**
 * 
 * Implements HPA/VPA configuration, blue-green deployment,
 * IaC drift detection, secrets rotation, and ConfigMap hot-reload.
 */

import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export interface HPAConfig {
  name: string;
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
  targetMemoryUtilization?: number;
  scaleUpPeriod: number;
  scaleDownPeriod: number;
}

export interface VPAConfig {
  name: string;
  updateMode: 'Off' | 'Initial' | 'Recreation' | 'Auto';
  minAllowed: ResourceRequirements;
  maxAllowed: ResourceRequirements;
}

export interface ResourceRequirements {
  cpu: string;
  memory: string;
}

export interface DeploymentConfig {
  name: string;
  strategy: 'blue-green' | 'canary' | 'rolling';
  healthCheckPath: string;
  readinessProbe: ProbeConfig;
  livenessProbe: ProbeConfig;
}

export interface ProbeConfig {
  path: string;
  port: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  successThreshold: number;
}

/**
 * Horizontal Pod Autoscaler Manager
 */
export class HPAManager {
  private configs = new Map<string, HPAConfig>();
  private currentMetrics = new Map<string, ResourceMetrics>();

  /**
   * Register HPA configuration
   */
  registerHPA(config: HPAConfig): void {
    this.configs.set(config.name, config);
    logger.info(`HPA registered for ${config.name}`, config);
  }

  /**
   * Update resource metrics
   */
  updateMetrics(name: string, metrics: ResourceMetrics): void {
    this.currentMetrics.set(name, metrics);
    this.evaluateScaling(name);
  }

  /**
   * Evaluate scaling decision
   */
  private evaluateScaling(name: string): void {
    const config = this.configs.get(name);
    const metrics = this.currentMetrics.get(name);

    if (!config || !metrics) {
      return;
    }

    const cpuUtilization = (metrics.cpuUsage / metrics.cpuRequest) * 100;
    const memoryUtilization = metrics.memoryRequest > 0 
      ? (metrics.memoryUsage / metrics.memoryRequest) * 100 
      : 0;

    let shouldScaleUp = false;
    let shouldScaleDown = false;

    // Check CPU scaling
    if (cpuUtilization > config.targetCPUUtilization) {
      shouldScaleUp = true;
    } else if (cpuUtilization < config.targetCPUUtilization * 0.7) {
      shouldScaleDown = true;
    }

    // Check memory scaling if configured
    if (config.targetMemoryUtilization && memoryUtilization > config.targetMemoryUtilization) {
      shouldScaleUp = true;
    }

    if (shouldScaleUp && metrics.currentReplicas < config.maxReplicas) {
      this.scaleUp(name, metrics.currentReplicas);
    } else if (shouldScaleDown && metrics.currentReplicas > config.minReplicas) {
      this.scaleDown(name, metrics.currentReplicas);
    }
  }

  /**
   * Scale up deployment
   */
  private scaleUp(name: string, currentReplicas: number): void {
    const newReplicas = Math.min(currentReplicas + 1, this.configs.get(name)!.maxReplicas);
    
    logger.info(`Scaling up ${name}`, {
      from: currentReplicas,
      to: newReplicas,
    });

    // In production, this would call Kubernetes API
    this.simulateScaling(name, newReplicas);
  }

  /**
   * Scale down deployment
   */
  private scaleDown(name: string, currentReplicas: number): void {
    const newReplicas = Math.max(currentReplicas - 1, this.configs.get(name)!.minReplicas);
    
    logger.info(`Scaling down ${name}`, {
      from: currentReplicas,
      to: newReplicas,
    });

    // In production, this would call Kubernetes API
    this.simulateScaling(name, newReplicas);
  }

  /**
   * Simulate scaling operation
   */
  private simulateScaling(name: string, replicas: number): void {
    const metrics = this.currentMetrics.get(name);
    if (metrics) {
      metrics.currentReplicas = replicas;
      this.currentMetrics.set(name, metrics);
    }
  }

  /**
   * Get HPA status
   */
  getHPAStatus(name: string): HPAStatus | null {
    const config = this.configs.get(name);
    const metrics = this.currentMetrics.get(name);

    if (!config || !metrics) {
      return null;
    }

    return {
      name,
      currentReplicas: metrics.currentReplicas,
      desiredReplicas: metrics.currentReplicas, // Simplified
      minReplicas: config.minReplicas,
      maxReplicas: config.maxReplicas,
      cpuUtilization: (metrics.cpuUsage / metrics.cpuRequest) * 100,
      memoryUtilization: metrics.memoryRequest > 0 
        ? (metrics.memoryUsage / metrics.memoryRequest) * 100 
        : 0,
    };
  }
}

interface ResourceMetrics {
  cpuUsage: number; // millicores
  cpuRequest: number; // millicores
  memoryUsage: number; // bytes
  memoryRequest: number; // bytes
  currentReplicas: number;
}

interface HPAStatus {
  name: string;
  currentReplicas: number;
  desiredReplicas: number;
  minReplicas: number;
  maxReplicas: number;
  cpuUtilization: number;
  memoryUtilization: number;
}

/**
 * Vertical Pod Autoscaler Manager
 */
export class VPAManager {
  private configs = new Map<string, VPAConfig>();
  private recommendations = new Map<string, VPARecommendation>();

  /**
   * Register VPA configuration
   */
  registerVPA(config: VPAConfig): void {
    this.configs.set(config.name, config);
    logger.info(`VPA registered for ${config.name}`, config);
  }

  /**
   * Generate resource recommendations
   */
  generateRecommendations(name: string, historicalMetrics: ResourceMetrics[]): void {
    const config = this.configs.get(name);
    if (!config) {
      return;
    }

    // Calculate percentiles for CPU and memory usage
    const cpuUsages = historicalMetrics.map(m => m.cpuUsage).sort((a, b) => a - b);
    const memoryUsages = historicalMetrics.map(m => m.memoryUsage).sort((a, b) => a - b);

    const cpuP95 = this.calculatePercentile(cpuUsages, 0.95);
    const memoryP95 = this.calculatePercentile(memoryUsages, 0.95);

    // Add safety margin
    const recommendedCPU = Math.ceil(cpuP95 * 1.2); // 20% margin
    const recommendedMemory = Math.ceil(memoryP95 * 1.1); // 10% margin

    // Apply min/max constraints
    const finalCPU = this.constrainResource(recommendedCPU, config.minAllowed.cpu, config.maxAllowed.cpu);
    const finalMemory = this.constrainResource(recommendedMemory, config.minAllowed.memory, config.maxAllowed.memory);

    const recommendation: VPARecommendation = {
      name,
      cpu: `${finalCPU}m`,
      memory: `${Math.ceil(finalMemory / (1024 * 1024))}Mi`,
      timestamp: Date.now(),
    };

    this.recommendations.set(name, recommendation);

    logger.info(`VPA recommendation generated for ${name}`, recommendation);

    // Apply recommendation based on update mode
    if (config.updateMode === 'Auto') {
      this.applyRecommendation(name, recommendation);
    }
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const index = Math.ceil(percentile * values.length) - 1;
    return values[Math.max(0, index)];
  }

  /**
   * Constrain resource within limits
   */
  private constrainResource(value: number, min: string, max: string): number {
    const minValue = this.parseResource(min);
    const maxValue = this.parseResource(max);
    
    return Math.max(minValue, Math.min(value, maxValue));
  }

  /**
   * Parse resource string (e.g., "100m", "256Mi")
   */
  private parseResource(resource: string): number {
    if (resource.endsWith('m')) {
      return parseInt(resource.slice(0, -1));
    } else if (resource.endsWith('Mi')) {
      return parseInt(resource.slice(0, -2)) * 1024 * 1024;
    } else if (resource.endsWith('Gi')) {
      return parseInt(resource.slice(0, -2)) * 1024 * 1024 * 1024;
    }
    return parseInt(resource);
  }

  /**
   * Apply VPA recommendation
   */
  private applyRecommendation(name: string, recommendation: VPARecommendation): void {
    logger.info(`Applying VPA recommendation for ${name}`, recommendation);
    
    // In production, this would update the deployment
    // For now, we just log the action
  }

  /**
   * Get VPA recommendation
   */
  getRecommendation(name: string): VPARecommendation | null {
    return this.recommendations.get(name) || null;
  }
}

interface VPARecommendation {
  name: string;
  cpu: string;
  memory: string;
  timestamp: number;
}

/**
 * Blue-Green Deployment Manager
 */
export class BlueGreenDeploymentManager {
  private deployments = new Map<string, BlueGreenState>();

  /**
   * Start blue-green deployment
   */
  async startDeployment(config: DeploymentConfig, newVersion: string): Promise<void> {
    const state: BlueGreenState = {
      name: config.name,
      currentVersion: 'blue',
      newVersion: 'green',
      status: 'deploying',
      startTime: Date.now(),
      config,
    };

    this.deployments.set(config.name, state);

    logger.info(`Starting blue-green deployment for ${config.name}`, {
      newVersion,
      strategy: config.strategy,
    });

    try {
      // Deploy green version
      await this.deployGreenVersion(config, newVersion);
      
      // Wait for green to be ready
      await this.waitForReadiness(config, 'green');
      
      // Run health checks
      await this.runHealthChecks(config, 'green');
      
      // Switch traffic
      await this.switchTraffic(config.name);
      
      // Cleanup old version
      await this.cleanupOldVersion(config, 'blue');
      
      state.status = 'completed';
      state.endTime = Date.now();
      
      logger.info(`Blue-green deployment completed for ${config.name}`, {
        duration: state.endTime - state.startTime,
      });
      
    } catch (error) {
      state.status = 'failed';
      state.error = (error as Error).message;
      state.endTime = Date.now();
      
      logger.error(`Blue-green deployment failed for ${config.name}`, {
        error: (error as Error).message,
        duration: state.endTime - state.startTime,
      });
      
      // Rollback
      await this.rollback(config.name);
      throw error;
    }
  }

  /**
   * Deploy green version
   */
  private async deployGreenVersion(config: DeploymentConfig, version: string): Promise<void> {
    logger.info(`Deploying green version ${version} for ${config.name}`);
    
    // Simulate deployment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In production, this would:
    // 1. Create new deployment with green label
    // 2. Wait for pods to be scheduled
    // 3. Monitor deployment progress
  }

  /**
   * Wait for readiness
   */
  private async waitForReadiness(config: DeploymentConfig, version: string): Promise<void> {
    const maxWaitTime = 300000; // 5 minutes
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const isReady = await this.checkReadiness(config, version);
      
      if (isReady) {
        logger.info(`${version} version is ready for ${config.name}`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`${version} version failed to become ready within timeout`);
  }

  /**
   * Check readiness
   */
  private async checkReadiness(config: DeploymentConfig, version: string): Promise<boolean> {
    try {
      // Simulate readiness check
      const response = await fetch(`http://localhost:${config.readinessProbe.port}${config.readinessProbe.path}`, {
        timeout: config.readinessProbe.timeoutSeconds * 1000,
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Run health checks
   */
  private async runHealthChecks(config: DeploymentConfig, version: string): Promise<void> {
    logger.info(`Running health checks for ${version} version of ${config.name}`);
    
    // Run multiple health check iterations
    for (let i = 0; i < 3; i++) {
      const isHealthy = await this.checkHealth(config, version);
      
      if (!isHealthy) {
        throw new Error(`Health check failed for ${version} version`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info(`Health checks passed for ${version} version of ${config.name}`);
  }

  /**
   * Check health
   */
  private async checkHealth(config: DeploymentConfig, version: string): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${config.livenessProbe.port}${config.livenessProbe.path}`, {
        timeout: config.livenessProbe.timeoutSeconds * 1000,
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Switch traffic
   */
  private async switchTraffic(deploymentName: string): Promise<void> {
    logger.info(`Switching traffic to green version for ${deploymentName}`);
    
    const state = this.deployments.get(deploymentName);
    if (state) {
      state.currentVersion = 'green';
      state.status = 'active';
    }
    
    // In production, this would update service selectors or ingress rules
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Cleanup old version
   */
  private async cleanupOldVersion(config: DeploymentConfig, version: string): Promise<void> {
    logger.info(`Cleaning up ${version} version for ${config.name}`);
    
    // In production, this would delete the old deployment
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Rollback deployment
   */
  async rollback(deploymentName: string): Promise<void> {
    const state = this.deployments.get(deploymentName);
    if (!state) {
      throw new Error(`Deployment ${deploymentName} not found`);
    }
    
    logger.warn(`Rolling back deployment for ${deploymentName}`);
    
    // Switch back to blue version
    state.currentVersion = 'blue';
    state.status = 'rolled_back';
    
    // In production, this would:
    // 1. Switch service back to blue
    // 2. Delete green deployment
    // 3. Ensure blue is healthy
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(name: string): BlueGreenState | null {
    return this.deployments.get(name) || null;
  }
}

interface BlueGreenState {
  name: string;
  currentVersion: string;
  newVersion: string;
  status: 'deploying' | 'active' | 'completed' | 'failed' | 'rolled_back';
  startTime: number;
  endTime?: number;
  error?: string;
  config: DeploymentConfig;
}

/**
 * Infrastructure as Code Drift Detection
 */
export class IaCDriftDetector {
  private expectedState = new Map<string, any>();
  private currentState = new Map<string, any>();

  /**
   * Set expected infrastructure state
   */
  setExpectedState(resourceName: string, state: any): void {
    this.expectedState.set(resourceName, state);
  }

  /**
   * Update current infrastructure state
   */
  updateCurrentState(resourceName: string, state: any): void {
    this.currentState.set(resourceName, state);
    this.detectDrift(resourceName);
  }

  /**
   * Detect configuration drift
   */
  private detectDrift(resourceName: string): void {
    const expected = this.expectedState.get(resourceName);
    const current = this.currentState.get(resourceName);

    if (!expected || !current) {
      return;
    }

    const drifts = this.compareStates(expected, current);

    if (drifts.length > 0) {
      logger.warn(`Configuration drift detected for ${resourceName}`, {
        drifts,
      });

      // In production, this would trigger alerts or auto-remediation
      this.handleDrift(resourceName, drifts);
    }
  }

  /**
   * Compare two states and find differences
   */
  private compareStates(expected: any, current: any, path = ''): DriftItem[] {
    const drifts: DriftItem[] = [];

    for (const key in expected) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in current)) {
        drifts.push({
          path: currentPath,
          expected: expected[key],
          current: undefined,
          type: 'missing',
        });
      } else if (typeof expected[key] === 'object' && expected[key] !== null) {
        drifts.push(...this.compareStates(expected[key], current[key], currentPath));
      } else if (expected[key] !== current[key]) {
        drifts.push({
          path: currentPath,
          expected: expected[key],
          current: current[key],
          type: 'changed',
        });
      }
    }

    // Check for unexpected properties
    for (const key in current) {
      if (!(key in expected)) {
        const currentPath = path ? `${path}.${key}` : key;
        drifts.push({
          path: currentPath,
          expected: undefined,
          current: current[key],
          type: 'unexpected',
        });
      }
    }

    return drifts;
  }

  /**
   * Handle detected drift
   */
  private handleDrift(resourceName: string, drifts: DriftItem[]): void {
    // In production, this could:
    // 1. Send alerts to operations team
    // 2. Automatically remediate certain types of drift
    // 3. Create tickets for manual review
    // 4. Block deployments if critical drift is detected

    logger.info(`Handling drift for ${resourceName}`, {
      driftCount: drifts.length,
      criticalDrifts: drifts.filter(d => this.isCriticalDrift(d)).length,
    });
  }

  /**
   * Check if drift is critical
   */
  private isCriticalDrift(drift: DriftItem): boolean {
    // Define critical configuration paths
    const criticalPaths = [
      'security',
      'networking',
      'access',
      'encryption',
    ];

    return criticalPaths.some(path => drift.path.includes(path));
  }

  /**
   * Get all detected drifts
   */
  getAllDrifts(): Record<string, DriftItem[]> {
    const allDrifts: Record<string, DriftItem[]> = {};

    for (const resourceName of this.expectedState.keys()) {
      const expected = this.expectedState.get(resourceName);
      const current = this.currentState.get(resourceName);

      if (expected && current) {
        const drifts = this.compareStates(expected, current);
        if (drifts.length > 0) {
          allDrifts[resourceName] = drifts;
        }
      }
    }

    return allDrifts;
  }
}

interface DriftItem {
  path: string;
  expected: any;
  current: any;
  type: 'missing' | 'changed' | 'unexpected';
}

/**
 * Secrets Rotation Manager
 */
export class SecretsRotationManager {
  private secrets = new Map<string, SecretConfig>();
  private rotationSchedule = new Map<string, NodeJS.Timeout>();

  /**
   * Register secret for rotation
   */
  registerSecret(config: SecretConfig): void {
    this.secrets.set(config.name, config);
    this.scheduleRotation(config);
    
    logger.info(`Secret ${config.name} registered for rotation`, {
      rotationInterval: config.rotationInterval,
    });
  }

  /**
   * Schedule automatic rotation
   */
  private scheduleRotation(config: SecretConfig): void {
    const existingSchedule = this.rotationSchedule.get(config.name);
    if (existingSchedule) {
      clearInterval(existingSchedule);
    }

    const interval = setInterval(() => {
      this.rotateSecret(config.name);
    }, config.rotationInterval);

    this.rotationSchedule.set(config.name, interval);
  }

  /**
   * Rotate secret
   */
  async rotateSecret(secretName: string): Promise<void> {
    const config = this.secrets.get(secretName);
    if (!config) {
      throw new Error(`Secret ${secretName} not found`);
    }

    logger.info(`Starting rotation for secret ${secretName}`);

    try {
      // Generate new secret value
      const newValue = await this.generateNewSecret(config);
      
      // Update secret in secret store
      await this.updateSecretStore(config, newValue);
      
      // Notify applications of rotation
      await this.notifyApplications(config);
      
      // Verify rotation success
      await this.verifyRotation(config);
      
      logger.info(`Secret rotation completed for ${secretName}`);
      
    } catch (error) {
      logger.error(`Secret rotation failed for ${secretName}`, {
        error: (error as Error).message,
      });
      
      // In production, this would trigger alerts
      throw error;
    }
  }

  /**
   * Generate new secret value
   */
  private async generateNewSecret(config: SecretConfig): Promise<string> {
    switch (config.type) {
      case 'password':
        return this.generatePassword(config.length || 32);
      case 'api_key':
        return this.generateApiKey();
      case 'certificate':
        return await this.generateCertificate(config);
      default:
        throw new Error(`Unsupported secret type: ${config.type}`);
    }
  }

  /**
   * Generate random password
   */
  private generatePassword(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Generate API key
   */
  private generateApiKey(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate certificate
   */
  private async generateCertificate(config: SecretConfig): Promise<string> {
    // In production, this would use proper certificate generation
    // For now, return a placeholder
    return `-----BEGIN CERTIFICATE-----\n${this.generateApiKey()}\n-----END CERTIFICATE-----`;
  }

  /**
   * Update secret in secret store
   */
  private async updateSecretStore(config: SecretConfig, newValue: string): Promise<void> {
    // In production, this would update Kubernetes secrets, AWS Secrets Manager, etc.
    logger.info(`Updating secret store for ${config.name}`);
    
    // Simulate update
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Notify applications of rotation
   */
  private async notifyApplications(config: SecretConfig): Promise<void> {
    if (config.notificationEndpoints) {
      for (const endpoint of config.notificationEndpoints) {
        try {
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'secret_rotated',
              secretName: config.name,
              timestamp: Date.now(),
            }),
          });
          
          logger.info(`Notified application at ${endpoint} of secret rotation`);
        } catch (error) {
          logger.error(`Failed to notify application at ${endpoint}`, {
            error: (error as Error).message,
          });
        }
      }
    }
  }

  /**
   * Verify rotation success
   */
  private async verifyRotation(config: SecretConfig): Promise<void> {
    if (config.verificationEndpoint) {
      try {
        const response = await fetch(config.verificationEndpoint);
        
        if (!response.ok) {
          throw new Error(`Verification failed with status ${response.status}`);
        }
        
        logger.info(`Secret rotation verified for ${config.name}`);
      } catch (error) {
        logger.error(`Secret rotation verification failed for ${config.name}`, {
          error: (error as Error).message,
        });
        throw error;
      }
    }
  }

  /**
   * Stop rotation for secret
   */
  stopRotation(secretName: string): void {
    const schedule = this.rotationSchedule.get(secretName);
    if (schedule) {
      clearInterval(schedule);
      this.rotationSchedule.delete(secretName);
      logger.info(`Stopped rotation for secret ${secretName}`);
    }
  }

  /**
   * Get rotation status
   */
  getRotationStatus(secretName: string): SecretStatus | null {
    const config = this.secrets.get(secretName);
    if (!config) {
      return null;
    }

    return {
      name: secretName,
      type: config.type,
      lastRotation: config.lastRotation || 0,
      nextRotation: (config.lastRotation || Date.now()) + config.rotationInterval,
      isScheduled: this.rotationSchedule.has(secretName),
    };
  }
}

interface SecretConfig {
  name: string;
  type: 'password' | 'api_key' | 'certificate';
  rotationInterval: number; // milliseconds
  length?: number;
  notificationEndpoints?: string[];
  verificationEndpoint?: string;
  lastRotation?: number;
}

interface SecretStatus {
  name: string;
  type: string;
  lastRotation: number;
  nextRotation: number;
  isScheduled: boolean;
}

/**
 * ConfigMap Hot-Reload Manager
 */
export class ConfigMapHotReloadManager {
  private configMaps = new Map<string, ConfigMapWatcher>();
  private reloadHandlers = new Map<string, ConfigReloadHandler[]>();

  /**
   * Watch ConfigMap for changes
   */
  watchConfigMap(name: string, filePath: string): void {
    const watcher = new ConfigMapWatcher(name, filePath);
    this.configMaps.set(name, watcher);

    watcher.on('change', (newConfig) => {
      this.handleConfigChange(name, newConfig);
    });

    watcher.start();
    
    logger.info(`Started watching ConfigMap ${name} at ${filePath}`);
  }

  /**
   * Register reload handler
   */
  registerReloadHandler(configMapName: string, handler: ConfigReloadHandler): void {
    const handlers = this.reloadHandlers.get(configMapName) || [];
    handlers.push(handler);
    this.reloadHandlers.set(configMapName, handlers);
  }

  /**
   * Handle configuration change
   */
  private async handleConfigChange(configMapName: string, newConfig: any): Promise<void> {
    logger.info(`Configuration changed for ${configMapName}`);

    const handlers = this.reloadHandlers.get(configMapName) || [];

    for (const handler of handlers) {
      try {
        await handler.handleReload(newConfig);
        logger.info(`Successfully reloaded configuration for ${handler.name}`);
      } catch (error) {
        logger.error(`Failed to reload configuration for ${handler.name}`, {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Stop watching ConfigMap
   */
  stopWatching(name: string): void {
    const watcher = this.configMaps.get(name);
    if (watcher) {
      watcher.stop();
      this.configMaps.delete(name);
      logger.info(`Stopped watching ConfigMap ${name}`);
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [name, watcher] of this.configMaps.entries()) {
      watcher.stop();
    }
    this.configMaps.clear();
  }
}

/**
 * ConfigMap File Watcher
 */
class ConfigMapWatcher {
  private watcher?: fs.FSWatcher;
  private currentConfig: any = null;
  private listeners: Array<(config: any) => void> = [];

  constructor(
    private name: string,
    private filePath: string
  ) {}

  /**
   * Start watching file
   */
  start(): void {
    // Load initial configuration
    this.loadConfig();

    // Watch for file changes
    this.watcher = fs.watch(this.filePath, (eventType) => {
      if (eventType === 'change') {
        // Debounce rapid changes
        setTimeout(() => {
          this.loadConfig();
        }, 100);
      }
    });
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        logger.warn(`ConfigMap file not found: ${this.filePath}`);
        return;
      }

      const content = fs.readFileSync(this.filePath, 'utf8');
      const newConfig = this.parseConfig(content);

      // Check if configuration actually changed
      if (JSON.stringify(newConfig) !== JSON.stringify(this.currentConfig)) {
        this.currentConfig = newConfig;
        this.notifyListeners(newConfig);
      }
    } catch (error) {
      logger.error(`Failed to load ConfigMap ${this.name}`, {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Parse configuration content
   */
  private parseConfig(content: string): any {
    const ext = path.extname(this.filePath).toLowerCase();
    
    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        // In production, use a proper YAML parser
        return { content }; // Simplified
      default:
        return { content };
    }
  }

  /**
   * Add change listener
   */
  on(event: 'change', listener: (config: any) => void): void {
    if (event === 'change') {
      this.listeners.push(listener);
    }
  }

  /**
   * Notify listeners of configuration change
   */
  private notifyListeners(config: any): void {
    for (const listener of this.listeners) {
      try {
        listener(config);
      } catch (error) {
        logger.error('ConfigMap change listener failed', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }
}

export interface ConfigReloadHandler {
  name: string;
  handleReload(newConfig: any): Promise<void>;
}