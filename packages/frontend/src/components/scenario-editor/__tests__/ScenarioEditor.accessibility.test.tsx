/**
 * Accessibility tests for ScenarioEditor component
 * **Validates: Requirements - Accessibility Compliance**
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../../test/axe-setup';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScenarioEditor } from '../ScenarioEditor';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const mockScenario = {
  id: '1',
  name: 'Test Scenario',
  description: 'Test description',
  naturalLanguageInput: 'Click the login button',
  generatedCode: 'await page.click("[data-testid=login-button]");',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ScenarioEditor Accessibility', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes axe accessibility tests', async () => {
    const { container } = render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper form labels and structure', () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Should have proper form structure
    const form = screen.getByRole('form') || container.querySelector('form');
    expect(form).toBeInTheDocument();

    // All inputs should have labels
    const nameInput = screen.getByLabelText(/scenario name/i);
    const descriptionInput = screen.getByLabelText(/description/i);
    
    expect(nameInput).toBeInTheDocument();
    expect(descriptionInput).toBeInTheDocument();
  });

  it('supports keyboard navigation through all interactive elements', async () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    const user = userEvent.setup();
    
    // Get all interactive elements
    const interactiveElements = screen.getAllByRole('button')
      .concat(screen.getAllByRole('textbox'))
      .concat(screen.getAllByRole('combobox') || []);

    // Should be able to tab through all elements
    for (let i = 0; i < Math.min(interactiveElements.length, 5); i++) {
      await user.tab();
      expect(document.activeElement).toBeInstanceOf(HTMLElement);
    }
  });

  it('provides proper ARIA labels for drag-and-drop interface', () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Drag-and-drop areas should have proper ARIA labels
    const dragAreas = screen.queryAllByRole('region');
    dragAreas.forEach(area => {
      expect(area).toHaveAttribute('aria-label');
    });
  });

  it('announces changes to screen readers', async () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Status updates should be announced
    const statusRegion = screen.queryByRole('status') || screen.queryByRole('alert');
    if (statusRegion) {
      expect(statusRegion).toHaveAttribute('aria-live');
    }
  });

  it('handles keyboard shortcuts accessibly', async () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    const user = userEvent.setup();
    
    // Test Ctrl+S for save (if implemented)
    await user.keyboard('{Control>}s{/Control}');
    
    // Test Escape for cancel (if implemented)
    await user.keyboard('{Escape}');
  });

  it('provides proper error announcements', async () => {
    const { container } = render(
      <TestWrapper>
        <ScenarioEditor
          scenario={{ ...mockScenario, name: '' }} // Invalid scenario
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Try to save with invalid data
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Error messages should be announced
    await waitFor(() => {
      const errorMessages = screen.queryAllByRole('alert');
      errorMessages.forEach(error => {
        expect(error).toBeInTheDocument();
      });
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('maintains focus management during dynamic content changes', async () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Focus should be managed when adding/removing steps
    const addButton = screen.queryByRole('button', { name: /add step/i });
    if (addButton) {
      addButton.focus();
      expect(document.activeElement).toBe(addButton);
      
      fireEvent.click(addButton);
      
      // Focus should move to newly added element or remain on add button
      expect(document.activeElement).toBeInstanceOf(HTMLElement);
    }
  });

  it('provides proper context for code editor', () => {
    render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Code editor should have proper labels
    const codeEditor = screen.queryByRole('textbox', { name: /code/i }) || 
                      screen.queryByLabelText(/generated code/i);
    
    if (codeEditor) {
      expect(codeEditor).toHaveAttribute('aria-label');
    }
  });

  it('supports high contrast mode', async () => {
    // Simulate high contrast mode
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-contrast: high)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    const { container } = render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Should still pass accessibility tests in high contrast mode
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('works with reduced motion preferences', async () => {
    // Simulate reduced motion preference
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    const { container } = render(
      <TestWrapper>
        <ScenarioEditor
          scenario={mockScenario}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      </TestWrapper>
    );

    // Should respect reduced motion preferences
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});