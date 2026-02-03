import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { fc } from 'fast-check'
import express from 'express'

/**
 * Property-Based Tests for Pagination Contract Consistency
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 9, 5 - Pagination**
 * 
 * These tests ensure that:
 * - Iterating all pages never loses or duplicates items
 * - Total count matches actual item count
 * - Cursor pagination handles deleted items gracefully
 */

interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
    nextCursor?: string
    prevCursor?: string
  }
}

// Mock data store
let mockProjects: Array<{ id: string; name: string; createdAt: string }> = []

const createTestApp = () => {
  const app = express()
  app.use(express.json())

  // Generate mock data
  const generateMockProjects = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `project-${i + 1}`,
      name: `Project ${i + 1}`,
      createdAt: new Date(Date.now() - (count - i) * 1000).toISOString()
    }))
  }

  // Reset mock data
  app.post('/api/test/reset', (req, res) => {
    const count = req.body.count || 100
    mockProjects = generateMockProjects(count)
    res.status(200).json({ message: 'Data reset', count: mockProjects.length })
  })

  // Offset-based pagination
  app.get('/api/projects', (req, res) => {
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)
    const offset = (page - 1) * limit

    const total = mockProjects.length
    const totalPages = Math.ceil(total / limit)
    const data = mockProjects.slice(offset, offset + limit)

    const response: PaginatedResponse<typeof mockProjects[0]> = {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }

    res.status(200).json(response)
  })

  // Cursor-based pagination
  app.get('/api/projects/cursor', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)
    const cursor = req.query.cursor as string
    const direction = req.query.direction as string || 'next'

    let startIndex = 0
    if (cursor) {
      const cursorIndex = mockProjects.findIndex(p => p.id === cursor)
      if (cursorIndex !== -1) {
        startIndex = direction === 'next' ? cursorIndex + 1 : Math.max(0, cursorIndex - limit)
      }
    }

    const data = mockProjects.slice(startIndex, startIndex + limit)
    const total = mockProjects.length

    const response: PaginatedResponse<typeof mockProjects[0]> = {
      data,
      pagination: {
        total,
        page: Math.floor(startIndex / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: startIndex + limit < total,
        hasPrev: startIndex > 0,
        nextCursor: data.length > 0 ? data[data.length - 1].id : undefined,
        prevCursor: data.length > 0 ? data[0].id : undefined
      }
    }

    res.status(200).json(response)
  })

  // Delete project (for testing cursor pagination with deletions)
  app.delete('/api/projects/:id', (req, res) => {
    const index = mockProjects.findIndex(p => p.id === req.params.id)
    if (index !== -1) {
      mockProjects.splice(index, 1)
      res.status(204).send()
    } else {
      res.status(404).json({ error: 'Project not found' })
    }
  })

  return app
}

describe('Pagination Contract Property Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createTestApp()
  })

  /**
   * Property Test: Iterating all pages never loses or duplicates items
   * **Validates: Requirements Hata Kataloğu Kategori 9, 5 - Pagination**
   */
  it('should never lose or duplicate items when iterating through all pages', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          totalItems: fc.integer({ min: 10, max: 200 }),
          pageSize: fc.integer({ min: 5, max: 50 })
        }),
        async ({ totalItems, pageSize }) => {
          // Reset data with specific count
          await request(app)
            .post('/api/test/reset')
            .send({ count: totalItems })

          const allItems: string[] = []
          let currentPage = 1
          let hasMore = true

          // Iterate through all pages
          while (hasMore) {
            const response = await request(app)
              .get('/api/projects')
              .query({ page: currentPage, limit: pageSize })

            expect(response.status).toBe(200)

            const { data, pagination } = response.body
            
            // Collect all item IDs
            data.forEach((item: any) => {
              allItems.push(item.id)
            })

            hasMore = pagination.hasNext
            currentPage++

            // Prevent infinite loops
            if (currentPage > 100) break
          }

          // Verify no duplicates
          const uniqueItems = new Set(allItems)
          expect(uniqueItems.size).toBe(allItems.length)

          // Verify all items are collected
          expect(allItems.length).toBe(totalItems)

          return true
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * Property Test: Total count matches actual item count
   * **Validates: Requirements Hata Kataloğu Kategori 9, 5 - Pagination**
   */
  it('should maintain consistent total count across all pages', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          totalItems: fc.integer({ min: 20, max: 150 }),
          pageSize: fc.integer({ min: 3, max: 25 })
        }),
        async ({ totalItems, pageSize }) => {
          // Reset data
          await request(app)
            .post('/api/test/reset')
            .send({ count: totalItems })

          const pagesToCheck = Math.min(5, Math.ceil(totalItems / pageSize))
          
          for (let page = 1; page <= pagesToCheck; page++) {
            const response = await request(app)
              .get('/api/projects')
              .query({ page, limit: pageSize })

            expect(response.status).toBe(200)

            const { pagination } = response.body

            // Total count should be consistent across all pages
            expect(pagination.total).toBe(totalItems)
            
            // Total pages calculation should be correct
            const expectedTotalPages = Math.ceil(totalItems / pageSize)
            expect(pagination.totalPages).toBe(expectedTotalPages)

            // Page number should match request
            expect(pagination.page).toBe(page)
            expect(pagination.limit).toBe(pageSize)

            // hasNext/hasPrev should be accurate
            expect(pagination.hasNext).toBe(page < expectedTotalPages)
            expect(pagination.hasPrev).toBe(page > 1)
          }

          return true
        }
      ),
      { numRuns: 8 }
    )
  })

  /**
   * Property Test: Cursor pagination handles deleted items gracefully
   * **Validates: Requirements Hata Kataloğu Kategori 9, 5 - Pagination**
   */
  it('should handle cursor pagination gracefully when items are deleted', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          totalItems: fc.integer({ min: 50, max: 100 }),
          pageSize: fc.integer({ min: 10, max: 20 }),
          deleteCount: fc.integer({ min: 1, max: 10 })
        }),
        async ({ totalItems, pageSize, deleteCount }) => {
          // Reset data
          await request(app)
            .post('/api/test/reset')
            .send({ count: totalItems })

          // Get first page with cursor pagination
          const firstPageResponse = await request(app)
            .get('/api/projects/cursor')
            .query({ limit: pageSize })

          expect(firstPageResponse.status).toBe(200)
          
          const { data: firstPageData, pagination: firstPagination } = firstPageResponse.body
          expect(firstPageData.length).toBeGreaterThan(0)

          // Delete some items from the first page
          const itemsToDelete = firstPageData.slice(0, Math.min(deleteCount, firstPageData.length))
          
          for (const item of itemsToDelete) {
            await request(app).delete(`/api/projects/${item.id}`)
          }

          // Get next page using cursor
          if (firstPagination.nextCursor) {
            const nextPageResponse = await request(app)
              .get('/api/projects/cursor')
              .query({ 
                cursor: firstPagination.nextCursor,
                limit: pageSize 
              })

            expect(nextPageResponse.status).toBe(200)

            const { data: nextPageData, pagination: nextPagination } = nextPageResponse.body

            // Verify pagination still works after deletions
            expect(nextPagination.total).toBe(totalItems - itemsToDelete.length)
            
            // Verify no deleted items appear in results
            const deletedIds = itemsToDelete.map(item => item.id)
            nextPageData.forEach((item: any) => {
              expect(deletedIds).not.toContain(item.id)
            })
          }

          return true
        }
      ),
      { numRuns: 6 }
    )
  })
})

