/**
 * Unit tests for accessibility compliance
 * **Validates: Requirements - Accessibility Compliance**
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test/axe-setup';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';
import { OfflineProvider } from '../contexts/OfflineContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ProjectForm } from '../components/projects/ProjectForm';
import { ScenarioEditor } from '../components/scenario-editor/ScenarioEditor';
import { 
  getLuminance, 
  getContrastRatio, 
  meetsContrastRequirement, 
  trapFocus, 
  isKeyboardNavigable,
  announceToScreenReader 
} from '../utils/accessibility';

// Test wrapper with all providers
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
        <AuthProvider>
          <OfflineProvider>
            {children}
          </OfflineProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Accessibility Unit Tests', () => {
  describe('Color Contrast Utilities', () => {
    it('calculates luminance correctly for known values', () => {
      // Black should have luminance of 0
      expect(getLuminance(0, 0, 0)).toBeCloseTo(0, 3);
      
      // White should have luminance of 1
      expect(getLuminance(255, 255, 255)).toBeCloseTo(1, 3);
      
      // Red should have specific luminance
      expect(getLuminance(255, 0, 0)).toBeCloseTo(0.2126, 3);
    });

    it('calculates contrast ratio correctly', () => {
      // Black on white should have maximum contrast (21:1)
      const blackWhiteRatio = getContrastRatio([0, 0, 0], [255, 255, 255]);
      expect(blackWhiteRatio).toBeCloseTo(21, 1);
      
      // Same colors should have minimum contrast (1:1)
      const sameColorRatio = getContrastRatio([128, 128, 128], [128, 128, 128]);
      expect(sameColorRatio).toBeCloseTo(1, 1);
    });

    it('correctly identifies WCAG compliance', () => {
      // Black on white meets all requirements
      expect(meetsContrastRequirement([0, 0, 0], [255, 255, 255], false)).toBe(true);
      expect(meetsContrastRequirement([0, 0, 0], [255, 255, 255], true)).toBe(true);
      
      // Light gray on white fails normal text but passes large text
      expect(meetsContrastRequirement([170, 170, 170], [255, 255, 255], false)).toBe(false);
      expect(meetsContrastRequirement([170, 170, 170], [255, 255, 255], true)).toBe(true);
    });
  });

  describe('Focus Management', () => {
    it('traps focus within a container', () => {
      const { container } = render(
        <div data-testid="modal">
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </div>
      );

      const modal = screen.getByTestId('modal');
      const buttons = screen.getAllByRole('button');
      
      const cleanup = trapFocus(modal);
      
      // First button should be focused
      expect(document.activeElement).toBe(buttons[0]);
      
      // Tab should move to second button
      fireEvent.keyDown(modal, { key: 'Tab' });
      expect(document.activeElement).toBe(buttons[1]);
      
      // Shift+Tab from first should go to last
      buttons[0].focus();
      fireEvent.keyDown(modal, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(buttons[2]);
      
      cleanup();
    });

    it('identifies keyboard navigable elements correctly', () => {
      const { container } = render(
        <div>
          <button>Button</button>
          <a href="/test">Link</a>
          <input type="text" />
          <div>Not navigable</div>
          <div tabIndex={0}>Navigable div</div>
          <div tabIndex={-1}>Not navigable div</div>
        </div>
      );

      const button = screen.getByRole('button');
      const link = screen.getByRole('link');
      const input = screen.getByRole('textbox');
      const divs = container.querySelectorAll('div');
      
      expect(isKeyboardNavigable(button)).toBe(true);
      expect(isKeyboardNavigable(link)).toBe(true);
      expect(isKeyboardNavigable(input)).toBe(true);
      expect(isKeyboardNavigable(divs[0])).toBe(false); // "Not navigable"
      expect(isKeyboardNavigable(divs[1])).toBe(true);  // tabIndex={0}
      expect(isKeyboardNavigable(divs[2])).toBe(false); // tabIndex={-1}
    });
  });

  describe('Screen Reader Announcements', () => {
    it('creates and removes announcement elements', async () => {
      const message = 'Test announcement';
      
      announceToScreenReader(message);
      
      // Should create announcement element
      const announcement = document.querySelector('[aria-live="polite"]');
      expect(announcement).toBeInTheDocument();
      expect(announcement).toHaveTextContent(message);
      expect(announcement).toHaveAttribute('aria-atomic', 'true');
      
      // Should remove element after timeout
      await waitFor(() => {
        expect(document.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();
      }, { timeout: 1500 });
    });
  });

  describe('Component Accessibility', () => {
    it('Button component passes axe tests', async () => {
      const { container } = render(
        <TestWrapper>
          <Button>Test Button</Button>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Input component with label passes axe tests', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <label htmlFor="test-input">Test Label</label>
            <Input id="test-input" type="text" />
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Select component passes axe tests', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <label htmlFor="test-select">Test Select</label>
            <Select id="test-select">
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </Select>
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('LoadingSpinner has proper accessibility attributes', async () => {
      const { container } = render(
        <TestWrapper>
          <LoadingSpinner />
        </TestWrapper>
      );

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveAttribute('aria-label', 'Loading');
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Form Accessibility', () => {
    it('ProjectForm has proper form accessibility', async () => {
      const mockOnSubmit = jest.fn();
      const { container } = render(
        <TestWrapper>
          <ProjectForm onSubmit={mockOnSubmit} />
        </TestWrapper>
      );

      // All form inputs should have labels
      const nameInput = screen.getByLabelText(/project name/i);
      const urlInput = screen.getByLabelText(/project url/i);
      
      expect(nameInput).toBeInTheDocument();
      expect(urlInput).toBeInTheDocument();
      
      // Form should be keyboard navigable
      const user = userEvent.setup();
      await user.tab();
      expect(document.activeElement).toBe(nameInput);
      
      await user.tab();
      expect(document.activeElement).toBe(urlInput);
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Keyboard Navigation', () => {
    it('supports keyboard navigation for all interactive elements', async () => {
      const mockOnClick = jest.fn();
      const { container } = render(
        <TestWrapper>
          <div>
            <Button onClick={mockOnClick}>Button 1</Button>
            <Button onClick={mockOnClick}>Button 2</Button>
            <input type="text" placeholder="Text input" />
            <select>
              <option>Option 1</option>
              <option>Option 2</option>
            </select>
          </div>
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      // Tab through all elements
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Button 1' }));
      
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Button 2' }));
      
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('textbox'));
      
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('combobox'));
      
      // Test Enter key activation on buttons
      screen.getByRole('button', { name: 'Button 1' }).focus();
      await user.keyboard('{Enter}');
      expect(mockOnClick).toHaveBeenCalledTimes(1);
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports Escape key to close modals', async () => {
      const mockOnClose = jest.fn();
      render(
        <TestWrapper>
          <div 
            role="dialog" 
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                mockOnClose();
              }
            }}
          >
            <h2>Modal Title</h2>
            <Button>Close</Button>
          </div>
        </TestWrapper>
      );

      const modal = screen.getByRole('dialog');
      const user = userEvent.setup();
      
      modal.focus();
      await user.keyboard('{Escape}');
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ARIA Labels and Descriptions', () => {
    it('provides proper ARIA labels for complex components', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <button aria-label="Delete project" aria-describedby="delete-help">
              🗑️
            </button>
            <div id="delete-help">
              This action cannot be undone
            </div>
          </div>
        </TestWrapper>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Delete project');
      expect(button).toHaveAttribute('aria-describedby', 'delete-help');
      
      const helpText = screen.getByText('This action cannot be undone');
      expect(helpText).toHaveAttribute('id', 'delete-help');
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper error announcements', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <label htmlFor="email">Email</label>
            <input 
              id="email" 
              type="email" 
              aria-describedby="email-error"
              aria-invalid="true"
            />
            <div id="email-error" role="alert">
              Please enter a valid email address
            </div>
          </div>
        </TestWrapper>
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'email-error');
      
      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveTextContent('Please enter a valid email address');
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Screen Reader Testing', () => {
    it('provides proper heading structure', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <h1>Main Page Title</h1>
            <h2>Section Title</h2>
            <h3>Subsection Title</h3>
            <h2>Another Section</h2>
          </div>
        </TestWrapper>
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      const h2s = screen.getAllByRole('heading', { level: 2 });
      const h3 = screen.getByRole('heading', { level: 3 });
      
      expect(h1).toHaveTextContent('Main Page Title');
      expect(h2s).toHaveLength(2);
      expect(h3).toHaveTextContent('Subsection Title');
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper landmark roles', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <header role="banner">
              <h1>Site Header</h1>
            </header>
            <nav role="navigation" aria-label="Main navigation">
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/projects">Projects</a></li>
              </ul>
            </nav>
            <main role="main">
              <h2>Main Content</h2>
            </main>
            <footer role="contentinfo">
              <p>Footer content</p>
            </footer>
          </div>
        </TestWrapper>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});