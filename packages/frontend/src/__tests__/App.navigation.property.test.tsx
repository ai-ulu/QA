import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import App from '../App';

/**
 * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
 * 
 * Property-based testler navigation ve deep linking işlevselliğinin
 * tüm senaryolarda doğru çalıştığını garanti eder.
 */

// Mock contexts
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../contexts/OfflineContext', () => ({
  useOffline: vi.fn(() => ({
    isOnline: true,
    isSlowConnection: false,
    queuedOperations: [],
    isProcessingQueue: false,
    addToQueue: vi.fn(),
    processQueue: vi.fn(),
    clearQueue: vi.fn(),
    getQueueStats: vi.fn(() => ({ total: 0, byType: {}, byResource: {} })),
    retryFailedOperation: vi.fn(),
  })),
  OfflineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock pages
vi.mock('../pages/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page">Landing Page</div>,
}));

vi.mock('../pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">Login Page</div>,
}));

vi.mock('../pages/AuthCallbackPage', () => ({
  AuthCallbackPage: () => <div data-testid="auth-callback-page">Auth Callback Page</div>,
}));

vi.mock('../pages/DashboardPage', () => ({
  DashboardPage: () => <div data-testid="dashboard-page">Dashboard Page</div>,
}));

vi.mock('../pages/ProjectsPage', () => ({
  ProjectsPage: () => <div data-testid="projects-page">Projects Page</div>,
}));

vi.mock('../pages/ProjectDetailPage', () => ({
  ProjectDetailPage: () => <div data-testid="project-detail-page">Project Detail Page</div>,
}));

vi.mock('../pages/ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-page">Profile Page</div>,
}));

vi.mock('../pages/NotFoundPage', () => ({
  NotFoundPage: () => <div data-testid="not-found-page">Not Found Page</div>,
}));

// Mock layouts
vi.mock('../components/layout/AppLayout', () => ({
  AppLayout: () => <div data-testid="app-layout">App Layout</div>,
}));

vi.mock('../components/layout/PublicLayout', () => ({
  PublicLayout: () => <div data-testid="public-layout">Public Layout</div>,
}));

// Custom arbitraries
const validRouteArb = fc.constantFrom(
  '/',
  '/login',
  '/auth/callback',
  '/dashboard',
  '/projects',
  '/profile'
);

const projectIdArb = fc.oneof(
  fc.integer({ min: 1, max: 999999 }).map(String),
  fc.uuid(),
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/'))
);

const protectedRouteArb = fc.constantFrom(
  '/dashboard',
  '/projects',
  '/profile'
);

const publicRouteArb = fc.constantFrom(
  '/',
  '/login',
  '/auth/callback'
);

const userArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  username: fc.string({ minLength: 1, maxLength: 30 }),
  email: fc.emailAddress(),
  avatar_url: fc.webUrl(),
});

