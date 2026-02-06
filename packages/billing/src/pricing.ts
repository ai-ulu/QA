export enum PricingTier {
  FREE = 'free',
  PRO = 'pro',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

export interface PricingPlan {
  tier: PricingTier;
  name: string;
  price: number; // Monthly price in USD
  annualPrice: number; // Annual price with 20% discount
  features: string[];
  limits: {
    testsPerMonth: number;
    users: number;
    projects: number;
    parallelExecutions: number;
    retentionDays: number;
  };
}

export const PRICING_PLANS: Record<PricingTier, PricingPlan> = {
  [PricingTier.FREE]: {
    tier: PricingTier.FREE,
    name: 'Free',
    price: 0,
    annualPrice: 0,
    features: [
      'Open source core engine',
      'Unlimited local tests',
      'Community support',
      'Basic reporting',
      'GitHub integration',
    ],
    limits: {
      testsPerMonth: -1, // Unlimited local
      users: 1,
      projects: 3,
      parallelExecutions: 1,
      retentionDays: 7,
    },
  },
  [PricingTier.PRO]: {
    tier: PricingTier.PRO,
    name: 'Pro',
    price: 29,
    annualPrice: 278, // 20% discount
    features: [
      'All Free features',
      'Cloud execution',
      '1,000 tests/month',
      'Advanced reporting',
      'Email support',
      'Slack/Discord integration',
      'Visual regression testing',
      'Self-healing tests',
    ],
    limits: {
      testsPerMonth: 1000,
      users: 1,
      projects: 10,
      parallelExecutions: 3,
      retentionDays: 30,
    },
  },
  [PricingTier.TEAM]: {
    tier: PricingTier.TEAM,
    name: 'Team',
    price: 99,
    annualPrice: 950, // 20% discount
    features: [
      'All Pro features',
      '10,000 tests/month',
      'Team collaboration',
      'Shared test library',
      'Role-based access control',
      'Priority support',
      'Jira/Linear integration',
      'Custom branding',
    ],
    limits: {
      testsPerMonth: 10000,
      users: 10,
      projects: 50,
      parallelExecutions: 10,
      retentionDays: 90,
    },
  },
  [PricingTier.ENTERPRISE]: {
    tier: PricingTier.ENTERPRISE,
    name: 'Enterprise',
    price: -1, // Custom pricing
    annualPrice: -1,
    features: [
      'All Team features',
      'Unlimited tests',
      'Self-hosted deployment',
      'SSO/SAML authentication',
      'Custom SLA',
      'Dedicated support',
      'On-premise installation',
      'Air-gapped support',
      'Audit logging',
      'White-labeling',
    ],
    limits: {
      testsPerMonth: -1, // Unlimited
      users: -1, // Unlimited
      projects: -1, // Unlimited
      parallelExecutions: -1, // Unlimited
      retentionDays: 365,
    },
  },
};

export class PricingCalculator {
  /**
   * Calculate monthly cost based on usage
   */
  static calculateUsageCost(testsExecuted: number, tier: PricingTier): number {
    const plan = PRICING_PLANS[tier];
    
    if (tier === PricingTier.FREE) {
      return 0;
    }

    if (tier === PricingTier.ENTERPRISE) {
      return -1; // Custom pricing
    }

    // Base price
    let cost = plan.price;

    // Overage charges (if exceeded monthly limit)
    if (testsExecuted > plan.limits.testsPerMonth) {
      const overage = testsExecuted - plan.limits.testsPerMonth;
      const overageRate = tier === PricingTier.PRO ? 0.05 : 0.03; // $0.05 or $0.03 per test
      cost += overage * overageRate;
    }

    return cost;
  }

  /**
   * Calculate annual savings
   */
  static calculateAnnualSavings(tier: PricingTier): number {
    const plan = PRICING_PLANS[tier];
    if (plan.price === 0 || plan.price === -1) {
      return 0;
    }

    const monthlyTotal = plan.price * 12;
    const savings = monthlyTotal - plan.annualPrice;
    return savings;
  }

  /**
   * Check if user can upgrade to tier
   */
  static canUpgrade(currentTier: PricingTier, targetTier: PricingTier): boolean {
    const tiers = [PricingTier.FREE, PricingTier.PRO, PricingTier.TEAM, PricingTier.ENTERPRISE];
    const currentIndex = tiers.indexOf(currentTier);
    const targetIndex = tiers.indexOf(targetTier);
    return targetIndex > currentIndex;
  }

  /**
   * Check if usage exceeds tier limits
   */
  static isOverLimit(usage: { tests: number; users: number; projects: number }, tier: PricingTier): boolean {
    const plan = PRICING_PLANS[tier];
    
    if (plan.limits.testsPerMonth !== -1 && usage.tests > plan.limits.testsPerMonth) {
      return true;
    }
    
    if (plan.limits.users !== -1 && usage.users > plan.limits.users) {
      return true;
    }
    
    if (plan.limits.projects !== -1 && usage.projects > plan.limits.projects) {
      return true;
    }

    return false;
  }
}
