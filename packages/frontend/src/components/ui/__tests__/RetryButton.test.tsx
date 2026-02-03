import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryButton, calculateRetryDelay, useRetryWithBackoff } from '../RetryButton';
import { renderHook, act } from '@testing-library/react';

describe('RetryButton', () => {
  const mockOnRetry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Temel işlevsellik', () => {
    it('should render retry button with default props', () => {
      render(<RetryButton onRetry={mockOnRetry} />);
      
      const button = screen.getByRole('button', { name: /retry operation/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Retry');
    });

    it('should show custom children when provided', () => {
      render(
        <RetryButton onRetry={mockOnRetry}>
          Custom Retry Text
        </RetryButton>
      );
      
      expect(screen.getByText('Custom Retry Text')).toBeInTheDocument();
    });

    it('should call onRetry when clicked', async () => {
      mockOnRetry.mockResolvedValue(undefined);
      
      render(<RetryButton onRetry={mockOnRetry} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('should show loading state during retry', async () => {
      let resolveRetry: () => void;
      const retryPromise = new Promise<void>((resolve) => {
        resolveRetry = resolve;
      });
      mockOnRetry.mockReturnValue(retryPromise);
      
      render(<RetryButton onRetry={mockOnRetry} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      // Button should show loading state
      expect(button).toHaveTextContent('Retrying...');
      expect(button).toBeDisabled();
      
      // Resolve the promise
      act(() => {
        resolveRetry!();
      });
      
      await waitFor(() => {
        expect(button).not.toBeDisabled();
        expect(button).toHaveTextContent('Retry');
      });
    });
  });

  describe('Retry count ve max retries', () => {
    it('should show retry count when retryCount > 0', () => {
      render(
        <RetryButton 
          onRetry={mockOnRetry} 
          retryCount={2} 
          maxRetries={5} 
        />
      );
      
      expect(screen.getByText('Retry (2/5)')).toBeInTheDocument();
      expect(screen.getByText('Attempt 3 of 5')).toBeInTheDocument();
    });

    it('should disable button when max retries reached', () => {
      render(
        <RetryButton 
          onRetry={mockOnRetry} 
          retryCount={3} 
          maxRetries={3} 
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Max retries reached');
      expect(screen.getByText(/maximum retry attempts reached/i)).toBeInTheDocument();
    });

    it('should not call onRetry when max retries reached', async () => {
      render(
        <RetryButton 
          onRetry={mockOnRetry} 
          retryCount={3} 
          maxRetries={3} 
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockOnRetry).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should show error message when retry fails', async () => {
      const errorMessage = 'Network connection failed';
      mockOnRetry.mockRejectedValue(new Error(errorMessage));
      
      render(<RetryButton onRetry={mockOnRetry} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
      
      // Button should be enabled again after error
      expect(button).not.toBeDisabled();
    });

    it('should handle non-Error objects', async () => {
      mockOnRetry.mockRejectedValue('String error');
      
      render(<RetryButton onRetry={mockOnRetry} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('Retry failed')).toBeInTheDocument();
      });
    });

    it('should clear error message on successful retry', async () => {
      // İlk retry başarısız
      mockOnRetry.mockRejectedValueOnce(new Error('First error'));
      
      render(<RetryButton onRetry={mockOnRetry} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });
      
      // İkinci retry başarılı
      mockOnRetry.mockResolvedValueOnce(undefined);
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });
  });

  describe('Disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<RetryButton onRetry={mockOnRetry} disabled={true} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should not call onRetry when disabled', async () => {
      render(<RetryButton onRetry={mockOnRetry} disabled={true} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockOnRetry).not.toHaveBeenCalled();
    });
  });

  describe('Visual states', () => {
    it('should show icon by default', () => {
      render(<RetryButton onRetry={mockOnRetry} />);
      
      // RefreshCwIcon should be present
      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toBeInTheDocument();
    });

    it('should hide icon when showIcon is false', () => {
      render(<RetryButton onRetry={mockOnRetry} showIcon={false} />);
      
      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<RetryButton onRetry={mockOnRetry} className="custom-class" />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label for different states', () => {
      const { rerender } = render(<RetryButton onRetry={mockOnRetry} />);
      
      let button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Retry operation');
      
      // Max retries reached
      rerender(
        <RetryButton 
          onRetry={mockOnRetry} 
          retryCount={3} 
          maxRetries={3} 
        />
      );
      
      button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Maximum retries reached');
    });
  });
});

describe('calculateRetryDelay', () => {
  it('should calculate exponential backoff correctly', () => {
    expect(calculateRetryDelay(0, 1000)).toBe(1000); // 1s
    expect(calculateRetryDelay(1, 1000)).toBe(2000); // 2s
    expect(calculateRetryDelay(2, 1000)).toBe(4000); // 4s
    expect(calculateRetryDelay(3, 1000)).toBe(8000); // 8s
  });

  it('should cap delay at 30 seconds', () => {
    expect(calculateRetryDelay(10, 1000)).toBe(30000); // Max 30s
    expect(calculateRetryDelay(20, 1000)).toBe(30000); // Max 30s
  });

  it('should use custom base delay', () => {
    expect(calculateRetryDelay(0, 500)).toBe(500);
    expect(calculateRetryDelay(1, 500)).toBe(1000);
    expect(calculateRetryDelay(2, 500)).toBe(2000);
  });
});

describe('useRetryWithBackoff', () => {
  const mockOperation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => useRetryWithBackoff(mockOperation));
    
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.isMaxRetriesReached).toBe(false);
  });

  it('should execute operation successfully', async () => {
    mockOperation.mockResolvedValue(undefined);
    
    const { result } = renderHook(() => useRetryWithBackoff(mockOperation));
    
    await act(async () => {
      await result.current.retry();
    });
    
    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(result.current.retryCount).toBe(0);
  });

  it('should increment retry count on failure', async () => {
    mockOperation.mockRejectedValue(new Error('Test error'));
    
    const { result } = renderHook(() => useRetryWithBackoff(mockOperation));
    
    await act(async () => {
      try {
        await result.current.retry();
      } catch (error) {
        // Expected to throw
      }
    });
    
    expect(result.current.retryCount).toBe(1);
  });

  it('should apply exponential backoff delay', async () => {
    mockOperation.mockRejectedValue(new Error('Test error'));
    
    const { result } = renderHook(() => 
      useRetryWithBackoff(mockOperation, { baseDelay: 1000 })
    );
    
    // İlk retry (delay yok)
    await act(async () => {
      try {
        await result.current.retry();
      } catch (error) {
        // Expected to throw
      }
    });
    
    expect(result.current.retryCount).toBe(1);
    
    // İkinci retry (1s delay)
    const retryPromise = act(async () => {
      try {
        await result.current.retry();
      } catch (error) {
        // Expected to throw
      }
    });
    
    // 1 saniye geçir
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    await retryPromise;
    
    expect(result.current.retryCount).toBe(2);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    mockOperation.mockRejectedValue(new Error('Test error'));
    
    const { result } = renderHook(() => 
      useRetryWithBackoff(mockOperation, { onRetry })
    );
    
    await act(async () => {
      try {
        await result.current.retry();
      } catch (error) {
        // Expected to throw
      }
    });
    
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('should call onMaxRetriesReached callback', async () => {
    const onMaxRetriesReached = vi.fn();
    mockOperation.mockRejectedValue(new Error('Test error'));
    
    const { result } = renderHook(() => 
      useRetryWithBackoff(mockOperation, { 
        maxRetries: 1, 
        onMaxRetriesReached 
      })
    );
    
    // İlk retry
    await act(async () => {
      try {
        await result.current.retry();
      } catch (error) {
        // Expected to throw
      }
    });
    
    // İkinci retry (max reached)
    await act(async () => {
      await result.current.retry();
    });
    
    expect(onMaxRetriesReached).toHaveBeenCalled();
    expect(result.current.isMaxRetriesReached).toBe(true);
  });

  it('should reset retry count and state', () => {
    mockOperation.mockRejectedValue(new Error('Test error'));
    
    const { result } = renderHook(() => useRetryWithBackoff(mockOperation));
    
    act(() => {
      // Manually set retry count for testing
      result.current.retry().catch(() => {});
    });
    
    act(() => {
      result.current.reset();
    });
    
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
  });
});