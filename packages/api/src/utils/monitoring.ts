/**
 * Monitoring and Alerting System
 * **Validates: Production Checklist - Monitoring**
 * 
 * Implements Prometheus metrics, centralized logging, alerting rules,
 * performance monitoring, and SLA tracking.
 */

import { logger } from './logger';

export interface MetricLabels {
  [key: string]: string;
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  duration: number; // in milliseconds
  severity: 'critical' | 'warning' | 'info';
  description: string;
  runbook?: string;
}

export interface SLAConfig {
  name: string;
  target: number; // percentage (e.g., 99.9)
  window: number; // time window in milliseconds
  errorBudget: number; // percentage
}

/**
 * Prometheus-style Metrics Collector
 */
export class MetricsCollector {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private summaries = new Map<string, Summary>();

  /**
   * Create or get a counter metric
   */
  counter(name: string, help: string, labels: string[] = []): Counter {
    const key = `${name}_${labels.join('_')}`;
    
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, help, labels));
    }
    
    return this.counters.get(key)!;
  }

  /**
   * Create or get a gauge metric
   */
  gauge(name: string, help: string, labels: string[] = []): Gauge {
    const key = `${name}_${labels.join('_')}`;
    
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, help, labels));
    }
    
    return this.gauges.get(key)!;
  }

  /**
   * Create or get a histogram metric
   */
  histogram(name: string, help: string, buckets: number[] = [], labels: string[] = []): Histogram {
    const key = `${name}_${labels.join('_')}`;
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, help, buckets, labels));
    }
    
    return this.histograms.get(key)!;
  }

  /**
   * Create or get a summary metric
   */
  summary(name: string, help: string, quantiles: number[] = [0.5, 0.9, 0.99], labels: string[] = []): Summary {
    const key = `${name}_${labels.join('_')}`;
    
    if (!this.summaries.has(key)) {
      this.summaries.set(key, new Summary(name, help, quantiles, labels));
    }
    
    return this.summaries.get(key)!;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportMetrics(): string {
    const lines: string[] = [];

    // Export counters
    for (const counter of this.counters.values()) {
      lines.push(...counter.export());
    }

    // Export gauges
    for (const gauge of this.gauges.values()) {
      lines.push(...gauge.export());
    }

    // Export histograms
    for (const histogram of this.histograms.values()) {
      lines.push(...histogram.export());
    }

    // Export summaries
    for (const summary of this.summaries.values()) {
      lines.push(...summary.export());
    }

    return lines.join('\n');
  }

  /**
   * Get all metrics as JSON
   */
  getMetricsJSON(): any {
    return {
      counters: Array.from(this.counters.values()).map(c => c.toJSON()),
      gauges: Array.from(this.gauges.values()).map(g => g.toJSON()),
      histograms: Array.from(this.histograms.values()).map(h => h.toJSON()),
      summaries: Array.from(this.summaries.values()).map(s => s.toJSON()),
    };
  }
}

/**
 * Counter Metric
 */
class Counter {
  private value = 0;
  private labelValues = new Map<string, number>();

  constructor(
    private name: string,
    private help: string,
    private labels: string[] = []
  ) {}

  /**
   * Increment counter
   */
  inc(labels: MetricLabels = {}, value = 1): void {
    if (this.labels.length === 0) {
      this.value += value;
    } else {
      const key = this.createLabelKey(labels);
      const current = this.labelValues.get(key) || 0;
      this.labelValues.set(key, current + value);
    }
  }

  /**
   * Get current value
   */
  get(labels: MetricLabels = {}): number {
    if (this.labels.length === 0) {
      return this.value;
    } else {
      const key = this.createLabelKey(labels);
      return this.labelValues.get(key) || 0;
    }
  }

  /**
   * Export in Prometheus format
   */
  export(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);

    if (this.labels.length === 0) {
      lines.push(`${this.name} ${this.value}`);
    } else {
      for (const [labelKey, value] of this.labelValues.entries()) {
        lines.push(`${this.name}{${labelKey}} ${value}`);
      }
    }

    return lines;
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      name: this.name,
      help: this.help,
      type: 'counter',
      value: this.labels.length === 0 ? this.value : Object.fromEntries(this.labelValues),
    };
  }

  private createLabelKey(labels: MetricLabels): string {
    return this.labels
      .map(label => `${label}="${labels[label] || ''}"`)
      .join(',');
  }
}

/**
 * Gauge Metric
 */
class Gauge {
  private value = 0;
  private labelValues = new Map<string, number>();

  constructor(
    private name: string,
    private help: string,
    private labels: string[] = []
  ) {}

