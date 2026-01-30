import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { ProjectList } from '../ProjectList';

const mockProjects = [
  {
    id: '1',
    name: 'Alpha Project',
    description: 'First test project',
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
    description: 'Second test project',
    url: 'https://beta.example.com',
    createdAt: '2024-01-14T09:15:00Z',
    lastRun: '2024-01-15T11:30:00Z',
    status: 'inactive' as const,
    testsCount: 3,
    passRate: 67
  },
  {
    id: '3',
    name: 'Gamma Project',
    description: 'Third test project with errors',
    url: 'https://gamma.example.com',
    createdAt: '2024-01-13T16:45:00Z',
    status: 'error' as const,
    testsCount: 8,
    passRate: 25
  }
];

const defaultProps = {
  projects: mockProjects,
  isLoading: false,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRun: vi.fn(),
  onCreateNew: vi.fn()
};

describe('ProjectList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all projects when not loading', () => {
    render(<ProjectList {...defaultProps} />);
    
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading is true', () => {
    render(<ProjectList {...defaultProps} isLoading={true} />);
    
    const skeletons = screen.getAllByTestId('loading-skeleton') || 
                     document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
  });

  it('shows empty state when no projects exist', () => {
    render(<ProjectList {...defaultProps} projects={[]} />);
    
    expect(screen.getByText('No projects')).toBeInTheDocument();
    expect(screen.getByText('Get started by creating your first project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
  });

  it('calls onCreateNew when Create Project button is clicked in empty state', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} projects={[]} />);
    
    const createButton = screen.getByRole('button', { name: 'Create Project' });
    await user.click(createButton);
    
    expect(defaultProps.onCreateNew).toHaveBeenCalled();
  });

  it('filters projects by search term', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'Alpha');
    
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Project')).not.toBeInTheDocument();
  });

  it('filters projects by description', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'errors');
    
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
  });

  it('filters projects by URL', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'beta.example');
    
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Project')).not.toBeInTheDocument();
  });

  it('filters projects by status', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const statusFilter = screen.getByDisplayValue('All Status');
    await user.selectOptions(statusFilter, 'active');
    
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Project')).not.toBeInTheDocument();
  });

  it('sorts projects by name', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    await user.selectOptions(sortSelect, 'name');
    
    const projectCards = screen.getAllByText(/Project$/);
    expect(projectCards[0]).toHaveTextContent('Alpha Project');
    expect(projectCards[1]).toHaveTextContent('Beta Project');
    expect(projectCards[2]).toHaveTextContent('Gamma Project');
  });

  it('sorts projects by creation date (default)', () => {
    render(<ProjectList {...defaultProps} />);
    
    const projectCards = screen.getAllByText(/Project$/);
    // Should be sorted by creation date descending (newest first)
    expect(projectCards[0]).toHaveTextContent('Alpha Project'); // 2024-01-15
    expect(projectCards[1]).toHaveTextContent('Beta Project');  // 2024-01-14
    expect(projectCards[2]).toHaveTextContent('Gamma Project'); // 2024-01-13
  });

  it('sorts projects by last run date', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    await user.selectOptions(sortSelect, 'lastRun');
    
    const projectCards = screen.getAllByText(/Project$/);
    // Alpha has most recent lastRun, Beta second, Gamma has no lastRun (should be last)
    expect(projectCards[0]).toHaveTextContent('Alpha Project');
    expect(projectCards[1]).toHaveTextContent('Beta Project');
    expect(projectCards[2]).toHaveTextContent('Gamma Project');
  });

  it('sorts projects by status', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    await user.selectOptions(sortSelect, 'status');
    
    const projectCards = screen.getAllByText(/Project$/);
    // Should be alphabetical by status: active, error, inactive
    expect(projectCards[0]).toHaveTextContent('Alpha Project');  // active
    expect(projectCards[1]).toHaveTextContent('Gamma Project'); // error
    expect(projectCards[2]).toHaveTextContent('Beta Project');  // inactive
  });

  it('combines search and status filters', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    const statusFilter = screen.getByDisplayValue('All Status');
    
    await user.type(searchInput, 'Project');
    await user.selectOptions(statusFilter, 'error');
    
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
  });

  it('shows correct results count', () => {
    render(<ProjectList {...defaultProps} />);
    
    expect(screen.getByText('Showing 3 of 3 projects')).toBeInTheDocument();
  });

  it('updates results count when filtering', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'Alpha');
    
    expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();
  });

  it('passes callbacks to ProjectCard components', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const runButtons = screen.getAllByRole('button', { name: 'Run Tests' });
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    
    await user.click(runButtons[0]);
    expect(defaultProps.onRun).toHaveBeenCalledWith(mockProjects[0]);
    
    await user.click(editButtons[0]);
    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockProjects[0]);
    
    await user.click(deleteButtons[0]);
    expect(defaultProps.onDelete).toHaveBeenCalledWith(mockProjects[0]);
  });

  it('handles case-insensitive search', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'ALPHA');
    
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
  });

  it('clears search when input is emptied', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'Alpha');
    
    expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();
    
    await user.clear(searchInput);
    
    expect(screen.getByText('Showing 3 of 3 projects')).toBeInTheDocument();
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();
  });

  it('shows no results when search matches nothing', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'nonexistent');
    
    expect(screen.getByText('Showing 0 of 3 projects')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Project')).not.toBeInTheDocument();
  });

  it('maintains responsive grid layout', () => {
    render(<ProjectList {...defaultProps} />);
    
    const grid = screen.getByText('Alpha Project').closest('.grid');
    expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
  });

  it('handles projects without lastRun in sorting', async () => {
    const user = userEvent.setup();
    const projectsWithoutLastRun = [
      { ...mockProjects[0], lastRun: undefined },
      { ...mockProjects[1], lastRun: undefined },
      { ...mockProjects[2], lastRun: undefined }
    ];
    
    render(<ProjectList {...defaultProps} projects={projectsWithoutLastRun} />);
    
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    await user.selectOptions(sortSelect, 'lastRun');
    
    // Should still render all projects even when none have lastRun
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(screen.getByText('Gamma Project')).toBeInTheDocument();
  });

  it('handles empty search gracefully', async () => {
    const user = userEvent.setup();
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, '   '); // Just spaces
    
    // Should show all projects when search is just whitespace
    expect(screen.getByText('Showing 3 of 3 projects')).toBeInTheDocument();
  });

  it('has proper accessibility for form controls', () => {
    render(<ProjectList {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    expect(searchInput).toHaveAttribute('type', 'text');
    
    const sortSelect = screen.getByDisplayValue('Sort by Created');
    expect(sortSelect.tagName).toBe('SELECT');
    
    const statusFilter = screen.getByDisplayValue('All Status');
    expect(statusFilter.tagName).toBe('SELECT');
  });

  it('does not render Create Project button in empty state when onCreateNew is not provided', () => {
    render(<ProjectList projects={[]} isLoading={false} />);
    
    expect(screen.getByText('No projects')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Project' })).not.toBeInTheDocument();
  });

  it('handles projects with missing descriptions in search', async () => {
    const user = userEvent.setup();
    const projectsWithMissingDesc = [
      { ...mockProjects[0], description: undefined },
      mockProjects[1],
      mockProjects[2]
    ];
    
    render(<ProjectList {...defaultProps} projects={projectsWithMissingDesc} />);
    
    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'Alpha');
    
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
  });
});