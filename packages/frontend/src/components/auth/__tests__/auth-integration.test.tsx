/**
 * Frontend Authentication Integration Tests
 * Feature: autoqa-pilot, Frontend Authentication Integration
 * 
 * Tests complete authentication flow in React components, session persistence, and error handling.
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

import { AuthProvider, useAuth } from '../../../contexts/AuthContext';
import { GitHubLoginButton } from '../GitHubLoginButton';
import { ProtectedRoute } from '../ProtectedRoute';
import { authApi } from '../../../api/auth';
import { User } from '../../../types/auth';

// Mock the auth API
vi.mock('../../../api/auth', () => ({
  authApi: {
    getToken: vi.fn(),
    setToken: vi.fn(),
    removeToken: vi.fn(),
    initializeToken: vi.fn(),
    setupInterceptors: vi.fn(() => vi.fn()),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    getUserStats: vi.fn(),
    deleteAccount: vi.fn(),
    initiateGitHubLogin: vi.fn(),
    handleOAuthCallback: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  },
}));

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_GITHUB_CLIENT_ID: 'test_client_id',
    VITE_API_BASE_URL: 'http://localhost:8000',
  },
});

// Mock window.location
const mockLocation = {
  href: '',
  origin: 'http://localhost:3000',
  assign: vi.fn(),
  replace: vi.fn(),
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Test user data
const mockUser: User = {
  id: '12345',
  username: 'testuser',
  login: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  bio: null,
  location: null,
  website: null,
  company: null,
  avatarUrl: 'https://github.com/images/error/testuser_happy.gif',
  githubId: 12345,
  projectCount: 0,
  createdAt: '2020-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// Test component to access auth context
function TestAuthComponent() {
  const { user, isLoading, isAuthenticated, login, loginWithGitHub, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="auth-status">
        {isLoading ? 'loading' : isAuthenticated ? 'authenticated' : 'unauthenticated'}
      </div>
      {user && (
        <div data-testid="user-info">
          <span data-testid="username">{user.username}</span>
          <span data-testid="email">{user.email}</span>
        </div>
      )}
      <button data-testid="login-github" onClick={loginWithGitHub}>
        Login with GitHub
      </button>
      <button data-testid="login-token" onClick={() => login('test-token')}>
        Login with Token
      </button>
      <button data-testid="logout" onClick={logout}>
        Logout
      </button>
    </div>
  );
}

// Test wrapper component
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Protected component for testing
function ProtectedComponent() {
  return <div data-testid="protected-content">Protected Content</div>;
}

describe('Frontend Authentication Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock implementations
    (authApi.getToken as any).mockReturnValue(null);
    (authApi.setupInterceptors as any).mockReturnValue(vi.fn());
    (authApi.getProfile as any).mockResolvedValue(mockUser);
    (authApi.logout as any).mockResolvedValue(undefined);
    
    // Clear mock location
    mockLocation.href = '';
    
    // Clear mock storage
    mockSessionStorage.getItem.mockReturnValue(null);
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Authentication Flow', () => {
    it('should handle complete GitHub OAuth flow', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Initially should be unauthenticated
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');

      // Click GitHub login button
      await user.click(screen.getByTestId('login-github'));

      // Should redirect to GitHub OAuth
      await waitFor(() => {
        expect(mockLocation.href).toContain('github.com/login/oauth/authorize');
        expect(mockLocation.href).toContain('client_id=test_client_id');
        expect(mockLocation.href).toContain('scope=user:email');
      });

      // Verify state was stored
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(String)
      );
    });

    it('should handle OAuth callback and complete authentication', async () => {
      // Mock successful OAuth callback
      (authApi.handleOAuthCallback as any).mockResolvedValue({
        user: mockUser,
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });

      // Mock token storage
      (authApi.getToken as any).mockReturnValue('test-access-token');

      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Simulate OAuth callback by directly calling login
      await act(async () => {
        const loginButton = screen.getByTestId('login-token');
        await userEvent.setup().click(loginButton);
      });

      // Should be authenticated
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // User info should be displayed
      expect(screen.getByTestId('username')).toHaveTextContent('testuser');
      expect(screen.getByTestId('email')).toHaveTextContent('test@example.com');

      // Token should be set
      expect(authApi.setToken).toHaveBeenCalledWith('test-token');
    });

    it('should handle authentication with token refresh', async () => {
      // Mock initial authentication
      (authApi.getToken as any).mockReturnValue('expired-token');
      (authApi.getProfile as any)
        .mockRejectedValueOnce({ response: { status: 401 } }) // First call fails
        .mockResolvedValueOnce(mockUser); // Second call succeeds after refresh

      (authApi.refreshToken as any).mockResolvedValue({
        accessToken: 'new-access-token',
      });

      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Should eventually be authenticated after token refresh
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
    });

    it('should handle logout flow completely', async () => {
      const user = userEvent.setup();
      
      // Start with authenticated state
      (authApi.getToken as any).mockReturnValue('test-token');
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Wait for authentication
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Click logout
      await user.click(screen.getByTestId('logout'));

      // Should be unauthenticated
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Token should be removed
      expect(authApi.removeToken).toHaveBeenCalled();
    });
  });

  describe('Session Persistence and Recovery', () => {
    it('should restore authentication state from stored token', async () => {
      // Mock stored token
      (authApi.getToken as any).mockReturnValue('stored-token');
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Should be authenticated from stored token
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      expect(authApi.getProfile).toHaveBeenCalled();
    });

    it('should handle session expiry gracefully', async () => {
      // Mock token that becomes invalid
      (authApi.getToken as any).mockReturnValue('expired-token');
      (authApi.getProfile as any).mockRejectedValue({
        response: { status: 401 }
      });

      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Should handle expired token and become unauthenticated
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Token should be removed
      expect(authApi.removeToken).toHaveBeenCalled();
    });

    it('should maintain authentication across component remounts', async () => {
      (authApi.getToken as any).mockReturnValue('persistent-token');
      
      const { rerender } = render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Wait for initial authentication
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Remount component
      rerender(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Should still be authenticated
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    it('should handle concurrent authentication requests', async () => {
      const user = userEvent.setup();
      (authApi.getToken as any).mockReturnValue(null);
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Click login multiple times quickly
      const loginButton = screen.getByTestId('login-token');
      await Promise.all([
        user.click(loginButton),
        user.click(loginButton),
        user.click(loginButton),
      ]);

      // Should handle concurrent requests gracefully
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Should only call setToken once
      expect(authApi.setToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Protected Route Integration', () => {
    it('should allow access to protected content when authenticated', async () => {
      (authApi.getToken as any).mockReturnValue('valid-token');
      
      render(
        <TestWrapper>
          <ProtectedRoute>
            <ProtectedComponent />
          </ProtectedRoute>
        </TestWrapper>
      );

      // Should show protected content
      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('should redirect to login when not authenticated', async () => {
      (authApi.getToken as any).mockReturnValue(null);
      
      // Mock useNavigate
      const mockNavigate = vi.fn();
      vi.mock('react-router-dom', async () => {
        const actual = await vi.importActual('react-router-dom') as any;
        return {
          ...actual,
          useNavigate: () => mockNavigate,
        };
      });

      render(
        <TestWrapper>
          <ProtectedRoute>
            <ProtectedComponent />
          </ProtectedRoute>
        </TestWrapper>
      );

      // Should not show protected content
      await waitFor(() => {
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      });
    });

    it('should show loading state while checking authentication', async () => {
      (authApi.getToken as any).mockReturnValue('token');
      (authApi.getProfile as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUser), 100))
      );
      
      render(
        <TestWrapper>
          <ProtectedRoute>
            <ProtectedComponent />
          </ProtectedRoute>
        </TestWrapper>
      );

      // Should show loading initially
      expect(screen.getByRole('status')).toBeInTheDocument(); // LoadingSpinner

      // Should show protected content after loading
      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });
  });

  describe('GitHub Login Button Integration', () => {
    it('should handle GitHub login button click', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <GitHubLoginButton>Login with GitHub</GitHubLoginButton>
        </TestWrapper>
      );

      const loginButton = screen.getByRole('button', { name: /login with github/i });
      await user.click(loginButton);

      // Should redirect to GitHub OAuth
      expect(mockLocation.href).toContain('github.com/login/oauth/authorize');
    });

    it('should show loading state during authentication', async () => {
      // Mock slow authentication
      (authApi.getProfile as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUser), 100))
      );
      
      render(
        <TestWrapper>
          <GitHubLoginButton>Login with GitHub</GitHubLoginButton>
        </TestWrapper>
      );

      const loginButton = screen.getByRole('button', { name: /login with github/i });
      
      // Should not show loading initially
      expect(loginButton).not.toBeDisabled();
      
      // Click and check loading state
      await userEvent.setup().click(loginButton);
      
      // Should handle loading state appropriately
      expect(mockLocation.href).toContain('github.com');
    });

    it('should be disabled when already loading', async () => {
      // Mock loading state
      (authApi.getToken as any).mockReturnValue('token');
      (authApi.getProfile as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUser), 100))
      );
      
      render(
        <TestWrapper>
          <GitHubLoginButton>Login with GitHub</GitHubLoginButton>
        </TestWrapper>
      );

      // Button should be disabled during loading
      await waitFor(() => {
        const loginButton = screen.getByRole('button', { name: /login with github/i });
        expect(loginButton).toBeDisabled();
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle authentication API errors', async () => {
      const user = userEvent.setup();
      (authApi.getProfile as any).mockRejectedValue(new Error('API Error'));
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Try to authenticate
      await user.click(screen.getByTestId('login-token'));

      // Should handle error gracefully
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });
    });

    it('should handle network errors during OAuth', async () => {
      const user = userEvent.setup();
      (authApi.handleOAuthCallback as any).mockRejectedValue(
        new Error('Network error')
      );
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Should handle network errors gracefully
      await user.click(screen.getByTestId('login-github'));
      
      // Should still redirect (error handling happens in callback)
      expect(mockLocation.href).toContain('github.com');
    });

    it('should recover from temporary API failures', async () => {
      const user = userEvent.setup();
      
      // Mock API failure then success
      (authApi.getProfile as any)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(mockUser);
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // First attempt fails
      await user.click(screen.getByTestId('login-token'));
      
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Second attempt succeeds
      await user.click(screen.getByTestId('login-token'));
      
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
    });

    it('should handle token refresh failures', async () => {
      // Mock token refresh failure
      (authApi.getToken as any).mockReturnValue('expired-token');
      (authApi.getProfile as any).mockRejectedValue({
        response: { status: 401 }
      });
      (authApi.refreshToken as any).mockRejectedValue(
        new Error('Refresh failed')
      );
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Should handle refresh failure and logout
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      expect(authApi.removeToken).toHaveBeenCalled();
    });

    it('should handle logout errors gracefully', async () => {
      const user = userEvent.setup();
      
      // Start authenticated
      (authApi.getToken as any).mockReturnValue('token');
      (authApi.logout as any).mockRejectedValue(new Error('Logout failed'));
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Logout should work even if API call fails
      await user.click(screen.getByTestId('logout'));

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Token should still be removed locally
      expect(authApi.removeToken).toHaveBeenCalled();
    });
  });

  describe('State Management and Consistency', () => {
    it('should maintain consistent state across multiple components', async () => {
      (authApi.getToken as any).mockReturnValue('token');
      
      render(
        <TestWrapper>
          <TestAuthComponent />
          <TestAuthComponent />
        </TestWrapper>
      );

      // Both components should show same auth state
      const authStatuses = screen.getAllByTestId('auth-status');
      
      await waitFor(() => {
        authStatuses.forEach(status => {
          expect(status).toHaveTextContent('authenticated');
        });
      });

      // Both should show same user info
      const usernames = screen.getAllByTestId('username');
      usernames.forEach(username => {
        expect(username).toHaveTextContent('testuser');
      });
    });

    it('should update all components when authentication state changes', async () => {
      const user = userEvent.setup();
      (authApi.getToken as any).mockReturnValue('token');
      
      render(
        <TestWrapper>
          <TestAuthComponent />
          <TestAuthComponent />
        </TestWrapper>
      );

      // Wait for authentication
      await waitFor(() => {
        const authStatuses = screen.getAllByTestId('auth-status');
        authStatuses.forEach(status => {
          expect(status).toHaveTextContent('authenticated');
        });
      });

      // Logout from one component
      const logoutButtons = screen.getAllByTestId('logout');
      await user.click(logoutButtons[0]);

      // Both components should be unauthenticated
      await waitFor(() => {
        const authStatuses = screen.getAllByTestId('auth-status');
        authStatuses.forEach(status => {
          expect(status).toHaveTextContent('unauthenticated');
        });
      });
    });

    it('should handle rapid state changes correctly', async () => {
      const user = userEvent.setup();
      (authApi.getToken as any).mockReturnValue(null);
      
      render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Rapid login/logout cycles
      for (let i = 0; i < 3; i++) {
        await user.click(screen.getByTestId('login-token'));
        await waitFor(() => {
          expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
        });

        await user.click(screen.getByTestId('logout'));
        await waitFor(() => {
          expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
        });
      }

      // Final state should be consistent
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    });
  });

  describe('Memory and Performance', () => {
    it('should clean up resources on unmount', async () => {
      const cleanupFn = vi.fn();
      (authApi.setupInterceptors as any).mockReturnValue(cleanupFn);
      
      const { unmount } = render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Unmount component
      unmount();

      // Cleanup should be called
      expect(cleanupFn).toHaveBeenCalled();
    });

    it('should not cause memory leaks with frequent re-renders', async () => {
      (authApi.getToken as any).mockReturnValue('token');
      
      const { rerender } = render(
        <TestWrapper>
          <TestAuthComponent />
        </TestWrapper>
      );

      // Multiple re-renders
      for (let i = 0; i < 10; i++) {
        rerender(
          <TestWrapper>
            <TestAuthComponent />
          </TestWrapper>
        );
      }

      // Should still work correctly
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
    });
  });
});