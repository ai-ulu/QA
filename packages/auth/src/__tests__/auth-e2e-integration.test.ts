/**
 * End-to-End Authentication Integration Tests
 * Feature: autoqa-pilot, E2E Authentication Integration
 * 
 * Tests complete authentication flow across backend and frontend components.
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { GitHubOAuthClient } from '../github-oauth';
import { JWTManager } from '../jwt-manager';
import { SessionManager } from '../session-manager';
import { redis } from '@autoqa/cache';
import axios from 'axios';
import { randomBytes } from 'crypto';

// Mock axios for controlled testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Test configuration
const testOAuthConfig = {
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret',
  redirectUri: 'https://test.example.com/auth/callback',
  scopes: ['user:email', 'read:user'],
};

const testJWTConfig = {
  accessTokenSecret: 'test_access_secret_that_is_long_enough_for_security',
  refreshTokenSecret: 'test_refresh_secret_that_is_long_enough_for_security',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'autoqa-test',
  audience: 'autoqa-test-users',
};

const testSessionConfig = {
  ttl: 86400, // 24 hours
  rolling: true,
  secure: false, // For testing
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  cookieName: 'test_session',
};

// Mock GitHub user data
const mockGitHubUser = {
  id: 12345,
  login: 'testuser',
  name: 'Test User',
  email: 'test@example.com',
  avatar_url: 'https://github.com/images/error/testuser_happy.gif',
  html_url: 'https://github.com/testuser',
  company: 'Test Company',
  location: 'Test City',
  bio: 'Test bio',
  public_repos: 10,
  followers: 5,
  following: 3,
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockGitHubEmails = [
  {
    email: 'test@example.com',
    primary: true,
    verified: true,
    visibility: 'public',
  },
];

// Authentication service class that simulates the complete flow
class AuthenticationService {
  private oauthClient: GitHubOAuthClient;
  private jwtManager: JWTManager;
  private sessionManager: SessionManager;

  constructor() {
    this.oauthClient = new GitHubOAuthClient(testOAuthConfig);
    this.jwtManager = new JWTManager(testJWTConfig);
    this.sessionManager = new SessionManager(testSessionConfig);
  }

  /**
   * Simulate complete authentication flow
   */
  async authenticateUser(options: {
    usePKCE?: boolean;
    additionalScopes?: string[];
  } = {}) {
    // Step 1: Generate OAuth URL (frontend initiates)
    const authData = await this.oauthClient.generateAuthUrl(options);

    // Step 2: User authorizes on GitHub (simulated)
    const authorizationCode = 'mock_authorization_code';

    // Step 3: Exchange code for token (backend handles callback)
    const tokenResult = await this.oauthClient.exchangeCodeForToken(
      authorizationCode,
      authData.state,
      authData.codeVerifier
    );

    if (!tokenResult.success || !tokenResult.user) {
      throw new Error('OAuth authentication failed');
    }

    // Step 4: Create user session
    const session = await this.sessionManager.createSession({
      userId: tokenResult.user.id.toString(),
      username: tokenResult.user.login,
      email: tokenResult.user.email,
      roles: ['user'],
      permissions: ['read', 'write'],
      metadata: {
        githubId: tokenResult.user.id,
        loginMethod: 'github',
        oauthProvider: 'github',
        githubAccessToken: tokenResult.tokens?.accessToken,
      },
    });

    // Step 5: Generate JWT tokens for API access
    const jwtTokens = await this.jwtManager.generateTokenPair({
      userId: session.userId,
      username: session.username,
      email: session.email,
      roles: session.roles,
      permissions: session.permissions,
      sessionId: session.sessionId,
    });

    return {
      user: tokenResult.user,
      session,
      tokens: jwtTokens,
      oauthTokens: tokenResult.tokens,
    };
  }

  /**
   * Validate authentication state
   */
  async validateAuthentication(accessToken: string) {
    const validation = await this.jwtManager.validateAccessToken(accessToken);
    
    if (!validation.valid || !validation.payload) {
      return { valid: false, error: validation.error };
    }

    const session = await this.sessionManager.getSession(validation.payload.sessionId);
    
    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    return {
      valid: true,
      user: validation.payload,
      session,
    };
  }

  /**
   * Refresh authentication tokens
   */
  async refreshAuthentication(refreshToken: string) {
    const refreshResult = await this.jwtManager.refreshAccessToken(refreshToken);
    
    if (!refreshResult.success || !refreshResult.tokens) {
      throw new Error('Token refresh failed');
    }

    return refreshResult.tokens;
  }

  /**
   * Logout user completely
   */
  async logoutUser(accessToken: string, refreshToken: string) {
    // Blacklist tokens
    await Promise.all([
      this.jwtManager.blacklistToken(accessToken),
      this.jwtManager.blacklistToken(refreshToken),
    ]);

    // Get session ID from token
    const validation = await this.jwtManager.validateAccessToken(accessToken);
    if (validation.payload?.sessionId) {
      await this.sessionManager.destroySession(validation.payload.sessionId);
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string) {
    return this.sessionManager.getUserSessions(userId);
  }

  /**
   * Destroy all user sessions
   */
  async logoutAllDevices(userId: string) {
    return this.sessionManager.destroyUserSessions(userId);
  }
}

