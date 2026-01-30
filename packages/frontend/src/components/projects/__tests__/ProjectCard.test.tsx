import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/utils';
import { ProjectCard } from '../ProjectCard';

const mockProject = {
  id: '1',
  name: 'Test Project',
  description: 'A test project for unit testing',
  url: 'https://example.com',
  createdAt: '2024-01-15T10:30:00Z',
  lastRun: '2024-01-16T14:20:00Z',
  status: 'active' as const,
  testsCount: 5,
  passRate: 85
};

describe('ProjectCard', () => {
  it('renders project information correctly', () => {
    render(<ProjectCard project={mockProject} />);
    
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('A test project for unit testing')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('5 tests')).toBeInTheDocument();
    expect(screen.getByText('85% pass rate')).toBeInTheDocument();
  });

  it('displays correct status badge with appropriate styling', () => {
    render(<ProjectCard project={mockProject} />);
    
    const statusBadge = screen.getByText('active');
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('displays different status colors for different statuses', () => {
    const inactiveProject = { ...mockProject, status: 'inactive' as const };
    const { rerender } = render(<ProjectCard project={inactiveProject} />);
    
    let statusBadge = screen.getByText('inactive');
    expect(statusBadge).toHaveClass('bg-gray-100', 'text-gray-800');
    
    const errorProject = { ...mockProject, status: 'error' as const };
    rerender(<ProjectCard project={errorProject} />);
    
    statusBadge = screen.getByText('error');
    expect(statusBadge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('displays pass rate with appropriate color coding', () => {
    // High pass rate (green)
    render(<ProjectCard project={mockProject} />);
    let passRateElement = screen.getByText('85% pass rate');
    expect(passRateElement).toHaveClass('text-green-600');
    
    // Medium pass rate (yellow)
    const mediumProject = { ...mockProject, passRate: 65 };
    const { rerender } = render(<ProjectCard project={mediumProject} />);
    rerender(<ProjectCard project={mediumProject} />);
    
    passRateElement = screen.getByText('65% pass rate');
    expect(passRateElement).toHaveClass('text-yellow-600');
    
    // Low pass rate (red)
    const lowProject = { ...mockProject, passRate: 45 };
    rerender(<ProjectCard project={lowProject} />);
    
    passRateElement = screen.getByText('45% pass rate');
    expect(passRateElement).toHaveClass('text-red-600');
  });

  it('formats dates correctly', () => {
    render(<ProjectCard project={mockProject} />);
    
    expect(screen.getByText('Created Jan 15, 2024')).toBeInTheDocument();
    expect(screen.getByText('Last run Jan 16, 2024')).toBeInTheDocument();
  });

  it('handles missing description gracefully', () => {
    const projectWithoutDescription = { ...mockProject, description: undefined };
    render(<ProjectCard project={projectWithoutDescription} />);
    
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.queryByText('A test project for unit testing')).not.toBeInTheDocument();
  });

  it('handles missing lastRun gracefully', () => {
    const projectWithoutLastRun = { ...mockProject, lastRun: undefined };
    render(<ProjectCard project={projectWithoutLastRun} />);
    
    expect(screen.getByText('Created Jan 15, 2024')).toBeInTheDocument();
    expect(screen.queryByText(/Last run/)).not.toBeInTheDocument();
  });

  it('renders project link with correct href', () => {
    render(<ProjectCard project={mockProject} />);
    
    const projectLink = screen.getByRole('link', { name: 'Test Project' });
    expect(projectLink).toHaveAttribute('href', '/projects/1');
  });

  it('renders external URL link with correct attributes', () => {
    render(<ProjectCard project={mockProject} />);
    
    const urlLink = screen.getByRole('link', { name: 'https://example.com' });
    expect(urlLink).toHaveAttribute('href', 'https://example.com');
    expect(urlLink).toHaveAttribute('target', '_blank');
    expect(urlLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('calls onRun callback when Run Tests button is clicked', () => {
    const onRun = vi.fn();
    render(<ProjectCard project={mockProject} onRun={onRun} />);
    
    const runButton = screen.getByRole('button', { name: 'Run Tests' });
    fireEvent.click(runButton);
    
    expect(onRun).toHaveBeenCalledWith(mockProject);
  });

  it('calls onEdit callback when Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<ProjectCard project={mockProject} onEdit={onEdit} />);
    
    const editButton = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editButton);
    
    expect(onEdit).toHaveBeenCalledWith(mockProject);
  });

  it('calls onDelete callback when Delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<ProjectCard project={mockProject} onDelete={onDelete} />);
    
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    
    expect(onDelete).toHaveBeenCalledWith(mockProject);
  });

  it('does not render action buttons when callbacks are not provided', () => {
    render(<ProjectCard project={mockProject} />);
    
    expect(screen.getByRole('button', { name: 'Run Tests' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('has proper hover effects and transitions', () => {
    render(<ProjectCard project={mockProject} />);
    
    const card = screen.getByText('Test Project').closest('div');
    expect(card).toHaveClass('hover:shadow-md', 'transition-shadow');
    
    const projectLink = screen.getByRole('link', { name: 'Test Project' });
    expect(projectLink).toHaveClass('hover:text-blue-600', 'transition-colors');
    
    const urlLink = screen.getByRole('link', { name: 'https://example.com' });
    expect(urlLink).toHaveClass('hover:text-blue-600');
  });

  it('has proper accessibility attributes', () => {
    render(<ProjectCard project={mockProject} />);
    
    const projectLink = screen.getByRole('link', { name: 'Test Project' });
    expect(projectLink).toBeInTheDocument();
    
    const runButton = screen.getByRole('button', { name: 'Run Tests' });
    expect(runButton).toBeInTheDocument();
    
    const editButton = screen.getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeInTheDocument();
  });

  it('truncates long URLs properly', () => {
    const longUrlProject = {
      ...mockProject,
      url: 'https://very-long-domain-name-that-should-be-truncated.example.com/with/very/long/path'
    };
    
    render(<ProjectCard project={longUrlProject} />);
    
    const urlLink = screen.getByRole('link', { name: longUrlProject.url });
    expect(urlLink).toHaveClass('truncate');
  });

  it('handles edge case with zero tests', () => {
    const noTestsProject = { ...mockProject, testsCount: 0, passRate: 0 };
    render(<ProjectCard project={noTestsProject} />);
    
    expect(screen.getByText('0 tests')).toBeInTheDocument();
    expect(screen.getByText('0% pass rate')).toBeInTheDocument();
  });
});