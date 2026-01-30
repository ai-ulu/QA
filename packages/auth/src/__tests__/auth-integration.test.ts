/**
 * Integration Tests for Authentication Flow
 * Feature: autoqa-pilot, Authentication Integration
 * 
 * Tests complete OAuth flow end-to-end, session persistence and expiry, and error scenarios.
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
  {
    email: 'private@example.com',
    primary: false,
    verified: true,
    visibility: 'private',
  },
];

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
      access_token: 'mock_access_token',
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

describe('Complete OAuth Flow End-to-End', () => {
  let oauthClient: GitHubOAuthClient;
  let jwtManager: JWTManager;
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    oauthClient = new GitHubOAuthClient(testOAuthConfig);
    jwtManager = new JWTManager(testJWTConfig);
    sessionManager = new SessionManager(testSessionConfig);
  });
  
  describe('Successful Authentication Flow', () => {
    it('should complete full OAuth flow with PKCE', async () => {
      // Step 1: Generate OAuth URL with PKCE
      const authData = await oauthClient.generateAuthUrl({ usePKCE: true });
      
      expect(authData.state).toBeDefined();
      expect(authData.codeVerifier).toBeDefined();
      expect(authData.url).toContain('code_challenge');
      expect(authData.url).toContain('code_challenge_method=S256');
      
      // Verify state is stored in Redis
      const stateData = await redis.get(`oauth:state:${authData.state}`);
      expect(stateData).toBeTruthy();
      
      const parsedState = JSON.parse(stateData!);
      expect(parsedState.codeVerifier).toBe(authData.codeVerifier);
      
      // Step 2: Exchange code for token
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_authorization_code',
        authData.state,
        authData.codeVerifier
      );
      
      expect(tokenResult.success).toBe(true);
      expect(tokenResult.user).toEqual(mockGitHubUser);
      expect(tokenResult.tokens).toBeDefined();
      expect(tokenResult.tokens?.accessToken).toBe('mock_access_token');
      
      // Verify state is cleaned up
      const cleanedState = await redis.get(`oauth:state:${authData.state}`);
      expect(cleanedState).toBeNull();
      
      // Step 3: Create session with user data
      const session = await sessionManager.createSession({
        userId: mockGitHubUser.id.toString(),
        username: mockGitHubUser.login,
        email: mockGitHubUser.email,
        roles: ['user'],
        permissions: ['read', 'write'],
        metadata: {
          githubId: mockGitHubUser.id,
          loginMethod: 'github',
          oauthProvider: 'github',
        },
      });
      
      expect(session.userId).toBe(mockGitHubUser.id.toString());
      expect(session.username).toBe(mockGitHubUser.login);
      expect(session.email).toBe(mockGitHubUser.email);
      
      // Step 4: Generate JWT tokens
      const jwtTokens = await jwtManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      expect(jwtTokens.accessToken).toBeDefined();
      expect(jwtTokens.refreshToken).toBeDefined();
      expect(jwtTokens.tokenId).toBeDefined();
      
      // Step 5: Validate tokens work with session
      const accessValidation = await jwtManager.validateAccessToken(jwtTokens.accessToken);
      expect(accessValidation.valid).toBe(true);
      expect(accessValidation.payload?.sessionId).toBe(session.sessionId);
      
      const refreshValidation = await jwtManager.validateRefreshToken(jwtTokens.refreshToken);
      expect(refreshValidation.valid).toBe(true);
      expect(refreshValidation.payload?.sessionId).toBe(session.sessionId);
      
      // Step 6: Verify session is retrievable
      const retrievedSession = await sessionManager.getSession(session.sessionId);
      expect(retrievedSession).toBeTruthy();
      expect(retrievedSession?.userId).toBe(session.userId);
    });
    
    it('should complete OAuth flow without PKCE', async () => {
      // Step 1: Generate OAuth URL without PKCE
      const authData = await oauthClient.generateAuthUrl({ usePKCE: false });
      
      expect(authData.state).toBeDefined();
      expect(authData.codeVerifier).toBeUndefined();
      expect(authData.url).not.toContain('code_challenge');
      
      // Step 2: Exchange code for token (without code verifier)
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_authorization_code',
        authData.state
      );
      
      expect(tokenResult.success).toBe(true);
      expect(tokenResult.user).toEqual(mockGitHubUser);
      
      // Verify axios was called with correct parameters (no code_verifier)
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/access_token'),
        expect.not.objectContaining({
          code_verifier: expect.anything(),
        }),
        expect.any(Object)
      );
    });
    
    it('should handle user with private email', async () => {
      // Mock user without public email
      const userWithoutEmail = { ...mockGitHubUser, email: null };
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('/user/emails')) {
          return Promise.resolve({ data: mockGitHubEmails });
        }
        if (url.includes('/user')) {
          return Promise.resolve({ data: userWithoutEmail });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });
      
      const authData = await oauthClient.generateAuthUrl();
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_authorization_code',
        authData.state
      );
      
      expect(tokenResult.success).toBe(true);
      expect(tokenResult.user?.email).toBe('test@example.com'); // Primary verified email
    });
    
    it('should complete full authentication with token refresh', async () => {
      // Complete initial OAuth flow
      const authData = await oauthClient.generateAuthUrl({ usePKCE: true });
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_authorization_code',
        authData.state,
        authData.codeVerifier
      );
      
      expect(tokenResult.success).toBe(true);
      
      // Create session and JWT tokens
      const session = await sessionManager.createSession({
        userId: mockGitHubUser.id.toString(),
        username: mockGitHubUser.login,
        email: mockGitHubUser.email,
        roles: ['user'],
        permissions: ['read', 'write'],
        metadata: {},
      });
      
      const initialTokens = await jwtManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      // Refresh tokens
      const refreshResult = await jwtManager.refreshAccessToken(initialTokens.refreshToken);
      
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.tokens).toBeDefined();
      expect(refreshResult.tokens?.accessToken).not.toBe(initialTokens.accessToken);
      expect(refreshResult.tokens?.refreshToken).not.toBe(initialTokens.refreshToken);
      
      // Verify new tokens work
      const newAccessValidation = await jwtManager.validateAccessToken(
        refreshResult.tokens!.accessToken
      );
      expect(newAccessValidation.valid).toBe(true);
      expect(newAccessValidation.payload?.sessionId).toBe(session.sessionId);
      
      // Verify old refresh token is invalidated
      const oldRefreshValidation = await jwtManager.validateRefreshToken(
        initialTokens.refreshToken
      );
      expect(oldRefreshValidation.valid).toBe(false);
    });
  });
  
  describe('OAuth Flow with Additional Scopes', () => {
    it('should handle additional scopes in OAuth flow', async () => {
      const additionalScopes = ['repo', 'admin:org'];
      const authData = await oauthClient.generateAuthUrl({
        usePKCE: true,
        additionalScopes,
      });
      
      const url = new URL(authData.url);
      const scopes = url.searchParams.get('scope')?.split(' ') || [];
      
      // Should include base scopes and additional scopes
      expect(scopes).toContain('user:email');
      expect(scopes).toContain('read:user');
      expect(scopes).toContain('repo');
      expect(scopes).toContain('admin:org');
      
      // Complete the flow
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_authorization_code',
        authData.state,
        authData.codeVerifier
      );
      
      expect(tokenResult.success).toBe(true);
    });
  });
  
  describe('Multi-Device Authentication', () => {
    it('should support multiple concurrent sessions for same user', async () => {
      const userId = mockGitHubUser.id.toString();
      const username = mockGitHubUser.login;
      
      // Create multiple sessions (simulating different devices)
      const sessions = await Promise.all([
        sessionManager.createSession({
          userId,
          username,
          email: mockGitHubUser.email,
          roles: ['user'],
          permissions: ['read', 'write'],
          metadata: { device: 'desktop', userAgent: 'Chrome/Desktop' },
        }),
        sessionManager.createSession({
          userId,
          username,
          email: mockGitHubUser.email,
          roles: ['user'],
          permissions: ['read', 'write'],
          metadata: { device: 'mobile', userAgent: 'Safari/Mobile' },
        }),
        sessionManager.createSession({
          userId,
          username,
          email: mockGitHubUser.email,
          roles: ['user'],
          permissions: ['read', 'write'],
          metadata: { device: 'tablet', userAgent: 'Chrome/Tablet' },
        }),
      ]);
      
      // Generate JWT tokens for each session
      const tokenPairs = await Promise.all(
        sessions.map(session =>
          jwtManager.generateTokenPair({
            userId: session.userId,
            username: session.username,
            email: session.email,
            roles: session.roles,
            permissions: session.permissions,
            sessionId: session.sessionId,
          })
        )
      );
      
      // All sessions should be active
      const userSessions = await sessionManager.getUserSessions(userId);
      expect(userSessions).toHaveLength(3);
      
      // All tokens should be valid
      for (const tokenPair of tokenPairs) {
        const accessValidation = await jwtManager.validateAccessToken(tokenPair.accessToken);
        expect(accessValidation.valid).toBe(true);
        
        const refreshValidation = await jwtManager.validateRefreshToken(tokenPair.refreshToken);
        expect(refreshValidation.valid).toBe(true);
      }
      
      // Should be able to refresh tokens independently
      const refreshResult = await jwtManager.refreshAccessToken(tokenPairs[0].refreshToken);
      expect(refreshResult.success).toBe(true);
      
      // Other sessions should remain unaffected
      const otherTokenValidation = await jwtManager.validateAccessToken(tokenPairs[1].accessToken);
      expect(otherTokenValidation.valid).toBe(true);
    });
  });
});

describe('Session Persistence and Expiry', () => {
  let sessionManager: SessionManager;
  let jwtManager: JWTManager;
  
  beforeEach(() => {
    sessionManager = new SessionManager(testSessionConfig);
    jwtManager = new JWTManager(testJWTConfig);
  });
  
  describe('Session Persistence', () => {
    it('should persist session data across Redis operations', async () => {
      const sessionData = {
        userId: 'test-user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user', 'admin'],
        permissions: ['read', 'write', 'delete'],
        metadata: {
          loginMethod: 'github',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test Browser',
          lastAction: 'login',
        },
      };
      
      // Create session
      const session = await sessionManager.createSession(sessionData);
      expect(session.sessionId).toBeDefined();
      
      // Verify session persists after Redis operations
      await redis.ping(); // Simulate Redis activity
      
      const retrievedSession = await sessionManager.getSession(session.sessionId);
      expect(retrievedSession).toBeTruthy();
      expect(retrievedSession?.userId).toBe(sessionData.userId);
      expect(retrievedSession?.username).toBe(sessionData.username);
      expect(retrievedSession?.email).toBe(sessionData.email);
      expect(retrievedSession?.roles).toEqual(sessionData.roles);
      expect(retrievedSession?.permissions).toEqual(sessionData.permissions);
      expect(retrievedSession?.metadata).toEqual(sessionData.metadata);
      
      // Update session and verify persistence
      const updatedMetadata = {
        ...sessionData.metadata,
        lastAction: 'project_created',
        projectCount: 1,
      };
      
      const updateResult = await sessionManager.updateSession(session.sessionId, {
        metadata: updatedMetadata,
      });
      expect(updateResult).toBe(true);
      
      // Verify update persisted
      const updatedSession = await sessionManager.getSession(session.sessionId);
      expect(updatedSession?.metadata).toEqual(updatedMetadata);
    });
    
    it('should maintain session consistency with JWT tokens', async () => {
      // Create session
      const session = await sessionManager.createSession({
        userId: 'test-user-456',
        username: 'testuser2',
        email: 'test2@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Generate JWT tokens
      const tokens = await jwtManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      // Validate tokens reference correct session
      const accessValidation = await jwtManager.validateAccessToken(tokens.accessToken);
      expect(accessValidation.valid).toBe(true);
      expect(accessValidation.payload?.sessionId).toBe(session.sessionId);
      expect(accessValidation.payload?.userId).toBe(session.userId);
      
      // Update session activity
      await sessionManager.updateSessionActivity(session.sessionId);
      
      // Tokens should still be valid after session activity update
      const postUpdateValidation = await jwtManager.validateAccessToken(tokens.accessToken);
      expect(postUpdateValidation.valid).toBe(true);
      
      // Session should reflect updated activity
      const updatedSession = await sessionManager.getSession(session.sessionId);
      expect(updatedSession?.lastActivity).not.toEqual(session.lastActivity);
    });
    
    it('should handle rolling session expiry correctly', async () => {
      // Create session manager with short TTL for testing
      const shortTTLConfig = {
        ...testSessionConfig,
        ttl: 2, // 2 seconds
        rolling: true,
      };
      const shortSessionManager = new SessionManager(shortTTLConfig);
      
      const session = await shortSessionManager.createSession({
        userId: 'test-user-789',
        username: 'testuser3',
        email: 'test3@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      const initialExpiry = session.expiresAt;
      
      // Wait 1 second and update activity
      await new Promise(resolve => setTimeout(resolve, 1000));
      await shortSessionManager.updateSessionActivity(session.sessionId);
      
      // Session should still be valid and expiry should be extended
      const updatedSession = await shortSessionManager.getSession(session.sessionId);
      expect(updatedSession).toBeTruthy();
      expect(new Date(updatedSession!.expiresAt).getTime())
        .toBeGreaterThan(new Date(initialExpiry).getTime());
      
      // Wait for original expiry time to pass
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Session should still be valid due to rolling expiry
      const stillValidSession = await shortSessionManager.getSession(session.sessionId);
      expect(stillValidSession).toBeTruthy();
    });
  });
  
  describe('Session Expiry', () => {
    it('should expire sessions after TTL', async () => {
      // Create session manager with very short TTL
      const shortTTLConfig = {
        ...testSessionConfig,
        ttl: 1, // 1 second
        rolling: false, // No rolling expiry
      };
      const shortSessionManager = new SessionManager(shortTTLConfig);
      
      const session = await shortSessionManager.createSession({
        userId: 'test-user-expiry',
        username: 'expiryuser',
        email: 'expiry@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Session should be valid initially
      const initialSession = await shortSessionManager.getSession(session.sessionId);
      expect(initialSession).toBeTruthy();
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Session should be expired and cleaned up
      const expiredSession = await shortSessionManager.getSession(session.sessionId);
      expect(expiredSession).toBeNull();
    });
    
    it('should invalidate JWT tokens when session expires', async () => {
      // Create short-lived session
      const shortTTLConfig = {
        ...testSessionConfig,
        ttl: 1, // 1 second
        rolling: false,
      };
      const shortSessionManager = new SessionManager(shortTTLConfig);
      
      const session = await shortSessionManager.createSession({
        userId: 'test-user-jwt-expiry',
        username: 'jwtexpiryuser',
        email: 'jwtexpiry@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Generate JWT tokens with longer expiry than session
      const longJWTConfig = {
        ...testJWTConfig,
        accessTokenExpiry: '1h', // Much longer than session TTL
      };
      const longJWTManager = new JWTManager(longJWTConfig);
      
      const tokens = await longJWTManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      // Tokens should be valid initially
      const initialValidation = await longJWTManager.validateAccessToken(tokens.accessToken);
      expect(initialValidation.valid).toBe(true);
      
      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Tokens should be invalid due to session expiry
      const expiredValidation = await longJWTManager.validateAccessToken(tokens.accessToken);
      expect(expiredValidation.valid).toBe(false);
      expect(expiredValidation.error).toBe('Session invalid or expired');
    });
    
    it('should clean up expired sessions automatically', async () => {
      const shortTTLConfig = {
        ...testSessionConfig,
        ttl: 1, // 1 second
      };
      const shortSessionManager = new SessionManager(shortTTLConfig);
      
      // Create multiple sessions
      const sessions = await Promise.all([
        shortSessionManager.createSession({
          userId: 'user1',
          username: 'user1',
          email: 'user1@example.com',
          roles: ['user'],
          permissions: ['read'],
          metadata: {},
        }),
        shortSessionManager.createSession({
          userId: 'user2',
          username: 'user2',
          email: 'user2@example.com',
          roles: ['user'],
          permissions: ['read'],
          metadata: {},
        }),
        shortSessionManager.createSession({
          userId: 'user3',
          username: 'user3',
          email: 'user3@example.com',
          roles: ['user'],
          permissions: ['read'],
          metadata: {},
        }),
      ]);
      
      // All sessions should be active initially
      const initialStats = await shortSessionManager.getSessionStats();
      expect(initialStats.activeSessions).toBe(3);
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Clean up expired sessions
      const cleanedCount = await shortSessionManager.cleanupExpiredSessions();
      expect(cleanedCount).toBe(3);
      
      // Stats should reflect cleanup
      const finalStats = await shortSessionManager.getSessionStats();
      expect(finalStats.activeSessions).toBe(0);
      expect(finalStats.totalSessions).toBe(0);
    });
  });
  
  describe('Session Activity Tracking', () => {
    it('should track session activity correctly', async () => {
      const session = await sessionManager.createSession({
        userId: 'activity-user',
        username: 'activityuser',
        email: 'activity@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      const initialActivity = session.lastActivity;
      
      // Simulate some delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update activity
      const activityUpdated = await sessionManager.updateSessionActivity(session.sessionId);
      expect(activityUpdated).toBe(true);
      
      // Verify activity was updated
      const updatedSession = await sessionManager.getSession(session.sessionId);
      expect(updatedSession).toBeTruthy();
      expect(new Date(updatedSession!.lastActivity).getTime())
        .toBeGreaterThan(new Date(initialActivity).getTime());
    });
    
    it('should extend session expiry on activity when rolling is enabled', async () => {
      const session = await sessionManager.createSession({
        userId: 'rolling-user',
        username: 'rollinguser',
        email: 'rolling@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      const initialExpiry = session.expiresAt;
      
      // Simulate some delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update activity
      await sessionManager.updateSessionActivity(session.sessionId);
      
      // Verify expiry was extended
      const updatedSession = await sessionManager.getSession(session.sessionId);
      expect(updatedSession).toBeTruthy();
      expect(new Date(updatedSession!.expiresAt).getTime())
        .toBeGreaterThan(new Date(initialExpiry).getTime());
    });
  });
});

describe('Error Scenarios and Recovery', () => {
  let oauthClient: GitHubOAuthClient;
  let jwtManager: JWTManager;
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    oauthClient = new GitHubOAuthClient(testOAuthConfig);
    jwtManager = new JWTManager(testJWTConfig);
    sessionManager = new SessionManager(testSessionConfig);
  });
  
  describe('OAuth Error Scenarios', () => {
    it('should handle GitHub API errors gracefully', async () => {
      // Mock GitHub API error
      mockedAxios.post.mockRejectedValueOnce(new Error('GitHub API unavailable'));
      
      const authData = await oauthClient.generateAuthUrl();
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_code',
        authData.state
      );
      
      expect(tokenResult.success).toBe(false);
      expect(tokenResult.error).toBe('token_exchange_failed');
      expect(tokenResult.errorDescription).toContain('GitHub API unavailable');
    });
    
    it('should handle OAuth error responses from GitHub', async () => {
      // Mock OAuth error response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          error: 'invalid_grant',
          error_description: 'The provided authorization grant is invalid',
        },
      });
      
      const authData = await oauthClient.generateAuthUrl();
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'invalid_code',
        authData.state
      );
      
      expect(tokenResult.success).toBe(false);
      expect(tokenResult.error).toBe('invalid_grant');
      expect(tokenResult.errorDescription).toBe('The provided authorization grant is invalid');
    });
    
    it('should handle network timeouts during OAuth', async () => {
      // Mock network timeout
      mockedAxios.post.mockRejectedValueOnce({
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      });
      
      const authData = await oauthClient.generateAuthUrl();
      const tokenResult = await oauthClient.exchangeCodeForToken(
        'test_code',
        authData.state
      );
      
      expect(tokenResult.success).toBe(false);
      expect(tokenResult.error).toBe('token_exchange_failed');
      expect(tokenResult.errorDescription).toContain('timeout');
    });
    
    it('should handle user info fetch failures', async () => {
      // Mock successful token exchange but failed user info
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'valid_token',
          token_type: 'bearer',
          scope: 'user:email',
        },
      });
      
      mockedAxios.get.mockRejectedValueOnce(new Error('User info unavailable'));
      
      const authData = await oauthClient.generateAuthUrl();
      
      await expect(
        oauthClient.exchangeCodeForToken('test_code', authData.state)
      ).rejects.toThrow('Failed to fetch user information');
    });
  });
  
  describe('JWT Token Error Scenarios', () => {
    it('should handle Redis connection failures during token validation', async () => {
      // Create session and tokens first
      const session = await sessionManager.createSession({
        userId: 'redis-test-user',
        username: 'redistestuser',
        email: 'redistest@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      const tokens = await jwtManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      // Mock Redis failure
      const originalGet = redis.get;
      redis.get = jest.fn().mockRejectedValue(new Error('Redis connection failed'));
      
      try {
        const validation = await jwtManager.validateAccessToken(tokens.accessToken);
        expect(validation.valid).toBe(false);
        expect(validation.error).toBe('Token validation failed');
      } finally {
        // Restore Redis
        redis.get = originalGet;
      }
    });
    
    it('should handle token refresh with expired refresh token', async () => {
      // Create JWT manager with very short refresh token expiry
      const shortRefreshConfig = {
        ...testJWTConfig,
        refreshTokenExpiry: '1ms',
      };
      const shortJWTManager = new JWTManager(shortRefreshConfig);
      
      const session = await sessionManager.createSession({
        userId: 'refresh-test-user',
        username: 'refreshtestuser',
        email: 'refreshtest@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      const tokens = await shortJWTManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      // Wait for refresh token to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const refreshResult = await shortJWTManager.refreshAccessToken(tokens.refreshToken);
      expect(refreshResult.success).toBe(false);
      expect(refreshResult.error).toBeDefined();
    });
    
    it('should handle concurrent token refresh attempts', async () => {
      const session = await sessionManager.createSession({
        userId: 'concurrent-user',
        username: 'concurrentuser',
        email: 'concurrent@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      const tokens = await jwtManager.generateTokenPair({
        userId: session.userId,
        username: session.username,
        email: session.email,
        roles: session.roles,
        permissions: session.permissions,
        sessionId: session.sessionId,
      });
      
      // Attempt concurrent refresh
      const refreshPromises = Array(3).fill(null).map(() =>
        jwtManager.refreshAccessToken(tokens.refreshToken)
      );
      
      const results = await Promise.all(refreshPromises);
      
      // Only one should succeed, others should fail
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBe(1);
      expect(failureCount).toBe(2);
    });
  });
  
  describe('Session Error Scenarios', () => {
    it('should handle corrupted session data in Redis', async () => {
      const session = await sessionManager.createSession({
        userId: 'corrupt-user',
        username: 'corruptuser',
        email: 'corrupt@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Corrupt session data
      await redis.set(`session:${session.sessionId}`, 'invalid_json_data');
      
      // Should handle corruption gracefully
      const retrievedSession = await sessionManager.getSession(session.sessionId);
      expect(retrievedSession).toBeNull();
    });
    
    it('should handle session cleanup when Redis keys are inconsistent', async () => {
      const userId = 'inconsistent-user';
      const session = await sessionManager.createSession({
        userId,
        username: 'inconsistentuser',
        email: 'inconsistent@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Manually remove session data but leave user sessions reference
      await redis.del(`session:${session.sessionId}`);
      
      // getUserSessions should handle inconsistency
      const userSessions = await sessionManager.getUserSessions(userId);
      expect(userSessions).toHaveLength(0);
      
      // User sessions set should be cleaned up
      const userSessionsSet = await redis.smembers(`user_sessions:${userId}`);
      expect(userSessionsSet).toHaveLength(0);
    });
    
    it('should recover from partial session destruction', async () => {
      const userId = 'partial-destroy-user';
      const session = await sessionManager.createSession({
        userId,
        username: 'partialdestroyuser',
        email: 'partialdestroy@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Simulate partial destruction (remove session but not user sessions reference)
      await redis.del(`session:${session.sessionId}`);
      
      // Attempting to destroy should still work
      const destroyed = await sessionManager.destroySession(session.sessionId);
      expect(destroyed).toBe(false); // Returns false because session was already gone
      
      // User sessions should be cleaned up
      const userSessions = await sessionManager.getUserSessions(userId);
      expect(userSessions).toHaveLength(0);
    });
  });
  
  describe('Recovery Mechanisms', () => {
    it('should recover from temporary Redis outage', async () => {
      // Create session first
      const session = await sessionManager.createSession({
        userId: 'recovery-user',
        username: 'recoveryuser',
        email: 'recovery@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Simulate Redis outage
      const originalMethods = {
        get: redis.get,
        setex: redis.setex,
        del: redis.del,
      };
      
      redis.get = jest.fn().mockRejectedValue(new Error('Redis unavailable'));
      redis.setex = jest.fn().mockRejectedValue(new Error('Redis unavailable'));
      redis.del = jest.fn().mockRejectedValue(new Error('Redis unavailable'));
      
      // Operations should fail gracefully
      const retrievedSession = await sessionManager.getSession(session.sessionId);
      expect(retrievedSession).toBeNull();
      
      const updateResult = await sessionManager.updateSession(session.sessionId, {
        metadata: { test: 'value' },
      });
      expect(updateResult).toBe(false);
      
      // Restore Redis
      redis.get = originalMethods.get;
      redis.setex = originalMethods.setex;
      redis.del = originalMethods.del;
      
      // Should work again after recovery
      const recoveredSession = await sessionManager.getSession(session.sessionId);
      expect(recoveredSession).toBeTruthy();
    });
    
    it('should handle graceful degradation during high load', async () => {
      // Simulate high load by creating many concurrent sessions
      const concurrentSessions = 20;
      const sessionPromises = Array(concurrentSessions).fill(null).map((_, index) =>
        sessionManager.createSession({
          userId: `load-user-${index}`,
          username: `loaduser${index}`,
          email: `load${index}@example.com`,
          roles: ['user'],
          permissions: ['read'],
          metadata: { sessionIndex: index },
        })
      );
      
      const sessions = await Promise.all(sessionPromises);
      expect(sessions).toHaveLength(concurrentSessions);
      
      // All sessions should be valid
      const validationPromises = sessions.map(session =>
        sessionManager.getSession(session.sessionId)
      );
      
      const validatedSessions = await Promise.all(validationPromises);
      const validCount = validatedSessions.filter(s => s !== null).length;
      
      expect(validCount).toBe(concurrentSessions);
    });
    
    it('should maintain data consistency during concurrent operations', async () => {
      const userId = 'consistency-user';
      const session = await sessionManager.createSession({
        userId,
        username: 'consistencyuser',
        email: 'consistency@example.com',
        roles: ['user'],
        permissions: ['read'],
        metadata: { counter: 0 },
      });
      
      // Perform concurrent updates
      const updatePromises = Array(10).fill(null).map((_, index) =>
        sessionManager.updateSession(session.sessionId, {
          metadata: { counter: index, updateIndex: index },
        })
      );
      
      const updateResults = await Promise.all(updatePromises);
      
      // All updates should succeed
      updateResults.forEach(result => {
        expect(result).toBe(true);
      });
      
      // Session should still be valid and consistent
      const finalSession = await sessionManager.getSession(session.sessionId);
      expect(finalSession).toBeTruthy();
      expect(finalSession?.userId).toBe(userId);
      expect(finalSession?.metadata.counter).toBeDefined();
    });
  });
});