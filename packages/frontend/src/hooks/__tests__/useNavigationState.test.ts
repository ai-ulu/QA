import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNavigationState, useDeepLinkRestore, useRouteValidation } from '../useNavigationState';

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
const mockLocation = {
  pathname: '/',
  search: '',
  hash: '',
  state: null,
  key: 'default',
};
const mockParams = {};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    useParams: () => mockParams,
  };
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

describe('useNavigationState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.pathname = '/';
    mockLocation.search = '';
    Object.assign(mockParams, {});
  });

  describe('Temel işlevsellik', () => {
    it('should initialize with current location', () => {
      mockLocation.pathname = '/dashboard';
      mockLocation.search = '?tab=projects';

      const { result } = renderHook(() => useNavigationState());

      expect(result.current.currentPath).toBe('/dashboard');
      expect(result.current.previousPath).toBe(null);
      expect(result.current.searchParams.get('tab')).toBe('projects');
      expect(result.current.isNavigating).toBe(false);
    });

    it('should update state when location changes', () => {
      const { result, rerender } = renderHook(() => useNavigationState());

      expect(result.current.currentPath).toBe('/');

      // Location değişimini simüle et
      mockLocation.pathname = '/projects';
      rerender();

      expect(result.current.currentPath).toBe('/projects');
      expect(result.current.previousPath).toBe('/');
    });

    it('should maintain navigation history', () => {
      const { result, rerender } = renderHook(() => useNavigationState());

      expect(result.current.navigationHistory).toEqual(['/']);

      // Birkaç navigation simüle et
      mockLocation.pathname = '/projects';
      rerender();

      expect(result.current.navigationHistory).toEqual(['/', '/projects']);

      mockLocation.pathname = '/dashboard';
      rerender();

      expect(result.current.navigationHistory).toEqual(['/', '/projects', '/dashboard']);
    });

    it('should limit navigation history to 10 entries', () => {
      const { result, rerender } = renderHook(() => useNavigationState());

      // 15 farklı route'a git
      for (let i = 1; i <= 15; i++) {
        mockLocation.pathname = `/route-${i}`;
        rerender();
      }

      // Sadece son 10 entry tutulmalı
      expect(result.current.navigationHistory).toHaveLength(10);
      expect(result.current.navigationHistory[0]).toBe('/route-6');
      expect(result.current.navigationHistory[9]).toBe('/route-15');
    });
  });

  describe('Navigation methods', () => {
    it('should navigate to string path', () => {
      const { result } = renderHook(() => useNavigationState());

      act(() => {
        result.current.navigateTo('/projects');
      });

      expect(mockNavigate).toHaveBeenCalledWith('/projects', {
        replace: undefined,
        state: undefined,
      });
    });

    it('should navigate with options', () => {
      const { result } = renderHook(() => useNavigationState());

      act(() => {
        result.current.navigateTo('/projects', {
          replace: true,
          state: { from: 'dashboard' },
        });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/projects', {
        replace: true,
        state: { from: 'dashboard' },
      });
    });

    it('should navigate with preserved query parameters', () => {
      mockLocation.search = '?tab=active&sort=name';
      const { result } = renderHook(() => useNavigationState());

      act(() => {
        result.current.navigateTo('/projects', { preserveQuery: true });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/projects?tab=active&sort=name', {
        replace: undefined,
        state: undefined,
      });
    });

    it('should handle numeric navigation (history)', () => {
      const { result } = renderHook(() => useNavigationState());

      act(() => {
        result.current.navigateTo(-1);
      });

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('should handle navigation errors', () => {
      const onNavigationError = vi.fn();
      const { result } = renderHook(() => 
        useNavigationState({ onNavigationError })
      );

      mockNavigate.mockImplementation(() => {
        throw new Error('Navigation failed');
      });

      act(() => {
        result.current.navigateTo('/projects');
      });

      expect(onNavigationError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Navigation failed',
        })
      );
    });
  });

  describe('Back navigation', () => {
    it('should go back when history exists', () => {
      const { result, rerender } = renderHook(() => useNavigationState());

      // Navigation history oluştur
      mockLocation.pathname = '/projects';
      rerender();
      mockLocation.pathname = '/dashboard';
      rerender();

      expect(result.current.canGoBack).toBe(true);

      act(() => {
        result.current.goBack();
      });

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('should use fallback when no history', () => {
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.canGoBack).toBe(false);

      act(() => {
        result.current.goBack('/home');
      });

      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
    });

    it('should handle back navigation errors', () => {
      const { result, rerender } = renderHook(() => useNavigationState());

      // History oluştur
      mockLocation.pathname = '/projects';
      rerender();

      mockNavigate.mockImplementation((to) => {
        if (to === -1) {
          throw new Error('Back navigation failed');
        }
        return Promise.resolve();
      });

      act(() => {
        result.current.goBack('/fallback');
      });

      // Fallback route'a navigate etmeli
      expect(mockNavigate).toHaveBeenCalledWith('/fallback', { replace: true });
    });
  });

  describe('Search parameters', () => {
    it('should update search parameters', () => {
      mockLocation.pathname = '/projects';
      mockLocation.search = '?tab=active';
      const { result } = renderHook(() => useNavigationState());

      act(() => {
        result.current.updateSearchParams({
          sort: 'name',
          filter: 'completed',
        });
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        '/projects?tab=active&sort=name&filter=completed',
        { replace: true }
      );
    });

    it('should remove search parameters when value is null', () => {
      mockLocation.pathname = '/projects';
      mockLocation.search = '?tab=active&sort=name';
      const { result } = renderHook(() => useNavigationState());

      act(() => {
        result.current.updateSearchParams({
          tab: null, // Remove this parameter
          filter: 'new', // Add this parameter
        });
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        '/projects?sort=name&filter=new',
        { replace: true }
      );
    });

    it('should get search parameter values', () => {
      mockLocation.search = '?tab=active&sort=name';
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.getSearchParam('tab')).toBe('active');
      expect(result.current.getSearchParam('sort')).toBe('name');
      expect(result.current.getSearchParam('missing')).toBeUndefined();
      expect(result.current.getSearchParam('missing', 'default')).toBe('default');
    });
  });

  describe('Route matching', () => {
    it('should match exact routes', () => {
      mockLocation.pathname = '/projects';
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.matchesRoute('/projects')).toBe(true);
      expect(result.current.matchesRoute('/dashboard')).toBe(false);
    });

    it('should match regex patterns', () => {
      mockLocation.pathname = '/projects/123';
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.matchesRoute(/^\/projects\/\d+$/)).toBe(true);
      expect(result.current.matchesRoute(/^\/dashboard/)).toBe(false);
    });

    it('should check current route', () => {
      mockLocation.pathname = '/dashboard';
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.isCurrentRoute('/dashboard')).toBe(true);
      expect(result.current.isCurrentRoute('/projects')).toBe(false);
    });

    it('should check child routes', () => {
      mockLocation.pathname = '/projects/123/scenarios';
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.isChildRoute('/projects')).toBe(true);
      expect(result.current.isChildRoute('/projects/123')).toBe(true);
      expect(result.current.isChildRoute('/dashboard')).toBe(false);
    });
  });

  describe('Parameter handling', () => {
    it('should get route parameters', () => {
      Object.assign(mockParams, { id: '123', tab: 'scenarios' });
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.getParam('id')).toBe('123');
      expect(result.current.getParam('tab')).toBe('scenarios');
      expect(result.current.getParam('missing')).toBeUndefined();
    });

    it('should transform parameters', () => {
      Object.assign(mockParams, { id: '123', count: '5' });
      const { result } = renderHook(() => useNavigationState());

      expect(result.current.getParam('id', String)).toBe('123');
      expect(result.current.getParam('count', Number)).toBe(5);
    });

    it('should handle parameter transformation errors', () => {
      const onNavigationError = vi.fn();
      Object.assign(mockParams, { count: 'invalid' });
      const { result } = renderHook(() => 
        useNavigationState({ onNavigationError })
      );

      const result_value = result.current.getParam('count', (v) => {
        const num = parseInt(v);
        if (isNaN(num)) throw new Error('Invalid number');
        return num;
      });

      expect(result_value).toBeUndefined();
      expect(onNavigationError).toHaveBeenCalled();
    });
  });

  describe('Parameter validation', () => {
    it('should validate parameters', () => {
      const validateParams = vi.fn().mockReturnValue(true);
      Object.assign(mockParams, { id: '123' });

      renderHook(() => useNavigationState({ validateParams }));

      expect(validateParams).toHaveBeenCalledWith({ id: '123' });
    });

    it('should handle validation errors', () => {
      const onNavigationError = vi.fn();
      const validateParams = vi.fn().mockReturnValue(false);
      Object.assign(mockParams, { id: 'invalid' });

      renderHook(() => 
        useNavigationState({ validateParams, onNavigationError })
      );

      expect(onNavigationError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid route parameters'),
        })
      );
    });
  });
});

