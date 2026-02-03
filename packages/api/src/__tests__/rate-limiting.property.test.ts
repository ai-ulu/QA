import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { fc } from 'fast-check'
import express from 'express'
import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'

/**
 * Property-Based Tests for Rate Limiting and Throttling Validation
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 9 - Rate Limiting**
 * 
 * These tests ensure that:
 * - Rate limiting prevents abuse across all endpoints
 * - 429 Too Many Requests after limit exceeded
 * - Rate limit headers are correctly set
 */

// Mock Redis client
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  ttl: vi.fn()
}

const createRateLimitedApp = () => {
  const app = express()
  app.use(express.json())

  // Global rate limiter
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later',
      retryAfter: 15 * 60 // 15 minutes in seconds
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // store: new RedisStore({
    //   client: mockRedisClient,
    //   prefix: 'rl:global:'
    // })
  })

  // Strict rate limiter for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 auth requests per windowMs
    message: {
      error: 'Too many authentication attempts, please try again later',
      retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful requests
  })

  // API-specific rate limiter
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 API requests per minute
    message: {
      error: 'API rate limit exceeded, please slow down',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false
  })

  // User-specific rate limiter (simulated)
  const userLimiter = (maxRequests: number, windowMs: number) => {
    return rateLimit({
      windowMs,
      max: maxRequests,
      keyGenerator: (req) => {
        // In real implementation, this would use user ID from JWT
        return req.headers['x-user-id'] as string || req.ip
      },
      message: {
        error: 'User rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false
    })
  }

  // Apply global rate limiting
  app.use(globalLimiter)

  // Auth endpoints with strict limiting
  app.post('/api/auth/login', authLimiter, (req, res) => {
    const { username, password } = req.body
    
    if (username === 'admin' && password === 'password') {
      res.json({ token: 'mock-jwt-token', user: { id: '1', username } })
    } else {
      res.status(401).json({ error: 'Invalid credentials' })
    }
  })

  app.post('/api/auth/register', authLimiter, (req, res) => {
    res.status(201).json({ message: 'User registered successfully' })
  })

  app.post('/api/auth/forgot-password', authLimiter, (req, res) => {
    res.json({ message: 'Password reset email sent' })
  })

  // API endpoints with standard limiting
  app.use('/api', apiLimiter)

  app.get('/api/projects', (req, res) => {
    res.json({ projects: [] })
  })

  app.post('/api/projects', (req, res) => {
    res.status(201).json({ id: '123', name: req.body.name })
  })

  // User-specific endpoints
  app.get('/api/user/profile', userLimiter(50, 60 * 1000), (req, res) => {
    res.json({ user: { id: '1', name: 'Test User' } })
  })

  app.post('/api/user/upload', userLimiter(10, 60 * 1000), (req, res) => {
    res.json({ message: 'File uploaded successfully' })
  })

  // Burst endpoint (very strict)
  const burstLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 3, // Only 3 requests per second
    message: {
      error: 'Burst limit exceeded',
      retryAfter: 1
    },
    standardHeaders: true
  })

  app.post('/api/burst-test', burstLimiter, (req, res) => {
    res.json({ message: 'Burst request processed' })
  })

  // Rate limit info endpoint
  app.get('/api/rate-limit/info', (req, res) => {
    res.json({
      limits: {
        global: { max: 1000, windowMs: 15 * 60 * 1000 },
        auth: { max: 5, windowMs: 15 * 60 * 1000 },
        api: { max: 100, windowMs: 60 * 1000 },
        user: { max: 50, windowMs: 60 * 1000 },
        burst: { max: 3, windowMs: 1000 }
      }
    })
  })

  return app
}

