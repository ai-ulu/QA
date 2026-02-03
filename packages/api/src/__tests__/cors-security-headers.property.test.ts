import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { fc } from 'fast-check'
import express from 'express'
import cors from 'cors'

/**
 * Property-Based Tests for CORS and Security Header Validation
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 9, 10 - CORS**
 * 
 * These tests ensure that:
 * - CORS blocks requests from unauthorized origins
 * - Preflight requests return correct allowed methods/headers
 * - Security headers present in all responses
 */

const createTestApp = (environment: 'development' | 'staging' | 'production' = 'production') => {
  const app = express()
  app.use(express.json())

  // Environment-specific CORS configuration
  const corsOptions = {
    development: {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Remaining']
    },
    staging: {
      origin: ['https://staging.autoqa.dev', 'https://staging-admin.autoqa.dev'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Remaining']
    },
    production: {
      origin: ['https://autoqa.dev', 'https://app.autoqa.dev', 'https://admin.autoqa.dev'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Remaining']
    }
  }

  app.use(cors(corsOptions[environment]))

  // Security headers middleware
  app.use((req, res, next) => {
    // HSTS (HTTP Strict Transport Security)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' https:; " +
      "connect-src 'self' https:; " +
      "frame-ancestors 'none';"
    )
    
    // X-Frame-Options
    res.setHeader('X-Frame-Options', 'DENY')
    
    // X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff')
    
    // X-XSS-Protection
    res.setHeader('X-XSS-Protection', '1; mode=block')
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    
    // Permissions Policy
    res.setHeader('Permissions-Policy', 
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    )

    next()
  })

  // Test endpoints
  app.get('/api/projects', (req, res) => {
    res.json({ projects: [] })
  })

  app.post('/api/projects', (req, res) => {
    res.status(201).json({ id: '123', name: req.body.name })
  })

  app.put('/api/projects/:id', (req, res) => {
    res.json({ id: req.params.id, ...req.body })
  })

  app.delete('/api/projects/:id', (req, res) => {
    res.status(204).send()
  })

  app.options('/api/projects', (req, res) => {
    res.status(200).send()
  })

  return app
}

describe('CORS and Security Headers Property Tests', () => {
  /**
   * Property Test: CORS blocks requests from unauthorized origins
   * **Validates: Requirements Hata Kataloğu Kategori 9, 10 - CORS**
   */
  it('should block requests from unauthorized origins', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          environment: fc.oneof(
            fc.constant('development' as const),
            fc.constant('staging' as const),
            fc.constant('production' as const)
          ),
          unauthorizedOrigin: fc.oneof(
            fc.constant('https://malicious.com'),
            fc.constant('http://evil.example.com'),
            fc.constant('https://phishing-site.net'),
            fc.constant('http://localhost:8080'), // Not in allowed list
            fc.constant('https://fake-autoqa.com')
          ),
          method: fc.oneof(
            fc.constant('GET'),
            fc.constant('POST'),
            fc.constant('PUT'),
            fc.constant('DELETE')
          ),
          endpoint: fc.constant('/api/projects')
        }),
        async ({ environment, unauthorizedOrigin, method, endpoint }) => {
          const app = createTestApp(environment)

          let response: any

          switch (method) {
            case 'GET':
              response = await request(app)
                .get(endpoint)
                .set('Origin', unauthorizedOrigin)
              break
            case 'POST':
              response = await request(app)
                .post(endpoint)
                .set('Origin', unauthorizedOrigin)
                .send({ name: 'Test Project' })
              break
            case 'PUT':
              response = await request(app)
                .put(`${endpoint}/123`)
                .set('Origin', unauthorizedOrigin)
                .send({ name: 'Updated Project' })
              break
            case 'DELETE':
              response = await request(app)
                .delete(`${endpoint}/123`)
                .set('Origin', unauthorizedOrigin)
              break
          }

          // CORS should either block the request or not include CORS headers
          const corsHeader = response.headers['access-control-allow-origin']
          
          if (corsHeader) {
            // If CORS header is present, it should not match unauthorized origin
            expect(corsHeader).not.toBe(unauthorizedOrigin)
          }

          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  /**
   * Property Test: Preflight requests return correct allowed methods/headers
   * **Validates: Requirements Hata Kataloğu Kategori 9, 10 - CORS**
   */
  it('should return correct allowed methods and headers for preflight requests', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          environment: fc.oneof(
            fc.constant('development' as const),
            fc.constant('staging' as const),
            fc.constant('production' as const)
          ),
          requestedMethod: fc.oneof(
            fc.constant('GET'),
            fc.constant('POST'),
            fc.constant('PUT'),
            fc.constant('DELETE')
          ),
          requestedHeaders: fc.array(
            fc.oneof(
              fc.constant('Content-Type'),
              fc.constant('Authorization'),
              fc.constant('X-Requested-With'),
              fc.constant('X-Correlation-ID')
            ),
            { minLength: 1, maxLength: 4 }
          )
        }),
        async ({ environment, requestedMethod, requestedHeaders }) => {
          const app = createTestApp(environment)
          
          // Get allowed origins for environment
          const allowedOrigins = {
            development: ['http://localhost:3000', 'http://localhost:3001'],
            staging: ['https://staging.autoqa.dev'],
            production: ['https://autoqa.dev', 'https://app.autoqa.dev']
          }

          const origin = allowedOrigins[environment][0]

          const response = await request(app)
            .options('/api/projects')
            .set('Origin', origin)
            .set('Access-Control-Request-Method', requestedMethod)
            .set('Access-Control-Request-Headers', requestedHeaders.join(', '))

          expect(response.status).toBe(200)

          // Verify CORS headers are present
          expect(response.headers['access-control-allow-origin']).toBe(origin)
          expect(response.headers['access-control-allow-methods']).toBeDefined()
          expect(response.headers['access-control-allow-headers']).toBeDefined()

          // Verify requested method is allowed
          const allowedMethods = response.headers['access-control-allow-methods']
          expect(allowedMethods).toContain(requestedMethod)

          // Verify requested headers are allowed
          const allowedHeaders = response.headers['access-control-allow-headers']
          requestedHeaders.forEach(header => {
            expect(allowedHeaders.toLowerCase()).toContain(header.toLowerCase())
          })

          return true
        }
      ),
      { numRuns: 12 }
    )
  })

  /**
   * Property Test: Security headers present in all responses
   * **Validates: Requirements Hata Kataloğu Kategori 9, 10 - CORS**
   */
  it('should include security headers in all responses', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          method: fc.oneof(
            fc.constant('GET'),
            fc.constant('POST'),
            fc.constant('PUT'),
            fc.constant('DELETE'),
            fc.constant('OPTIONS')
          ),
          endpoint: fc.oneof(
            fc.constant('/api/projects'),
            fc.constant('/api/projects/123')
          )
        }),
        async ({ method, endpoint }) => {
          const app = createTestApp('production')

          let response: any

          switch (method) {
            case 'GET':
              response = await request(app).get(endpoint)
              break
            case 'POST':
              response = await request(app)
                .post('/api/projects')
                .send({ name: 'Test Project' })
              break
            case 'PUT':
              response = await request(app)
                .put('/api/projects/123')
                .send({ name: 'Updated Project' })
              break
            case 'DELETE':
              response = await request(app).delete('/api/projects/123')
              break
            case 'OPTIONS':
              response = await request(app).options('/api/projects')
              break
          }

          // Verify all required security headers are present
          const requiredHeaders = [
            'strict-transport-security',
            'content-security-policy',
            'x-frame-options',
            'x-content-type-options',
            'x-xss-protection',
            'referrer-policy',
            'permissions-policy'
          ]

          requiredHeaders.forEach(header => {
            expect(response.headers[header]).toBeDefined()
            expect(response.headers[header]).not.toBe('')
          })

          // Verify specific header values
          expect(response.headers['x-frame-options']).toBe('DENY')
          expect(response.headers['x-content-type-options']).toBe('nosniff')
          expect(response.headers['x-xss-protection']).toBe('1; mode=block')

          return true
        }
      ),
      { numRuns: 20 }
    )
  })
})

