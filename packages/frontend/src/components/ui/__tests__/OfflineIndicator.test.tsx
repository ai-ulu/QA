import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineIndicator } from '../OfflineIndicator';

// Mock useNetworkStatus
vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => ({
    isOnline: true,
    isSlowConnection: false,
    connectionType: 'wifi',
    effectiveType: '4g',
  })),
}));

describe('OfflineIndicator', () => {
  const mockNetworkStatus = vi.mocked(
    await import('../../hooks/useNetworkStatus')
  ).useNetworkStatus;

  const mockOnRetry = vi.fn();
  const mockOnClearQueue = vi.fn();
  const mockOnRetryOperation = vi.fn();

  const mockQueuedOperations = [
    {
      id: 'op-1',
      type: 'CREATE' as const,
      resource: '/api/projects',
      timestamp: Date.now() - 5000,
      retryCount: 0,
    },
    {
      id: 'op-2',
      type: 'UPDATE' as const,
      resource: '/api/projects/123',
      timestamp: Date.now() - 3000,
      retryCount: 1,
    },
    {
      id: 'op-3',
      type: 'DELETE' as const,
      resource: '/api/scenarios/456',
      timestamp: Date.now() - 1000,
      retryCount: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockNetworkStatus.mockReturnValue({
      isOnline: true,
      isSlowConnection: false,
      connectionType: 'wifi',
      effectiveType: '4g',
    });
  });

  describe('Online durumları', () => {
    it('online ve hızlı bağlantıda hiçbir şey göstermemeli', () => {
      render(<OfflineIndicator />);
      
      expect(screen.queryByText(/çevrimdışı/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/yavaş bağlantı/i)).not.toBeInTheDocument();
    });

    it('yavaş bağlantı uyarısı göstermeli', () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: true,
        isSlowConnection: true,
        connectionType: 'cellular',
        effectiveType: '2g',
      });

      render(<OfflineIndicator />);
      
      expect(screen.getByText('Yavaş bağlantı')).toBeInTheDocument();
      expect(screen.getByText('İşlemler normalden daha uzun sürebilir.')).toBeInTheDocument();
    });

    it('reconnected mesajını göstermeli', async () => {
      // Başlangıçta offline
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      const { rerender } = render(<OfflineIndicator />);
      
      expect(screen.getByText('Çevrimdışısınız')).toBeInTheDocument();

      // Online'a geç
      mockNetworkStatus.mockReturnValue({
        isOnline: true,
        isSlowConnection: false,
        connectionType: 'wifi',
        effectiveType: '4g',
      });

      rerender(<OfflineIndicator />);
      
      expect(screen.getByText('Bağlantı yeniden kuruldu!')).toBeInTheDocument();
    });

    it('processing durumunda sync mesajı göstermeli', () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      const { rerender } = render(<OfflineIndicator queuedOperationsCount={3} />);

      // Online'a geç ve processing başlat
      mockNetworkStatus.mockReturnValue({
        isOnline: true,
        isSlowConnection: false,
        connectionType: 'wifi',
        effectiveType: '4g',
      });

      rerender(
        <OfflineIndicator 
          queuedOperationsCount={3} 
          isProcessingQueue={true}
        />
      );
      
      expect(screen.getByText('3 işlem senkronize ediliyor...')).toBeInTheDocument();
    });
  });

  describe('Offline durumu', () => {
    beforeEach(() => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });
    });

    it('offline indicator göstermeli', () => {
      render(<OfflineIndicator />);
      
      expect(screen.getByText('Çevrimdışısınız')).toBeInTheDocument();
      expect(screen.getByText(/değişiklikler kaydedilecek/i)).toBeInTheDocument();
    });

    it('queue count göstermeli', () => {
      render(<OfflineIndicator queuedOperationsCount={5} />);
      
      expect(screen.getByText('5 işlem kuyrukta')).toBeInTheDocument();
    });

    it('retry button çalışmalı', async () => {
      mockOnRetry.mockResolvedValue(undefined);
      
      render(<OfflineIndicator onRetry={mockOnRetry} />);
      
      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);
      
      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('clear queue button çalışmalı', () => {
      render(
        <OfflineIndicator 
          queuedOperationsCount={3}
          onClearQueue={mockOnClearQueue}
        />
      );
      
      const clearButton = screen.getByTitle('Kuyruğu temizle');
      fireEvent.click(clearButton);
      
      expect(mockOnClearQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('Queue details', () => {
    beforeEach(() => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });
    });

    it('queue details toggle çalışmalı', () => {
      render(
        <OfflineIndicator 
          queuedOperationsCount={3}
          queuedOperations={mockQueuedOperations}
        />
      );
      
      const toggleButton = screen.getByText('Detayları göster');
      fireEvent.click(toggleButton);
      
      expect(screen.getByText('Bekleyen İşlemler:')).toBeInTheDocument();
      expect(screen.getByText('CREATE')).toBeInTheDocument();
      expect(screen.getByText('UPDATE')).toBeInTheDocument();
      expect(screen.getByText('DELETE')).toBeInTheDocument();
      
      // Toggle back
      const hideButton = screen.getByText('Gizle');
      fireEvent.click(hideButton);
      
      expect(screen.queryByText('Bekleyen İşlemler:')).not.toBeInTheDocument();
    });

    it('operation details doğru göstermeli', () => {
      render(
        <OfflineIndicator 
          queuedOperationsCount={3}
          queuedOperations={mockQueuedOperations}
          showDetails={true}
        />
      );
      
      // Operation types
      expect(screen.getByText('CREATE')).toBeInTheDocument();
      expect(screen.getByText('UPDATE')).toBeInTheDocument();
      expect(screen.getByText('DELETE')).toBeInTheDocument();
      
      // Resource names
      expect(screen.getByText('projects')).toBeInTheDocument();
      expect(screen.getByText('123')).toBeInTheDocument();
      expect(screen.getByText('456')).toBeInTheDocument();
      
      // Retry count
      expect(screen.getByText('(1 deneme)')).toBeInTheDocument();
    });

    it('max 5 operation göstermeli', () => {
      const manyOperations = Array.from({ length: 8 }, (_, i) => ({
        id: `op-${i}`,
        type: 'CREATE' as const,
        resource: `/api/test-${i}`,
        timestamp: Date.now() - i * 1000,
        retryCount: 0,
      }));

      render(
        <OfflineIndicator 
          queuedOperationsCount={8}
          queuedOperations={manyOperations}
          showDetails={true}
        />
      );
      
      expect(screen.getByText('+3 işlem daha...')).toBeInTheDocument();
    });

    it('individual operation retry çalışmalı', async () => {
      mockOnRetryOperation.mockResolvedValue(undefined);
      
      render(
        <OfflineIndicator 
          queuedOperationsCount={1}
          queuedOperations={[mockQueuedOperations[0]]}
          onRetryOperation={mockOnRetryOperation}
          showDetails={true}
        />
      );
      
      const retryButtons = screen.getAllByRole('button', { name: /retry/i });
      const operationRetryButton = retryButtons.find(button => 
        button.className.includes('h-6 w-6')
      );
      
      if (operationRetryButton) {
        fireEvent.click(operationRetryButton);
        
        await waitFor(() => {
          expect(mockOnRetryOperation).toHaveBeenCalledWith('op-1');
        });
      }
    });
  });

  describe('Processing indicator', () => {
    beforeEach(() => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });
    });

    it('processing indicator göstermeli', () => {
      render(
        <OfflineIndicator 
          queuedOperationsCount={3}
          isProcessingQueue={true}
        />
      );
      
      expect(screen.getByText('İşlemler senkronize ediliyor...')).toBeInTheDocument();
    });

    it('processing olmadığında indicator göstermemeli', () => {
      render(
        <OfflineIndicator 
          queuedOperationsCount={3}
          isProcessingQueue={false}
        />
      );
      
      expect(screen.queryByText('İşlemler senkronize ediliyor...')).not.toBeInTheDocument();
    });
  });

  describe('Visual states', () => {
    it('custom className uygulamalı', () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      render(<OfflineIndicator className="custom-class" />);
      
      const indicator = screen.getByText('Çevrimdışısınız').closest('div');
      expect(indicator).toHaveClass('custom-class');
    });

    it('operation type colors doğru olmalı', () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      render(
        <OfflineIndicator 
          queuedOperationsCount={3}
          queuedOperations={mockQueuedOperations}
          showDetails={true}
        />
      );
      
      const createBadge = screen.getByText('CREATE');
      const updateBadge = screen.getByText('UPDATE');
      const deleteBadge = screen.getByText('DELETE');
      
      expect(createBadge).toHaveClass('bg-green-100', 'text-green-700');
      expect(updateBadge).toHaveClass('bg-blue-100', 'text-blue-700');
      expect(deleteBadge).toHaveClass('bg-red-100', 'text-red-700');
    });
  });

  describe('Time formatting', () => {
    it('Turkish locale ile time format etmeli', () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      const testOperation = {
        id: 'test-op',
        type: 'CREATE' as const,
        resource: '/api/test',
        timestamp: new Date('2024-01-15T14:30:00').getTime(),
        retryCount: 0,
      };

      render(
        <OfflineIndicator 
          queuedOperationsCount={1}
          queuedOperations={[testOperation]}
          showDetails={true}
        />
      );
      
      // Turkish time format should be used
      expect(screen.getByText(/14:30:00/)).toBeInTheDocument();
    });
  });
});