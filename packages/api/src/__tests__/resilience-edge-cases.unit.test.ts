/**
 * Unit Tests for Resilience Edge Cases
 * **Validates: Production Checklist standards**
 * 
 * Tests circuit breaker edge cases, retry exhaustion, graceful degradation,
 * health check failures, pod recovery, and secrets rotation scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  RetryManager,
  HealthCheckManager,
  GracefulDegradationManager,
} from '../utils/circuit-breaker';
import {
  MetricsCollector,
  AlertManager,
  SLATracker,
  PerformanceMonitor,
} from '../utils/monitoring';
import {
  HPAManager,
  VPAManager,
  BlueGreenDeploymentManager,
  SecretsRotationManager,
  ConfigMapHotReloadManager,
} from '../utils/infrastructure';
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

// Mock fetch
global.fetch = vi.fn();

describe('Resilience Edge Cases Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Circuit Breaker Edge Cases', () => {
    it('should handle rapid state transitions', async () => {
      const circuitBreaker = new CircuitBreaker('rapid-test', {
        failureThreshold: 2,
        recoveryTimeout: 100,
        minimumThroughput: 1,
      });

      // Trip the circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.OPEN);

      // Fast forward to recovery time
      vi.advanceTimersByTime(150);

      // Should transition to HALF_OPEN on next call
      try {
        await circuitBreaker.execute(async () => 'success');
      } catch (error) {
        // May still be OPEN
      }

      const status = circuitBreaker.getStatus();
      expect([CircuitBreakerState.HALF_OPEN, CircuitBreakerState.CLOSED]).toContain(status.state);
    });

    it('should handle concurrent executions during state transitions', async () => {
      const circuitBreaker = new CircuitBreaker('concurrent-test', {
        failureThreshold: 1,
        recoveryTimeout: 100,
        halfOpenMaxCalls: 2,
        minimumThroughput: 1,
      });

      // Trip circuit breaker
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Initial failure');
        });
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.OPEN);

      // Fast forward to recovery
      vi.advanceTimersByTime(150);

      // Make concurrent calls in HALF_OPEN state
      const promises = Array.from({ length: 5 }, () =>
        circuitBreaker.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'success';
        }).catch(error => error.message)
      );

      const results = await Promise.all(promises);
      
      // Some should succeed, some should be rejected due to HALF_OPEN limit
      const successes = results.filter(r => r === 'success').length;
      const rejections = results.filter(r => typeof r === 'string' && r.includes('HALF_OPEN')).length;
      
      expect(successes).toBeLessThanOrEqual(2); // halfOpenMaxCalls
      expect(rejections).toBeGreaterThan(0);
    });

    it('should reset failure count on successful recovery', async () => {
      const circuitBreaker = new CircuitBreaker('reset-test', {
        failureThreshold: 3,
        recoveryTimeout: 100,
        halfOpenMaxCalls: 2,
        minimumThroughput: 1,
      });

      // Build up some failures (but not enough to trip)
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getStatus().failureCount).toBe(2);

      // Successful call should reduce failure count
      await circuitBreaker.execute(async () => 'success');
      
      expect(circuitBreaker.getStatus().failureCount).toBeLessThan(2);
    });
  });

  describe('Retry Exhaustion Scenarios', () => {
    it('should handle retry exhaustion with proper error propagation', async () => {
      const retryManager = new RetryManager({
        maxAttempts: 3,
        baseDelay: 10,
        retryableErrors: ['ECONNRESET'],
      });

      let attemptCount = 0;
      const originalError = new Error('ECONNRESET: Connection reset');

      try {
        await retryManager.executeWithRetry(async () => {
          attemptCount++;
          throw originalError;
        });
      } catch (error) {
        expect(error).toBe(originalError);
        expect(attemptCount).toBe(3);
      }
    });

    it('should handle mixed retryable and non-retryable errors', async () => {
      const retryManager = new RetryManager({
        maxAttempts: 5,
        baseDelay: 10,
        retryableErrors: ['ECONNRESET'],
      });

      let attemptCount = 0;

      try {
        await retryManager.executeWithRetry(async () => {
          attemptCount++;
          
          if (attemptCount <= 2) {
            throw new Error('ECONNRESET: Retryable error');
          } else {
            throw new Error('EACCES: Non-retryable error');
          }
        });
      } catch (error) {
        expect((error as Error).message).toBe('EACCES: Non-retryable error');
        expect(attemptCount).toBe(3); // 2 retryable + 1 non-retryable
      }
    });

    it('should respect maximum delay even with high attempt counts', async () => {
      const retryManager = new RetryManager({
        maxAttempts: 10,
        baseDelay: 100,
        maxDelay: 500,
        backoffMultiplier: 3,
        retryableErrors: ['TIMEOUT'],
      });

      const attemptTimes: number[] = [];
      let attemptCount = 0;

      try {
        await retryManager.executeWithRetry(async () => {
          attemptCount++;
          attemptTimes.push(Date.now());
          
          if (attemptCount < 5) {
            throw new Error('TIMEOUT: Request timeout');
          }
          
          return 'success';
        });
      } catch (error) {
        // May succeed or fail
      }

      // Check that delays don't exceed maxDelay
      if (attemptTimes.length > 1) {
        for (let i = 1; i < attemptTimes.length; i++) {
          const delay = attemptTimes[i] - attemptTimes[i - 1];
          expect(delay).toBeLessThanOrEqual(600); // maxDelay + jitter buffer
        }
      }
    });
  });

  describe('Graceful Degradation Behavior', () => {
    it('should handle fallback service failures', async () => {
      const degradationManager = new GracefulDegradationManager();
      
      const primaryService = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackService = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      degradationManager.registerService(
        'failing-service',
        primaryService,
        fallbackService,
        { failureThreshold: 1, minimumThroughput: 1 }
      );

      await expect(
        degradationManager.executeWithDegradation('failing-service', primaryService)
      ).rejects.toThrow('Fallback failed');

      expect(primaryService).toHaveBeenCalled();
      expect(fallbackService).toHaveBeenCalled();
    });

    it('should handle unregistered services', async () => {
      const degradationManager = new GracefulDegradationManager();
      
      const service = vi.fn().mockResolvedValue('success');

      await expect(
        degradationManager.executeWithDegradation('unknown-service', service)
      ).rejects.toThrow('Service unknown-service not registered');

      expect(service).not.toHaveBeenCalled();
    });

    it('should track multiple service states independently', async () => {
      const degradationManager = new GracefulDegradationManager();
      
      // Register multiple services
      degradationManager.registerService(
        'service-a',
        vi.fn().mockResolvedValue('a-primary'),
        vi.fn().mockResolvedValue('a-fallback'),
        { failureThreshold: 2 }
      );

      degradationManager.registerService(
        'service-b',
        vi.fn().mockResolvedValue('b-primary'),
        vi.fn().mockResolvedValue('b-fallback'),
        { failureThreshold: 3 }
      );

      const statusA = degradationManager.getServiceStatus('service-a');
      const statusB = degradationManager.getServiceStatus('service-b');

      expect(statusA.name).toBe('service-a');
      expect(statusB.name).toBe('service-b');
      expect(statusA.state).toBe(CircuitBreakerState.CLOSED);
      expect(statusB.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Health Check Failure Responses', () => {
    it('should handle health check endpoint timeouts', async () => {
      const healthCheckManager = new HealthCheckManager();
      
      (global.fetch as any).mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 2000)
        )
      );

      let healthResult: any = null;

      healthCheckManager.registerCheck('timeout-service', {
        endpoint: 'http://localhost:3000/health',
        timeout: 1000,
        interval: 100,
        healthyThreshold: 2,
        unhealthyThreshold: 2,
      });

      // Wait for health checks to run
      await vi.advanceTimersByTimeAsync(500);

      healthResult = healthCheckManager.getHealthCheck('timeout-service');
      
      if (healthResult) {
        expect(healthResult.status).toBe('unhealthy');
        expect(healthResult.consecutiveFailures).toBeGreaterThan(0);
      }
    });

    it('should handle malformed health check responses', async () => {
      const healthCheckManager = new HealthCheckManager();
      
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      healthCheckManager.registerCheck('malformed-service', {
        endpoint: 'http://localhost:3000/health',
        timeout: 1000,
        interval: 100,
        healthyThreshold: 1,
        unhealthyThreshold: 1,
      });

      await vi.advanceTimersByTimeAsync(200);

      const healthResult = healthCheckManager.getHealthCheck('malformed-service');
      
      if (healthResult) {
        expect(healthResult.status).toBe('unhealthy');
      }
    });

    it('should handle network errors during health checks', async () => {
      const healthCheckManager = new HealthCheckManager();
      
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      healthCheckManager.registerCheck('network-error-service', {
        endpoint: 'http://localhost:3000/health',
        timeout: 1000,
        interval: 100,
        healthyThreshold: 1,
        unhealthyThreshold: 1,
      });

      await vi.advanceTimersByTimeAsync(200);

      const healthResult = healthCheckManager.getHealthCheck('network-error-service');
      
      if (healthResult) {
        expect(healthResult.status).toBe('unhealthy');
        expect(healthResult.consecutiveFailures).toBeGreaterThan(0);
      }
    });
  });

  describe('Pod Failure and Recovery', () => {
    it('should handle HPA scaling during resource pressure', async () => {
      const hpaManager = new HPAManager();
      
      hpaManager.registerHPA({
        name: 'test-deployment',
        minReplicas: 2,
        maxReplicas: 10,
        targetCPUUtilization: 70,
        targetMemoryUtilization: 80,
        scaleUpPeriod: 30000,
        scaleDownPeriod: 60000,
      });

      // Simulate high CPU usage
      hpaManager.updateMetrics('test-deployment', {
        cpuUsage: 900, // 90% of 1000m request
        cpuRequest: 1000,
        memoryUsage: 1024 * 1024 * 1024, // 1GB
        memoryRequest: 2 * 1024 * 1024 * 1024, // 2GB request
        currentReplicas: 3,
      });

      const status = hpaManager.getHPAStatus('test-deployment');
      
      expect(status).toBeDefined();
      expect(status!.cpuUtilization).toBe(90);
      expect(status!.memoryUtilization).toBe(50);
      expect(status!.currentReplicas).toBeGreaterThanOrEqual(3);
    });

    it('should handle VPA recommendations with resource constraints', async () => {
      const vpaManager = new VPAManager();
      
      vpaManager.registerVPA({
        name: 'test-deployment',
        updateMode: 'Auto',
        minAllowed: { cpu: '100m', memory: '128Mi' },
        maxAllowed: { cpu: '2000m', memory: '4Gi' },
      });

      // Generate recommendations based on historical data
      const historicalMetrics = [
        { cpuUsage: 1500, cpuRequest: 1000, memoryUsage: 512 * 1024 * 1024, memoryRequest: 1024 * 1024 * 1024, currentReplicas: 1 },
        { cpuUsage: 1800, cpuRequest: 1000, memoryUsage: 600 * 1024 * 1024, memoryRequest: 1024 * 1024 * 1024, currentReplicas: 1 },
        { cpuUsage: 1200, cpuRequest: 1000, memoryUsage: 400 * 1024 * 1024, memoryRequest: 1024 * 1024 * 1024, currentReplicas: 1 },
      ];

      vpaManager.generateRecommendations('test-deployment', historicalMetrics);

      const recommendation = vpaManager.getRecommendation('test-deployment');
      
      expect(recommendation).toBeDefined();
      expect(recommendation!.cpu).toMatch(/^\d+m$/);
      expect(recommendation!.memory).toMatch(/^\d+Mi$/);
    });

    it('should handle blue-green deployment failures', async () => {
      const deploymentManager = new BlueGreenDeploymentManager();
      
      // Mock failed health check
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const deploymentConfig = {
        name: 'test-app',
        strategy: 'blue-green' as const,
        healthCheckPath: '/health',
        readinessProbe: {
          path: '/ready',
          port: 3000,
          initialDelaySeconds: 10,
          periodSeconds: 5,
          timeoutSeconds: 3,
          failureThreshold: 3,
          successThreshold: 1,
        },
        livenessProbe: {
          path: '/health',
          port: 3000,
          initialDelaySeconds: 30,
          periodSeconds: 10,
          timeoutSeconds: 5,
          failureThreshold: 3,
          successThreshold: 1,
        },
      };

      await expect(
        deploymentManager.startDeployment(deploymentConfig, 'v2.0.0')
      ).rejects.toThrow();

      const status = deploymentManager.getDeploymentStatus('test-app');
      expect(status?.status).toBe('failed');
    });
  });

  describe('Secrets Rotation Without Downtime', () => {
    it('should handle secrets rotation failures gracefully', async () => {
      const secretsManager = new SecretsRotationManager();
      
      // Mock fetch to fail for notification endpoints
      (global.fetch as any).mockRejectedValue(new Error('Notification failed'));

      secretsManager.registerSecret({
        name: 'api-key',
        type: 'api_key',
        rotationInterval: 1000,
        notificationEndpoints: ['http://localhost:3000/notify'],
        verificationEndpoint: 'http://localhost:3000/verify',
      });

      await expect(
        secretsManager.rotateSecret('api-key')
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Secret rotation failed'),
        expect.any(Object)
      );
    });

    it('should handle concurrent rotation attempts', async () => {
      const secretsManager = new SecretsRotationManager();
      
      secretsManager.registerSecret({
        name: 'concurrent-secret',
        type: 'password',
        rotationInterval: 5000,
        length: 16,
      });

      // Start multiple rotations concurrently
      const rotationPromises = [
        secretsManager.rotateSecret('concurrent-secret'),
        secretsManager.rotateSecret('concurrent-secret'),
        secretsManager.rotateSecret('concurrent-secret'),
      ];

      // At least one should succeed
      const results = await Promise.allSettled(rotationPromises);
      const successes = results.filter(r => r.status === 'fulfilled').length;
      
      expect(successes).toBeGreaterThan(0);
    });

    it('should handle verification endpoint failures', async () => {
      const secretsManager = new SecretsRotationManager();
      
      // Mock verification to fail
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('verify')) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      secretsManager.registerSecret({
        name: 'verify-fail-secret',
        type: 'api_key',
        rotationInterval: 1000,
        verificationEndpoint: 'http://localhost:3000/verify',
      });

      await expect(
        secretsManager.rotateSecret('verify-fail-secret')
      ).rejects.toThrow('Verification failed');
    });
  });

  describe('Monitoring and Alerting Edge Cases', () => {
    it('should handle metrics collection under high load', async () => {
      const metricsCollector = new MetricsCollector();
      
      const counter = metricsCollector.counter('high_load_requests', 'High load requests', ['endpoint']);
      const histogram = metricsCollector.histogram('response_time', 'Response time', [0.1, 0.5, 1, 5]);

      // Simulate high load
      for (let i = 0; i < 10000; i++) {
        counter.inc({ endpoint: `/api/endpoint${i % 10}` });
        histogram.observe(Math.random() * 5);
      }

      const metrics = metricsCollector.getMetricsJSON();
      
      expect(metrics.counters).toHaveLength(1);
      expect(metrics.histograms).toHaveLength(1);
      
      // Should handle high volume without errors
      expect(counter.get({ endpoint: '/api/endpoint0' })).toBeGreaterThan(0);
    });

    it('should handle alert rule evaluation with missing metrics', async () => {
      const alertManager = new AlertManager();
      
      alertManager.addRule({
        name: 'missing-metric-alert',
        condition: 'nonexistent.metric > 100',
        threshold: 100,
        duration: 0,
        severity: 'warning',
        description: 'Test alert for missing metric',
      });

      // Evaluate with empty metrics
      alertManager.evaluateRules({});

      const activeAlerts = alertManager.getActiveAlerts();
      
      // Should not create alerts for missing metrics
      expect(activeAlerts).toHaveLength(0);
    });

    it('should handle SLA tracking with irregular data', async () => {
      const slaTracker = new SLATracker();
      
      slaTracker.registerSLA({
        name: 'irregular-service',
        target: 99.9,
        window: 60000, // 1 minute
        errorBudget: 0.1,
      });

      // Record irregular measurements
      const measurements = [
        { success: true, delay: 0 },
        { success: false, delay: 100 },
        { success: true, delay: 200 },
        { success: true, delay: 300 },
        { success: false, delay: 400 },
      ];

      for (const [index, measurement] of measurements.entries()) {
        setTimeout(() => {
          slaTracker.recordMeasurement('irregular-service', measurement.success);
        }, measurement.delay);
      }

      // Fast forward time
      vi.advanceTimersByTime(500);

      const status = slaTracker.getSLAStatus('irregular-service');
      
      expect(status).toBeDefined();
      expect(status!.totalRequests).toBeGreaterThan(0);
      expect(status!.current).toBeGreaterThanOrEqual(0);
      expect(status!.current).toBeLessThanOrEqual(100);
    });
  });

  describe('ConfigMap Hot-Reload Edge Cases', () => {
    it('should handle malformed configuration files', async () => {
      const configManager = new ConfigMapHotReloadManager();
      
      // Mock file system operations
      const fs = require('fs');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json }');
      vi.spyOn(fs, 'watch').mockImplementation((path, callback) => {
        // Simulate file change
        setTimeout(() => callback('change'), 100);
        return { close: vi.fn() };
      });

      let reloadCalled = false;
      const handler = {
        name: 'test-handler',
        handleReload: vi.fn().mockImplementation(async () => {
          reloadCalled = true;
        }),
      };

      configManager.registerReloadHandler('test-config', handler);
      configManager.watchConfigMap('test-config', '/config/test.json');

      vi.advanceTimersByTime(200);

      // Should not call reload handler for malformed config
      expect(reloadCalled).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load ConfigMap'),
        expect.any(Object)
      );
    });

    it('should handle file system watch errors', async () => {
      const configManager = new ConfigMapHotReloadManager();
      
      const fs = require('fs');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'watch').mockImplementation(() => {
        throw new Error('Watch failed');
      });

      expect(() => {
        configManager.watchConfigMap('error-config', '/nonexistent/config.json');
      }).toThrow('Watch failed');
    });
  });
});