describe('CORS and Security Headers Unit Tests', () => {
  /**
   * Unit Test: Environment-specific CORS configuration
   */
  it('should use different CORS origins per environment', async () => {
    const environments = ['development', 'staging', 'production'] as const
    
    for (const env of environments) {
      const app = createTestApp(env)
      
      const allowedOrigins = {
        development: 'http://localhost:3000',
        staging: 'https://staging.autoqa.dev',
        production: 'https://autoqa.dev'
      }

      const response = await request(app)
        .get('/api/projects')
        .set('Origin', allowedOrigins[env])

      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigins[env])
    }
  })

  /**
   * Unit Test: Credentials support in CORS
   */
  it('should support credentials in CORS requests', async () => {
    const app = createTestApp('production')

    const response = await request(app)
      .get('/api/projects')
      .set('Origin', 'https://autoqa.dev')

    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  /**
   * Unit Test: Custom headers exposure
   */
  it('should expose custom headers in CORS', async () => {
    const app = createTestApp('production')

    const response = await request(app)
      .get('/api/projects')
      .set('Origin', 'https://autoqa.dev')

    const exposedHeaders = response.headers['access-control-expose-headers']
    expect(exposedHeaders).toContain('X-Correlation-ID')
    expect(exposedHeaders).toContain('X-RateLimit-Remaining')
  })

  /**
   * Unit Test: Content Security Policy
   */
  it('should set comprehensive Content Security Policy', async () => {
    const app = createTestApp('production')

    const response = await request(app).get('/api/projects')

    const csp = response.headers['content-security-policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("script-src 'self'")
  })

  /**
   * Unit Test: HSTS header configuration
   */
  it('should set HSTS header with proper configuration', async () => {
    const app = createTestApp('production')

    const response = await request(app).get('/api/projects')

    const hsts = response.headers['strict-transport-security']
    expect(hsts).toContain('max-age=31536000')
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')
  })

  /**
   * Unit Test: Permissions Policy
   */
  it('should set restrictive Permissions Policy', async () => {
    const app = createTestApp('production')

    const response = await request(app).get('/api/projects')

    const permissionsPolicy = response.headers['permissions-policy']
    expect(permissionsPolicy).toContain('camera=()')
    expect(permissionsPolicy).toContain('microphone=()')
    expect(permissionsPolicy).toContain('geolocation=()')
    expect(permissionsPolicy).toContain('payment=()')
  })

  /**
   * Unit Test: Preflight request handling
   */
  it('should handle preflight requests correctly', async () => {
    const app = createTestApp('production')

    const response = await request(app)
      .options('/api/projects')
      .set('Origin', 'https://autoqa.dev')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization')

    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-methods']).toContain('POST')
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type')
    expect(response.headers['access-control-allow-headers']).toContain('Authorization')
    expect(response.headers['access-control-max-age']).toBeDefined()
  })
})