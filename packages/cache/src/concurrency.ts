/**
 * Concurrency and Race Condition Prevention
 * **Validates: Production Checklist - Concurrency & Parallelism**
 * 
 * Implements idempotency keys, locking mechanisms, atomic operations,
 * deadlock prevention, and thundering herd protection.
 */

import Redis from 'ioredis';
import { logger } from './utils/logger';

export interface IdempotencyKey {
  key: string;
  expiresAt: Date;
  result?: any;
  status: 'pending' | 'completed' | 'failed';
}

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retryDelay?: number;
  retryCount?: number;
  identifier?: string;
}

export interface AtomicOperationResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  retryAfter?: number;
}

/**
 * Idempotency Manager
 */
export class IdempotencyManager {
  private redis: Redis;
  private keyPrefix = 'idempotency:';
  private defaultTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Generate idempotency key
   */
  generateKey(operation: string, params: any): string {
    const crypto = require('crypto');
    const data = JSON.stringify({ operation, params }, Object.keys({ operation, params }).sort());
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return `${this.keyPrefix}${operation}:${hash}`;
  }

  /**
   * Check if operation is already in progress or completed
   */
  async checkIdempotency(key: string): Promise<IdempotencyKey | null> {
    try {
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to check idempotency', {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Start idempotent operation
   */
  async startOperation(
    key: string,
    ttl: number = this.defaultTTL
  ): Promise<boolean> {
    try {
      const idempotencyKey: IdempotencyKey = {
        key,
        expiresAt: new Date(Date.now() + ttl),
        status: 'pending',
      };

      // Use SET with NX (only if not exists) and EX (expiration)
      const result = await this.redis.set(
        key,
        JSON.stringify(idempotencyKey),
        'PX',
        ttl,
        'NX'
      );

      return result === 'OK';
    } catch (error) {
      logger.error('Failed to start idempotent operation', {
        key,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Complete idempotent operation
   */
  async completeOperation(
    key: string,
    result: any,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    try {
      const idempotencyKey: IdempotencyKey = {
        key,
        expiresAt: new Date(Date.now() + ttl),
        result,
        status: 'completed',
      };

      await this.redis.set(
        key,
        JSON.stringify(idempotencyKey),
        'PX',
        ttl
      );
    } catch (error) {
      logger.error('Failed to complete idempotent operation', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Fail idempotent operation
   */
  async failOperation(
    key: string,
    error: string,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    try {
      const idempotencyKey: IdempotencyKey = {
        key,
        expiresAt: new Date(Date.now() + ttl),
        result: { error },
        status: 'failed',
      };

      await this.redis.set(
        key,
        JSON.stringify(idempotencyKey),
        'PX',
        ttl
      );
    } catch (error) {
      logger.error('Failed to mark idempotent operation as failed', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Execute idempotent operation
   */
  async executeIdempotent<T>(
    operation: string,
    params: any,
    executor: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    const key = this.generateKey(operation, params);
    
    // Check if operation already exists
    const existing = await this.checkIdempotency(key);
    
    if (existing) {
      if (existing.status === 'completed') {
        return existing.result;
      } else if (existing.status === 'failed') {
        throw new Error(existing.result?.error || 'Operation failed');
      } else if (existing.status === 'pending') {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.executeIdempotent(operation, params, executor, ttl);
      }
    }

    // Start new operation
    const started = await this.startOperation(key, ttl);
    
    if (!started) {
      // Another process started the operation, wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.executeIdempotent(operation, params, executor, ttl);
    }

    try {
      const result = await executor();
      await this.completeOperation(key, result, ttl);
      return result;
    } catch (error) {
      await this.failOperation(key, (error as Error).message, ttl);
      throw error;
    }
  }
}

/**
 * Distributed Lock Manager
 */
export class DistributedLockManager {
  private redis: Redis;
  private lockPrefix = 'lock:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(
    resource: string,
    options: LockOptions = {}
  ): Promise<string | null> {
    const {
      ttl = 30000, // 30 seconds
      retryDelay = 100,
      retryCount = 10,
      identifier = this.generateIdentifier(),
    } = options;

    const lockKey = `${this.lockPrefix}${resource}`;
    
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        // Try to acquire lock with SET NX EX
        const result = await this.redis.set(
          lockKey,
          identifier,
          'PX',
          ttl,
          'NX'
        );

        if (result === 'OK') {
          logger.debug('Lock acquired', {
            resource,
            identifier,
            ttl,
            attempt,
          });
          return identifier;
        }

        // Lock is held by someone else, wait and retry
        if (attempt < retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        logger.error('Failed to acquire lock', {
          resource,
          identifier,
          attempt,
          error: (error as Error).message,
        });
      }
    }

    logger.warn('Failed to acquire lock after retries', {
      resource,
      identifier,
      retryCount,
    });

    return null;
  }

  /**
   * Release distributed lock
   */
  async releaseLock(resource: string, identifier: string): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${resource}`;
    
    // Lua script to ensure we only release our own lock
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, lockKey, identifier);
      
      const released = result === 1;
      
      if (released) {
        logger.debug('Lock released', { resource, identifier });
      } else {
        logger.warn('Failed to release lock - not owner', { resource, identifier });
      }

      return released;
    } catch (error) {
      logger.error('Failed to release lock', {
        resource,
        identifier,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Execute with lock
   */
  async executeWithLock<T>(
    resource: string,
    executor: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const identifier = await this.acquireLock(resource, options);
    
    if (!identifier) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      return await executor();
    } finally {
      await this.releaseLock(resource, identifier);
    }
  }

  /**
   * Generate unique identifier for lock
   */
  private generateIdentifier(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Atomic Operations Manager
 */
export class AtomicOperationsManager {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Atomic counter increment
   */
  async atomicIncrement(
    key: string,
    increment: number = 1,
    ttl?: number
  ): Promise<number> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.incrby(key, increment);
      
      if (ttl) {
        pipeline.expire(key, Math.floor(ttl / 1000));
      }
      
      const results = await pipeline.exec();
      
      if (!results || results[0][1] === null) {
        throw new Error('Failed to increment counter');
      }
      
      return results[0][1] as number;
    } catch (error) {
      logger.error('Atomic increment failed', {
        key,
        increment,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Atomic list operations
   */
  async atomicListPush(
    key: string,
    values: string[],
    maxLength?: number
  ): Promise<number> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Push values
      pipeline.lpush(key, ...values);
      
      // Trim if max length specified
      if (maxLength) {
        pipeline.ltrim(key, 0, maxLength - 1);
      }
      
      const results = await pipeline.exec();
      
      if (!results || results[0][1] === null) {
        throw new Error('Failed to push to list');
      }
      
      return results[0][1] as number;
    } catch (error) {
      logger.error('Atomic list push failed', {
        key,
        values: values.length,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Atomic hash operations
   */
  async atomicHashUpdate(
    key: string,
    updates: Record<string, string | number>,
    ttl?: number
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Update hash fields
      for (const [field, value] of Object.entries(updates)) {
        pipeline.hset(key, field, value);
      }
      
      if (ttl) {
        pipeline.expire(key, Math.floor(ttl / 1000));
      }
      
      await pipeline.exec();
    } catch (error) {
      logger.error('Atomic hash update failed', {
        key,
        updates: Object.keys(updates),
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Compare and swap operation
   */
  async compareAndSwap(
    key: string,
    expectedValue: string,
    newValue: string,
    ttl?: number
  ): Promise<boolean> {
    const luaScript = `
      local current = redis.call("GET", KEYS[1])
      if current == ARGV[1] then
        redis.call("SET", KEYS[1], ARGV[2])
        if ARGV[3] then
          redis.call("EXPIRE", KEYS[1], ARGV[3])
        end
        return 1
      else
        return 0
      end
    `;

    try {
      const args = [expectedValue, newValue];
      if (ttl) {
        args.push(Math.floor(ttl / 1000).toString());
      }

      const result = await this.redis.eval(luaScript, 1, key, ...args);
      return result === 1;
    } catch (error) {
      logger.error('Compare and swap failed', {
        key,
        error: (error as Error).message,
      });
      return false;
    }
  }
}

/**
 * Thundering Herd Prevention
 */
export class ThunderingHerdPrevention {
  private redis: Redis;
  private lockManager: DistributedLockManager;

  constructor(redis: Redis) {
    this.redis = redis;
    this.lockManager = new DistributedLockManager(redis);
  }

  /**
   * Execute with thundering herd prevention
   */
  async executeWithHerdPrevention<T>(
    key: string,
    executor: () => Promise<T>,
    options: {
      cacheTTL?: number;
      lockTTL?: number;
      staleWhileRevalidate?: boolean;
    } = {}
  ): Promise<T> {
    const {
      cacheTTL = 300000, // 5 minutes
      lockTTL = 30000,   // 30 seconds
      staleWhileRevalidate = true,
    } = options;

    const cacheKey = `cache:${key}`;
    const lockKey = `herd:${key}`;

    // Try to get from cache first
    const cached = await this.getCachedValue<T>(cacheKey);
    
    if (cached && !this.isStale(cached, cacheTTL)) {
      return cached.value;
    }

    // If stale but exists, return stale value and refresh in background
    if (cached && staleWhileRevalidate) {
      // Start background refresh
      this.refreshInBackground(key, executor, cacheKey, cacheTTL, lockKey, lockTTL);
      return cached.value;
    }

    // Try to acquire lock for fresh computation
    const lockIdentifier = await this.lockManager.acquireLock(lockKey, {
      ttl: lockTTL,
      retryCount: 1,
    });

    if (lockIdentifier) {
      try {
        // We got the lock, compute fresh value
        const result = await executor();
        await this.setCachedValue(cacheKey, result, cacheTTL);
        return result;
      } finally {
        await this.lockManager.releaseLock(lockKey, lockIdentifier);
      }
    } else {
      // Someone else is computing, wait a bit and try cache again
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const freshCached = await this.getCachedValue<T>(cacheKey);
      if (freshCached) {
        return freshCached.value;
      }

      // Still no cache, fall back to direct execution
      return executor();
    }
  }

  /**
   * Get cached value with metadata
   */
  private async getCachedValue<T>(key: string): Promise<{
    value: T;
    timestamp: number;
  } | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get cached value', {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Set cached value with metadata
   */
  private async setCachedValue<T>(
    key: string,
    value: T,
    ttl: number
  ): Promise<void> {
    try {
      const data = {
        value,
        timestamp: Date.now(),
      };

      await this.redis.set(key, JSON.stringify(data), 'PX', ttl);
    } catch (error) {
      logger.error('Failed to set cached value', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check if cached value is stale
   */
  private isStale(cached: { timestamp: number }, ttl: number): boolean {
    return Date.now() - cached.timestamp > ttl;
  }

  /**
   * Refresh value in background
   */
  private async refreshInBackground<T>(
    key: string,
    executor: () => Promise<T>,
    cacheKey: string,
    cacheTTL: number,
    lockKey: string,
    lockTTL: number
  ): Promise<void> {
    // Don't await this - it runs in background
    setImmediate(async () => {
      try {
        const lockIdentifier = await this.lockManager.acquireLock(lockKey, {
          ttl: lockTTL,
          retryCount: 1,
        });

        if (lockIdentifier) {
          try {
            const result = await executor();
            await this.setCachedValue(cacheKey, result, cacheTTL);
          } finally {
            await this.lockManager.releaseLock(lockKey, lockIdentifier);
          }
        }
      } catch (error) {
        logger.error('Background refresh failed', {
          key,
          error: (error as Error).message,
        });
      }
    });
  }
}

/**
 * Clock Skew Handler
 */
export class ClockSkewHandler {
  private ntpServers = [
    'pool.ntp.org',
    'time.google.com',
    'time.cloudflare.com',
  ];
  private clockOffset = 0;
  private lastSync = 0;
  private syncInterval = 300000; // 5 minutes

  constructor() {
    this.syncClock();
    setInterval(() => this.syncClock(), this.syncInterval);
  }

  /**
   * Get adjusted timestamp accounting for clock skew
   */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  /**
   * Sync clock with NTP servers
   */
  private async syncClock(): Promise<void> {
    try {
      const ntpTime = await this.getNTPTime();
      const localTime = Date.now();
      
      this.clockOffset = ntpTime - localTime;
      this.lastSync = localTime;

      if (Math.abs(this.clockOffset) > 1000) {
        logger.warn('Significant clock skew detected', {
          offset: this.clockOffset,
          offsetSeconds: this.clockOffset / 1000,
        });
      }
    } catch (error) {
      logger.error('Failed to sync clock', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get time from NTP server
   */
  private async getNTPTime(): Promise<number> {
    // Simplified NTP implementation
    // In production, use a proper NTP library
    return new Promise((resolve, reject) => {
      const dgram = require('dgram');
      const client = dgram.createSocket('udp4');
      
      const ntpData = Buffer.alloc(48);
      ntpData[0] = 0x1B; // NTP version and mode
      
      client.send(ntpData, 123, this.ntpServers[0], (err) => {
        if (err) {
          client.close();
          reject(err);
          return;
        }
      });
      
      client.on('message', (msg) => {
        client.close();
        
        // Extract timestamp from NTP response
        const seconds = msg.readUInt32BE(40);
        const fraction = msg.readUInt32BE(44);
        
        // Convert to JavaScript timestamp
        const ntpTime = (seconds - 2208988800) * 1000 + (fraction * 1000) / 0x100000000;
        resolve(ntpTime);
      });
      
      client.on('error', (err) => {
        client.close();
        reject(err);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        client.close();
        reject(new Error('NTP request timeout'));
      }, 5000);
    });
  }

  /**
   * Get clock skew information
   */
  getClockInfo(): {
    offset: number;
    lastSync: number;
    syncAge: number;
    isHealthy: boolean;
  } {
    const syncAge = Date.now() - this.lastSync;
    const isHealthy = syncAge < this.syncInterval * 2 && Math.abs(this.clockOffset) < 5000;

    return {
      offset: this.clockOffset,
      lastSync: this.lastSync,
      syncAge,
      isHealthy,
    };
  }
}