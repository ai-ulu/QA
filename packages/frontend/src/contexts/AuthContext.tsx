import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  loginWithGitHub: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const queryClient = useQueryClient();

  // Get user profile query
  const {
    data: user,
    isLoading: isUserLoading,
    error: userError,
  } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: authApi.getProfile,
    enabled: !!authApi.getToken() && isInitialized,
    retry: (failureCount, error: any) => {
      // Don't retry on 401/403 errors
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (token: string) => {
      authApi.setToken(token);
      return authApi.getProfile();
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(['auth', 'user'], userData);
      toast.success('Başarıyla giriş yapıldı!');
    },
    onError: (error: any) => {
      authApi.removeToken();
      toast.error('Giriş yapılırken hata oluştu');
      console.error('Login error:', error);
    },
  });

  // GitHub OAuth login
  const loginWithGitHub = () => {
    // Redirect to GitHub OAuth
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/callback`;
    const scope = 'user:email';
    const state = Math.random().toString(36).substring(2, 15);
    
    // Store state for validation
    sessionStorage.setItem('oauth_state', state);
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
    
    window.location.href = githubAuthUrl;
  };

  // Logout function
  const logout = () => {
    authApi.removeToken();
    queryClient.setQueryData(['auth', 'user'], null);
    queryClient.clear();
    toast.success('Başarıyla çıkış yapıldı');
  };

  // Refresh user function
  const refreshUser = async () => {
    if (authApi.getToken()) {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    }
  };

  // Handle authentication errors
  useEffect(() => {
    if (userError) {
      const error = userError as any;
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        // Token is invalid, remove it
        authApi.removeToken();
        queryClient.setQueryData(['auth', 'user'], null);
      }
    }
  }, [userError, queryClient]);

  // Initialize auth state
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Set up axios interceptor for token refresh
  useEffect(() => {
    const interceptor = authApi.setupInterceptors({
      onTokenExpired: () => {
        logout();
        toast.error('Oturum süresi doldu, lütfen tekrar giriş yapın');
      },
      onUnauthorized: () => {
        logout();
      },
    });

    return () => {
      // Cleanup interceptor
      if (interceptor) {
        interceptor();
      }
    };
  }, []);

  const isLoading = !isInitialized || (isUserLoading && !!authApi.getToken());
  const isAuthenticated = !!user && !!authApi.getToken();

  const login = async (token: string): Promise<void> => {
    await loginMutation.mutateAsync(token);
  };

  const value: AuthContextType = {
    user: user || null,
    isLoading,
    isAuthenticated,
    login,
    loginWithGitHub,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}