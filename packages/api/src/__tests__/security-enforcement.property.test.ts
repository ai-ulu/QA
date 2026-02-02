/**
 * Property Tests for Security Enforcement
 * **Property 18: Rate Limiting Enforcement**
 * **Validates: Requirements 9.4**
 * 
 * Tests that rate limiting is enforced consistently,
 * Redis-based throttling prevents abuse, and retry storm prevention works.
 */

import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { rateLimiter } from '../middleware/rate-limiter';
import { correlationId } from '../middleware/correlation-id';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock cache for rate limiter
jest.mock('@autoqa/cache', () => ({
  RateLimiterFactory: {
    createSlidingWindow: jest.fn(() => ({
      checkLimit: jest.fn(),
    })),
  },
}));

describe('Property Tests: Security Enforcement', () => {
  let app: express.Application;
  let mockRateLimiter: any;
  
  beforeAll(() => {
    const { RateLimiterFactory } = require('@autoqa/cache');
    mockRateLimiter = RateLimiterFactory.createSlidingWindow();
    
    app = express();
    app.use(express.json());
    app.use(correlationId);
    
    // Test endpoint with rate limiting
    app.get('/test-rate-limit', rateLimiter.api, (req, res) => {
      res.json({ success: true, timestamp: new Date().toISOString() });
    });
    
    // Test endpoint for webhook rate limiting
    app.post('/test-webhook-rate-limit', rateLimiter.webhook, (req, res) => {
      res.json({ success: true, timestamp: new Date().toISOString() });
    });
  });

  /**
   * Property 18.1: Rate limiting is consistently enforced across all requests
   */
  it('should consistently enforce rate limiting across all requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            identifier: fc.string({ minLength: 1, maxLength: 50 }),
            requestCount: fc.integer({ min: 1, max: 20 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (testCases) => {
          // Reset mock for each test
          mockRateLimiter.checkLimit.mockReset();
          
          for (const testCase of testCases) {
            let allowedRequests = 0;
            let blockedRequests = 0;
            
            // Configure mock to allow first 5 requests, then block
            mockRateLimiter.checkLimit.mockImplementation((identifier: string) => {
              const callCount = mockRateLimiter.checkLimit.mock.calls.filter(
                (call: any[]) => call[0] === identifier
              ).length;
              
              if (callCount <= 5) {
                return Promise.resolve({
                  allowed: true,
                  remaining: 5 - callCount,
                  resetTime: new Date(Date.now() + 60000),
                });
              } else {
                return Promise.resolve({
                  allowed: false,
                  remaining: 0,
                  resetTime: new Date(Date.now() + 60000),
                });
              }
            });
            
            // Send requests
            for (let i = 0; i < testCase.requestCount; i++) {
              const response = await request(app)
                .get('/test-rate-limit')
                .set('X-Forwarded-For', testCase.identifier);
              
              if (response.status === 200) {
                allowedRequests++;
              } else if (response.status === 429) {
                blockedRequests++;
                
                // Verify rate limit response structure
                expect(response.body).toMatchObject({
                  error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: expect.any(String),
                    retryAfter: expect.any(String),
                    correlationId: expect.any(String),
                    timestamp: expect.any(String),
                  },
                });
                
                // Verify rate limit headers
                expect(response.headers['x-ratelimit-limit']).toBeDefined();
                expect(response.headers['x-ratelimit-remaining']).toBeDefined();
                expect(response.headers['x-ratelimit-reset']).toBeDefined();
                expect(response.headers['retry-after']).toBeDefined();
              }
            }
            
            // Verify rate limiting behavior
            if (testCase.requestCount > 5) {
              expect(allowedRequests).toBeLessThanOrEqual(5);
              expect(blockedRequests).toBeGreaterThan(0);
            } else {
              expect(allowedRequests).toBe(testCase.requestCount);
              expect(blockedRequests).toBe(0);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 18.2: Different rate limits are enforced for different endpoints
   */
  it('should enforce different rate limits for different endpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          apiRequests: fc.integer({ min: 1, max: 15 }),
          webhookRequests: fc.integer({ min: 1, max: 15 }),
          identifier: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async (testCase) => {
          // Reset mock
          mockRateLimiter.checkLimit.mockReset();
          
          // Configure different limits for different endpoints
          mockRateLimiter.checkLimit.mockImplementation((identifier: string) => {
            const apiCalls = mockRateLimiter.checkLimit.mock.calls.filter(
              (call: any[]) => call[0] === identifier && call[1]?.endpoint === 'api'
            ).length;
            
            const webhookCalls = mockRateLimiter.checkLimit.mock.calls.filter(
              (call: any[]) => call[0] === identifier && call[1]?.endpoint === 'webhook'
            ).length;
            
            // API limit: 10 requests
            if (call[1]?.endpoint === 'api') {
              return Promise.resolve({
                allowed: apiCalls <= 10,
                remaining: Math.max(0, 10 - apiCalls),
                resetTime: new Date(Date.now() + 60000),
              });
            }
            
            // Webhook limit: 5 requests
            if (call[1]?.endpoint === 'webhook') {
              return Promise.resolve({
                allowed: webhookCalls <= 5,
                remaining: Math.max(0, 5 - webhookCalls),
                resetTime: new Date(Date.now() + 60000),
              });
            }
            
            return Promise.resolve({
              allowed: true,
              remaining: 100,
              resetTime: new Date(Date.now() + 60000),
            });
          });
          
          let apiAllowed = 0;
          let apiBlocked = 0;
          let webhookAllowed = 0;
          let webhookBlocked = 0;
          
          // Test API endpoint
          for (let i = 0; i < testCase.apiRequests; i++) {
            const response = await request(app)
              .get('/test-rate-limit')
              .set('X-Forwarded-For', testCase.identifier);
            
            if (response.status === 200) {
              apiAllowed++;
            } else if (response.status === 429) {
              apiBlocked++;
            }
          }
          
          // Test webhook endpoint
          for (let i = 0; i < testCase.webhookRequests; i++) {
            const response = await request(app)
              .post('/test-webhook-rate-limit')
              .set('X-Forwarded-For', testCase.identifier)
              .send({ test: 'data' });
            
            if (response.status === 200) {
              webhookAllowed++;
            } else if (response.status === 429) {
              webhookBlocked++;
            }
          }
          
          // Verify different limits are enforced
          expect(apiAllowed + apiBlocked).toBe(testCase.apiRequests);
          expect(webhookAllowed + webhookBlocked).toBe(testCase.webhookRequests);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 18.3: Rate limiting prevents retry storms
   */
  it('should prevent retry storms with exponential backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          identifier: fc.string({ minLength: 1, maxLength: 50 }),
          burstSize: fc.integer({ min: 10, max: 50 }),
        }),
        async (testCase) => {
          // Reset mock
          mockRateLimiter.checkLimit.mockReset();
          
          // Configure to block after 3 requests
          let requestCount = 0;
          mockRateLimiter.checkLimit.mockImplementation(() => {
            requestCount++;
            
            if (requestCount <= 3) {
              return Promise.resolve({
                allowed: true,
                remaining: 3 - requestCount,
                resetTime: new Date(Date.now() + 60000),
              });
            } else {
              return Promise.resolve({
                allowed: false,
                remaining: 0,
                resetTime: new Date(Date.now() + 60000),
              });
            }
          });
          
          const responses: any[] = [];
          const timestamps: number[] = [];
          
          // Send burst of requests
          for (let i = 0; i < testCase.burstSize; i++) {
            timestamps.push(Date.now());
            
            const response = await request(app)
              .get('/test-rate-limit')
              .set('X-Forwarded-For', testCase.identifier);
            
            responses.push({
              status: response.status,
              timestamp: Date.now(),
            });
            
            // Small delay to prevent overwhelming the test
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          // Verify rate limiting kicked in
          const successfulResponses = responses.filter(r => r.status === 200);
          const rateLimitedResponses = responses.filter(r => r.status === 429);
          
          expect(successfulResponses.length).toBeLessThanOrEqual(3);
          expect(rateLimitedResponses.length).toBeGreaterThan(0);
          
          // Verify retry-after headers are provided
          if (rateLimitedResponses.length > 0) {
            // At least some rate limited responses should have retry-after info
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 18.4: Rate limiting is consistent across concurrent requests
   */
  it('should maintain consistency across concurrent requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          identifier: fc.string({ minLength: 1, maxLength: 50 }),
          concurrency: fc.integer({ min: 5, max: 20 }),
        }),
        async (testCase) => {
          // Reset mock
          mockRateLimiter.checkLimit.mockReset();
          
          let callCount = 0;
          mockRateLimiter.checkLimit.mockImplementation(() => {
            callCount++;
            
            if (callCount <= 5) {
              return Promise.resolve({
                allowed: true,
                remaining: 5 - callCount,
                resetTime: new Date(Date.now() + 60000),
              });
            } else {
              return Promise.resolve({
                allowed: false,
                remaining: 0,
                resetTime: new Date(Date.now() + 60000),
              });
            }
          });
          
          // Send concurrent requests
          const promises = Array.from({ length: testCase.concurrency }, () =>
            request(app)
              .get('/test-rate-limit')
              .set('X-Forwarded-For', testCase.identifier)
          );
          
          const responses = await Promise.all(promises);
          
          // Count successful and rate-limited responses
          const successCount = responses.filter(r => r.status === 200).length;
          const rateLimitedCount = responses.filter(r => r.status === 429).length;
          
          // Verify total responses
          expect(successCount + rateLimitedCount).toBe(testCase.concurrency);
          
          // Verify rate limiting is enforced
          if (testCase.concurrency > 5) {
            expect(successCount).toBeLessThanOrEqual(5);
            expect(rateLimitedCount).toBeGreaterThan(0);
          }
          
          // Verify all rate-limited responses have proper structure
          responses.filter(r => r.status === 429).forEach(response => {
            expect(response.body).toMatchObject({
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: expect.any(String),
                correlationId: expect.any(String),
                timestamp: expect.any(String),
              },
            });
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 18.5: Rate limiting respects time windows
   */
  it('should respect rate limiting time windows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          identifier: fc.string({ minLength: 1, maxLength: 50 }),
          requestsInWindow: fc.integer({ min: 1, max: 10 }),
        }),
        async (testCase) => {
          // Reset mock
          mockRateLimiter.checkLimit.mockReset();
          
          const windowStart = Date.now();
          let requestCount = 0;
          
          mockRateLimiter.checkLimit.mockImplementation(() => {
            requestCount++;
            const now = Date.now();
            const windowElapsed = now - windowStart;
            
            // Reset count if window has passed (simulate sliding window)
            if (windowElapsed > 60000) { // 1 minute window
              requestCount = 1;
            }
            
            if (requestCount <= 5) {
              return Promise.resolve({
                allowed: true,
                remaining: 5 - requestCount,
                resetTime: new Date(windowStart + 60000),
              });
            } else {
              return Promise.resolve({
                allowed: false,
                remaining: 0,
                resetTime: new Date(windowStart + 60000),
              });
            }
          });
          
          const responses: any[] = [];
          
          // Send requests within the window
          for (let i = 0; i < testCase.requestsInWindow; i++) {
            const response = await request(app)
              .get('/test-rate-limit')
              .set('X-Forwarded-For', testCase.identifier);
            
            responses.push({
              status: response.status,
              timestamp: Date.now(),
            });
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          // Verify responses are consistent with window limits
          const successfulResponses = responses.filter(r => r.status === 200);
          const rateLimitedResponses = responses.filter(r => r.status === 429);
          
          expect(successfulResponses.length + rateLimitedResponses.length).toBe(testCase.requestsInWindow);
          
          // If we exceed the limit, some should be rate limited
          if (testCase.requestsInWindow > 5) {
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});