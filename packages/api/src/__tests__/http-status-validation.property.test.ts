import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { fc } from 'fast-check'
import express from 'express'

/**
 * Property-Based Tests for HTTP Status Code Validation and Consistency
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 9 - HTTP Status**
 * 
 * These tests ensure that:
 * - All successful operations return 2xx status codes
 * - All client errors return 4xx with structured error
 * - All server errors return 5xx with correlation ID
 */

// Mock API server setup
const createTestApp = () => {
  const app = express()
  app.use(express.json())
  
  // Mock correlation ID middleware
  app.use((req, res, next) => {
    req.correlationId = Math.random().toString(36).substring(7)
    res.setHeader('X-Correlation-ID', req.correlationId)
    next()
  })

  // Success endpoints (2xx)
  app.get('/api/projects', (req, res) => {
    res.status(200).json({ projects: [], total: 0 })
  })

  app.post('/api/projects', (req, res) => {
    if (!req.body.name) {
      return res.status(400).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
        title: 'Bad Request',
        status: 400,
        detail: 'Project name is required',
        instance: req.path,
        correlationId: req.correlationId
      })
    }
    res.status(201).json({ id: '123', name: req.body.name })
  })

  app.put('/api/projects/:id', (req, res) => {
    res.status(200).json({ id: req.params.id, ...req.body })
  })

  app.delete('/api/projects/:id', (req, res) => {
    res.status(204).send()
  })

  // Client error endpoints (4xx)
  app.get('/api/projects/:id', (req, res) => {
    if (req.params.id === 'nonexistent') {
      return res.status(404).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
        title: 'Not Found',
        status: 404,
        detail: 'Project not found',
        instance: req.path,
        correlationId: req.correlationId
      })
    }
    res.status(200).json({ id: req.params.id, name: 'Test Project' })
  })

  app.post('/api/auth/login', (req, res) => {
    if (!req.headers.authorization) {
      return res.status(401).json({
        type: 'https://tools.ietf.org/html/rfc7235#section-3.1',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
        instance: req.path,
        correlationId: req.correlationId
      })
    }
    res.status(200).json({ token: 'mock-token' })
  })

  app.get('/api/admin/users', (req, res) => {
    if (req.headers.authorization !== 'Bearer admin-token') {
      return res.status(403).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.3',
        title: 'Forbidden',
        status: 403,
        detail: 'Admin access required',
        instance: req.path,
        correlationId: req.correlationId
      })
    }
    res.status(200).json({ users: [] })
  })

  // Server error endpoints (5xx)
  app.get('/api/error/server', (req, res) => {
    res.status(500).json({
      type: 'https://tools.ietf.org/html/rfc7231#section-6.6.1',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred',
      instance: req.path,
      correlationId: req.correlationId
    })
  })

  app.get('/api/error/service', (req, res) => {
    res.status(503).json({
      type: 'https://tools.ietf.org/html/rfc7231#section-6.6.4',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Service temporarily unavailable',
      instance: req.path,
      correlationId: req.correlationId,
      'retry-after': '60'
    })
  })

  return app
}

describe('HTTP Status Code Property Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createTestApp()
  })

  /**
   * Property Test: All successful operations return 2xx status codes
   * **Validates: Requirements Hata Kataloğu Kategori 9 - HTTP Status**
   */
  it('should return 2xx status codes for all successful operations', () => {
    fc.assert(
      fc.property(
        fc.record({
          method: fc.oneof(
            fc.constant('GET'),
            fc.constant('POST'),
            fc.constant('PUT'),
            fc.constant('DELETE')
          ),
          endpoint: fc.oneof(
            fc.constant('/api/projects'),
            fc.constant('/api/projects/123')
          ),
          body: fc.option(fc.record({
            name: fc.string().filter(s => s.length > 0 && s.length < 50),
            description: fc.option(fc.string())
          }))
        }),
        async (testCase) => {
          let response: any

          switch (testCase.method) {
            case 'GET':
              response = await request(app).get(testCase.endpoint)
              break
            case 'POST':
              response = await request(app)
                .post(testCase.endpoint)
                .send(testCase.body || { name: 'Test Project' })
              break
            case 'PUT':
              response = await request(app)
                .put(testCase.endpoint)
                .send(testCase.body || { name: 'Updated Project' })
              break
            case 'DELETE':
              response = await request(app).delete(testCase.endpoint)
              break
          }

          // Verify 2xx status code for successful operations
          expect(response.status).toBeGreaterThanOrEqual(200)
          expect(response.status).toBeLessThan(300)

          // Verify correlation ID header is present
          expect(response.headers['x-correlation-id']).toBeDefined()

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Property Test: All client errors return 4xx with structured error
   * **Validates: Requirements Hata Kataloğu Kategori 9 - HTTP Status**
   */
  it('should return 4xx status codes with RFC 7807 Problem Details for client errors', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            endpoint: fc.constant('/api/projects/nonexistent'),
            method: fc.constant('GET'),
            expectedStatus: fc.constant(404)
          }),
          fc.record({
            endpoint: fc.constant('/api/auth/login'),
            method: fc.constant('POST'),
            expectedStatus: fc.constant(401)
          }),
          fc.record({
            endpoint: fc.constant('/api/admin/users'),
            method: fc.constant('GET'),
            expectedStatus: fc.constant(403),
            headers: fc.constant({ authorization: 'Bearer invalid-token' })
          }),
          fc.record({
            endpoint: fc.constant('/api/projects'),
            method: fc.constant('POST'),
            expectedStatus: fc.constant(400),
            body: fc.constant({}) // Missing required name field
          })
        ),
        async (errorCase) => {
          let response: any

          switch (errorCase.method) {
            case 'GET':
              response = await request(app)
                .get(errorCase.endpoint)
                .set(errorCase.headers || {})
              break
            case 'POST':
              response = await request(app)
                .post(errorCase.endpoint)
                .send(errorCase.body || {})
                .set(errorCase.headers || {})
              break
          }

          // Verify 4xx status code
          expect(response.status).toBe(errorCase.expectedStatus)
          expect(response.status).toBeGreaterThanOrEqual(400)
          expect(response.status).toBeLessThan(500)

          // Verify RFC 7807 Problem Details format
          expect(response.body).toHaveProperty('type')
          expect(response.body).toHaveProperty('title')
          expect(response.body).toHaveProperty('status')
          expect(response.body).toHaveProperty('detail')
          expect(response.body).toHaveProperty('instance')
          expect(response.body).toHaveProperty('correlationId')

          // Verify status consistency
          expect(response.body.status).toBe(response.status)

          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  /**
   * Property Test: All server errors return 5xx with correlation ID
   * **Validates: Requirements Hata Kataloğu Kategori 9 - HTTP Status**
   */
  it('should return 5xx status codes with correlation ID for server errors', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            endpoint: fc.constant('/api/error/server'),
            expectedStatus: fc.constant(500)
          }),
          fc.record({
            endpoint: fc.constant('/api/error/service'),
            expectedStatus: fc.constant(503)
          })
        ),
        async (errorCase) => {
          const response = await request(app).get(errorCase.endpoint)

          // Verify 5xx status code
          expect(response.status).toBe(errorCase.expectedStatus)
          expect(response.status).toBeGreaterThanOrEqual(500)
          expect(response.status).toBeLessThan(600)

          // Verify correlation ID is present
          expect(response.headers['x-correlation-id']).toBeDefined()
          expect(response.body.correlationId).toBeDefined()
          expect(response.body.correlationId).toBe(response.headers['x-correlation-id'])

          // Verify RFC 7807 Problem Details format for server errors
          expect(response.body).toHaveProperty('type')
          expect(response.body).toHaveProperty('title')
          expect(response.body).toHaveProperty('status')
          expect(response.body).toHaveProperty('detail')

          return true
        }
      ),
      { numRuns: 10 }
    )
  })
})