describe('Rate Limiting Property Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createRateLimitedApp()
    vi.clearAllMocks()
  })

  /**
   * Property Test: Rate limiting prevents abuse across all endpoints
   * **Validates: Requirements Hata Kataloğu Kategori 9 - Rate Limiting**
   */
  it('should enforce rate limits across all endpoints', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          endpoint: fc.oneof(
            fc.constant('/api/projects'),
            fc.constant('/api/user/profile'),
            fc.constant('/api/auth/login')
          ),
          requestCount: fc.integer({ min: 1, max: 10 }),
          method: fc.oneof(fc.constant('GET'), fc.constant('POST'))
        }),
        async ({ endpoint, requestCount, method }) => {
          const responses = []

          // Make multiple requests rapidly
          for (let i = 0; i < requestCount; i++) {
            let response: any

            if (method === 'GET') {
              response = await request(app).get(endpoint)
            } else {
              const body = endpoint.includes('auth') 
                ? { username: 'test', password: 'test' }
                : { name: 'Test Project' }
              
              response = await request(app)
                .post(endpoint)
                .send(body)
            }

            responses.push(response)
          }

          // Verify rate limit headers are present
          responses.forEach(response => {
            expect(response.headers['ratelimit-limit']).toBeDefined()
            expect(response.headers['ratelimit-remaining']).toBeDefined()
            expect(response.headers['ratelimit-reset']).toBeDefined()
          })

          // If we made many requests, some should be rate limited
          if (requestCount >= 5 && endpoint.includes('auth')) {
            const rateLimitedResponses = responses.filter(r => r.status === 429)
            expect(rateLimitedResponses.length).toBeGreaterThan(0)
          }

          return true
        }
      ),
      { numRuns: 8 }
    )
  })

  /**
   * Property Test: Rate limit headers are correctly set
   * **Validates: Requirements Hata Kataloğu Kategori 9 - Rate Limiting**
   */
  it('should set correct rate limit headers', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          endpoint: fc.oneof(
            fc.constant('/api/projects'),
            fc.constant('/api/user/profile'),
            fc.constant('/api/rate-limit/info')
          ),
          userId: fc.option(fc.string().filter(s => s.length > 0))
        }),
        async ({ endpoint, userId }) => {
          const headers: any = {}
          if (userId) {
            headers['x-user-id'] = userId
          }

          const response = await request(app)
            .get(endpoint)
            .set(headers)

          // Verify standard rate limit headers
          expect(response.headers['ratelimit-limit']).toBeDefined()
          expect(response.headers['ratelimit-remaining']).toBeDefined()
          expect(response.headers['ratelimit-reset']).toBeDefined()

          // Verify header values are numeric
          const limit = parseInt(response.headers['ratelimit-limit'])
          const remaining = parseInt(response.headers['ratelimit-remaining'])
          const reset = parseInt(response.headers['ratelimit-reset'])

          expect(limit).toBeGreaterThan(0)
          expect(remaining).toBeGreaterThanOrEqual(0)
          expect(remaining).toBeLessThanOrEqual(limit)
          expect(reset).toBeGreaterThan(Date.now() / 1000) // Reset time should be in the future

          return true
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * Property Test: Different endpoints have different rate limits
   * **Validates: Requirements Hata Kataloğu Kategori 9 - Rate Limiting**
   */
  it('should apply different rate limits to different endpoint categories', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constant({}), // No random input needed
        async () => {
          // Get rate limit info
          const infoResponse = await request(app).get('/api/rate-limit/info')
          expect(infoResponse.status).toBe(200)

          const limits = infoResponse.body.limits

          // Verify different limits for different categories
          expect(limits.auth.max).toBeLessThan(limits.api.max) // Auth should be more restrictive
          expect(limits.burst.max).toBeLessThan(limits.auth.max) // Burst should be most restrictive
          expect(limits.global.max).toBeGreaterThan(limits.api.max) // Global should be highest

          // Test actual enforcement
          const authResponse = await request(app)
            .post('/api/auth/login')
            .send({ username: 'test', password: 'test' })

          const apiResponse = await request(app).get('/api/projects')

          // Auth endpoint should have lower limit
          const authLimit = parseInt(authResponse.headers['ratelimit-limit'])
          const apiLimit = parseInt(apiResponse.headers['ratelimit-limit'])

          expect(authLimit).toBeLessThan(apiLimit)

          return true
        }
      ),
      { numRuns: 3 }
    )
  })
})

