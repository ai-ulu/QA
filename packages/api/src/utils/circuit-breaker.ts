/**
 * Circuit Breaker and Retry Patterns
 * **Validates: Production Checklist - Distributed System**
 * 
 * Implements circuit breaker for external services, exponential backoff,
 * graceful degradation, health checks, and retry storm prevention.
 */

import { logger } from './logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
  minimumThroughput: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitterFactor: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface HealthCheckConfig {
  endpoint: string;
  timeout: number;
  interval: number;
  healthyThreshold: number;
  unhealthyThreshold: number;
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private requestCount = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 10000, // 10 seconds
      halfOpenMaxCalls: 3,
      minimumThroughput: 10,
      ...config,
    };

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCalls = 0;
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new Error(`Circuit breaker ${this.name} HALF_OPEN limit exceeded`);
      }
      this.halfOpenCalls++;
    }

    this.requestCount++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.config.halfOpenMaxCalls) {
        this.state = CircuitBreakerState.CLOSED;
        this.reset();
        logger.info(`Circuit breaker ${this.name} recovered to CLOSED`);
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      logger.warn(`Circuit breaker ${this.name} failed in HALF_OPEN, returning to OPEN`);
    } else if (this.state === CircuitBreakerState.CLOSED) {
      if (this.shouldTrip()) {
        this.state = CircuitBreakerState.OPEN;
        logger.error(`Circuit breaker ${this.name} tripped to OPEN`, {
          failureCount: this.failureCount,
          threshold: this.config.failureThreshold,
        });
      }
    }
  }

  /**
   * Check if circuit breaker should trip
   */
  private shouldTrip(): boolean {
    return (
      this.failureCount >= this.config.failureThreshold &&
      this.requestCount >= this.config.minimumThroughput
    );
  }

  /**
   * Check if should attempt reset from OPEN to HALF_OPEN
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  /**
   * Reset circuit breaker counters
   */
  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  /**
   * Start monitoring and periodic reset
   */
  private startMonitoring(): void {
    setInterval(() => {
      // Reset request count for throughput calculation
      this.requestCount = 0;
      
      // Log current state
      logger.debug(`Circuit breaker ${this.name} status`, {
        state: this.state,
        failureCount: this.failureCount,
        successCount: this.successCount,
      });
    }, this.config.monitoringPeriod);
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    name: string;
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    requestCount: number;
  } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
    };
  }
}

/**
 * Retry with Exponential Backoff
 */