// Test setup and teardown
beforeAll(async () => {
  await redis.ping();
});

beforeEach(async () => {
  await redis.flushdb();
  jest.clearAllMocks();
  
  // Setup default axios mocks
  mockedAxios.create.mockReturnValue(mockedAxios);
  mockedAxios.post.mockResolvedValue({
    data: {
      access_token: 'mock_github_access_token',
      token_type: 'bearer',
      scope: 'user:email',
    },
  });
  mockedAxios.get.mockImplementation((url) => {
    if (url.includes('/user/emails')) {
      return Promise.resolve({ data: mockGitHubEmails });
    }
    if (url.includes('/user')) {
      return Promise.resolve({ data: mockGitHubUser });
    }
    return Promise.reject(new Error('Unknown endpoint'));
  });
});

afterEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await redis.flushdb();
});

describe('End-to-End Authentication Integration', () => {
  let authService: AuthenticationService;

  beforeEach(() => {
    authService = new AuthenticationService();
  });

  describe('Complete Authentication Lifecycle', () => {
    it('should complete full authentication lifecycle', async () => {
      // Step 1: Authenticate user
      const authResult = await authService.authenticateUser({ usePKCE: true });

      expect(authResult.user).toEqual(mockGitHubUser);
      expect(authResult.session.userId).toBe(mockGitHubUser.id.toString());
      expect(authResult.tokens.accessToken).toBeDefined();
      expect(authResult.tokens.refreshToken).toBeDefined();

      // Step 2: Validate authentication
      const validation = await authService.validateAuthentication(authResult.tokens.accessToken);

      expect(validation.valid).toBe(true);
      expect(validation.user?.userId).toBe(mockGitHubUser.id.toString());
      expect(validation.session?.sessionId).toBe(authResult.session.sessionId);

      // Step 3: Refresh tokens
      const newTokens = await authService.refreshAuthentication(authResult.tokens.refreshToken);

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(authResult.tokens.accessToken);

      // Step 4: Validate new tokens
      const newValidation = await authService.validateAuthentication(newTokens.accessToken);

      expect(newValidation.valid).toBe(true);
      expect(newValidation.user?.userId).toBe(mockGitHubUser.id.toString());

      // Step 5: Logout
      await authService.logoutUser(newTokens.accessToken, newTokens.refreshToken);

      // Step 6: Validate tokens are invalid after logout
      const postLogoutValidation = await authService.validateAuthentication(newTokens.accessToken);

      expect(postLogoutValidation.valid).toBe(false);
    });

    it('should handle multi-device authentication scenario', async () => {
      const userId = mockGitHubUser.id.toString();

      // Authenticate on multiple devices
      const device1Auth = await authService.authenticateUser({ usePKCE: true });
      const device2Auth = await authService.authenticateUser({ usePKCE: true });
      const device3Auth = await authService.authenticateUser({ usePKCE: true });

      // All devices should have valid authentication
      const validations = await Promise.all([
        authService.validateAuthentication(device1Auth.tokens.accessToken),
        authService.validateAuthentication(device2Auth.tokens.accessToken),
        authService.validateAuthentication(device3Auth.tokens.accessToken),
      ]);

      validations.forEach(validation => {
        expect(validation.valid).toBe(true);
        expect(validation.user?.userId).toBe(userId);
      });

      // User should have 3 active sessions
      const userSessions = await authService.getUserSessions(userId);
      expect(userSessions).toHaveLength(3);

      // Logout from one device
      await authService.logoutUser(
        device1Auth.tokens.accessToken,
        device1Auth.tokens.refreshToken
      );

      // Device 1 should be invalid, others should still be valid
      const postLogoutValidations = await Promise.all([
        authService.validateAuthentication(device1Auth.tokens.accessToken),
        authService.validateAuthentication(device2Auth.tokens.accessToken),
        authService.validateAuthentication(device3Auth.tokens.accessToken),
      ]);

      expect(postLogoutValidations[0].valid).toBe(false);
      expect(postLogoutValidations[1].valid).toBe(true);
      expect(postLogoutValidations[2].valid).toBe(true);

      // User should have 2 active sessions
      const remainingSessions = await authService.getUserSessions(userId);
      expect(remainingSessions).toHaveLength(2);

      // Logout from all devices
      const loggedOutCount = await authService.logoutAllDevices(userId);
      expect(loggedOutCount).toBe(2);

      // All remaining tokens should be invalid
      const finalValidations = await Promise.all([
        authService.validateAuthentication(device2Auth.tokens.accessToken),
        authService.validateAuthentication(device3Auth.tokens.accessToken),
      ]);

      finalValidations.forEach(validation => {
        expect(validation.valid).toBe(false);
      });

      // No active sessions should remain
      const finalSessions = await authService.getUserSessions(userId);
      expect(finalSessions).toHaveLength(0);
    });

    it('should handle authentication with additional scopes', async () => {
      const additionalScopes = ['repo', 'admin:org'];
      
      const authResult = await authService.authenticateUser({
        usePKCE: true,
        additionalScopes,
      });

      expect(authResult.user).toEqual(mockGitHubUser);
      expect(authResult.session.metadata.oauthProvider).toBe('github');
      expect(authResult.session.metadata.githubAccessToken).toBe('mock_github_access_token');

      // Validate authentication works
      const validation = await authService.validateAuthentication(authResult.tokens.accessToken);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle OAuth failures gracefully', async () => {
      // Mock OAuth failure
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          error: 'invalid_grant',
          error_description: 'The provided authorization grant is invalid',
        },
      });

      await expect(
        authService.authenticateUser({ usePKCE: true })
      ).rejects.toThrow('OAuth authentication failed');
    });

    it('should handle GitHub API failures', async () => {
      // Mock GitHub API failure
      mockedAxios.get.mockRejectedValueOnce(new Error('GitHub API unavailable'));

      await expect(
        authService.authenticateUser({ usePKCE: true })
      ).rejects.toThrow('Failed to fetch user information');
    });

    it('should handle Redis failures during authentication', async () => {
      // Mock Redis failure during session creation
      const originalSetex = redis.setex;
      redis.setex = jest.fn().mockRejectedValue(new Error('Redis unavailable'));

      try {
        await expect(
          authService.authenticateUser({ usePKCE: true })
        ).rejects.toThrow();
      } finally {
        redis.setex = originalSetex;
      }
    });

    it('should handle token refresh failures', async () => {
      // Authenticate user first
      const authResult = await authService.authenticateUser({ usePKCE: true });

      // Mock Redis failure during refresh
      const originalGet = redis.get;
      redis.get = jest.fn().mockRejectedValue(new Error('Redis unavailable'));

      try {
        await expect(
          authService.refreshAuthentication(authResult.tokens.refreshToken)
        ).rejects.toThrow('Token refresh failed');
      } finally {
        redis.get = originalGet;
      }
    });

    it('should handle session expiry during validation', async () => {
      // Create authentication with short session TTL
      const shortSessionConfig = {
        ...testSessionConfig,
        ttl: 1, // 1 second
      };
      
      const shortAuthService = new AuthenticationService();
      shortAuthService['sessionManager'] = new SessionManager(shortSessionConfig);

      const authResult = await shortAuthService.authenticateUser({ usePKCE: true });

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Validation should fail due to expired session
      const validation = await shortAuthService.validateAuthentication(authResult.tokens.accessToken);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Session invalid or expired');
    });

    it('should recover from partial authentication state', async () => {
      const authResult = await authService.authenticateUser({ usePKCE: true });

      // Simulate partial state corruption (remove session but keep JWT data)
      await redis.del(`session:${authResult.session.sessionId}`);

      // Validation should fail gracefully
      const validation = await authService.validateAuthentication(authResult.tokens.accessToken);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Session invalid or expired');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent authentication attempts', async () => {
      // Simulate multiple concurrent authentication attempts
      const authPromises = Array(5).fill(null).map(() =>
        authService.authenticateUser({ usePKCE: true })
      );

      const authResults = await Promise.all(authPromises);

      // All authentications should succeed
      expect(authResults).toHaveLength(5);
      authResults.forEach(result => {
        expect(result.user).toEqual(mockGitHubUser);
        expect(result.tokens.accessToken).toBeDefined();
      });

      // All tokens should be unique
      const accessTokens = authResults.map(r => r.tokens.accessToken);
      const uniqueTokens = new Set(accessTokens);
      expect(uniqueTokens.size).toBe(5);

      // All sessions should be valid
      const validations = await Promise.all(
        authResults.map(result =>
          authService.validateAuthentication(result.tokens.accessToken)
        )
      );

      validations.forEach(validation => {
        expect(validation.valid).toBe(true);
      });
    });

    it('should handle concurrent token refresh attempts', async () => {
      const authResult = await authService.authenticateUser({ usePKCE: true });

      // Attempt concurrent refresh
      const refreshPromises = Array(3).fill(null).map(() =>
        authService.refreshAuthentication(authResult.tokens.refreshToken)
      );

      const refreshResults = await Promise.allSettled(refreshPromises);

      // Only one should succeed, others should fail
      const successCount = refreshResults.filter(r => r.status === 'fulfilled').length;
      const failureCount = refreshResults.filter(r => r.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(2);
    });

    it('should handle concurrent logout attempts', async () => {
      const authResult = await authService.authenticateUser({ usePKCE: true });

      // Attempt concurrent logout
      const logoutPromises = Array(3).fill(null).map(() =>
        authService.logoutUser(
          authResult.tokens.accessToken,
          authResult.tokens.refreshToken
        )
      );

      // All should complete without error
      await Promise.all(logoutPromises);

      // Token should be invalid
      const validation = await authService.validateAuthentication(authResult.tokens.accessToken);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume authentication efficiently', async () => {
      const startTime = Date.now();
      const userCount = 20;

      // Create many concurrent authentications
      const authPromises = Array(userCount).fill(null).map((_, index) => {
        // Mock different users
        const userMock = {
          ...mockGitHubUser,
          id: mockGitHubUser.id + index,
          login: `testuser${index}`,
          email: `test${index}@example.com`,
        };

        mockedAxios.get.mockImplementation((url) => {
          if (url.includes('/user/emails')) {
            return Promise.resolve({ data: mockGitHubEmails });
          }
          if (url.includes('/user')) {
            return Promise.resolve({ data: userMock });
          }
          return Promise.reject(new Error('Unknown endpoint'));
        });

        return authService.authenticateUser({ usePKCE: true });
      });

      const authResults = await Promise.all(authPromises);
      const endTime = Date.now();

      // All authentications should succeed
      expect(authResults).toHaveLength(userCount);

      // Should complete within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Validate all tokens
      const validationPromises = authResults.map(result =>
        authService.validateAuthentication(result.tokens.accessToken)
      );

      const validations = await Promise.all(validationPromises);
      validations.forEach(validation => {
        expect(validation.valid).toBe(true);
      });
    });

    it('should maintain performance under token refresh load', async () => {
      // Create initial authentications
      const authResults = await Promise.all(
        Array(10).fill(null).map(() =>
          authService.authenticateUser({ usePKCE: true })
        )
      );

      const startTime = Date.now();

      // Refresh all tokens concurrently
      const refreshPromises = authResults.map(result =>
        authService.refreshAuthentication(result.tokens.refreshToken)
      );

      const refreshResults = await Promise.allSettled(refreshPromises);
      const endTime = Date.now();

      // Most should succeed (some may fail due to race conditions)
      const successCount = refreshResults.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain data consistency across all components', async () => {
      const authResult = await authService.authenticateUser({ usePKCE: true });

      // Verify data consistency between JWT payload and session
      const validation = await authService.validateAuthentication(authResult.tokens.accessToken);
      
      expect(validation.valid).toBe(true);
      expect(validation.user?.userId).toBe(authResult.session.userId);
      expect(validation.user?.username).toBe(authResult.session.username);
      expect(validation.user?.sessionId).toBe(authResult.session.sessionId);
      expect(validation.session?.userId).toBe(authResult.session.userId);
      expect(validation.session?.sessionId).toBe(authResult.session.sessionId);
    });

    it('should maintain referential integrity during cleanup', async () => {
      const userId = mockGitHubUser.id.toString();
      
      // Create multiple sessions
      const authResults = await Promise.all([
        authService.authenticateUser({ usePKCE: true }),
        authService.authenticateUser({ usePKCE: true }),
        authService.authenticateUser({ usePKCE: true }),
      ]);

      // Verify all sessions exist
      const initialSessions = await authService.getUserSessions(userId);
      expect(initialSessions).toHaveLength(3);

      // Logout all devices
      const loggedOutCount = await authService.logoutAllDevices(userId);
      expect(loggedOutCount).toBe(3);

      // Verify complete cleanup
      const finalSessions = await authService.getUserSessions(userId);
      expect(finalSessions).toHaveLength(0);

      // Verify no orphaned data in Redis
      const sessionKeys = await redis.keys('session:*');
      const userSessionKeys = await redis.keys('user_sessions:*');
      const refreshTokenKeys = await redis.keys('jwt:refresh:*');

      expect(sessionKeys).toHaveLength(0);
      expect(userSessionKeys).toHaveLength(0);
      expect(refreshTokenKeys).toHaveLength(0);
    });
  });
});