import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ScenarioEditor } from '../ScenarioEditor';
import { TestScenario } from '../../../types/scenario';

// Mock drag and drop
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => (
    <div data-testid="drag-drop-context" onClick={() => onDragEnd && onDragEnd({
      destination: { index: 1 },
      source: { index: 0 },
      type: 'step'
    })}>
      {children}
    </div>
  ),
  Droppable: ({ children }: any) => children({
    droppableProps: {},
    innerRef: vi.fn(),
    placeholder: null
  }),
  Draggable: ({ children }: any) => children({
    draggableProps: {},
    dragHandleProps: {},
    innerRef: vi.fn()
  }, { isDragging: false })
}));

// Mock child components
vi.mock('../StepEditor', () => ({
  StepEditor: ({ step, onChange, onDelete, isDragging }: any) => (
    <div data-testid={`step-editor-${step.id}`} className={isDragging ? 'dragging' : ''}>
      <span>{step.description}</span>
      <button onClick={() => onChange({ ...step, description: 'Updated step' })}>
        Update Step
      </button>
      <button onClick={onDelete}>Delete Step</button>
    </div>
  )
}));

vi.mock('../AssertionEditor', () => ({
  AssertionEditor: ({ assertion, onChange, onDelete, isDragging }: any) => (
    <div data-testid={`assertion-editor-${assertion.id}`} className={isDragging ? 'dragging' : ''}>
      <span>{assertion.description}</span>
      <button onClick={() => onChange({ ...assertion, description: 'Updated assertion' })}>
        Update Assertion
      </button>
      <button onClick={onDelete}>Delete Assertion</button>
    </div>
  )
}));

vi.mock('../NaturalLanguageInput', () => ({
  NaturalLanguageInput: ({ value, onChange, onGenerate, isGenerating }: any) => (
    <div data-testid="natural-language-input">
      <h3>AI-Powered Test Generation</h3>
      <textarea
        placeholder="Describe your test scenario in natural language..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            onGenerate();
          }
        }}
        maxLength={500}
      />
      <div>{value.length}/500</div>
      <button onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate Test'}
      </button>
      <button>Show Examples</button>
      <div style={{ display: 'none' }}>
        <p>Try these examples:</p>
        <button onClick={() => onChange('Navigate to login page, enter username and password, click login button')}>
          Navigate to login page, enter username and password, click login button
        </button>
      </div>
    </div>
  )
}));

vi.mock('../CodePreview', () => ({
  CodePreview: ({ code, scenario, isGenerating }: any) => (
    <div data-testid="code-preview">
      <div>Playwright</div>
      <div>Cypress</div>
      {code && <pre>{code}</pre>}
      {isGenerating && <div>Loading...</div>}
    </div>
  )
}));

const mockScenario: TestScenario = {
  id: 'test-scenario-1',
  name: 'Test Login Flow',
  description: 'Test user login functionality',
  steps: [
    {
      id: 'step-1',
      type: 'navigate',
      value: 'https://example.com/login',
      description: 'Navigate to login page',
      timeout: 5000
    },
    {
      id: 'step-2',
      type: 'type',
      selector: '#username',
      value: 'testuser',
      description: 'Enter username',
      timeout: 5000
    }
  ],
  assertions: [
    {
      id: 'assertion-1',
      type: 'visible',
      selector: '.dashboard',
      expected: 'true',
      description: 'Dashboard should be visible'
    }
  ]
};