export class RetryManager {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      jitterFactor: 0.1,
      backoffMultiplier: 2,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'],
      ...config,
    };
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 1) {
          logger.info(`Retry succeeded on attempt ${attempt}`, { context });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (!this.isRetryableError(lastError) || attempt === this.config.maxAttempts) {
          logger.error(`Retry failed after ${attempt} attempts`, {
            context,
            error: lastError.message,
            retryable: this.isRetryableError(lastError),
          });
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        
        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, {
          context,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    return this.config.retryableErrors.some(retryableError =>
      error.message.includes(retryableError) ||
      error.name.includes(retryableError) ||
      (error as any).code === retryableError
    );
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Health Check Manager
 */
export class HealthCheckManager {
  private readonly checks = new Map<string, HealthCheck>();
  private readonly results = new Map<string, HealthCheckResult>();

  /**
   * Register a health check
   */
  registerCheck(name: string, config: HealthCheckConfig): void {
    const healthCheck = new HealthCheck(name, config);
    this.checks.set(name, healthCheck);
    
    // Start monitoring
    healthCheck.start((result) => {
      this.results.set(name, result);
      
      if (result.status === 'unhealthy') {
        logger.error(`Health check ${name} failed`, {
          error: result.error,
          consecutiveFailures: result.consecutiveFailures,
        });
      } else if (result.status === 'healthy' && result.consecutiveFailures > 0) {
        logger.info(`Health check ${name} recovered`, {
          consecutiveSuccesses: result.consecutiveSuccesses,
        });
      }
    });
  }

  /**
   * Get health check result
   */
  getHealthCheck(name: string): HealthCheckResult | undefined {
    return this.results.get(name);
  }

  /**
   * Get all health check results
   */
  getAllHealthChecks(): Record<string, HealthCheckResult> {
    const results: Record<string, HealthCheckResult> = {};
    
    for (const [name, result] of this.results.entries()) {
      results[name] = result;
    }
    
    return results;
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, HealthCheckResult>;
    summary: {
      total: number;
      healthy: number;
      unhealthy: number;
    };
  } {
    const checks = this.getAllHealthChecks();
    const total = Object.keys(checks).length;
    const healthy = Object.values(checks).filter(c => c.status === 'healthy').length;
    const unhealthy = total - healthy;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (unhealthy === 0) {
      status = 'healthy';
    } else if (healthy > unhealthy) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      checks,
      summary: { total, healthy, unhealthy },
    };
  }

  /**
   * Stop all health checks
   */
  stopAll(): void {
    for (const healthCheck of this.checks.values()) {
      healthCheck.stop();
    }
  }
}

/**
 * Individual Health Check
 */
class HealthCheck {
  private interval?: NodeJS.Timeout;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private status: 'healthy' | 'unhealthy' = 'healthy';

  constructor(
    private readonly name: string,
    private readonly config: HealthCheckConfig
  ) {}

  /**
   * Start health check monitoring
   */
  start(callback: (result: HealthCheckResult) => void): void {
    this.interval = setInterval(async () => {
      try {
        await this.performCheck();
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        if (this.status === 'unhealthy' && this.consecutiveSuccesses >= this.config.healthyThreshold) {
          this.status = 'healthy';
        }
      } catch (error) {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        if (this.status === 'healthy' && this.consecutiveFailures >= this.config.unhealthyThreshold) {
          this.status = 'unhealthy';
        }
      }

      callback({
        name: this.name,
        status: this.status,
        consecutiveSuccesses: this.consecutiveSuccesses,
        consecutiveFailures: this.consecutiveFailures,
        lastCheck: new Date(),
        error: this.status === 'unhealthy' ? 'Health check failed' : undefined,
      });
    }, this.config.interval);
  }

  /**
   * Perform the actual health check
   */
  private async performCheck(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        signal: controller.signal,
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Stop health check monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy';
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  lastCheck: Date;
  error?: string;
}

/**
 * Graceful Degradation Manager
 */
export class GracefulDegradationManager {
  private readonly fallbacks = new Map<string, () => Promise<any>>();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Register a service with fallback
   */
  registerService<T>(
    name: string,
    primaryService: () => Promise<T>,
    fallbackService: () => Promise<T>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ): void {
    this.fallbacks.set(name, fallbackService);
    this.circuitBreakers.set(name, new CircuitBreaker(name, circuitBreakerConfig));
  }

  /**
   * Execute service with graceful degradation
   */
  async executeWithDegradation<T>(
    serviceName: string,
    primaryService: () => Promise<T>
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    const fallback = this.fallbacks.get(serviceName);

    if (!circuitBreaker) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    try {
      return await circuitBreaker.execute(primaryService);
    } catch (error) {
      if (fallback) {
        logger.warn(`Primary service ${serviceName} failed, using fallback`, {
          error: (error as Error).message,
        });
        
        return await fallback();
      }
      
      throw error;
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceName: string): any {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    return circuitBreaker?.getStatus();
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): Record<string, any> {
    const statuses: Record<string, any> = {};
    
    for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
      statuses[name] = circuitBreaker.getStatus();
    }
    
    return statuses;
  }
}

/**
 * Retry Storm Prevention
 */
export class RetryStormPrevention {
  private readonly activeRetries = new Map<string, number>();
  private readonly maxConcurrentRetries: number;

  constructor(maxConcurrentRetries = 10) {
    this.maxConcurrentRetries = maxConcurrentRetries;
  }

  /**
   * Execute with retry storm prevention
   */
  async executeWithStormPrevention<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const currentRetries = this.activeRetries.get(key) || 0;
    
    if (currentRetries >= this.maxConcurrentRetries) {
      throw new Error(`Retry storm detected for ${key}. Max concurrent retries exceeded.`);
    }

    this.activeRetries.set(key, currentRetries + 1);

    try {
      const result = await fn();
      return result;
    } finally {
      const newCount = (this.activeRetries.get(key) || 1) - 1;
      
      if (newCount <= 0) {
        this.activeRetries.delete(key);
      } else {
        this.activeRetries.set(key, newCount);
      }
    }
  }

  /**
   * Get current retry counts
   */
  getRetryStats(): Record<string, number> {
    return Object.fromEntries(this.activeRetries.entries());
  }
}