  /**
   * Set gauge value
   */
  set(value: number, labels: MetricLabels = {}): void {
    if (this.labels.length === 0) {
      this.value = value;
    } else {
      const key = this.createLabelKey(labels);
      this.labelValues.set(key, value);
    }
  }

  /**
   * Increment gauge
   */
  inc(labels: MetricLabels = {}, value = 1): void {
    if (this.labels.length === 0) {
      this.value += value;
    } else {
      const key = this.createLabelKey(labels);
      const current = this.labelValues.get(key) || 0;
      this.labelValues.set(key, current + value);
    }
  }

  /**
   * Decrement gauge
   */
  dec(labels: MetricLabels = {}, value = 1): void {
    this.inc(labels, -value);
  }

  /**
   * Get current value
   */
  get(labels: MetricLabels = {}): number {
    if (this.labels.length === 0) {
      return this.value;
    } else {
      const key = this.createLabelKey(labels);
      return this.labelValues.get(key) || 0;
    }
  }

  /**
   * Export in Prometheus format
   */
  export(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);

    if (this.labels.length === 0) {
      lines.push(`${this.name} ${this.value}`);
    } else {
      for (const [labelKey, value] of this.labelValues.entries()) {
        lines.push(`${this.name}{${labelKey}} ${value}`);
      }
    }

    return lines;
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      name: this.name,
      help: this.help,
      type: 'gauge',
      value: this.labels.length === 0 ? this.value : Object.fromEntries(this.labelValues),
    };
  }

  private createLabelKey(labels: MetricLabels): string {
    return this.labels
      .map(label => `${label}="${labels[label] || ''}"`)
      .join(',');
  }
}

/**
 * Histogram Metric
 */
class Histogram {
  private buckets: Map<number, number> = new Map();
  private sum = 0;
  private count = 0;

  constructor(
    private name: string,
    private help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    private labels: string[] = []
  ) {
    // Initialize buckets
    for (const bucket of buckets) {
      this.buckets.set(bucket, 0);
    }
    this.buckets.set(Infinity, 0); // +Inf bucket
  }

  /**
   * Observe a value
   */
  observe(value: number, labels: MetricLabels = {}): void {
    this.sum += value;
    this.count++;

    // Update buckets
    for (const [bucket, count] of this.buckets.entries()) {
      if (value <= bucket) {
        this.buckets.set(bucket, count + 1);
      }
    }
  }

  /**
   * Export in Prometheus format
   */
  export(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);

    // Export buckets
    for (const [bucket, count] of this.buckets.entries()) {
      const bucketStr = bucket === Infinity ? '+Inf' : bucket.toString();
      lines.push(`${this.name}_bucket{le="${bucketStr}"} ${count}`);
    }

    lines.push(`${this.name}_sum ${this.sum}`);
    lines.push(`${this.name}_count ${this.count}`);

    return lines;
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      name: this.name,
      help: this.help,
      type: 'histogram',
      buckets: Object.fromEntries(this.buckets),
      sum: this.sum,
      count: this.count,
    };
  }
}

/**
 * Summary Metric
 */
class Summary {
  private values: number[] = [];
  private sum = 0;
  private count = 0;

  constructor(
    private name: string,
    private help: string,
    private quantiles: number[] = [0.5, 0.9, 0.99],
    private labels: string[] = []
  ) {}

  /**
   * Observe a value
   */
  observe(value: number, labels: MetricLabels = {}): void {
    this.values.push(value);
    this.sum += value;
    this.count++;

    // Keep only recent values (sliding window)
    if (this.values.length > 1000) {
      this.values = this.values.slice(-1000);
    }
  }

