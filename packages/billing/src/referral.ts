export interface ReferralCode {
  code: string;
  userId: string;
  uses: number;
  maxUses: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  code: string;
  status: 'pending' | 'completed' | 'paid';
  commission: number;
  createdAt: Date;
  completedAt?: Date;
}

export interface AffiliateStats {
  userId: string;
  totalReferrals: number;
  activeReferrals: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
}

export class ReferralManager {
  private static COMMISSION_RATES = {
    tier1: 0.10, // 10% for 1-10 referrals
    tier2: 0.15, // 15% for 11-50 referrals
    tier3: 0.20, // 20% for 50+ referrals
  };

  /**
   * Generate referral code
   */
  async generateCode(userId: string, maxUses: number = -1): Promise<ReferralCode> {
    const code = this.createCode(userId);

    return {
      code,
      userId,
      uses: 0,
      maxUses,
      createdAt: new Date(),
    };
  }

  /**
   * Apply referral code
   */
  async applyCode(code: string, newUserId: string): Promise<Referral> {
    // Validate code
    const referralCode = await this.getCode(code);
    
    if (!referralCode) {
      throw new Error('Invalid referral code');
    }

    if (referralCode.maxUses !== -1 && referralCode.uses >= referralCode.maxUses) {
      throw new Error('Referral code has reached maximum uses');
    }

    if (referralCode.expiresAt && new Date() > referralCode.expiresAt) {
      throw new Error('Referral code has expired');
    }

    // Create referral
    const referral: Referral = {
      id: this.generateId(),
      referrerId: referralCode.userId,
      referredUserId: newUserId,
      code,
      status: 'pending',
      commission: 0,
      createdAt: new Date(),
    };

    return referral;
  }

  /**
   * Complete referral (when referred user subscribes)
   */
  async completeReferral(referralId: string, subscriptionAmount: number): Promise<Referral> {
    const referral = await this.getReferral(referralId);
    
    // Calculate commission based on tier
    const stats = await this.getAffiliateStats(referral.referrerId);
    const commissionRate = this.getCommissionRate(stats.totalReferrals);
    const commission = subscriptionAmount * commissionRate;

    referral.status = 'completed';
    referral.commission = commission;
    referral.completedAt = new Date();

    return referral;
  }

  /**
   * Process payout
   */
  async processPayout(userId: string): Promise<number> {
    const stats = await this.getAffiliateStats(userId);
    
    if (stats.pendingCommission < 50) {
      throw new Error('Minimum payout amount is $50');
    }

    // In real implementation, integrate with payment processor
    const payoutAmount = stats.pendingCommission;

    // Mark referrals as paid
    // Update stats

    return payoutAmount;
  }

  /**
   * Get affiliate stats
   */
  async getAffiliateStats(userId: string): Promise<AffiliateStats> {
    // Mock implementation
    return {
      userId,
      totalReferrals: 25,
      activeReferrals: 20,
      totalCommission: 500,
      pendingCommission: 150,
      paidCommission: 350,
    };
  }

  /**
   * Get commission rate based on tier
   */
  private getCommissionRate(totalReferrals: number): number {
    if (totalReferrals >= 50) {
      return ReferralManager.COMMISSION_RATES.tier3;
    } else if (totalReferrals >= 11) {
      return ReferralManager.COMMISSION_RATES.tier2;
    } else {
      return ReferralManager.COMMISSION_RATES.tier1;
    }
  }

  /**
   * Create unique referral code
   */
  private createCode(userId: string): string {
    const prefix = 'AUTOQA';
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `${prefix}-${random}`;
  }

  private async getCode(code: string): Promise<ReferralCode | null> {
    // Mock implementation
    return {
      code,
      userId: 'user-123',
      uses: 5,
      maxUses: 100,
      createdAt: new Date(),
    };
  }

  private async getReferral(id: string): Promise<Referral> {
    // Mock implementation
    return {
      id,
      referrerId: 'user-123',
      referredUserId: 'user-456',
      code: 'AUTOQA-ABC123',
      status: 'pending',
      commission: 0,
      createdAt: new Date(),
    };
  }

  private generateId(): string {
    return `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
