import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useNetworkStatus } from '../useNetworkStatus';

// Mock navigator.onLine ve connection API
const mockConnection = {
  effectiveType: '4g',
  type: 'wifi',
  downlink: 10,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

Object.defineProperty(navigator, 'connection', {
  writable: true,
  value: mockConnection,
});

describe('useNetworkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigator.onLine = true;
    mockConnection.effectiveType = '4g';
    mockConnection.type = 'wifi';
    mockConnection.downlink = 10;
  });

  afterEach(() => {
    // Event listener'ları temizle
    window.removeEventListener('online', vi.fn());
    window.removeEventListener('offline', vi.fn());
  });

  describe('Temel işlevsellik', () => {
    it('başlangıçta doğru network durumunu döndürmeli', () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isSlowConnection).toBe(false);
      expect(result.current.connectionType).toBe('wifi');
      expect(result.current.effectiveType).toBe('4g');
    });

    it('yavaş bağlantıyı doğru tespit etmeli', () => {
      mockConnection.effectiveType = 'slow-2g';
      mockConnection.downlink = 0.5;

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it('2g bağlantıyı yavaş olarak işaretlemeli', () => {
      mockConnection.effectiveType = '2g';
      mockConnection.downlink = 2;

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it('düşük downlink hızını yavaş olarak işaretlemeli', () => {
      mockConnection.effectiveType = '4g';
      mockConnection.downlink = 1.0; // 1.5'ten düşük

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });
  });

  describe('Event handling', () => {
    it('online event\'ini doğru handle etmeli', () => {
      navigator.onLine = false;
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(false);

      act(() => {
        navigator.onLine = true;
        window.dispatchEvent(new Event('online'));
      });

      expect(result.current.isOnline).toBe(true);
    });

    it('offline event\'ini doğru handle etmeli', () => {
      navigator.onLine = true;
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);

      act(() => {
        navigator.onLine = false;
        window.dispatchEvent(new Event('offline'));
      });

      expect(result.current.isOnline).toBe(false);
    });

    it('connection change event\'ini handle etmeli', () => {
      const { result } = renderHook(() => useNetworkStatus());

      act(() => {
        mockConnection.effectiveType = 'slow-2g';
        mockConnection.downlink = 0.5;
        // Connection change event'ini simüle et
        const changeHandler = mockConnection.addEventListener.mock.calls
          .find(call => call[0] === 'change')?.[1];
        if (changeHandler) {
          changeHandler();
        }
      });

      expect(result.current.isSlowConnection).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('connection API olmadığında graceful fallback yapmalı', () => {
      // Connection API'yi kaldır
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe('unknown');
      expect(result.current.effectiveType).toBe('unknown');
      expect(result.current.isSlowConnection).toBe(false);
    });

    it('connection API null olduğunda çalışmalı', () => {
      Object.defineProperty(navigator, 'connection', {
        value: null,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe('unknown');
      expect(result.current.effectiveType).toBe('unknown');
    });

    it('connection API eksik property\'lere sahip olduğunda çalışmalı', () => {
      Object.defineProperty(navigator, 'connection', {
        value: {}, // Boş obje
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe('unknown');
      expect(result.current.effectiveType).toBe('unknown');
      expect(result.current.isSlowConnection).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('unmount\'ta event listener\'ları temizlemeli', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const connectionRemoveSpy = vi.spyOn(mockConnection, 'removeEventListener');

      const { unmount } = renderHook(() => useNetworkStatus());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      expect(connectionRemoveSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });
});