  /**
   * Calculate quantile
   */
  private calculateQuantile(quantile: number): number {
    if (this.values.length === 0) return 0;

    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.ceil(quantile * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Export in Prometheus format
   */
  export(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} summary`);

    // Export quantiles
    for (const quantile of this.quantiles) {
      const value = this.calculateQuantile(quantile);
      lines.push(`${this.name}{quantile="${quantile}"} ${value}`);
    }

    lines.push(`${this.name}_sum ${this.sum}`);
    lines.push(`${this.name}_count ${this.count}`);

    return lines;
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    const quantileValues: Record<string, number> = {};
    for (const quantile of this.quantiles) {
      quantileValues[quantile.toString()] = this.calculateQuantile(quantile);
    }

    return {
      name: this.name,
      help: this.help,
      type: 'summary',
      quantiles: quantileValues,
      sum: this.sum,
      count: this.count,
    };
  }
}

/**
 * Centralized Logging with Correlation IDs
 */
export class CentralizedLogger {
  private correlationId: string | null = null;
  private context: Record<string, any> = {};

  /**
   * Set correlation ID for request tracking
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Set context for all log messages
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
    this.correlationId = null;
  }

  /**
   * Log with correlation ID and context
   */
  private logWithContext(level: string, message: string, meta: any = {}): void {
    const logData = {
      level,
      message,
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      context: this.context,
      ...meta,
    };

    // In production, this would send to centralized logging system
    console.log(JSON.stringify(logData));
  }

  info(message: string, meta?: any): void {
    this.logWithContext('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logWithContext('warn', message, meta);
  }

  error(message: string, meta?: any): void {
    this.logWithContext('error', message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logWithContext('debug', message, meta);
  }
}

/**
 * Alert Manager
 */
export class AlertManager {
  private rules: AlertRule[] = [];
  private activeAlerts = new Map<string, ActiveAlert>();
  private alertHandlers: AlertHandler[] = [];

  /**
   * Add alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /**
   * Add alert handler
   */
  addHandler(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Evaluate all rules
   */
  evaluateRules(metrics: any): void {
    for (const rule of this.rules) {
      this.evaluateRule(rule, metrics);
    }
  }

  /**
   * Evaluate single rule
   */
  private evaluateRule(rule: AlertRule, metrics: any): void {
    const isTriggered = this.evaluateCondition(rule.condition, rule.threshold, metrics);
    const existingAlert = this.activeAlerts.get(rule.name);

    if (isTriggered) {
      if (!existingAlert) {
        // New alert
        const alert: ActiveAlert = {
          rule,
          startTime: Date.now(),
          lastEvaluation: Date.now(),
          evaluationCount: 1,
        };

        this.activeAlerts.set(rule.name, alert);
        
        // Check if alert should fire (duration threshold met)
        if (rule.duration === 0) {
          this.fireAlert(alert);
        }
      } else {
        // Existing alert
        existingAlert.lastEvaluation = Date.now();
        existingAlert.evaluationCount++;

        // Check if duration threshold is met
        if (Date.now() - existingAlert.startTime >= rule.duration && !existingAlert.fired) {
          this.fireAlert(existingAlert);
        }
      }
    } else {
      if (existingAlert) {
        // Alert resolved
        this.resolveAlert(existingAlert);
        this.activeAlerts.delete(rule.name);
      }
    }
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(condition: string, threshold: number, metrics: any): boolean {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // Example conditions: "response_time > 1000", "error_rate > 0.05"
      const [metricName, operator, value] = condition.split(' ');
      const metricValue = this.getMetricValue(metricName, metrics);

      switch (operator) {
        case '>':
          return metricValue > threshold;
        case '<':
          return metricValue < threshold;
        case '>=':
          return metricValue >= threshold;
        case '<=':
          return metricValue <= threshold;
        case '==':
          return metricValue === threshold;
        case '!=':
          return metricValue !== threshold;
        default:
          return false;
      }
    } catch (error) {
      logger.error('Failed to evaluate alert condition', {
        condition,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get metric value from metrics object
   */
  private getMetricValue(metricName: string, metrics: any): number {
    // Navigate nested object structure
    const parts = metricName.split('.');
    let value = metrics;

    for (const part of parts) {
      value = value?.[part];
    }

    return typeof value === 'number' ? value : 0;
  }

  /**
   * Fire alert
   */
  private fireAlert(alert: ActiveAlert): void {
    alert.fired = true;
    alert.firedAt = Date.now();

    logger.error('Alert fired', {
      rule: alert.rule.name,
      severity: alert.rule.severity,
      description: alert.rule.description,
    });

    // Notify handlers
    for (const handler of this.alertHandlers) {
      try {
        handler.handleAlert(alert);
      } catch (error) {
        logger.error('Alert handler failed', {
          handler: handler.constructor.name,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Resolve alert
   */
  private resolveAlert(alert: ActiveAlert): void {
    alert.resolvedAt = Date.now();

    logger.info('Alert resolved', {
      rule: alert.rule.name,
      duration: alert.resolvedAt - alert.startTime,
    });

    // Notify handlers
    for (const handler of this.alertHandlers) {
      try {
        handler.handleResolution?.(alert);
      } catch (error) {
        logger.error('Alert resolution handler failed', {
          handler: handler.constructor.name,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ActiveAlert[] {
    return Array.from(this.activeAlerts.values());
  }
}

interface ActiveAlert {
  rule: AlertRule;
  startTime: number;
  lastEvaluation: number;
  evaluationCount: number;
  fired?: boolean;
  firedAt?: number;
  resolvedAt?: number;
}

/**
 * Alert Handler Interface
 */
export interface AlertHandler {
  handleAlert(alert: ActiveAlert): void;
  handleResolution?(alert: ActiveAlert): void;
}

/**
 * SLA Tracker
 */
export class SLATracker {
  private slas = new Map<string, SLAConfig>();
  private measurements = new Map<string, SLAMeasurement[]>();

  /**
   * Register SLA
   */
  registerSLA(config: SLAConfig): void {
    this.slas.set(config.name, config);
    this.measurements.set(config.name, []);
  }

  /**
   * Record measurement
   */
  recordMeasurement(slaName: string, success: boolean, responseTime?: number): void {
    const measurements = this.measurements.get(slaName);
    if (!measurements) {
      logger.warn(`SLA ${slaName} not registered`);
      return;
    }

    const measurement: SLAMeasurement = {
      timestamp: Date.now(),
      success,
      responseTime,
    };

    measurements.push(measurement);

    // Clean old measurements outside window
    const sla = this.slas.get(slaName)!;
    const cutoff = Date.now() - sla.window;
    
    const filtered = measurements.filter(m => m.timestamp >= cutoff);
    this.measurements.set(slaName, filtered);
  }

  /**
   * Get SLA status
   */
  getSLAStatus(slaName: string): SLAStatus | null {
    const sla = this.slas.get(slaName);
    const measurements = this.measurements.get(slaName);

    if (!sla || !measurements) {
      return null;
    }

    const totalRequests = measurements.length;
    const successfulRequests = measurements.filter(m => m.success).length;
    const currentAvailability = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

    const errorBudgetUsed = Math.max(0, sla.target - currentAvailability);
    const errorBudgetRemaining = Math.max(0, sla.errorBudget - errorBudgetUsed);

    return {
      name: slaName,
      target: sla.target,
      current: currentAvailability,
      errorBudgetUsed,
      errorBudgetRemaining,
      totalRequests,
      successfulRequests,
      isHealthy: currentAvailability >= sla.target,
    };
  }

  /**
   * Get all SLA statuses
   */
  getAllSLAStatuses(): SLAStatus[] {
    const statuses: SLAStatus[] = [];

    for (const slaName of this.slas.keys()) {
      const status = this.getSLAStatus(slaName);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }
}

interface SLAMeasurement {
  timestamp: number;
  success: boolean;
  responseTime?: number;
}

interface SLAStatus {
  name: string;
  target: number;
  current: number;
  errorBudgetUsed: number;
  errorBudgetRemaining: number;
  totalRequests: number;
  successfulRequests: number;
  isHealthy: boolean;
}

/**
 * Performance Monitor
 */
export class PerformanceMonitor {
  private metrics: MetricsCollector;
  private slaTracker: SLATracker;

  constructor() {
    this.metrics = new MetricsCollector();
    this.slaTracker = new SLATracker();
    this.setupDefaultMetrics();
  }

  /**
   * Setup default metrics
   */
  private setupDefaultMetrics(): void {
    // HTTP request metrics
    this.metrics.counter('http_requests_total', 'Total HTTP requests', ['method', 'status', 'endpoint']);
    this.metrics.histogram('http_request_duration_seconds', 'HTTP request duration', 
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], ['method', 'endpoint']);
    
    // System metrics
    this.metrics.gauge('nodejs_memory_usage_bytes', 'Node.js memory usage', ['type']);
    this.metrics.gauge('nodejs_cpu_usage_percent', 'Node.js CPU usage');
    
    // Application metrics
    this.metrics.gauge('active_connections', 'Active connections');
    this.metrics.counter('errors_total', 'Total errors', ['type']);
  }

  /**
   * Record HTTP request
   */
  recordHTTPRequest(method: string, endpoint: string, statusCode: number, duration: number): void {
    this.metrics.counter('http_requests_total', 'Total HTTP requests', ['method', 'status', 'endpoint'])
      .inc({ method, status: statusCode.toString(), endpoint });

    this.metrics.histogram('http_request_duration_seconds', 'HTTP request duration', [], ['method', 'endpoint'])
      .observe(duration / 1000, { method, endpoint });

    // Record SLA measurement
    const success = statusCode >= 200 && statusCode < 400;
    this.slaTracker.recordMeasurement('http_availability', success, duration);
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.metrics.gauge('nodejs_memory_usage_bytes', 'Node.js memory usage', ['type'])
      .set(memUsage.heapUsed, { type: 'heap_used' });
    this.metrics.gauge('nodejs_memory_usage_bytes', 'Node.js memory usage', ['type'])
      .set(memUsage.heapTotal, { type: 'heap_total' });
    this.metrics.gauge('nodejs_memory_usage_bytes', 'Node.js memory usage', ['type'])
      .set(memUsage.external, { type: 'external' });

    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    this.metrics.gauge('nodejs_cpu_usage_percent', 'Node.js CPU usage').set(cpuPercent);
  }

  /**
   * Get metrics collector
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Get SLA tracker
   */
  getSLATracker(): SLATracker {
    return this.slaTracker;
  }
}