import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/utils';
import { ProjectList } from '../ProjectList';
import { ProjectForm } from '../ProjectForm';
import { ProjectCard } from '../ProjectCard';

const mockProjects = [
  {
    id: '1',
    name: 'Test Project',
    description: 'A test project',
    url: 'https://example.com',
    createdAt: '2024-01-15T10:30:00Z',
    lastRun: '2024-01-16T14:20:00Z',
    status: 'active' as const,
    testsCount: 5,
    passRate: 85
  }
];

describe('Project Management Integration', () => {
  it('handles complete project CRUD workflow', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onRun = vi.fn();

    // Test project creation form
    const { rerender } = render(
      <ProjectForm 
        onSubmit={onSubmit}
        onCancel={onCancel}
        title="Create New Project"
      />
    );

    // Fill out the form
    const nameInput = screen.getByLabelText('Project Name');
    const descriptionInput = screen.getByLabelText('Description');
    const urlInput = screen.getByLabelText('Website URL');

    fireEvent.change(nameInput, { target: { value: 'Integration Test Project' } });
    fireEvent.change(descriptionInput, { target: { value: 'Testing integration' } });
    fireEvent.change(urlInput, { target: { value: 'https://integration.example.com' } });

    // Submit the form
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Integration Test Project',
        description: 'Testing integration',
        url: 'https://integration.example.com',
        credentials: {
          username: '',
          password: '',
          apiKey: ''
        }
      });
    });

    // Now test the project list with the new project
    const newProject = {
      id: '2',
      name: 'Integration Test Project',
      description: 'Testing integration',
      url: 'https://integration.example.com',
      createdAt: '2024-01-17T10:30:00Z',
      status: 'active' as const,
      testsCount: 0,
      passRate: 0
    };

    rerender(
      <ProjectList
        projects={[...mockProjects, newProject]}
        onEdit={onEdit}
        onDelete={onDelete}
        onRun={onRun}
      />
    );

    // Verify the new project appears in the list
    expect(screen.getByText('Integration Test Project')).toBeInTheDocument();
    expect(screen.getByText('Testing integration')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 projects')).toBeInTheDocument();

    // Test project actions
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    const runButtons = screen.getAllByRole('button', { name: 'Run Tests' });

    // Click edit on the new project (second in list)
    fireEvent.click(editButtons[1]);
    expect(onEdit).toHaveBeenCalledWith(newProject);

    // Click run on the new project
    fireEvent.click(runButtons[1]);
    expect(onRun).toHaveBeenCalledWith(newProject);

    // Click delete on the new project
    fireEvent.click(deleteButtons[1]);
    expect(onDelete).toHaveBeenCalledWith(newProject);
  });

  it('handles form validation errors and recovery', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <ProjectForm 
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    // Try to submit empty form
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    fireEvent.click(submitButton);

    // Check validation errors appear
    await waitFor(() => {
      expect(screen.getByText('Project name is required')).toBeInTheDocument();
      expect(screen.getByText('Website URL is required')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();

    // Fix the name but provide invalid URL
    const nameInput = screen.getByLabelText('Project Name');
    const urlInput = screen.getByLabelText('Website URL');

    fireEvent.change(nameInput, { target: { value: 'Test Project' } });
    fireEvent.change(urlInput, { target: { value: 'invalid-url' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText('Project name is required')).not.toBeInTheDocument();
      expect(screen.getByText('Please enter a valid URL')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();

    // Fix the URL and submit successfully
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText('Please enter a valid URL')).not.toBeInTheDocument();
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Test Project',
        description: '',
        url: 'https://example.com',
        credentials: {
          username: '',
          password: '',
          apiKey: ''
        }
      });
    });
  });

  it('handles project list filtering and sorting with real data', () => {
    const projects = [
      {
        id: '1',
        name: 'Alpha Project',
        description: 'First project',
        url: 'https://alpha.example.com',
        createdAt: '2024-01-15T10:30:00Z',
        lastRun: '2024-01-16T14:20:00Z',
        status: 'active' as const,
        testsCount: 5,
        passRate: 85
      },
      {
        id: '2',
        name: 'Beta Project',
        description: 'Second project',
        url: 'https://beta.example.com',
        createdAt: '2024-01-14T09:15:00Z',
        status: 'inactive' as const,
        testsCount: 3,
        passRate: 67
      },
      {
        id: '3',
        name: 'Gamma Project',
        description: 'Third project with issues',
        url: 'https://gamma.example.com',
        createdAt: '2024-01-13T16:45:00Z',
        status: 'error' as const,
        testsCount: 8,
        passRate: 25
      }
    ];

    render(<ProjectList projects={projects} />);

    // Initial state - all projects visible
    expect(screen.getByText('Showing 3 of 3 projects')).toBeInTheDocument();
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();

    // Test search functionality
    const searchInput = screen.getByPlaceholderText('Search projects...');
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Project')).not.toBeInTheDocument();

    // Clear search and test status filter
    fireEvent.change(searchInput, { target: { value: '' } });
    const statusFilter = screen.getByDisplayValue('All Status');
    fireEvent.change(statusFilter, { target: { value: 'error' } });

    expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();

    // Reset filters and test sorting
    fireEvent.change(statusFilter, { target: { value: 'all' } });
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    fireEvent.change(sortSelect, { target: { value: 'name' } });

    const projectNames = screen.getAllByText(/Project$/);
    expect(projectNames[0]).toHaveTextContent('Alpha Project');
    expect(projectNames[1]).toHaveTextContent('Beta Project');
    expect(projectNames[2]).toHaveTextContent('Gamma Project');
  });

  it('handles loading states across components', () => {
    // Test ProjectList loading state
    render(<ProjectList projects={[]} isLoading={true} />);
    
    const skeletons = screen.getAllByRole('generic').filter(el => 
      el.classList.contains('animate-pulse')
    );
    expect(skeletons.length).toBeGreaterThan(0);

    // Test ProjectForm loading state
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    
    const { rerender } = render(
      <ProjectForm 
        onSubmit={onSubmit}
        onCancel={onCancel}
        isLoading={true}
      />
    );

    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(submitButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    // Test loading indicator in submit button
    expect(submitButton.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('handles error states and user feedback', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network error'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ProjectForm 
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    // Fill out form with valid data
    const nameInput = screen.getByLabelText('Project Name');
    const urlInput = screen.getByLabelText('Website URL');
    
    fireEvent.change(nameInput, { target: { value: 'Test Project' } });
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    fireEvent.click(submitButton);

    // Verify error is logged
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Form submission error:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  it('handles credentials workflow end-to-end', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectForm 
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    // Fill basic form data
    const nameInput = screen.getByLabelText('Project Name');
    const urlInput = screen.getByLabelText('Website URL');
    
    fireEvent.change(nameInput, { target: { value: 'Secure Project' } });
    fireEvent.change(urlInput, { target: { value: 'https://secure.example.com' } });

    // Show credentials section
    const showCredentialsButton = screen.getByRole('button', { name: 'Show Credentials' });
    fireEvent.click(showCredentialsButton);

    // Fill credentials
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const apiKeyInput = screen.getByLabelText('API Key');

    fireEvent.change(usernameInput, { target: { value: 'testuser@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'securepassword123' } });
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test-api-key-12345' } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Secure Project',
        description: '',
        url: 'https://secure.example.com',
        credentials: {
          username: 'testuser@example.com',
          password: 'securepassword123',
          apiKey: 'sk-test-api-key-12345'
        }
      });
    });
  });

  it('maintains component state during user interactions', () => {
    const projects = mockProjects;
    
    render(<ProjectList projects={projects} />);

    // Apply search filter
    const searchInput = screen.getByPlaceholderText('Search projects...');
    fireEvent.change(searchInput, { target: { value: 'Test' } });

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 projects')).toBeInTheDocument();

    // Change sort order
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    fireEvent.change(sortSelect, { target: { value: 'name' } });

    // Search filter should still be applied
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 projects')).toBeInTheDocument();
    expect(searchInput).toHaveValue('Test');

    // Add status filter
    const statusFilter = screen.getByDisplayValue('All Status');
    fireEvent.change(statusFilter, { target: { value: 'active' } });

    // Both filters should still be applied
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 projects')).toBeInTheDocument();
    expect(searchInput).toHaveValue('Test');
    expect(statusFilter).toHaveValue('active');
  });
});