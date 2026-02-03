import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

/**
 * Navigation state management hook
 * URL state synchronization ve navigation edge case'lerini handle eder
 */

interface NavigationState {
  currentPath: string;
  previousPath: string | null;
  params: Record<string, string | undefined>;
  searchParams: URLSearchParams;
  isNavigating: boolean;
}

interface UseNavigationStateOptions {
  preserveState?: boolean;
  validateParams?: (params: Record<string, string | undefined>) => boolean;
  onNavigationError?: (error: Error) => void;
}

export function useNavigationState(options: UseNavigationStateOptions = {}) {
  const {
    preserveState = true,
    validateParams,
    onNavigationError,
  } = options;

  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const [navigationState, setNavigationState] = useState<NavigationState>({
    currentPath: location.pathname,
    previousPath: null,
    params,
    searchParams: new URLSearchParams(location.search),
    isNavigating: false,
  });

  const [navigationHistory, setNavigationHistory] = useState<string[]>([location.pathname]);

  // Update navigation state when location changes
  useEffect(() => {
    setNavigationState(prev => ({
      currentPath: location.pathname,
      previousPath: prev.currentPath,
      params,
      searchParams: new URLSearchParams(location.search),
      isNavigating: false,
    }));

    // Update navigation history
    setNavigationHistory(prev => {
      const newHistory = [...prev];
      if (newHistory[newHistory.length - 1] !== location.pathname) {
        newHistory.push(location.pathname);
        // Keep only last 10 entries
        return newHistory.slice(-10);
      }
      return newHistory;
    });
  }, [location.pathname, location.search, params]);

  // Validate route parameters
  useEffect(() => {
    if (validateParams && !validateParams(params)) {
      const error = new Error(`Invalid route parameters: ${JSON.stringify(params)}`);
      onNavigationError?.(error);
    }
  }, [params, validateParams, onNavigationError]);

  // Safe navigation with error handling
  const navigateTo = useCallback(
    (
      to: string | number,
      options?: {
        replace?: boolean;
        state?: any;
        preserveQuery?: boolean;
      }
    ) => {
      try {
        setNavigationState(prev => ({ ...prev, isNavigating: true }));

        if (typeof to === 'number') {
          // History navigation
          navigate(to);
          return;
        }

        let targetPath = to;

        // Preserve query parameters if requested
        if (options?.preserveQuery && location.search) {
          const separator = targetPath.includes('?') ? '&' : '?';
          targetPath = `${targetPath}${separator}${location.search.slice(1)}`;
        }

        navigate(targetPath, {
          replace: options?.replace,
          state: options?.state,
        });
      } catch (error) {
        setNavigationState(prev => ({ ...prev, isNavigating: false }));
        const navError = error instanceof Error ? error : new Error('Navigation failed');
        onNavigationError?.(navError);
      }
    },
    [navigate, location.search, onNavigationError]
  );

  // Go back with fallback
  const goBack = useCallback(
    (fallbackPath: string = '/') => {
      try {
        if (navigationHistory.length > 1) {
          navigate(-1);
        } else {
          navigateTo(fallbackPath, { replace: true });
        }
      } catch (error) {
        // Fallback to home if back navigation fails
        navigateTo(fallbackPath, { replace: true });
      }
    },
    [navigate, navigateTo, navigationHistory.length]
  );

  // Update URL search parameters
  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const newSearchParams = new URLSearchParams(location.search);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          newSearchParams.delete(key);
        } else {
          newSearchParams.set(key, value);
        }
      });

      const newSearch = newSearchParams.toString();
      const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;

      navigate(newPath, { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  // Get search parameter value
  const getSearchParam = useCallback(
    (key: string, defaultValue?: string): string | undefined => {
      return navigationState.searchParams.get(key) || defaultValue;
    },
    [navigationState.searchParams]
  );

  // Check if current route matches pattern
  const matchesRoute = useCallback(
    (pattern: string | RegExp): boolean => {
      if (typeof pattern === 'string') {
        return navigationState.currentPath === pattern;
      }
      return pattern.test(navigationState.currentPath);
    },
    [navigationState.currentPath]
  );

  // Get route parameter with type safety
  const getParam = useCallback(
    <T = string>(key: string, transform?: (value: string) => T): T | undefined => {
      const value = navigationState.params[key];
      if (value === undefined) return undefined;
      
      if (transform) {
        try {
          return transform(value);
        } catch (error) {
          onNavigationError?.(new Error(`Failed to transform param ${key}: ${error}`));
          return undefined;
        }
      }
      
      return value as T;
    },
    [navigationState.params, onNavigationError]
  );

  // Check if navigation is possible
  const canGoBack = navigationHistory.length > 1;
  const canGoForward = false; // Browser API doesn't provide this info

  return {
    // Current state
    ...navigationState,
    
    // Navigation history
    navigationHistory: [...navigationHistory],
    canGoBack,
    canGoForward,
    
    // Navigation methods
    navigateTo,
    goBack,
    
    // URL parameter methods
    updateSearchParams,
    getSearchParam,
    getParam,
    
    // Route matching
    matchesRoute,
    
    // Utility methods
    isCurrentRoute: (path: string) => navigationState.currentPath === path,
    isChildRoute: (parentPath: string) => navigationState.currentPath.startsWith(parentPath),
    
    // State preservation
    preserveState: preserveState,
  };
}

/**
 * Hook for handling deep link restoration
 */
export function useDeepLinkRestore() {
  const [intendedRoute, setIntendedRoute] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Store intended route when redirected to login
  const storeIntendedRoute = useCallback((route: string) => {
    setIntendedRoute(route);
    sessionStorage.setItem('autoqa_intended_route', route);
  }, []);

  // Restore intended route after authentication
  const restoreIntendedRoute = useCallback(() => {
    const stored = intendedRoute || sessionStorage.getItem('autoqa_intended_route');
    if (stored && stored !== '/login' && stored !== '/') {
      sessionStorage.removeItem('autoqa_intended_route');
      setIntendedRoute(null);
      navigate(stored, { replace: true });
      return true;
    }
    return false;
  }, [intendedRoute, navigate]);

  // Clear intended route
  const clearIntendedRoute = useCallback(() => {
    setIntendedRoute(null);
    sessionStorage.removeItem('autoqa_intended_route');
  }, []);

  return {
    intendedRoute,
    storeIntendedRoute,
    restoreIntendedRoute,
    clearIntendedRoute,
  };
}

/**
 * Hook for route parameter validation
 */
export function useRouteValidation() {
  const params = useParams();
  const location = useLocation();

  // Validate project ID parameter
  const validateProjectId = useCallback((id: string | undefined): boolean => {
    if (!id) return false;
    
    // UUID pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    // Numeric ID pattern
    const numericPattern = /^\d+$/;
    
    // Alphanumeric with dashes/underscores
    const alphanumericPattern = /^[a-zA-Z0-9_-]+$/;
    
    return uuidPattern.test(id) || numericPattern.test(id) || alphanumericPattern.test(id);
  }, []);

  // Validate scenario ID parameter
  const validateScenarioId = useCallback((id: string | undefined): boolean => {
    return validateProjectId(id); // Same validation logic
  }, [validateProjectId]);

  // Get validated project ID
  const getValidatedProjectId = useCallback((): string | null => {
    const id = params.id;
    return id && validateProjectId(id) ? id : null;
  }, [params.id, validateProjectId]);

  // Get validated scenario ID
  const getValidatedScenarioId = useCallback((): string | null => {
    const id = params.scenarioId || params.id;
    return id && validateScenarioId(id) ? id : null;
  }, [params.scenarioId, params.id, validateScenarioId]);

  return {
    validateProjectId,
    validateScenarioId,
    getValidatedProjectId,
    getValidatedScenarioId,
    currentParams: params,
    currentPath: location.pathname,
  };
}