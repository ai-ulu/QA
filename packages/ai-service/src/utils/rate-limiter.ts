import { RateLimiterMemory } from 'rate-limiter-flexible';

export interface RateLimiterOptions {
  tokensPerMinute: number;
  requestsPerMinute: number;
}

export class RateLimiter {
  private tokenLimiter: RateLimiterMemory;
  private requestLimiter: RateLimiterMemory;

  constructor(options: RateLimiterOptions) {
    this.tokenLimiter = new RateLimiterMemory({
      points: options.tokensPerMinute,
      duration: 60, // 1 minute
    });

    this.requestLimiter = new RateLimiterMemory({
      points: options.requestsPerMinute,
      duration: 60, // 1 minute
    });
  }

  async checkTokenLimit(tokensToConsume: number): Promise<void> {
    try {
      await this.tokenLimiter.consume('tokens', tokensToConsume);
    } catch (rejRes: any) {
      const remainingTime = Math.round(rejRes.msBeforeNext / 1000);
      throw new Error(`Token rate limit exceeded. Try again in ${remainingTime} seconds.`);
    }
  }

  async checkRequestLimit(): Promise<void> {
    try {
      await this.requestLimiter.consume('requests', 1);
    } catch (rejRes: any) {
      const remainingTime = Math.round(rejRes.msBeforeNext / 1000);
      throw new Error(`Request rate limit exceeded. Try again in ${remainingTime} seconds.`);
    }
  }

  async getRemainingTokens(): Promise<number> {
    const res = await this.tokenLimiter.get('tokens');
    return res ? res.remainingPoints : this.tokenLimiter.points;
  }

  async getRemainingRequests(): Promise<number> {
    const res = await this.requestLimiter.get('requests');
    return res ? res.remainingPoints : this.requestLimiter.points;
  }

  reset(): void {
    this.tokenLimiter.delete('tokens');
    this.requestLimiter.delete('requests');
  }
}