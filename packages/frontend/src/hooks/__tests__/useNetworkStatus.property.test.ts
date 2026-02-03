import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useNetworkStatus } from '../useNetworkStatus';

/**
 * **Validates: Requirements - Offline Scenarios**
 * Property Test: Network status detection works correctly across all connection states
 */

describe('useNetworkStatus - Property Tests', () => {
  let mockNavigator: any;
  let mockConnection: any;

  beforeEach(() => {
    // Mock navigator.onLine
    mockNavigator = {
      onLine: true,
    };
    Object.defineProperty(window, 'navigator', {
      value: mockNavigator,
      writable: true,
    });

    // Mock connection API
    mockConnection = {
      type: 'wifi',
      effectiveType: '4g',
      downlink: 10,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockNavigator.connection = mockConnection;

    // Mock event listeners
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should correctly detect online/offline status for any navigator.onLine value', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isOnline) => {
          mockNavigator.onLine = isOnline;
          
          const { result } = renderHook(() => useNetworkStatus());
          
          expect(result.current.isOnline).toBe(isOnline);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly identify slow connections for any connection parameters', () => {
    fc.assert(
      fc.property(
        fc.record({
          effectiveType: fc.constantFrom('slow-2g', '2g', '3g', '4g'),
          downlink: fc.float({ min: 0, max: 50 }),
        }),
        (connectionParams) => {
          mockConnection.effectiveType = connectionParams.effectiveType;
          mockConnection.downlink = connectionParams.downlink;
          
          const { result } = renderHook(() => useNetworkStatus());
          
          const expectedSlowConnection = 
            connectionParams.effectiveType === 'slow-2g' ||
            connectionParams.effectiveType === '2g' ||
            connectionParams.downlink < 1.5;
          
          expect(result.current.isSlowConnection).toBe(expectedSlowConnection);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle connection type changes correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('wifi', 'cellular', 'ethernet', 'bluetooth', 'unknown'),
        fc.constantFrom('slow-2g', '2g', '3g', '4g'),
        (connectionType, effectiveType) => {
          mockConnection.type = connectionType;
          mockConnection.effectiveType = effectiveType;
          
          const { result } = renderHook(() => useNetworkStatus());
          
          expect(result.current.connectionType).toBe(connectionType);
          expect(result.current.effectiveType).toBe(effectiveType);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle missing connection API gracefully', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hasConnection) => {
          if (!hasConnection) {
            delete mockNavigator.connection;
            delete mockNavigator.mozConnection;
            delete mockNavigator.webkitConnection;
          }
          
          const { result } = renderHook(() => useNetworkStatus());
          
          // Should not throw and should have default values
          expect(result.current.connectionType).toBe('unknown');
          expect(result.current.effectiveType).toBe('unknown');
          expect(result.current.isSlowConnection).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should properly register and cleanup event listeners', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (renderCount) => {
          const hooks: any[] = [];
          
          // Render multiple hooks
          for (let i = 0; i < renderCount; i++) {
            hooks.push(renderHook(() => useNetworkStatus()));
          }
          
          // Verify event listeners are registered
          expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
          expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
          
          // Cleanup all hooks
          hooks.forEach(hook => hook.unmount());
          
          // Verify cleanup
          expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
          expect(window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should respond to online/offline events correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        (statusSequence) => {
          const { result } = renderHook(() => useNetworkStatus());
          
          statusSequence.forEach((isOnline) => {
            mockNavigator.onLine = isOnline;
            
            act(() => {
              // Simulate online/offline event
              const event = new Event(isOnline ? 'online' : 'offline');
              window.dispatchEvent(event);
            });
            
            expect(result.current.isOnline).toBe(isOnline);
          });
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});