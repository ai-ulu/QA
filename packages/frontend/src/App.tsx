import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useOffline } from './contexts/OfflineContext';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { OfflineIndicator } from './components/ui/OfflineIndicator';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';

// Layout
import { AppLayout } from './components/layout/AppLayout';
import { PublicLayout } from './components/layout/PublicLayout';

function App() {
  const { user, isLoading } = useAuth();
  const { queuedOperations, processQueue } = useOffline();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<PublicLayout />}>
          <Route index element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
          <Route path="login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route path="auth/callback" element={<AuthCallbackPage />} />
        </Route>

        {/* Protected routes */}
        <Route path="/" element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* 404 page */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      
      {/* Offline indicator */}
      <OfflineIndicator 
        onRetry={processQueue}
        queuedOperationsCount={queuedOperations.length}
      />
    </>
  );
}

export default App;