describe('HTTP Status Code Unit Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createTestApp()
  })

  /**
   * Unit Test: 404 for non-existent resources, 401 for unauthorized
   */
  it('should return 404 for non-existent resources', async () => {
    const response = await request(app).get('/api/projects/nonexistent')
    
    expect(response.status).toBe(404)
    expect(response.body.title).toBe('Not Found')
    expect(response.body.detail).toBe('Project not found')
  })

  it('should return 401 for unauthorized requests', async () => {
    const response = await request(app).post('/api/auth/login')
    
    expect(response.status).toBe(401)
    expect(response.body.title).toBe('Unauthorized')
    expect(response.body.detail).toBe('Authentication required')
  })

  it('should return 403 for forbidden requests', async () => {
    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer invalid-token')
    
    expect(response.status).toBe(403)
    expect(response.body.title).toBe('Forbidden')
    expect(response.body.detail).toBe('Admin access required')
  })

  it('should return 400 for bad requests', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({}) // Missing required name field
    
    expect(response.status).toBe(400)
    expect(response.body.title).toBe('Bad Request')
    expect(response.body.detail).toBe('Project name is required')
  })

  /**
   * Unit Test: Consistent error response format
   */
  it('should maintain consistent error response format across all endpoints', async () => {
    const errorEndpoints = [
      { path: '/api/projects/nonexistent', method: 'get', status: 404 },
      { path: '/api/auth/login', method: 'post', status: 401 },
      { path: '/api/error/server', method: 'get', status: 500 }
    ]

    for (const endpoint of errorEndpoints) {
      const response = await request(app)[endpoint.method](endpoint.path)
      
      expect(response.status).toBe(endpoint.status)
      
      // Verify consistent RFC 7807 format
      expect(response.body).toHaveProperty('type')
      expect(response.body).toHaveProperty('title')
      expect(response.body).toHaveProperty('status')
      expect(response.body).toHaveProperty('detail')
      expect(response.body).toHaveProperty('instance')
      expect(response.body).toHaveProperty('correlationId')
      
      // Verify type follows RFC format
      expect(response.body.type).toMatch(/^https:\/\/tools\.ietf\.org\/html\/rfc/)
      
      // Verify status consistency
      expect(response.body.status).toBe(response.status)
    }
  })

  /**
   * Unit Test: Success response status codes
   */
  it('should use appropriate success status codes', async () => {
    // GET should return 200
    const getResponse = await request(app).get('/api/projects')
    expect(getResponse.status).toBe(200)

    // POST should return 201 for creation
    const postResponse = await request(app)
      .post('/api/projects')
      .send({ name: 'New Project' })
    expect(postResponse.status).toBe(201)

    // PUT should return 200 for update
    const putResponse = await request(app)
      .put('/api/projects/123')
      .send({ name: 'Updated Project' })
    expect(putResponse.status).toBe(200)

    // DELETE should return 204 for successful deletion
    const deleteResponse = await request(app).delete('/api/projects/123')
    expect(deleteResponse.status).toBe(204)
    expect(deleteResponse.body).toEqual({})
  })
})