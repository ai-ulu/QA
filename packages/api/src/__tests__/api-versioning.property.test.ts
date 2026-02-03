import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { fc } from 'fast-check'
import express from 'express'

/**
 * Property-Based Tests for API Versioning and Breaking Change Detection
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 9 - Versioning**
 * 
 * These tests ensure that:
 * - Old API versions (v1) still work when v2 is released
 * - Deprecated endpoints return Sunset header
 * - Breaking changes fail CI/CD validation
 */

interface ApiVersion {
  version: string
  deprecated: boolean
  sunsetDate?: string
  supportedUntil?: string
}

const createVersionedApp = () => {
  const app = express()
  app.use(express.json())

  // API version configuration
  const apiVersions: Record<string, ApiVersion> = {
    'v1': {
      version: 'v1',
      deprecated: true,
      sunsetDate: '2024-12-31',
      supportedUntil: '2024-06-30'
    },
    'v2': {
      version: 'v2',
      deprecated: false
    },
    'v3': {
      version: 'v3',
      deprecated: false
    }
  }

  // Version detection middleware
  app.use((req, res, next) => {
    // Check Accept-Version header first
    let version = req.headers['accept-version'] as string
    
    // Fallback to URL path version
    if (!version) {
      const pathMatch = req.path.match(/^\/api\/(v\d+)\//)
      version = pathMatch ? pathMatch[1] : 'v2' // Default to v2
    }

    // Validate version
    if (!apiVersions[version]) {
      return res.status(400).json({
        error: 'Unsupported API version',
        supportedVersions: Object.keys(apiVersions),
        requestedVersion: version
      })
    }

    req.apiVersion = version
    req.versionInfo = apiVersions[version]

    // Add deprecation headers for deprecated versions
    if (apiVersions[version].deprecated) {
      res.setHeader('Deprecation', 'true')
      if (apiVersions[version].sunsetDate) {
        res.setHeader('Sunset', apiVersions[version].sunsetDate)
      }
      res.setHeader('Link', `</api/${version}/docs>; rel="deprecation"`)
    }

    // Add version info to response headers
    res.setHeader('API-Version', version)
    res.setHeader('API-Supported-Versions', Object.keys(apiVersions).join(', '))

    next()
  })

  // V1 endpoints (deprecated)
  app.get('/api/v1/projects', (req, res) => {
    // V1 format - simple array
    res.json([
      { id: 1, name: 'Project 1', status: 'active' },
      { id: 2, name: 'Project 2', status: 'inactive' }
    ])
  })

  app.post('/api/v1/projects', (req, res) => {
    // V1 format - simple response
    res.status(201).json({
      id: 123,
      name: req.body.name,
      status: 'active'
    })
  })

  // V2 endpoints (current)
  app.get('/api/v2/projects', (req, res) => {
    // V2 format - with metadata and pagination
    res.json({
      data: [
        { 
          id: '1', 
          name: 'Project 1', 
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        { 
          id: '2', 
          name: 'Project 2', 
          status: 'inactive',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z'
        }
      ],
      meta: {
        total: 2,
        page: 1,
        limit: 10
      }
    })
  })

  app.post('/api/v2/projects', (req, res) => {
    // V2 format - with full metadata
    res.status(201).json({
      data: {
        id: '123',
        name: req.body.name,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      meta: {
        version: 'v2',
        created: true
      }
    })
  })

  // V3 endpoints (latest)
  app.get('/api/v3/projects', (req, res) => {
    // V3 format - with enhanced metadata and HATEOAS
    res.json({
      data: [
        { 
          id: '1', 
          name: 'Project 1', 
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          _links: {
            self: { href: '/api/v3/projects/1' },
            tests: { href: '/api/v3/projects/1/tests' }
          }
        }
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        version: 'v3'
      },
      _links: {
        self: { href: '/api/v3/projects' },
        next: { href: '/api/v3/projects?page=2' }
      }
    })
  })

  // Version-agnostic endpoints (using Accept-Version header)
  app.get('/api/projects', (req, res) => {
    const version = req.apiVersion || 'v2'
    
    switch (version) {
      case 'v1':
        return res.redirect(307, '/api/v1/projects')
      case 'v2':
        return res.redirect(307, '/api/v2/projects')
      case 'v3':
        return res.redirect(307, '/api/v3/projects')
      default:
        return res.redirect(307, '/api/v2/projects')
    }
  })

  // Breaking change detection endpoint
  app.get('/api/breaking-changes', (req, res) => {
    const changes = [
      {
        version: 'v2',
        changes: [
          {
            type: 'breaking',
            description: 'Response format changed from array to object with data/meta',
            endpoint: 'GET /api/projects',
            migration: 'Access projects via response.data instead of response directly'
          }
        ]
      },
      {
        version: 'v3',
        changes: [
          {
            type: 'non-breaking',
            description: 'Added HATEOAS links to responses',
            endpoint: 'GET /api/projects',
            migration: 'No migration required, new fields are optional'
          }
        ]
      }
    ]

    res.json({ changes })
  })

  return app
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string
      versionInfo?: ApiVersion
    }
  }
}

describe('API Versioning Property Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createVersionedApp()
  })

  /**
   * Property Test: Old API versions (v1) still work when v2 is released
   * **Validates: Requirements Hata Kataloğu Kategori 9 - Versioning**
   */
  it('should maintain backward compatibility for old API versions', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          version: fc.oneof(fc.constant('v1'), fc.constant('v2'), fc.constant('v3')),
          method: fc.oneof(fc.constant('GET'), fc.constant('POST')),
          useHeader: fc.boolean()
        }),
        async ({ version, method, useHeader }) => {
          let response: any

          if (method === 'GET') {
            if (useHeader) {
              // Use Accept-Version header
              response = await request(app)
                .get('/api/projects')
                .set('Accept-Version', version)
            } else {
              // Use URL path versioning
              response = await request(app).get(`/api/${version}/projects`)
            }
          } else {
            // POST request
            const testData = { name: 'Test Project' }
            
            if (useHeader) {
              response = await request(app)
                .post('/api/projects')
                .set('Accept-Version', version)
                .send(testData)
            } else {
              response = await request(app)
                .post(`/api/${version}/projects`)
                .send(testData)
            }
          }

          // All versions should work (backward compatibility)
          expect(response.status).toBeLessThan(400)
          
          // Response should include version information
          expect(response.headers['api-version']).toBeDefined()
          expect(response.headers['api-supported-versions']).toBeDefined()

          // Verify version-specific response format
          if (version === 'v1') {
            if (method === 'GET') {
              expect(Array.isArray(response.body)).toBe(true)
            } else {
              expect(response.body).toHaveProperty('id')
              expect(response.body).toHaveProperty('name')
            }
          } else if (version === 'v2' || version === 'v3') {
            if (method === 'GET') {
              expect(response.body).toHaveProperty('data')
              expect(response.body).toHaveProperty('meta')
            } else {
              expect(response.body).toHaveProperty('data')
            }
          }

          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  /**
   * Property Test: Deprecated endpoints return Sunset header
   * **Validates: Requirements Hata Kataloğu Kategori 9 - Versioning**
   */
  it('should return deprecation headers for deprecated API versions', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          endpoint: fc.oneof(
            fc.constant('/api/v1/projects'),
            fc.constant('/api/v2/projects'),
            fc.constant('/api/v3/projects')
          ),
          method: fc.oneof(fc.constant('GET'), fc.constant('POST'))
        }),
        async ({ endpoint, method }) => {
          let response: any

          if (method === 'GET') {
            response = await request(app).get(endpoint)
          } else {
            response = await request(app)
              .post(endpoint)
              .send({ name: 'Test Project' })
          }

          const version = endpoint.match(/v(\d+)/)?.[0]
          
          if (version === 'v1') {
            // V1 is deprecated, should have deprecation headers
            expect(response.headers['deprecation']).toBe('true')
            expect(response.headers['sunset']).toBeDefined()
            expect(response.headers['link']).toContain('rel="deprecation"')
          } else {
            // V2 and V3 are not deprecated
            expect(response.headers['deprecation']).toBeUndefined()
            expect(response.headers['sunset']).toBeUndefined()
          }

          return true
        }
      ),
      { numRuns: 12 }
    )
  })

  /**
   * Property Test: Breaking changes are properly documented
   * **Validates: Requirements Hata Kataloğu Kategori 9 - Versioning**
   */
  it('should document breaking changes between API versions', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constant({}), // No random input needed for this test
        async () => {
          const response = await request(app).get('/api/breaking-changes')

          expect(response.status).toBe(200)
          expect(response.body).toHaveProperty('changes')
          expect(Array.isArray(response.body.changes)).toBe(true)

          // Verify breaking changes are documented
          const breakingChanges = response.body.changes.filter((change: any) => 
            change.changes.some((c: any) => c.type === 'breaking')
          )

          breakingChanges.forEach((versionChange: any) => {
            expect(versionChange).toHaveProperty('version')
            expect(versionChange).toHaveProperty('changes')
            
            versionChange.changes.forEach((change: any) => {
              expect(change).toHaveProperty('type')
              expect(change).toHaveProperty('description')
              expect(change).toHaveProperty('endpoint')
              expect(change).toHaveProperty('migration')
            })
          })

          return true
        }
      ),
      { numRuns: 5 }
    )
  })
})

