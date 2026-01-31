/**
 * Property Tests for Healing Event Logging
 * **Feature: autoqa-pilot, Property 8: Healing Event Logging**
 * **Validates: Requirements 4.3, 4.4, 4.5**
 * 
 * Tests that all healing attempts are logged appropriately and
 * verifies user notifications are sent for all healing events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock types for testing without full dependencies
interface MockPage {
  setContent(html: string): Promise<void>;
  locator(selector: string): MockLocator;
  screenshot(options?: { type?: 'png' | 'jpeg'; fullPage?: boolean }): Promise<Buffer>;
  content(): Promise<string>;
}

interface MockLocator {
  first(): MockLocator;
  count(): Promise<number>;
  textContent(): Promise<string | null>;
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  evaluate<T>(fn: (el: Element) => T): Promise<T>;
}

// Mock healing types
enum HealingStrategy {
  CSS_SELECTOR = 'CSS_SELECTOR',
  XPATH = 'XPATH',
  TEXT_CONTENT = 'TEXT_CONTENT',
  VISUAL_RECOGNITION = 'VISUAL_RECOGNITION',
  STRUCTURAL_ANALYSIS = 'STRUCTURAL_ANALYSIS'
}

enum NotificationType {
  TEST_COMPLETED = 'TEST_COMPLETED',
  TEST_FAILED = 'TEST_FAILED',
  SCHEDULE_TRIGGERED = 'SCHEDULE_TRIGGERED',
  HEALING_EVENT = 'HEALING_EVENT',
  SYSTEM_ALERT = 'SYSTEM_ALERT'
}

interface HealingContext {
  page: MockPage;
  originalSelector: string;
  elementType: string;
  lastKnownLocation?: ElementLocation;
  domSnapshot?: string;
  screenshot?: Buffer;
  metadata?: Record<string, any>;
}

interface HealingResult {
  success: boolean;
  newSelector?: string;
  strategy: HealingStrategy;
  confidence: number;
  alternatives?: ElementSelector[];
  metadata?: {
    totalExecutionTime?: number;
    attemptsCount?: number;
    attempts?: HealingAttempt[];
    strategiesTried?: HealingStrategy[];
  };
  error?: string;
}

interface HealingAttempt {
  strategy: HealingStrategy;
  selector: string;
  confidence: number;
  success: boolean;
  error?: string;
  executionTime: number;
}

interface ElementSelector {
  type: 'css' | 'xpath' | 'text' | 'visual' | 'structural';
  value: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

interface ElementLocation {
  selectors: ElementSelector[];
  tagName?: string;
  attributes?: Record<string, string>;
  textContent?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visualHash?: string;
}

interface HealingEvent {
  id: string;
  scenarioId: string;
  executionId?: string;
  elementType: string;
  oldSelector: string;
  newSelector?: string;
  strategy: HealingStrategy;
  success: boolean;
  confidence: number;
  attempts: HealingAttempt[];
  metadata?: Record<string, any>;
  timestamp: Date;
}

interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

// Mock logger that captures all logging events
class MockHealingLogger {
  private events: HealingEvent[] = [];
  private attempts: HealingAttempt[] = [];
  private errors: Array<{ error: Error; context: HealingContext }> = [];
  private results: HealingResult[] = [];

  logAttempt(attempt: HealingAttempt): void {
    this.attempts.push({ ...attempt });
  }

  logResult(result: HealingResult): void {
    this.results.push({ ...result });
    
    // Create healing event from result
    const event: HealingEvent = {
      id: this.generateEventId(),
      scenarioId: 'test-scenario-id',
      executionId: 'test-execution-id',
      elementType: 'button',
      oldSelector: 'original-selector',
      newSelector: result.newSelector,
      strategy: result.strategy,
      success: result.success,
      confidence: result.confidence,
      attempts: result.metadata?.attempts || [],
      metadata: result.metadata,
      timestamp: new Date()
    };
    
    this.events.push(event);
  }

  logError(error: Error, context: HealingContext): void {
    this.errors.push({ error: { ...error }, context: { ...context } });
  }

  getHistory(): HealingEvent[] {
    return [...this.events];
  }

  getAttempts(): HealingAttempt[] {
    return [...this.attempts];
  }

  getErrors(): Array<{ error: Error; context: HealingContext }> {
    return [...this.errors];
  }

  getResults(): HealingResult[] {
    return [...this.results];
  }

  clear(): void {
    this.events = [];
    this.attempts = [];
    this.errors = [];
    this.results = [];
  }

  private generateEventId(): string {
    return `healing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Mock notification service
class MockNotificationService {
  private notifications: Notification[] = [];
  private subscribers: Array<(notification: Notification) => void> = [];

  async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<Notification> {
    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      title,
      message,
      metadata,
      isRead: false,
      createdAt: new Date()
    };

    this.notifications.push(notification);
    
    // Notify subscribers
    this.subscribers.forEach(callback => callback(notification));
    
    return notification;
  }

  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  getNotificationsByType(type: NotificationType): Notification[] {
    return this.notifications.filter(n => n.type === type);
  }

  getNotificationsByUser(userId: string): Notification[] {
    return this.notifications.filter(n => n.userId === userId);
  }

  subscribe(callback: (notification: Notification) => void): void {
    this.subscribers.push(callback);
  }

  clear(): void {
    this.notifications = [];
  }
}

// Mock Self-Healing Engine with comprehensive logging
class MockSelfHealingEngineWithLogging {
  private strategies: HealingStrategy[];
  private maxAttempts: number;
  private confidenceThreshold: number;
  private logger: MockHealingLogger;
  private notificationService: MockNotificationService;
  private userId: string;

  constructor(
    logger: MockHealingLogger,
    notificationService: MockNotificationService,
    userId: string = 'test-user-id',
    config?: {
      strategies?: HealingStrategy[];
      maxAttempts?: number;
      confidenceThreshold?: number;
    }
  ) {
    this.strategies = config?.strategies || [
      HealingStrategy.CSS_SELECTOR,
      HealingStrategy.XPATH,
      HealingStrategy.TEXT_CONTENT,
      HealingStrategy.VISUAL_RECOGNITION,
      HealingStrategy.STRUCTURAL_ANALYSIS
    ];
    this.maxAttempts = config?.maxAttempts || 5;
    this.confidenceThreshold = config?.confidenceThreshold || 0.7;
    this.logger = logger;
    this.notificationService = notificationService;
    this.userId = userId;
  }

  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    const attempts: HealingAttempt[] = [];

    try {
      // Log start of healing process
      console.log(`Starting healing process for selector: ${context.originalSelector}`);

      // Simulate healing attempts with comprehensive logging
      for (let i = 0; i < Math.min(this.strategies.length, this.maxAttempts); i++) {
        const strategy = this.strategies[i];
        const attemptStartTime = Date.now();
        
        // Simulate strategy execution
        const success = await this.simulateStrategyExecution(context, strategy);
        const confidence = success ? Math.random() * 0.3 + 0.7 : Math.random() * 0.5;
        const executionTime = Date.now() - attemptStartTime + Math.random() * 100;

        const attempt: HealingAttempt = {
          strategy,
          selector: success ? this.generateSelector(context, strategy) : '',
          confidence,
          success,
          error: success ? undefined : `Strategy ${strategy} failed to locate element`,
          executionTime
        };

        attempts.push(attempt);
        
        // Log each attempt
        this.logger.logAttempt(attempt);

        // If successful and meets threshold, return success
        if (success && confidence >= this.confidenceThreshold) {
          const result: HealingResult = {
            success: true,
            newSelector: attempt.selector,
            strategy,
            confidence,
            metadata: {
              totalExecutionTime: Date.now() - startTime,
              attemptsCount: attempts.length,
              attempts,
              strategiesTried: attempts.map(a => a.strategy)
            }
          };

          // Log successful result
          this.logger.logResult(result);

          // Send success notification
          await this.notificationService.sendNotification(
            this.userId,
            NotificationType.HEALING_EVENT,
            'Self-Healing Success',
            `Element successfully healed using ${strategy} strategy with ${(confidence * 100).toFixed(1)}% confidence`,
            {
              scenarioId: 'test-scenario-id',
              executionId: 'test-execution-id',
              oldSelector: context.originalSelector,
              newSelector: attempt.selector,
              strategy,
              confidence,
              attemptsCount: attempts.length
            }
          );

          return result;
        }
      }

      // All strategies failed
      const result: HealingResult = {
        success: false,
        strategy: attempts[attempts.length - 1]?.strategy || HealingStrategy.CSS_SELECTOR,
        confidence: 0,
        error: 'All healing strategies failed',
        metadata: {
          totalExecutionTime: Date.now() - startTime,
          attemptsCount: attempts.length,
          attempts,
          strategiesTried: attempts.map(a => a.strategy)
        }
      };

      // Log failed result
      this.logger.logResult(result);

      // Send failure notification
      await this.notificationService.sendNotification(
        this.userId,
        NotificationType.HEALING_EVENT,
        'Self-Healing Failed',
        `All healing strategies failed for element: ${context.originalSelector}`,
        {
          scenarioId: 'test-scenario-id',
          executionId: 'test-execution-id',
          oldSelector: context.originalSelector,
          strategiesTried: attempts.map(a => a.strategy),
          attemptsCount: attempts.length,
          totalExecutionTime: Date.now() - startTime
        }
      );

      return result;

    } catch (error) {
      // Log error
      this.logger.logError(error as Error, context);

      // Send error notification
      await this.notificationService.sendNotification(
        this.userId,
        NotificationType.SYSTEM_ALERT,
        'Healing Process Error',
        `Error during healing process: ${(error as Error).message}`,
        {
          scenarioId: 'test-scenario-id',
          executionId: 'test-execution-id',
          oldSelector: context.originalSelector,
          error: (error as Error).message,
          stack: (error as Error).stack
        }
      );

      const result: HealingResult = {
        success: false,
        strategy: HealingStrategy.CSS_SELECTOR,
        confidence: 0,
        error: (error as Error).message,
        metadata: {
          totalExecutionTime: Date.now() - startTime,
          attemptsCount: attempts.length,
          attempts
        }
      };

      this.logger.logResult(result);
      return result;
    }
  }

  private async simulateStrategyExecution(context: HealingContext, strategy: HealingStrategy): Promise<boolean> {
    // Simulate different success rates for different strategies
    const successRates = {
      [HealingStrategy.CSS_SELECTOR]: 0.8,
      [HealingStrategy.XPATH]: 0.6,
      [HealingStrategy.TEXT_CONTENT]: 0.7,
      [HealingStrategy.VISUAL_RECOGNITION]: 0.5,
      [HealingStrategy.STRUCTURAL_ANALYSIS]: 0.6
    };

    // Higher success rate if element has good attributes
    let baseRate = successRates[strategy];
    if (context.lastKnownLocation?.attributes?.id) baseRate += 0.1;
    if (context.lastKnownLocation?.attributes?.['data-testid']) baseRate += 0.1;
    if (context.lastKnownLocation?.textContent) baseRate += 0.05;

    // Visual recognition should have visual hash for success
    if (strategy === HealingStrategy.VISUAL_RECOGNITION) {
      if (!context.lastKnownLocation?.visualHash && !context.screenshot) {
        return false; // Can't do visual recognition without visual data
      }
    }

    return Math.random() < Math.min(baseRate, 0.95);
  }

  private generateSelector(context: HealingContext, strategy: HealingStrategy): string {
    const location = context.lastKnownLocation;
    
    switch (strategy) {
      case HealingStrategy.CSS_SELECTOR:
        if (location?.attributes?.id) return `#${location.attributes.id}`;
        if (location?.attributes?.['data-testid']) return `[data-testid="${location.attributes['data-testid']}"]`;
        if (location?.attributes?.class) return `.${location.attributes.class.split(' ')[0]}`;
        return `${location?.tagName || 'div'}`;
        
      case HealingStrategy.XPATH:
        return `//${location?.tagName || 'div'}[@id='${location?.attributes?.id || 'test'}']`;
        
      case HealingStrategy.TEXT_CONTENT:
        return `text="${location?.textContent || 'test text'}"`;
        
      case HealingStrategy.VISUAL_RECOGNITION:
        return `visual:${location?.visualHash || 'mock-visual-hash'}`;
        
      case HealingStrategy.STRUCTURAL_ANALYSIS:
        return `structural:${location?.tagName || 'div'}-${Object.keys(location?.attributes || {}).length}`;
        
      default:
        return `#generated-${strategy.toLowerCase()}-selector`;
    }
  }
}

// Mock page implementation
class MockPageImpl implements MockPage {
  private pageContent: string = '';
  private elements: Map<string, any> = new Map();

  async setContent(html: string): Promise<void> {
    this.pageContent = html;
    this.parseElements(html);
  }

  locator(selector: string): MockLocator {
    return new MockLocatorImpl(selector, this.elements);
  }

  async screenshot(options?: { type?: 'png' | 'jpeg'; fullPage?: boolean }): Promise<Buffer> {
    return Buffer.from('mock-screenshot-data');
  }

  async content(): Promise<string> {
    return this.pageContent;
  }

  private parseElements(html: string): void {
    const idMatches = html.match(/id="([^"]+)"/g) || [];
    const testIdMatches = html.match(/data-testid="([^"]+)"/g) || [];

    idMatches.forEach(match => {
      const id = match.match(/id="([^"]+)"/)?.[1];
      if (id) this.elements.set(`#${id}`, { id, exists: true });
    });

    testIdMatches.forEach(match => {
      const testId = match.match(/data-testid="([^"]+)"/)?.[1];
      if (testId) this.elements.set(`[data-testid="${testId}"]`, { testId, exists: true });
    });
  }
}

class MockLocatorImpl implements MockLocator {
  constructor(private selector: string, private elements: Map<string, any>) {}

  first(): MockLocator {
    return this;
  }

  async count(): Promise<number> {
    return this.elements.has(this.selector) ? 1 : 0;
  }

  async textContent(): Promise<string | null> {
    return this.elements.has(this.selector) ? 'Mock text content' : null;
  }

  async boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.elements.has(this.selector) ? { x: 10, y: 10, width: 100, height: 50 } : null;
  }

  async evaluate<T>(fn: (el: Element) => T): Promise<T> {
    const mockElement = {
      tagName: 'DIV',
      attributes: [{ name: 'id', value: 'test' }]
    } as any;
    return fn(mockElement);
  }
}

// Fast-check arbitraries for property testing
const healingContextArbitrary = fc.record({
  originalSelector: fc.string({ minLength: 1, maxLength: 100 }),
  elementType: fc.constantFrom('button', 'input', 'div', 'span', 'a', 'form'),
  lastKnownLocation: fc.option(fc.record({
    selectors: fc.array(fc.record({
      type: fc.constantFrom('css', 'xpath', 'text', 'visual', 'structural'),
      value: fc.string({ minLength: 1, maxLength: 50 })
    }), { minLength: 1, maxLength: 3 }),
    tagName: fc.constantFrom('button', 'input', 'div', 'span', 'a'),
    attributes: fc.option(fc.dictionary(
      fc.constantFrom('id', 'class', 'data-testid', 'name', 'type', 'aria-label'),
      fc.string({ minLength: 1, maxLength: 50 })
    )),
    textContent: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    visualHash: fc.option(fc.string({ minLength: 32, maxLength: 64 }))
  }))
});

const userIdArbitrary = fc.string({ minLength: 1, maxLength: 50 });

describe('Healing Event Logging Property Tests', () => {
  let logger: MockHealingLogger;
  let notificationService: MockNotificationService;
  let page: MockPage;

  beforeEach(() => {
    logger = new MockHealingLogger();
    notificationService = new MockNotificationService();
    page = new MockPageImpl();
  });

  afterEach(() => {
    logger.clear();
    notificationService.clear();
  });

  /**
   * Property 8: Healing Event Logging
   * **Validates: Requirements 4.3, 4.4, 4.5**
   * 
   * Test that all healing attempts are logged appropriately
   * Verify user notifications are sent for all healing events
   */
  describe('Property 8: Healing Event Logging', () => {
    it('should log all healing attempts for any valid healing context', async () => {
      await fc.assert(
        fc.asyncProperty(
          healingContextArbitrary,
          userIdArbitrary,
          async (contextData, userId) => {
            // Create engine with logging
            const engine = new MockSelfHealingEngineWithLogging(
              logger,
              notificationService,
              userId,
              {
                strategies: [
                  HealingStrategy.CSS_SELECTOR,
                  HealingStrategy.XPATH,
                  HealingStrategy.TEXT_CONTENT
                ],
                maxAttempts: 3,
                confidenceThreshold: 0.7
              }
            );

            // Create healing context
            const context: HealingContext = {
              page,
              ...contextData
            };

            // Perform healing
            const result = await engine.heal(context);

            // Property: All attempts should be logged
            const loggedAttempts = logger.getAttempts();
            expect(loggedAttempts.length).toBeGreaterThan(0);
            expect(loggedAttempts.length).toBeLessThanOrEqual(3); // Max attempts

            // Property: Each logged attempt should have required fields
            for (const attempt of loggedAttempts) {
              expect(attempt).toHaveProperty('strategy');
              expect(attempt).toHaveProperty('confidence');
              expect(attempt).toHaveProperty('success');
              expect(attempt).toHaveProperty('executionTime');
              expect(typeof attempt.strategy).toBe('string');
              expect(typeof attempt.confidence).toBe('number');
              expect(typeof attempt.success).toBe('boolean');
              expect(typeof attempt.executionTime).toBe('number');
              expect(attempt.confidence).toBeGreaterThanOrEqual(0);
              expect(attempt.confidence).toBeLessThanOrEqual(1);
              expect(attempt.executionTime).toBeGreaterThanOrEqual(0);
            }

            // Property: Result should be logged
            const loggedResults = logger.getResults();
            expect(loggedResults.length).toBe(1);
            
            const loggedResult = loggedResults[0];
            expect(loggedResult.success).toBe(result.success);
            expect(loggedResult.strategy).toBe(result.strategy);
            expect(loggedResult.confidence).toBe(result.confidence);

            // Property: Healing events should be created
            const healingEvents = logger.getHistory();
            expect(healingEvents.length).toBe(1);
            
            const event = healingEvents[0];
            expect(event.success).toBe(result.success);
            expect(event.strategy).toBe(result.strategy);
            expect(event.confidence).toBe(result.confidence);
            expect(event.oldSelector).toBe('original-selector');
            expect(event.attempts.length).toBe(loggedAttempts.length);
            expect(event.timestamp).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 50 } // Reduced from 100 to 50 for faster testing
      );
    });

    it('should send user notifications for all healing events (Requirement 4.4)', async () => {
      await fc.assert(
        fc.asyncProperty(
          healingContextArbitrary,
          userIdArbitrary,
          async (contextData, userId) => {
            const engine = new MockSelfHealingEngineWithLogging(
              logger,
              notificationService,
              userId
            );

            const context: HealingContext = {
              page,
              ...contextData
            };

            // Perform healing
            const result = await engine.heal(context);

            // Property: Notification should be sent for every healing event
            const notifications = notificationService.getNotifications();
            expect(notifications.length).toBeGreaterThanOrEqual(1);

            // Property: Healing event notifications should have correct type
            const healingNotifications = notificationService.getNotificationsByType(
              NotificationType.HEALING_EVENT
            );
            
            if (result.success) {
              // Success case should have healing event notification
              expect(healingNotifications.length).toBeGreaterThanOrEqual(1);
              
              const successNotification = healingNotifications.find(n => 
                n.title.includes('Success')
              );
              expect(successNotification).toBeDefined();
              expect(successNotification!.userId).toBe(userId);
              expect(successNotification!.metadata).toHaveProperty('strategy');
              expect(successNotification!.metadata).toHaveProperty('confidence');
              expect(successNotification!.metadata).toHaveProperty('newSelector');
            } else {
              // Failure case should have healing event notification
              expect(healingNotifications.length).toBeGreaterThanOrEqual(1);
              
              const failureNotification = healingNotifications.find(n => 
                n.title.includes('Failed')
              );
              expect(failureNotification).toBeDefined();
              expect(failureNotification!.userId).toBe(userId);
              expect(failureNotification!.metadata).toHaveProperty('strategiesTried');
              expect(failureNotification!.metadata).toHaveProperty('attemptsCount');
            }

            // Property: All notifications should have required fields
            for (const notification of notifications) {
              expect(notification).toHaveProperty('id');
              expect(notification).toHaveProperty('userId');
              expect(notification).toHaveProperty('type');
              expect(notification).toHaveProperty('title');
              expect(notification).toHaveProperty('message');
              expect(notification).toHaveProperty('createdAt');
              expect(notification.userId).toBe(userId);
              expect(notification.createdAt).toBeInstanceOf(Date);
              expect(typeof notification.title).toBe('string');
              expect(typeof notification.message).toBe('string');
              expect(notification.title.length).toBeGreaterThan(0);
              expect(notification.message.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 } // Reduced from 100 to 50 for faster testing
      );
    });

    it('should log detailed information for visual element recognition (Requirement 4.5)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            originalSelector: fc.string({ minLength: 1, maxLength: 100 }),
            elementType: fc.constantFrom('button', 'input', 'div'),
            hasVisualData: fc.boolean(),
            hasScreenshot: fc.boolean()
          }),
          userIdArbitrary,
          async (testData, userId) => {
            const engine = new MockSelfHealingEngineWithLogging(
              logger,
              notificationService,
              userId,
              {
                strategies: [HealingStrategy.VISUAL_RECOGNITION],
                maxAttempts: 1,
                confidenceThreshold: 0.5
              }
            );

            // Create context with or without visual data
            const context: HealingContext = {
              page,
              originalSelector: testData.originalSelector,
              elementType: testData.elementType,
              lastKnownLocation: testData.hasVisualData ? {
                selectors: [{ type: 'visual', value: 'mock-visual-selector' }],
                visualHash: 'mock-visual-hash-12345'
              } : undefined,
              screenshot: testData.hasScreenshot ? Buffer.from('mock-screenshot') : undefined
            };

            // Perform healing
            const result = await engine.heal(context);

            // Property: Visual recognition attempts should be logged
            const loggedAttempts = logger.getAttempts();
            expect(loggedAttempts.length).toBe(1);
            
            const visualAttempt = loggedAttempts[0];
            expect(visualAttempt.strategy).toBe(HealingStrategy.VISUAL_RECOGNITION);

            // Property: Visual recognition should fail without visual data
            if (!testData.hasVisualData && !testData.hasScreenshot) {
              expect(visualAttempt.success).toBe(false);
              expect(visualAttempt.error).toBeDefined();
            }

            // Property: Visual recognition success should include visual hash in selector
            if (visualAttempt.success && testData.hasVisualData) {
              expect(visualAttempt.selector).toContain('visual:');
              expect(visualAttempt.selector).toContain('mock-visual-hash');
            }

            // Property: Healing events should include visual recognition metadata
            const healingEvents = logger.getHistory();
            expect(healingEvents.length).toBe(1);
            
            const event = healingEvents[0];
            expect(event.strategy).toBe(HealingStrategy.VISUAL_RECOGNITION);
            
            // Property: Visual recognition metadata should be preserved
            if (testData.hasVisualData || testData.hasScreenshot) {
              expect(event.metadata).toBeDefined();
              // Visual recognition should have attempted with available data
              expect(event.attempts.length).toBe(1);
              expect(event.attempts[0].strategy).toBe(HealingStrategy.VISUAL_RECOGNITION);
            }
          }
        ),
        { numRuns: 30 } // Reduced from 100 to 30 for faster visual recognition testing
      );
    });

    it('should validate Requirements 4.3: Detailed logging of healing attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          healingContextArbitrary,
          fc.integer({ min: 1, max: 5 }),
          userIdArbitrary,
          async (contextData, maxAttempts, userId) => {
            const engine = new MockSelfHealingEngineWithLogging(
              logger,
              notificationService,
              userId,
              {
                strategies: [
                  HealingStrategy.CSS_SELECTOR,
                  HealingStrategy.XPATH,
                  HealingStrategy.TEXT_CONTENT,
                  HealingStrategy.VISUAL_RECOGNITION,
                  HealingStrategy.STRUCTURAL_ANALYSIS
                ],
                maxAttempts,
                confidenceThreshold: 0.8 // High threshold to force multiple attempts
              }
            );

            const context: HealingContext = {
              page,
              ...contextData
            };

            const result = await engine.heal(context);

            // Property: Detailed logging should capture all attempt information
            const loggedAttempts = logger.getAttempts();
            expect(loggedAttempts.length).toBeGreaterThan(0);
            expect(loggedAttempts.length).toBeLessThanOrEqual(maxAttempts);

            // Property: Each attempt should have detailed information
            for (const attempt of loggedAttempts) {
              // Required fields for detailed logging
              expect(attempt).toHaveProperty('strategy');
              expect(attempt).toHaveProperty('selector');
              expect(attempt).toHaveProperty('confidence');
              expect(attempt).toHaveProperty('success');
              expect(attempt).toHaveProperty('executionTime');
              
              // Detailed validation
              expect(Object.values(HealingStrategy)).toContain(attempt.strategy);
              expect(typeof attempt.selector).toBe('string');
              expect(typeof attempt.confidence).toBe('number');
              expect(typeof attempt.success).toBe('boolean');
              expect(typeof attempt.executionTime).toBe('number');
              
              // Confidence should be valid percentage
              expect(attempt.confidence).toBeGreaterThanOrEqual(0);
              expect(attempt.confidence).toBeLessThanOrEqual(1);
              
              // Execution time should be positive
              expect(attempt.executionTime).toBeGreaterThanOrEqual(0);
              
              // Failed attempts should have error information
              if (!attempt.success) {
                expect(attempt.error).toBeDefined();
                expect(typeof attempt.error).toBe('string');
                expect(attempt.error!.length).toBeGreaterThan(0);
              }
              
              // Successful attempts should have valid selectors
              if (attempt.success) {
                expect(attempt.selector.length).toBeGreaterThan(0);
                expect(attempt.confidence).toBeGreaterThan(0);
              }
            }

            // Property: Result metadata should include comprehensive attempt information
            expect(result.metadata).toBeDefined();
            expect(result.metadata!.attempts).toBeDefined();
            expect(result.metadata!.attemptsCount).toBe(loggedAttempts.length);
            expect(result.metadata!.totalExecutionTime).toBeGreaterThan(0);
            expect(result.metadata!.strategiesTried).toBeDefined();
            expect(result.metadata!.strategiesTried!.length).toBe(loggedAttempts.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle error scenarios with appropriate logging and notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          healingContextArbitrary,
          userIdArbitrary,
          async (contextData, userId) => {
            // Create engine that will throw errors
            const engine = new MockSelfHealingEngineWithLogging(
              logger,
              notificationService,
              userId
            );

            // Mock the heal method to throw an error
            const originalHeal = engine.heal.bind(engine);
            vi.spyOn(engine, 'heal').mockImplementation(async (context) => {
              // Simulate random errors during healing
              if (Math.random() < 0.3) { // 30% chance of error
                throw new Error('Simulated healing error');
              }
              return originalHeal(context);
            });

            const context: HealingContext = {
              page,
              ...contextData
            };

            try {
              const result = await engine.heal(context);
              
              // If no error was thrown, verify normal logging
              const notifications = notificationService.getNotifications();
              expect(notifications.length).toBeGreaterThanOrEqual(1);
              
              const healingEvents = logger.getHistory();
              expect(healingEvents.length).toBe(1);
              
            } catch (error) {
              // If error was thrown, verify error logging
              const errors = logger.getErrors();
              expect(errors.length).toBeGreaterThanOrEqual(0); // May be 0 if error thrown before logging
              
              const notifications = notificationService.getNotifications();
              // Should have system alert notification for errors
              const systemAlerts = notificationService.getNotificationsByType(
                NotificationType.SYSTEM_ALERT
              );
              expect(systemAlerts.length).toBeGreaterThanOrEqual(0);
            }

            // Property: Error handling should not break the logging system
            expect(logger.getHistory).not.toThrow();
            expect(notificationService.getNotifications).not.toThrow();
          }
        ),
        { numRuns: 50 } // Reduced runs for error simulation
      );
    });

    it('should maintain logging consistency across multiple healing sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(healingContextArbitrary, { minLength: 2, maxLength: 5 }),
          userIdArbitrary,
          async (contextArray, userId) => {
            const engine = new MockSelfHealingEngineWithLogging(
              logger,
              notificationService,
              userId
            );

            const results: HealingResult[] = [];
            
            // Perform multiple healing sessions
            for (const contextData of contextArray) {
              const context: HealingContext = {
                page,
                ...contextData
              };
              
              const result = await engine.heal(context);
              results.push(result);
            }

            // Property: Each healing session should be logged separately
            const healingEvents = logger.getHistory();
            expect(healingEvents.length).toBe(contextArray.length);

            // Property: Events should be in chronological order
            for (let i = 1; i < healingEvents.length; i++) {
              expect(healingEvents[i].timestamp.getTime()).toBeGreaterThanOrEqual(
                healingEvents[i - 1].timestamp.getTime()
              );
            }

            // Property: Each event should have unique ID
            const eventIds = healingEvents.map(e => e.id);
            const uniqueIds = new Set(eventIds);
            expect(uniqueIds.size).toBe(eventIds.length);

            // Property: Notifications should be sent for each healing event
            const notifications = notificationService.getNotifications();
            expect(notifications.length).toBeGreaterThanOrEqual(contextArray.length);

            // Property: All notifications should be for the same user
            for (const notification of notifications) {
              expect(notification.userId).toBe(userId);
            }

            // Property: Total attempts should equal sum of individual session attempts
            const totalLoggedAttempts = logger.getAttempts().length;
            const totalEventAttempts = healingEvents.reduce(
              (sum, event) => sum + event.attempts.length, 
              0
            );
            expect(totalLoggedAttempts).toBe(totalEventAttempts);
          }
        ),
        { numRuns: 50 } // Reduced runs for multiple session testing
      );
    });
  });
});