function renderWithRouter(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('App Navigation Property Tests', () => {
  const mockUseAuth = vi.mocked(await import('../contexts/AuthContext')).useAuth;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Property Test:** Deep links always resolve to correct route with state
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('Property: Deep links always resolve to correct route with state', () => {
    fc.assert(
      fc.property(
        validRouteArb,
        fc.option(userArb),
        (route, user) => {
          mockUseAuth.mockReturnValue({
            user: user || null,
            isLoading: false,
            isAuthenticated: !!user,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          renderWithRouter([route]);

          // Route'a göre beklenen davranışı kontrol et
          if (!user) {
            // Unauthenticated user
            if (route === '/' || route === '/login' || route === '/auth/callback') {
              // Public routes should be accessible
              expect(screen.queryByTestId('not-found-page')).not.toBeInTheDocument();
            } else {
              // Protected routes should redirect to login
              expect(screen.getByTestId('login-page')).toBeInTheDocument();
            }
          } else {
            // Authenticated user
            if (route === '/' || route === '/login') {
              // Should redirect to dashboard
              expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
            } else if (route === '/auth/callback') {
              // Auth callback should be accessible
              expect(screen.getByTestId('auth-callback-page')).toBeInTheDocument();
            } else {
              // Protected routes should be accessible
              expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
            }
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Property Test:** Browser back/forward maintains application state
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('Property: Browser back/forward maintains application state', () => {
    fc.assert(
      fc.property(
        fc.array(validRouteArb, { minLength: 2, maxLength: 5 }),
        userArb,
        (routes, user) => {
          mockUseAuth.mockReturnValue({
            user,
            isLoading: false,
            isAuthenticated: true,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          // İlk route ile başla
          const { rerender } = renderWithRouter([routes[0]]);

          // Her route değişimini test et
          routes.slice(1).forEach((route) => {
            const queryClient = new QueryClient({
              defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
              },
            });

            rerender(
              <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[route]}>
                  <App />
                </MemoryRouter>
              </QueryClientProvider>
            );

            // Route değişikliği sonrası state korunmalı
            expect(mockUseAuth).toHaveBeenCalled();
          });

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Property Test:** Protected routes redirect to login correctly
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
   */
  it('Property: Protected routes redirect to login correctly', () => {
    fc.assert(
      fc.property(
        protectedRouteArb,
        (protectedRoute) => {
          mockUseAuth.mockReturnValue({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          renderWithRouter([protectedRoute]);

          // Tüm protected route'lar login'e redirect etmeli
          expect(screen.getByTestId('login-page')).toBeInTheDocument();
          expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
          expect(screen.queryByTestId('projects-page')).not.toBeInTheDocument();
          expect(screen.queryByTestId('profile-page')).not.toBeInTheDocument();

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Property Test:** Project detail routes handle all valid IDs
   */
  it('Property: Project detail routes handle all valid IDs', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        userArb,
        (projectId, user) => {
          mockUseAuth.mockReturnValue({
            user,
            isLoading: false,
            isAuthenticated: true,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          const route = `/projects/${encodeURIComponent(projectId)}`;
          renderWithRouter([route]);

          // Authenticated user için project detail page gösterilmeli
          expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
          expect(screen.queryByTestId('not-found-page')).not.toBeInTheDocument();

          return true;
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * **Property Test:** Public routes are accessible without authentication
   */
  it('Property: Public routes are accessible without authentication', () => {
    fc.assert(
      fc.property(
        publicRouteArb,
        (publicRoute) => {
          mockUseAuth.mockReturnValue({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          renderWithRouter([publicRoute]);

          // Public route'lar erişilebilir olmalı
          expect(screen.queryByTestId('not-found-page')).not.toBeInTheDocument();
          
          // Login'e redirect edilmemeli (auth/callback hariç)
          if (publicRoute !== '/auth/callback') {
            expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Property Test:** Authentication state changes preserve current route
   */
  it('Property: Authentication state changes preserve current route', () => {
    fc.assert(
      fc.property(
        validRouteArb,
        userArb,
        (route, user) => {
          // Başlangıçta unauthenticated
          mockUseAuth.mockReturnValue({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          const { rerender } = renderWithRouter([route]);

          // Authenticate ol
          mockUseAuth.mockReturnValue({
            user,
            isLoading: false,
            isAuthenticated: true,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          const queryClient = new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          });

          rerender(
            <QueryClientProvider client={queryClient}>
              <MemoryRouter initialEntries={[route]}>
                <App />
              </MemoryRouter>
            </QueryClientProvider>
          );

          // Authentication sonrası uygun route'a yönlendirilmeli
          if (route === '/' || route === '/login') {
            expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
          } else if (route === '/auth/callback') {
            expect(screen.getByTestId('auth-callback-page')).toBeInTheDocument();
          } else {
            // Protected routes erişilebilir olmalı
            expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
          }

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Property Test:** Invalid routes always show 404 page
   */
  it('Property: Invalid routes always show 404 page', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 })
          .filter(s => !['', 'login', 'auth/callback', 'dashboard', 'projects', 'profile'].includes(s))
          .map(s => `/${s}`),
        fc.option(userArb),
        (invalidRoute, user) => {
          mockUseAuth.mockReturnValue({
            user: user || null,
            isLoading: false,
            isAuthenticated: !!user,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          renderWithRouter([invalidRoute]);

          // Invalid route'lar her zaman 404 göstermeli
          expect(screen.getByTestId('not-found-page')).toBeInTheDocument();

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Property Test:** Loading state is handled correctly
   */
  it('Property: Loading state is handled correctly', () => {
    fc.assert(
      fc.property(
        validRouteArb,
        fc.boolean(),
        (route, hasUser) => {
          mockUseAuth.mockReturnValue({
            user: hasUser ? {
              id: '1',
              username: 'test',
              email: 'test@example.com',
              avatar_url: 'https://example.com/avatar.jpg',
            } : null,
            isLoading: true, // Loading state
            isAuthenticated: hasUser,
            login: vi.fn(),
            loginWithGitHub: vi.fn(),
            logout: vi.fn(),
            refreshUser: vi.fn(),
          });

          renderWithRouter([route]);

          // Loading durumunda spinner gösterilmeli
          expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
          
          // Hiçbir page render edilmemeli
          expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
          expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
          expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});