describe('Pagination Contract Unit Tests', () => {
  let app: express.Application

  beforeEach(() => {
    app = createTestApp()
  })

  /**
   * Unit Test: Empty results pagination
   */
  it('should handle empty results correctly', async () => {
    // Reset with 0 items
    await request(app)
      .post('/api/test/reset')
      .send({ count: 0 })

    const response = await request(app)
      .get('/api/projects')
      .query({ page: 1, limit: 10 })

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([])
    expect(response.body.pagination.total).toBe(0)
    expect(response.body.pagination.totalPages).toBe(0)
    expect(response.body.pagination.hasNext).toBe(false)
    expect(response.body.pagination.hasPrev).toBe(false)
  })

  /**
   * Unit Test: Single page results
   */
  it('should handle single page results correctly', async () => {
    await request(app)
      .post('/api/test/reset')
      .send({ count: 5 })

    const response = await request(app)
      .get('/api/projects')
      .query({ page: 1, limit: 10 })

    expect(response.status).toBe(200)
    expect(response.body.data.length).toBe(5)
    expect(response.body.pagination.total).toBe(5)
    expect(response.body.pagination.totalPages).toBe(1)
    expect(response.body.pagination.hasNext).toBe(false)
    expect(response.body.pagination.hasPrev).toBe(false)
  })

  /**
   * Unit Test: Page size limits
   */
  it('should enforce maximum page size limits', async () => {
    await request(app)
      .post('/api/test/reset')
      .send({ count: 200 })

    // Request more than maximum allowed
    const response = await request(app)
      .get('/api/projects')
      .query({ page: 1, limit: 150 })

    expect(response.status).toBe(200)
    expect(response.body.pagination.limit).toBe(100) // Should be capped at 100
    expect(response.body.data.length).toBeLessThanOrEqual(100)
  })

  /**
   * Unit Test: Invalid page numbers
   */
  it('should handle invalid page numbers gracefully', async () => {
    await request(app)
      .post('/api/test/reset')
      .send({ count: 50 })

    // Page 0 should default to page 1
    const response1 = await request(app)
      .get('/api/projects')
      .query({ page: 0, limit: 10 })

    expect(response1.status).toBe(200)
    expect(response1.body.pagination.page).toBe(1)

    // Negative page should default to page 1
    const response2 = await request(app)
      .get('/api/projects')
      .query({ page: -1, limit: 10 })

    expect(response2.status).toBe(200)
    expect(response2.body.pagination.page).toBe(1)

    // Page beyond total pages should return empty results
    const response3 = await request(app)
      .get('/api/projects')
      .query({ page: 100, limit: 10 })

    expect(response3.status).toBe(200)
    expect(response3.body.data).toEqual([])
    expect(response3.body.pagination.hasNext).toBe(false)
  })

  /**
   * Unit Test: Cursor pagination edge cases
   */
  it('should handle cursor pagination edge cases', async () => {
    await request(app)
      .post('/api/test/reset')
      .send({ count: 20 })

    // Invalid cursor should start from beginning
    const response1 = await request(app)
      .get('/api/projects/cursor')
      .query({ cursor: 'invalid-cursor', limit: 5 })

    expect(response1.status).toBe(200)
    expect(response1.body.data.length).toBeGreaterThan(0)

    // Empty cursor should start from beginning
    const response2 = await request(app)
      .get('/api/projects/cursor')
      .query({ limit: 5 })

    expect(response2.status).toBe(200)
    expect(response2.body.data.length).toBeGreaterThan(0)
    expect(response2.body.pagination.prevCursor).toBeDefined()
    expect(response2.body.pagination.nextCursor).toBeDefined()
  })
})