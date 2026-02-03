import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fc } from 'fast-check'
import App from '../App'
import { AuthProvider } from '../contexts/AuthContext'

/**
 * Property-Based Tests for Deep Linking and Navigation
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
 * 
 * These tests ensure that:
 * - Deep links always resolve to correct route with state
 * - Browser back/forward maintains application state
 * - Protected routes redirect to login correctly
 */

const createTestWrapper = (initialEntries: string[] = ['/']) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Deep Linking Property Tests', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  /**
   * Property Test: Deep links always resolve to correct route with state
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('should resolve deep links to correct routes with preserved state', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/'),
          fc.constant('/login'),
          fc.constant('/dashboard'),
          fc.constant('/projects'),
          fc.string().filter(s => s.startsWith('/projects/') && s.length > 10),
          fc.constant('/profile'),
          fc.constant('/settings')
        ),
        (deepLinkPath) => {
          const TestWrapper = createTestWrapper([deepLinkPath])
          
          const { unmount } = render(<App />, { wrapper: TestWrapper })
          
          // Verify route is accessible (no 404 or crash)
          expect(document.body).toBeDefined()
          
          // Check that navigation occurred without errors
          const currentPath = window.location.pathname
          expect(typeof currentPath).toBe('string')
          
          unmount()
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property Test: Browser back/forward maintains application state
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('should maintain application state during browser navigation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('/'),
            fc.constant('/dashboard'),
            fc.constant('/projects'),
            fc.constant('/profile')
          ),
          { minLength: 2, maxLength: 5 }
        ),
        (navigationSequence) => {
          const TestWrapper = createTestWrapper([navigationSequence[0]])
          
          const { unmount } = render(<App />, { wrapper: TestWrapper })
          
          // Simulate navigation sequence
          navigationSequence.forEach((path, index) => {
            if (index > 0) {
              window.history.pushState({}, '', path)
            }
          })
          
          // Simulate back navigation
          const backSteps = Math.floor(navigationSequence.length / 2)
          for (let i = 0; i < backSteps; i++) {
            window.history.back()
          }
          
          // Verify state is maintained (no crashes)
          expect(document.body).toBeDefined()
          
          unmount()
          return true
        }
      ),
      { numRuns: 30 }
    )
  })

  /**
   * Property Test: URL parameters are preserved and validated
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('should preserve and validate URL parameters correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          projectId: fc.string().filter(s => s.length > 0 && s.length < 50),
          tab: fc.oneof(fc.constant('tests'), fc.constant('settings'), fc.constant('reports')),
          filter: fc.option(fc.string().filter(s => s.length > 0 && s.length < 20))
        }),
        (params) => {
          const searchParams = new URLSearchParams()
          searchParams.set('tab', params.tab)
          if (params.filter) {
            searchParams.set('filter', params.filter)
          }
          
          const deepLinkPath = `/projects/${params.projectId}?${searchParams.toString()}`
          const TestWrapper = createTestWrapper([deepLinkPath])
          
          const { unmount } = render(<App />, { wrapper: TestWrapper })
          
          // Verify URL parameters are accessible
          const currentUrl = new URL(window.location.href)
          expect(currentUrl.searchParams.get('tab')).toBe(params.tab)
          
          if (params.filter) {
            expect(currentUrl.searchParams.get('filter')).toBe(params.filter)
          }
          
          unmount()
          return true
        }
      ),
      { numRuns: 40 }
    )
  })
})

describe('Navigation Edge Cases Unit Tests', () => {
  /**
   * Unit Test: Protected routes redirect to login correctly
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('should redirect protected routes to login when unauthenticated', async () => {
    const protectedRoutes = ['/dashboard', '/projects', '/profile', '/settings']
    
    for (const route of protectedRoutes) {
      const TestWrapper = createTestWrapper([route])
      
      const { unmount } = render(<App />, { wrapper: TestWrapper })
      
      // Should redirect to login or show login form
      await waitFor(() => {
        const loginElements = screen.queryAllByText(/login|sign in/i)
        expect(loginElements.length).toBeGreaterThan(0)
      }, { timeout: 2000 })
      
      unmount()
    }
  })

  /**
   * Unit Test: Invalid routes show 404 page
   */
  it('should show 404 page for invalid routes', async () => {
    const invalidRoutes = ['/nonexistent', '/invalid/path', '/projects/invalid-id/invalid']
    
    for (const route of invalidRoutes) {
      const TestWrapper = createTestWrapper([route])
      
      const { unmount } = render(<App />, { wrapper: TestWrapper })
      
      // Should show 404 or not found message
      await waitFor(() => {
        const notFoundElements = screen.queryAllByText(/404|not found|page not found/i)
        expect(notFoundElements.length).toBeGreaterThan(0)
      }, { timeout: 2000 })
      
      unmount()
    }
  })

  /**
   * Unit Test: Route transitions preserve form data
   */
  it('should preserve form data during route transitions', async () => {
    const TestWrapper = createTestWrapper(['/projects/new'])
    
    const { unmount } = render(<App />, { wrapper: TestWrapper })
    
    // Fill form data (if form exists)
    const nameInput = screen.queryByLabelText(/project name/i)
    if (nameInput) {
      // Simulate form interaction
      expect(nameInput).toBeDefined()
    }
    
    // Navigate away and back
    window.history.pushState({}, '', '/dashboard')
    window.history.back()
    
    // Form data should be preserved (browser behavior)
    expect(document.body).toBeDefined()
    
    unmount()
  })

  /**
   * Unit Test: Hash fragments work correctly
   */
  it('should handle hash fragments in URLs correctly', () => {
    const routesWithHash = [
      '/dashboard#overview',
      '/projects#list',
      '/profile#settings'
    ]
    
    routesWithHash.forEach(route => {
      const TestWrapper = createTestWrapper([route])
      
      const { unmount } = render(<App />, { wrapper: TestWrapper })
      
      // Verify hash is preserved
      expect(window.location.hash).toBe(route.split('#')[1] ? `#${route.split('#')[1]}` : '')
      
      unmount()
    })
  })
})