import { PricingTier } from './pricing';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  PAUSED = 'paused',
}

export interface Subscription {
  id: string;
  userId: string;
  tier: PricingTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  subscriptionId: string;
  testsExecuted: number;
  period: {
    start: Date;
    end: Date;
  };
}

export class SubscriptionManager {
  /**
   * Create new subscription
   */
  async createSubscription(userId: string, tier: PricingTier, trialDays?: number): Promise<Subscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription: Subscription = {
      id: this.generateId(),
      userId,
      tier,
      status: trialDays ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      trialEnd: trialDays ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    return subscription;
  }

  /**
   * Upgrade subscription
   */
  async upgradeSubscription(subscriptionId: string, newTier: PricingTier): Promise<Subscription> {
    // In real implementation, this would update the database
    const subscription = await this.getSubscription(subscriptionId);
    
    subscription.tier = newTier;
    subscription.updatedAt = new Date();

    return subscription;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    if (immediate) {
      subscription.status = SubscriptionStatus.CANCELED;
      subscription.currentPeriodEnd = new Date();
    } else {
      subscription.cancelAtPeriodEnd = true;
    }

    subscription.updatedAt = new Date();
    return subscription;
  }

  /**
   * Track usage
   */
  async trackUsage(subscriptionId: string, testsExecuted: number): Promise<UsageRecord> {
    const subscription = await this.getSubscription(subscriptionId);

    const usage: UsageRecord = {
      subscriptionId,
      testsExecuted,
      period: {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd,
      },
    };

    return usage;
  }

  /**
   * Check if subscription is active
   */
  isActive(subscription: Subscription): boolean {
    return subscription.status === SubscriptionStatus.ACTIVE || 
           subscription.status === SubscriptionStatus.TRIALING;
  }

  /**
   * Check if trial is active
   */
  isTrialing(subscription: Subscription): boolean {
    if (subscription.status !== SubscriptionStatus.TRIALING || !subscription.trialEnd) {
      return false;
    }

    return new Date() < subscription.trialEnd;
  }

  private async getSubscription(id: string): Promise<Subscription> {
    // Mock implementation
    return {
      id,
      userId: 'user-123',
      tier: PricingTier.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private generateId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
