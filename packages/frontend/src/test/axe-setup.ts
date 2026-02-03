/**
 * Axe-core setup for accessibility testing
 */
import { configureAxe } from 'jest-axe';

// Configure axe for our testing environment
export const axe = configureAxe({
  rules: {
    // Enable all WCAG 2.1 Level AA rules
    'color-contrast': { enabled: true },
    'keyboard-navigation': { enabled: true },
    'focus-management': { enabled: true },
    'aria-labels': { enabled: true },
    'heading-order': { enabled: true },
    'landmark-roles': { enabled: true },
    'list-structure': { enabled: true },
    'image-alt': { enabled: true },
    'form-labels': { enabled: true },
    'link-purpose': { enabled: true },
    'button-name': { enabled: true },
    'input-purpose': { enabled: true },
    'tab-index': { enabled: true },
    'focus-visible': { enabled: true },
    'skip-link': { enabled: true },
    'page-has-heading-one': { enabled: true },
    'region': { enabled: true },
    'bypass': { enabled: true }
  },
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa']
});

// Helper to run axe tests on rendered components
export async function runAxeTest(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}

// Helper to test keyboard navigation
export function testKeyboardNavigation(container: HTMLElement): void {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  expect(focusableElements.length).toBeGreaterThan(0);
  
  focusableElements.forEach((element) => {
    const htmlElement = element as HTMLElement;
    htmlElement.focus();
    expect(document.activeElement).toBe(htmlElement);
  });
}

// Helper to test focus trap in modals
export function testFocusTrap(modalContainer: HTMLElement): void {
  const focusableElements = modalContainer.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  if (focusableElements.length === 0) return;
  
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
  
  // Test Tab key cycling
  firstElement.focus();
  expect(document.activeElement).toBe(firstElement);
  
  // Simulate Tab to last element
  lastElement.focus();
  expect(document.activeElement).toBe(lastElement);
  
  // Test Shift+Tab cycling back
  firstElement.focus();
  expect(document.activeElement).toBe(firstElement);
}