describe('useDeepLinkRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.getItem.mockReturnValue(null);
  });

  it('should store intended route', () => {
    const { result } = renderHook(() => useDeepLinkRestore());

    act(() => {
      result.current.storeIntendedRoute('/projects/123');
    });

    expect(result.current.intendedRoute).toBe('/projects/123');
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      'autoqa_intended_route',
      '/projects/123'
    );
  });

  it('should restore intended route', () => {
    const { result } = renderHook(() => useDeepLinkRestore());

    act(() => {
      result.current.storeIntendedRoute('/projects/123');
    });

    act(() => {
      const restored = result.current.restoreIntendedRoute();
      expect(restored).toBe(true);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/projects/123', { replace: true });
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('autoqa_intended_route');
    expect(result.current.intendedRoute).toBe(null);
  });

  it('should restore from sessionStorage', () => {
    sessionStorageMock.getItem.mockReturnValue('/dashboard');
    const { result } = renderHook(() => useDeepLinkRestore());

    act(() => {
      const restored = result.current.restoreIntendedRoute();
      expect(restored).toBe(true);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('should not restore login or root routes', () => {
    const { result } = renderHook(() => useDeepLinkRestore());

    act(() => {
      result.current.storeIntendedRoute('/login');
    });

    act(() => {
      const restored = result.current.restoreIntendedRoute();
      expect(restored).toBe(false);
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should clear intended route', () => {
    const { result } = renderHook(() => useDeepLinkRestore());

    act(() => {
      result.current.storeIntendedRoute('/projects/123');
    });

    act(() => {
      result.current.clearIntendedRoute();
    });

    expect(result.current.intendedRoute).toBe(null);
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('autoqa_intended_route');
  });
});

describe('useRouteValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockParams, {});
    mockLocation.pathname = '/';
  });

  describe('Project ID validation', () => {
    it('should validate UUID format', () => {
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.validateProjectId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(result.current.validateProjectId('invalid-uuid')).toBe(false);
    });

    it('should validate numeric IDs', () => {
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.validateProjectId('123')).toBe(true);
      expect(result.current.validateProjectId('0')).toBe(true);
      expect(result.current.validateProjectId('abc123')).toBe(true);
      expect(result.current.validateProjectId('')).toBe(false);
    });

    it('should validate alphanumeric IDs', () => {
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.validateProjectId('project-123')).toBe(true);
      expect(result.current.validateProjectId('project_test')).toBe(true);
      expect(result.current.validateProjectId('project@123')).toBe(false);
    });
  });

  describe('Get validated IDs', () => {
    it('should get validated project ID', () => {
      Object.assign(mockParams, { id: '123' });
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.getValidatedProjectId()).toBe('123');
    });

    it('should return null for invalid project ID', () => {
      Object.assign(mockParams, { id: '' });
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.getValidatedProjectId()).toBe(null);
    });

    it('should get validated scenario ID from scenarioId param', () => {
      Object.assign(mockParams, { scenarioId: 'scenario-123' });
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.getValidatedScenarioId()).toBe('scenario-123');
    });

    it('should get validated scenario ID from id param as fallback', () => {
      Object.assign(mockParams, { id: 'scenario-456' });
      const { result } = renderHook(() => useRouteValidation());

      expect(result.current.getValidatedScenarioId()).toBe('scenario-456');
    });
  });
});