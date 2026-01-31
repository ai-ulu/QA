/**
 * Self-Healing Engine
 * Main orchestrator for element location strategies and healing mechanisms
 * 
 * This engine coordinates multiple healing strategies to automatically update
 * test selectors when UI elements change, providing robust test maintenance.
 * 
 * Validates Requirements:
 * - 4.1: CSS selector alternatives and fallback mechanisms
 * - 4.2: XPath fallback and text content matching
 * - 4.5: Visual element recognition capabilities
 */

import { Page } from 'playwright';
import {
  HealingContext,
  HealingResult,
  HealingConfig,
  HealingAttempt,
  HealingStrategy,
  HealingEvent,
  HealingLogger,
  HealingMetrics,
  ElementLocation,
  HealingError
} from './types';

import { CSSelectorStrategy } from './strategies/css-selector';
import { XPathSelectorStrategy } from './strategies/xpath';
import { TextContentMatchingStrategy } from './strategies/text-content';
import { VisualElementRecognition } from './strategies/visual-recognition';
import { StructuralElementAnalysis } from './strategies/structural-analysis';

export class SelfHealingEngine {
  private config: HealingConfig;
  private strategies: Map<HealingStrategy, any>;
  private logger?: HealingLogger;
  private metrics: HealingMetrics;

  constructor(config?: Partial<HealingConfig>, logger?: HealingLogger) {
    this.config = {
      strategies: [
        HealingStrategy.CSS_SELECTOR,
        HealingStrategy.XPATH,
        HealingStrategy.TEXT_CONTENT,
        HealingStrategy.VISUAL_RECOGNITION,
        HealingStrategy.STRUCTURAL_ANALYSIS
      ],
      maxAttempts: 5,
      confidenceThreshold: 0.7,
      timeout: 30000, // 30 seconds
      visualSimilarityThreshold: 0.8,
      textSimilarityThreshold: 0.6,
      enableLogging: true,
      enableScreenshots: true,
      enableDomSnapshots: true,
      ...config
    };

    this.logger = logger;
    this.strategies = new Map();
    this.metrics = {
      totalAttempts: 0,
      successfulHealing: 0,
      failedHealing: 0,
      averageConfidence: 0,
      strategySuccessRates: {} as Record<HealingStrategy, number>,
      averageHealingTime: 0
    };

    this.initializeStrategies();
  }

  /**
   * Initialize all healing strategies
   */
  private initializeStrategies(): void {
    // Initialize CSS selector strategy
    if (this.config.strategies.includes(HealingStrategy.CSS_SELECTOR)) {
      this.strategies.set(HealingStrategy.CSS_SELECTOR, new CSSelectorStrategy());
    }

    // Initialize XPath strategy
    if (this.config.strategies.includes(HealingStrategy.XPATH)) {
      this.strategies.set(HealingStrategy.XPATH, new XPathSelectorStrategy());
    }

    // Initialize text content strategy
    if (this.config.strategies.includes(HealingStrategy.TEXT_CONTENT)) {
      this.strategies.set(HealingStrategy.TEXT_CONTENT, new TextContentMatchingStrategy({
        fuzzyThreshold: this.config.textSimilarityThreshold,
        caseSensitive: false
      }));
    }

    // Initialize visual recognition strategy
    if (this.config.strategies.includes(HealingStrategy.VISUAL_RECOGNITION)) {
      this.strategies.set(HealingStrategy.VISUAL_RECOGNITION, new VisualElementRecognition({
        similarityThreshold: this.config.visualSimilarityThreshold,
        templateMatchingMethod: 'CCOEFF',
        enableEdgeDetection: true
      }));
    }

    // Initialize structural analysis strategy
    if (this.config.strategies.includes(HealingStrategy.STRUCTURAL_ANALYSIS)) {
      this.strategies.set(HealingStrategy.STRUCTURAL_ANALYSIS, new StructuralElementAnalysis({
        includeStyles: false,
        maxParentDepth: 5,
        weightAttributes: {
          'id': 1.0,
          'data-testid': 0.95,
          'data-test': 0.95,
          'class': 0.8,
          'name': 0.85,
          'type': 0.7,
          'role': 0.75,
          'aria-label': 0.75
        }
      }));
    }

    // Initialize strategy success rates
    for (const strategy of this.config.strategies) {
      this.metrics.strategySuccessRates[strategy] = 0;
    }
  }