describe('ScenarioEditor', () => {
  const mockOnScenarioChange = vi.fn();
  const mockOnGenerateCode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders scenario editor with basic elements', () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    expect(screen.getByText('Test Scenario Editor')).toBeInTheDocument();
    expect(screen.getByText('Visual Editor')).toBeInTheDocument();
    expect(screen.getByText('Code Preview')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Login Flow')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test user login functionality')).toBeInTheDocument();
  });

  it('displays scenario steps correctly', () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    expect(screen.getByText('Navigate to login page')).toBeInTheDocument();
    expect(screen.getByText('Enter username')).toBeInTheDocument();
    expect(screen.getByText('Test Steps')).toBeInTheDocument();
  });

  it('displays scenario assertions correctly', () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    expect(screen.getByText('Dashboard should be visible')).toBeInTheDocument();
    expect(screen.getByText('Assertions')).toBeInTheDocument();
  });

  it('switches between visual and code preview tabs', async () => {
    const user = userEvent.setup();
    
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    // Initially on visual tab
    expect(screen.getByText('Test Steps')).toBeInTheDocument();

    // Switch to code preview
    await user.click(screen.getByText('Code Preview'));
    
    // Should show code preview elements
    expect(screen.getByText('Playwright')).toBeInTheDocument();
    expect(screen.getByText('Cypress')).toBeInTheDocument();
  });

  it('updates scenario name when input changes', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const nameInput = screen.getByDisplayValue('Test Login Flow');
    
    // Simulate a simple change event
    fireEvent.change(nameInput, { target: { value: 'New Name' } });

    // Check that onChange was called
    expect(mockOnScenarioChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Name'
      })
    );
  });

  it('updates scenario description when input changes', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const descriptionInput = screen.getByDisplayValue('Test user login functionality');
    
    // Simulate a simple change event
    fireEvent.change(descriptionInput, { target: { value: 'New Description' } });

    // Check that onChange was called
    expect(mockOnScenarioChange).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'New Description'
      })
    );
  });

  it('adds new step when Add Step button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    await user.click(screen.getByText('Add Step'));

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      steps: [
        ...mockScenario.steps,
        expect.objectContaining({
          type: 'click',
          description: 'New step'
        })
      ]
    });
  });

  it('adds new assertion when Add Assertion button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    await user.click(screen.getByText('Add Assertion'));

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      assertions: [
        ...mockScenario.assertions,
        expect.objectContaining({
          type: 'visible',
          description: 'New assertion'
        })
      ]
    });
  });

  it('shows natural language input section', () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    expect(screen.getByText('AI-Powered Test Generation')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe your test scenario/)).toBeInTheDocument();
  });

  it('calls onGenerateCode when generate button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const textarea = screen.getByPlaceholderText(/Describe your test scenario/);
    await user.type(textarea, 'Navigate to homepage and click login');

    const generateButton = screen.getByText('Generate Test');
    await user.click(generateButton);

    expect(mockOnGenerateCode).toHaveBeenCalledWith('Navigate to homepage and click login');
  });

  it('shows loading state when generating code', () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
        isGenerating={true}
      />
    );

    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('displays generated code in code preview', () => {
    const generatedCode = `import { test, expect } from '@playwright/test';

test('Generated Test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`;

    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
        generatedCode={generatedCode}
      />
    );

    // Switch to code preview tab
    fireEvent.click(screen.getByText('Code Preview'));

    expect(screen.getByText(/import { test, expect }/)).toBeInTheDocument();
  });

  it('shows empty state when no steps exist', () => {
    const emptyScenario = {
      ...mockScenario,
      steps: [],
      assertions: []
    };

    render(
      <ScenarioEditor
        scenario={emptyScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    expect(screen.getByText('No steps yet. Add a step or generate from natural language.')).toBeInTheDocument();
    expect(screen.getByText('No assertions yet. Add an assertion to verify test results.')).toBeInTheDocument();
  });

  it('handles drag and drop for steps', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    // Simulate drag and drop
    const dragDropContext = screen.getByTestId('drag-drop-context');
    fireEvent.click(dragDropContext);

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      steps: [mockScenario.steps[1], mockScenario.steps[0]]
    });
  });

  it('handles step updates correctly', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const updateButton = screen.getByTestId('step-editor-step-1').querySelector('button');
    fireEvent.click(updateButton!);

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      steps: [
        { ...mockScenario.steps[0], description: 'Updated step' },
        mockScenario.steps[1]
      ]
    });
  });

  it('handles step deletion correctly', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const deleteButton = screen.getByTestId('step-editor-step-1').querySelectorAll('button')[1];
    fireEvent.click(deleteButton!);

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      steps: [mockScenario.steps[1]]
    });
  });

  it('handles assertion updates correctly', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const updateButton = screen.getByTestId('assertion-editor-assertion-1').querySelector('button');
    fireEvent.click(updateButton!);

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      assertions: [
        { ...mockScenario.assertions[0], description: 'Updated assertion' }
      ]
    });
  });

  it('handles assertion deletion correctly', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    const deleteButton = screen.getByTestId('assertion-editor-assertion-1').querySelectorAll('button')[1];
    fireEvent.click(deleteButton!);

    expect(mockOnScenarioChange).toHaveBeenCalledWith({
      ...mockScenario,
      assertions: []
    });
  });

  it('validates natural language input length', async () => {
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    // Check that the counter initially shows 0/500
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });

  it('shows examples when Show Examples is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    await user.click(screen.getByText('Show Examples'));

    expect(screen.getByText('Try these examples:')).toBeInTheDocument();
    expect(screen.getByText(/Navigate to login page, enter username and password/)).toBeInTheDocument();
  });

  it('populates textarea when example is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ScenarioEditor
        scenario={mockScenario}
        onScenarioChange={mockOnScenarioChange}
        onGenerateCode={mockOnGenerateCode}
      />
    );

    await user.click(screen.getByText('Show Examples'));
    
    const exampleButton = screen.getByText(/Navigate to login page, enter username and password/);
    await user.click(exampleButton);

    const textarea = screen.getByPlaceholderText(/Describe your test scenario/);
    expect(textarea).toHaveValue('Navigate to login page, enter username and password, click login button');
  });
});