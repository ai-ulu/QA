import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { ProjectForm } from '../ProjectForm';

const mockOnSubmit = vi.fn();
const mockOnCancel = vi.fn();

const defaultProps = {
  onSubmit: mockOnSubmit,
  onCancel: mockOnCancel,
  isLoading: false,
  title: 'Create New Project'
};

describe('ProjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with all required fields', () => {
    render(<ProjectForm {...defaultProps} />);
    
    expect(screen.getByText('Create New Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Website URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders with initial data when provided', () => {
    const initialData = {
      name: 'Existing Project',
      description: 'An existing project',
      url: 'https://existing.com',
      credentials: {
        username: 'testuser',
        password: 'testpass',
        apiKey: 'test-api-key'
      }
    };

    render(<ProjectForm {...defaultProps} initialData={initialData} title="Edit Project" />);
    
    expect(screen.getByDisplayValue('Existing Project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('An existing project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://existing.com')).toBeInTheDocument();
    expect(screen.getByText('Edit Project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Project' })).toBeInTheDocument();
  });

  it('validates required fields on submission', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    await user.click(submitButton);
    
    expect(screen.getByText('Project name is required')).toBeInTheDocument();
    expect(screen.getByText('Website URL is required')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates URL format', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    const nameInput = screen.getByLabelText('Project Name');
    const urlInput = screen.getByLabelText('Website URL');
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    
    await user.type(nameInput, 'Test Project');
    await user.type(urlInput, 'invalid-url');
    await user.click(submitButton);
    
    expect(screen.getByText('Please enter a valid URL')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('clears validation errors when user starts typing', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    await user.click(submitButton);
    
    expect(screen.getByText('Project name is required')).toBeInTheDocument();
    
    const nameInput = screen.getByLabelText('Project Name');
    await user.type(nameInput, 'T');
    
    expect(screen.queryByText('Project name is required')).not.toBeInTheDocument();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    
    render(<ProjectForm {...defaultProps} />);
    
    const nameInput = screen.getByLabelText('Project Name');
    const descriptionInput = screen.getByLabelText('Description');
    const urlInput = screen.getByLabelText('Website URL');
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    
    await user.type(nameInput, 'Test Project');
    await user.type(descriptionInput, 'Test Description');
    await user.type(urlInput, 'https://example.com');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Test Project',
        description: 'Test Description',
        url: 'https://example.com',
        credentials: {
          username: '',
          password: '',
          apiKey: ''
        }
      });
    });
  });

  it('shows and hides credentials section', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    
    const showCredentialsButton = screen.getByRole('button', { name: 'Show Credentials' });
    await user.click(showCredentialsButton);
    
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    
    const hideCredentialsButton = screen.getByRole('button', { name: 'Hide Credentials' });
    await user.click(hideCredentialsButton);
    
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('includes credentials in form submission when provided', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    
    render(<ProjectForm {...defaultProps} />);
    
    // Fill required fields
    await user.type(screen.getByLabelText('Project Name'), 'Test Project');
    await user.type(screen.getByLabelText('Website URL'), 'https://example.com');
    
    // Show and fill credentials
    await user.click(screen.getByRole('button', { name: 'Show Credentials' }));
    await user.type(screen.getByLabelText('Username'), 'testuser');
    await user.type(screen.getByLabelText('Password'), 'testpass');
    await user.type(screen.getByLabelText('API Key'), 'test-key');
    
    await user.click(screen.getByRole('button', { name: 'Create Project' }));
    
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Test Project',
        description: '',
        url: 'https://example.com',
        credentials: {
          username: 'testuser',
          password: 'testpass',
          apiKey: 'test-key'
        }
      });
    });
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows loading state correctly', () => {
    render(<ProjectForm {...defaultProps} isLoading={true} />);
    
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    
    expect(submitButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    expect(submitButton).toHaveAttribute('disabled');
  });

  it('handles form submission errors gracefully', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnSubmit.mockRejectedValue(new Error('Submission failed'));
    
    render(<ProjectForm {...defaultProps} />);
    
    await user.type(screen.getByLabelText('Project Name'), 'Test Project');
    await user.type(screen.getByLabelText('Website URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));
    
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Form submission error:', expect.any(Error));
    });
    
    consoleErrorSpy.mockRestore();
  });

  it('has proper form accessibility', () => {
    render(<ProjectForm {...defaultProps} />);
    
    const form = screen.getByRole('form');
    expect(form).toBeInTheDocument();
    
    // Check that labels are properly associated with inputs
    const nameInput = screen.getByLabelText('Project Name');
    expect(nameInput).toHaveAttribute('required');
    
    const urlInput = screen.getByLabelText('Website URL');
    expect(urlInput).toHaveAttribute('required');
    expect(urlInput).toHaveAttribute('type', 'url');
  });

  it('shows error messages with proper ARIA attributes', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    await user.click(screen.getByRole('button', { name: 'Create Project' }));
    
    const nameError = screen.getByText('Project name is required');
    const urlError = screen.getByText('Website URL is required');
    
    expect(nameError).toHaveAttribute('role', 'alert');
    expect(urlError).toHaveAttribute('role', 'alert');
  });

  it('accepts various URL formats', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    
    const validUrls = [
      'https://example.com',
      'http://example.com',
      'https://subdomain.example.com',
      'https://example.com:8080',
      'https://example.com/path',
      'https://example.com/path?query=value'
    ];
    
    for (const url of validUrls) {
      const { rerender } = render(<ProjectForm {...defaultProps} />);
      
      await user.type(screen.getByLabelText('Project Name'), 'Test');
      await user.type(screen.getByLabelText('Website URL'), url);
      await user.click(screen.getByRole('button', { name: 'Create Project' }));
      
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ url })
        );
      });
      
      mockOnSubmit.mockClear();
      rerender(<div />); // Clear the component
    }
  });

  it('handles textarea for description properly', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    const descriptionTextarea = screen.getByLabelText('Description');
    expect(descriptionTextarea.tagName).toBe('TEXTAREA');
    expect(descriptionTextarea).toHaveAttribute('rows', '3');
    
    const longDescription = 'This is a very long description that spans multiple lines and should be handled properly by the textarea component';
    await user.type(descriptionTextarea, longDescription);
    
    expect(descriptionTextarea).toHaveValue(longDescription);
  });

  it('prevents form submission when already loading', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} isLoading={true} />);
    
    const form = screen.getByRole('form');
    fireEvent.submit(form);
    
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows credentials with proper input types', async () => {
    const user = userEvent.setup();
    render(<ProjectForm {...defaultProps} />);
    
    await user.click(screen.getByRole('button', { name: 'Show Credentials' }));
    
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const apiKeyInput = screen.getByLabelText('API Key');
    
    expect(usernameInput).toHaveAttribute('type', 'text');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(apiKeyInput).toHaveAttribute('type', 'text');
  });
});