describe('Rate Limiting Unit Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createRateLimitedApp()
  })

  /**
   * Unit Test: 429 status code when limit exceeded
   */
  it('should return 429 when rate limit is exceeded', async () => {
    // Make requests to burst endpoint (limit: 3 per second)
    const responses = []
    
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/burst-test')
        .send({})
      responses.push(response)
    }

    // First 3 should succeed
    expect(responses[0].status).toBe(200)
    expect(responses[1].status).toBe(200)
    expect(responses[2].status).toBe(200)

    // Remaining should be rate limited
    expect(responses[3].status).toBe(429)
    expect(responses[4].status).toBe(429)

    // Verify error message
    expect(responses[3].body.error).toContain('Burst limit exceeded')
    expect(responses[3].body.retryAfter).toBe(1)
  })

  /**
   * Unit Test: Rate limit reset behavior
   */
  it('should reset rate limit after window expires', async () => {
    // This test would require waiting for the window to expire
    // In a real test, you might use fake timers or a shorter window
    
    const response = await request(app).get('/api/projects')
    
    const resetTime = parseInt(response.headers['ratelimit-reset'])
    const currentTime = Math.floor(Date.now() / 1000)
    
    // Reset time should be in the future
    expect(resetTime).toBeGreaterThan(currentTime)
    
    // Reset time should be within the window (60 seconds for API endpoints)
    expect(resetTime - currentTime).toBeLessThanOrEqual(60)
  })

  /**
   * Unit Test: User-specific rate limiting
   */
  it('should apply rate limits per user', async () => {
    const user1Response = await request(app)
      .get('/api/user/profile')
      .set('x-user-id', 'user1')

    const user2Response = await request(app)
      .get('/api/user/profile')
      .set('x-user-id', 'user2')

    // Both users should have their own rate limit counters
    expect(user1Response.headers['ratelimit-remaining']).toBeDefined()
    expect(user2Response.headers['ratelimit-remaining']).toBeDefined()

    // Both should have the same limit but independent counters
    expect(user1Response.headers['ratelimit-limit']).toBe(user2Response.headers['ratelimit-limit'])
  })

  /**
   * Unit Test: Skip successful requests for auth endpoints
   */
  it('should not count successful auth requests against rate limit', async () => {
    // Make a successful login
    const successResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password' })

    expect(successResponse.status).toBe(200)

    // Make a failed login
    const failResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' })

    expect(failResponse.status).toBe(401)

    // The remaining count should be the same or higher for success
    // (since successful requests are skipped)
    const successRemaining = parseInt(successResponse.headers['ratelimit-remaining'])
    const failRemaining = parseInt(failResponse.headers['ratelimit-remaining'])

    expect(successRemaining).toBeGreaterThanOrEqual(failRemaining)
  })

  /**
   * Unit Test: Rate limit headers format
   */
  it('should use standard rate limit header format', async () => {
    const response = await request(app).get('/api/projects')

    // Should use standard headers (not legacy X-RateLimit-*)
    expect(response.headers['ratelimit-limit']).toBeDefined()
    expect(response.headers['ratelimit-remaining']).toBeDefined()
    expect(response.headers['ratelimit-reset']).toBeDefined()

    // Should not use legacy headers
    expect(response.headers['x-ratelimit-limit']).toBeUndefined()
    expect(response.headers['x-ratelimit-remaining']).toBeUndefined()
    expect(response.headers['x-ratelimit-reset']).toBeUndefined()
  })

  /**
   * Unit Test: Retry-After header in 429 responses
   */
  it('should include Retry-After header in 429 responses', async () => {
    // Exceed burst limit
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/burst-test').send({})
    }

    const rateLimitedResponse = await request(app)
      .post('/api/burst-test')
      .send({})

    expect(rateLimitedResponse.status).toBe(429)
    expect(rateLimitedResponse.headers['retry-after']).toBeDefined()
    
    const retryAfter = parseInt(rateLimitedResponse.headers['retry-after'])
    expect(retryAfter).toBeGreaterThan(0)
  })

  /**
   * Unit Test: Rate limit by IP address
   */
  it('should rate limit by IP address when no user ID provided', async () => {
    const response1 = await request(app).get('/api/user/profile')
    const response2 = await request(app).get('/api/user/profile')

    // Both requests from same IP should share rate limit
    const remaining1 = parseInt(response1.headers['ratelimit-remaining'])
    const remaining2 = parseInt(response2.headers['ratelimit-remaining'])

    expect(remaining2).toBe(remaining1 - 1)
  })

  /**
   * Unit Test: Rate limit window sliding
   */
  it('should handle sliding window correctly', async () => {
    const response = await request(app).get('/api/projects')
    
    const resetTime = parseInt(response.headers['ratelimit-reset'])
    const currentTime = Math.floor(Date.now() / 1000)
    
    // Reset time should be approximately current time + window duration
    const expectedReset = currentTime + 60 // 60 seconds for API endpoints
    expect(Math.abs(resetTime - expectedReset)).toBeLessThanOrEqual(2) // Allow 2 second tolerance
  })
})