import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from '../App';

/**
 * **Validates: Requirements Hata Kataloğu Kategori 11 - Deep Link Errors**
 * 
 * Navigation ve deep linking testleri - tüm route'ların doğru çalıştığını
 * ve authentication guard'larının düzgün işlediğini test eder.
 */

// Mock contexts
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  })),
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

describe('App Navigation Tests', () => {
  const mockUseAuth = vi.mocked(await import('../contexts/AuthContext')).useAuth;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Public routes - Unauthenticated user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });
    });

    it('should render landing page on root path', async () => {
      renderWithRouter(['/']);
      
      await waitFor(() => {
        expect(screen.getByTestId('landing-page')).toBeInTheDocument();
      });
    });

    it('should render login page on /login path', async () => {
      renderWithRouter(['/login']);
      
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('should render auth callback page on /auth/callback path', async () => {
      renderWithRouter(['/auth/callback']);
      
      await waitFor(() => {
        expect(screen.getByTestId('auth-callback-page')).toBeInTheDocument();
      });
    });

    it('should redirect to login when accessing protected routes', async () => {
      renderWithRouter(['/dashboard']);
      
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('should redirect to login when accessing /projects', async () => {
      renderWithRouter(['/projects']);
      
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('should redirect to login when accessing /projects/:id', async () => {
      renderWithRouter(['/projects/123']);
      
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('should redirect to login when accessing /profile', async () => {
      renderWithRouter(['/profile']);
      
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    });

    it('should render 404 page for unknown routes', async () => {
      renderWithRouter(['/unknown-route']);
      
      await waitFor(() => {
        expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
      });
    });
  });

  describe('Protected routes - Authenticated user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });
    });

    it('should redirect to dashboard from root when authenticated', async () => {
      renderWithRouter(['/']);
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });
    });

    it('should redirect to dashboard from login when authenticated', async () => {
      renderWithRouter(['/login']);
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });
    });

    it('should render dashboard page on /dashboard', async () => {
      renderWithRouter(['/dashboard']);
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });
    });

    it('should render projects page on /projects', async () => {
      renderWithRouter(['/projects']);
      
      await waitFor(() => {
        expect(screen.getByTestId('projects-page')).toBeInTheDocument();
      });
    });

    it('should render project detail page on /projects/:id', async () => {
      renderWithRouter(['/projects/123']);
      
      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });

    it('should render profile page on /profile', async () => {
      renderWithRouter(['/profile']);
      
      await waitFor(() => {
        expect(screen.getByTestId('profile-page')).toBeInTheDocument();
      });
    });

    it('should still allow access to auth callback', async () => {
      renderWithRouter(['/auth/callback']);
      
      await waitFor(() => {
        expect(screen.getByTestId('auth-callback-page')).toBeInTheDocument();
      });
    });

    it('should render 404 page for unknown routes even when authenticated', async () => {
      renderWithRouter(['/unknown-route']);
      
      await waitFor(() => {
        expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
      });
    });
  });

  describe('Loading states', () => {
    it('should show loading spinner when auth is loading', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      renderWithRouter(['/']);
      
      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });

    it('should not show loading spinner when auth is not loading', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      renderWithRouter(['/']);
      
      await waitFor(() => {
        expect(screen.queryByRole('status', { name: /loading/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Deep linking scenarios', () => {
    it('should preserve intended route after authentication', async () => {
      // Başlangıçta unauthenticated, protected route'a gitmeye çalış
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      const { rerender } = renderWithRouter(['/projects/123']);
      
      // Login'e redirect edilmeli
      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });

      // Şimdi authenticate ol
      mockUseAuth.mockReturnValue({
        user: {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      // Aynı route ile rerender et
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/projects/123']}>
            <App />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Artık project detail page'e erişebilmeli
      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });

    it('should handle complex route parameters', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      // UUID benzeri ID ile test
      renderWithRouter(['/projects/550e8400-e29b-41d4-a716-446655440000']);
      
      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });

    it('should handle special characters in routes', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      // URL encoded characters ile test
      renderWithRouter(['/projects/test%20project%20123']);
      
      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation edge cases', () => {
    it('should handle empty route parameters', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      // Boş ID ile test
      renderWithRouter(['/projects/']);
      
      await waitFor(() => {
        expect(screen.getByTestId('projects-page')).toBeInTheDocument();
      });
    });

    it('should handle trailing slashes correctly', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      renderWithRouter(['/dashboard/']);
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });
    });

    it('should handle case sensitivity in routes', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: vi.fn(),
        loginWithGitHub: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      // Büyük harfli route
      renderWithRouter(['/LOGIN']);
      
      await waitFor(() => {
        expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
      });
    });
  });
});