  /**
   * Main healing method - attempts to heal a broken selector
   */
  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    const attempts: HealingAttempt[] = [];
    
    try {
      // Validate input
      if (!context.page || !context.originalSelector) {
        throw new HealingError('Invalid healing context', HealingStrategy.CSS_SELECTOR, context.originalSelector || '');
      }

      // Capture initial state if enabled
      if (this.config.enableScreenshots && !context.screenshot) {
        try {
          context.screenshot = await context.page.screenshot({ type: 'png', fullPage: true });
        } catch (error) {
          console.warn('Failed to capture screenshot for healing context:', error);
        }
      }

      if (this.config.enableDomSnapshots && !context.domSnapshot) {
        try {
          context.domSnapshot = await context.page.content();
        } catch (error) {
          console.warn('Failed to capture DOM snapshot for healing context:', error);
        }
      }

      // Try each strategy in order of priority
      for (const strategyType of this.config.strategies) {
        if (attempts.length >= this.config.maxAttempts) {
          break;
        }

        const strategy = this.strategies.get(strategyType);
        if (!strategy) {
          console.warn(`Strategy ${strategyType} not initialized`);
          continue;
        }

        const attemptStartTime = Date.now();
        
        try {
          // Set timeout for strategy execution
          const result = await Promise.race([
            strategy.heal(context),
            this.createTimeoutPromise(this.config.timeout)
          ]);

          const executionTime = Date.now() - attemptStartTime;
          
          const attempt: HealingAttempt = {
            strategy: strategyType,
            selector: result.newSelector || '',
            confidence: result.confidence,
            success: result.success,
            error: result.error,
            executionTime
          };

          attempts.push(attempt);
          
          if (this.logger) {
            this.logger.logAttempt(attempt);
          }

          // If healing was successful and meets confidence threshold
          if (result.success && result.confidence >= this.config.confidenceThreshold) {
            const finalResult: HealingResult = {
              ...result,
              metadata: {
                ...result.metadata,
                totalExecutionTime: Date.now() - startTime,
                attemptsCount: attempts.length,
                attempts
              }
            };

            // Update metrics
            this.updateMetrics(attempts, true, result.confidence, Date.now() - startTime);
            
            // Log successful healing
            if (this.logger) {
              this.logger.logResult(finalResult);
            }

            return finalResult;
          }

          // If strategy found alternatives but didn't meet confidence threshold, continue
          if (result.alternatives && result.alternatives.length > 0) {
            // Store alternatives for potential use by other strategies
            if (!context.metadata) {
              context.metadata = {};
            }
            context.metadata[`${strategyType}_alternatives`] = result.alternatives;
          }

        } catch (error) {
          const executionTime = Date.now() - attemptStartTime;
          
          const attempt: HealingAttempt = {
            strategy: strategyType,
            selector: '',
            confidence: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            executionTime
          };

          attempts.push(attempt);
          
          if (this.logger) {
            this.logger.logAttempt(attempt);
            this.logger.logError(error instanceof Error ? error : new Error('Unknown error'), context);
          }

          console.warn(`Strategy ${strategyType} failed:`, error);
        }
      }

      // All strategies failed
      const finalResult: HealingResult = {
        success: false,
        strategy: attempts.length > 0 ? attempts[attempts.length - 1].strategy : HealingStrategy.CSS_SELECTOR,
        confidence: 0,
        error: 'All healing strategies failed',
        metadata: {
          totalExecutionTime: Date.now() - startTime,
          attemptsCount: attempts.length,
          attempts,
          strategiesTried: attempts.map(a => a.strategy)
        }
      };

      // Update metrics
      this.updateMetrics(attempts, false, 0, Date.now() - startTime);
      
      // Log failed healing
      if (this.logger) {
        this.logger.logResult(finalResult);
      }

      return finalResult;

    } catch (error) {
      const finalResult: HealingResult = {
        success: false,
        strategy: HealingStrategy.CSS_SELECTOR,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error during healing',
        metadata: {
          totalExecutionTime: Date.now() - startTime,
          attemptsCount: attempts.length,
          attempts
        }
      };

      // Update metrics
      this.updateMetrics(attempts, false, 0, Date.now() - startTime);
      
      if (this.logger) {
        this.logger.logError(error instanceof Error ? error : new Error('Unknown error'), context);
        this.logger.logResult(finalResult);
      }

      return finalResult;
    }
  }

  /**
   * Validate if a selector works on the page
   */
  async validateSelector(page: Page, selector: string): Promise<boolean> {
    try {
      const element = page.locator(selector).first();
      const count = await element.count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract element location information for caching
   */
  async extractElementLocation(page: Page, selector: string): Promise<ElementLocation | null> {
    try {
      const element = page.locator(selector).first();
      const count = await element.count();
      
      if (count === 0) {
        return null;
      }

      const [tagName, attributes, textContent, boundingBox] = await Promise.all([
        element.evaluate(el => el.tagName.toLowerCase()),
        element.evaluate(el => {
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        }),
        element.textContent(),
        element.boundingBox()
      ]);

      // Capture element screenshot if visual recognition is enabled
      let visualHash: string | undefined;
      if (this.config.strategies.includes(HealingStrategy.VISUAL_RECOGNITION)) {
        try {
          const visualStrategy = this.strategies.get(HealingStrategy.VISUAL_RECOGNITION) as VisualElementRecognition;
          if (visualStrategy) {
            const screenshot = await visualStrategy.captureElementImage(page, selector);
            const features = await visualStrategy.extractVisualFeatures(screenshot);
            visualHash = features.hash;
          }
        } catch (error) {
          console.warn('Failed to extract visual features:', error);
        }
      }

      return {
        selectors: [{ type: 'css', value: selector }],
        tagName,
        attributes,
        textContent: textContent || undefined,
        boundingBox: boundingBox || undefined,
        visualHash
      };
    } catch (error) {
      console.warn('Failed to extract element location:', error);
      return null;
    }
  }

  /**
   * Get current healing metrics
   */
  getMetrics(): HealingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset healing metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulHealing: 0,
      failedHealing: 0,
      averageConfidence: 0,
      strategySuccessRates: {} as Record<HealingStrategy, number>,
      averageHealingTime: 0
    };

    // Reset strategy success rates
    for (const strategy of this.config.strategies) {
      this.metrics.strategySuccessRates[strategy] = 0;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeStrategies(); // Reinitialize strategies with new config
  }

  /**
   * Create a timeout promise
   */
  private createTimeoutPromise(timeout: number): Promise<HealingResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Healing strategy timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Update healing metrics
   */
  private updateMetrics(
    attempts: HealingAttempt[], 
    success: boolean, 
    confidence: number, 
    totalTime: number
  ): void {
    this.metrics.totalAttempts += attempts.length;
    
    if (success) {
      this.metrics.successfulHealing++;
    } else {
      this.metrics.failedHealing++;
    }

    // Update average confidence
    const totalHealing = this.metrics.successfulHealing + this.metrics.failedHealing;
    this.metrics.averageConfidence = (
      (this.metrics.averageConfidence * (totalHealing - 1)) + confidence
    ) / totalHealing;

    // Update average healing time
    this.metrics.averageHealingTime = (
      (this.metrics.averageHealingTime * (totalHealing - 1)) + totalTime
    ) / totalHealing;

    // Update strategy success rates
    for (const attempt of attempts) {
      const currentRate = this.metrics.strategySuccessRates[attempt.strategy] || 0;
      const currentCount = Math.floor(currentRate * this.metrics.totalAttempts / attempts.length) || 1;
      
      if (attempt.success) {
        this.metrics.strategySuccessRates[attempt.strategy] = 
          (currentRate * currentCount + 1) / (currentCount + 1);
      } else {
        this.metrics.strategySuccessRates[attempt.strategy] = 
          (currentRate * currentCount) / (currentCount + 1);
      }
    }
  }
}