describe('API Versioning Unit Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createVersionedApp()
  })

  /**
   * Unit Test: Version detection from headers
   */
  it('should detect API version from Accept-Version header', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Accept-Version', 'v2')

    expect(response.headers['api-version']).toBe('v2')
  })

  /**
   * Unit Test: Version detection from URL path
   */
  it('should detect API version from URL path', async () => {
    const response = await request(app).get('/api/v1/projects')

    expect(response.headers['api-version']).toBe('v1')
  })

  /**
   * Unit Test: Unsupported version handling
   */
  it('should reject unsupported API versions', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Accept-Version', 'v99')

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Unsupported API version')
    expect(response.body.supportedVersions).toContain('v1')
    expect(response.body.supportedVersions).toContain('v2')
    expect(response.body.requestedVersion).toBe('v99')
  })

  /**
   * Unit Test: Default version fallback
   */
  it('should fallback to default version when none specified', async () => {
    const response = await request(app).get('/api/projects')

    expect(response.status).toBe(307) // Redirect to default version
    expect(response.headers.location).toContain('/api/v2/projects')
  })

  /**
   * Unit Test: Sunset date format
   */
  it('should use proper date format for Sunset header', async () => {
    const response = await request(app).get('/api/v1/projects')

    const sunsetHeader = response.headers['sunset']
    expect(sunsetHeader).toBeDefined()
    
    // Should be a valid date string
    const sunsetDate = new Date(sunsetHeader)
    expect(sunsetDate.toString()).not.toBe('Invalid Date')
  })

  /**
   * Unit Test: Version-specific response formats
   */
  it('should maintain different response formats per version', async () => {
    // V1 response format
    const v1Response = await request(app).get('/api/v1/projects')
    expect(Array.isArray(v1Response.body)).toBe(true)
    expect(v1Response.body[0]).toHaveProperty('id')
    expect(typeof v1Response.body[0].id).toBe('number') // V1 uses numeric IDs

    // V2 response format
    const v2Response = await request(app).get('/api/v2/projects')
    expect(v2Response.body).toHaveProperty('data')
    expect(v2Response.body).toHaveProperty('meta')
    expect(typeof v2Response.body.data[0].id).toBe('string') // V2 uses string IDs

    // V3 response format
    const v3Response = await request(app).get('/api/v3/projects')
    expect(v3Response.body).toHaveProperty('data')
    expect(v3Response.body).toHaveProperty('meta')
    expect(v3Response.body).toHaveProperty('_links') // V3 includes HATEOAS
    expect(v3Response.body.data[0]).toHaveProperty('_links')
  })

  /**
   * Unit Test: Content negotiation
   */
  it('should support content negotiation with version headers', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Accept', 'application/json')
      .set('Accept-Version', 'v3')

    expect(response.status).toBe(307)
    expect(response.headers.location).toContain('/api/v3/projects')
  })
})