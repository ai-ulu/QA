export interface AnalyticsEvent {
  id: string;
  userId: string;
  event: string;
  properties: Record<string, any>;
  timestamp: Date;
}

export interface UserCohort {
  cohortId: string;
  name: string;
  userIds: string[];
  createdAt: Date;
}

export interface ConversionFunnel {
  name: string;
  steps: FunnelStep[];
}

export interface FunnelStep {
  name: string;
  event: string;
  userCount: number;
  conversionRate: number;
}

export class AnalyticsTracker {
  /**
   * Track event
   */
  async track(userId: string, event: string, properties: Record<string, any> = {}): Promise<void> {
    const analyticsEvent: AnalyticsEvent = {
      id: this.generateId(),
      userId,
      event,
      properties: {
        ...properties,
        // Add default properties
        platform: 'web',
        version: '1.0.0',
      },
      timestamp: new Date(),
    };

    // In real implementation, send to analytics service (PostHog, Mixpanel, etc.)
    console.log('Analytics event:', analyticsEvent);
  }

  /**
   * Track page view
   */
  async trackPageView(userId: string, page: string): Promise<void> {
    await this.track(userId, 'page_view', { page });
  }

  /**
   * Track conversion
   */
  async trackConversion(userId: string, from: string, to: string): Promise<void> {
    await this.track(userId, 'conversion', { from, to });
  }

  /**
   * Create cohort
   */
  async createCohort(name: string, userIds: string[]): Promise<UserCohort> {
    return {
      cohortId: this.generateId(),
      name,
      userIds,
      createdAt: new Date(),
    };
  }

  /**
   * Analyze conversion funnel
   */
  async analyzeFunnel(funnelName: string, events: string[]): Promise<ConversionFunnel> {
    // Mock implementation - in real app, query analytics database
    const steps: FunnelStep[] = events.map((event, index) => ({
      name: event,
      event,
      userCount: 1000 - index * 200, // Mock data
      conversionRate: index === 0 ? 100 : ((1000 - index * 200) / 1000) * 100,
    }));

    return {
      name: funnelName,
      steps,
    };
  }

  /**
   * Calculate churn rate
   */
  async calculateChurnRate(cohortId: string, periodDays: number): Promise<number> {
    // Mock implementation
    const totalUsers = 100;
    const churnedUsers = 15;
    return (churnedUsers / totalUsers) * 100;
  }

  /**
   * Track revenue attribution
   */
  async trackRevenue(userId: string, amount: number, source: string): Promise<void> {
    await this.track(userId, 'revenue', {
      amount,
      source,
      currency: 'USD',
    });
  }

  private generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class ABTestManager {
  /**
   * Create A/B test
   */
  async createTest(name: string, variants: string[]): Promise<string> {
    return `test_${name}_${Date.now()}`;
  }

  /**
   * Assign user to variant
   */
  async assignVariant(testId: string, userId: string): Promise<string> {
    // Simple hash-based assignment for consistency
    const hash = this.hashCode(userId + testId);
    const variants = ['A', 'B'];
    return variants[Math.abs(hash) % variants.length];
  }

  /**
   * Track test result
   */
  async trackResult(testId: string, userId: string, variant: string, converted: boolean): Promise<void> {
    // In real implementation, store in database
    console.log(`A/B Test: ${testId}, User: ${userId}, Variant: ${variant}, Converted: ${converted}`);
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }
}
