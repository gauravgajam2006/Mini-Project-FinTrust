import { useEffect } from 'react';
import { supabase } from './supabase';
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { toast, Toaster } from 'react-hot-toast';
import { LoanProvider, useLoan } from './context/LoanContext';
import Layout from './components/Layout';
import PageTransition from './components/PageTransition';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy loaded components for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginSignup = lazy(() => import('./components/LoginSignup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateLoan = lazy(() => import('./pages/CreateLoan'));
const LoansList = lazy(() => import('./pages/LoansList'));
const LoanDetails = lazy(() => import('./pages/LoanDetails'));
const UpdateLoan = lazy(() => import('./pages/UpdateLoan'));
const Profile = lazy(() => import('./pages/Profile'));
const SocialHub = lazy(() => import('./pages/SocialHub'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Chatbot = lazy(() => import('./components/Chatbot'));
const LoanAgreement = lazy(() => import('./pages/LoanAgreement'));

// Simple 404 page
const NotFoundPage = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0f172a', color: '#e2e8f0',
        flexDirection: 'column', gap: '16px'
    }}>
        <h1 style={{ fontSize: '4rem', margin: 0, color: '#06b6d4' }}>404</h1>
        <p style={{ fontSize: '1.2rem', color: '#94a3b8' }}>Page not found</p>
        <a href="/dashboard" style={{
            padding: '10px 24px', background: '#06b6d4', color: '#0f172a',
            borderRadius: '8px', textDecoration: 'none', fontWeight: 600
        }}>Go to Dashboard</a>
    </div>
);

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useLoan();
  if (loading) return <LoadingSpinner />;
  return isAuthenticated ? children : <Navigate to="/auth" />;
};

// Public Route Component (redirects to dashboard if logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useLoan();
  if (loading) return <LoadingSpinner />;
  return isAuthenticated ? <Navigate to="/dashboard" /> : children;
};

// Animated Routes Component
const AnimatedRoutes = () => {
  const location = useLocation();

  useEffect(() => {
    const handleOnline = () => toast.success('You are back online!');
    const handleOffline = () => toast.error('You are offline. Some features may not work.');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<LoadingSpinner />}>
        <Routes location={location} key={location.pathname}>
          {/* Public Routes */}
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/auth" element={<PublicRoute><LoginSignup /></PublicRoute>} />

          {/* Protected Routes directly rendering layout wrappers */}
          <Route path="/dashboard" element={<ProtectedRoute><Layout><PageTransition><Dashboard /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/loans" element={<ProtectedRoute><Layout><PageTransition><LoansList /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/create-loan" element={<ProtectedRoute><Layout><PageTransition><CreateLoan /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/loan/:id" element={<ProtectedRoute><Layout><PageTransition><LoanDetails /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/loan/:id/edit" element={<ProtectedRoute><Layout><PageTransition><UpdateLoan /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/social" element={<ProtectedRoute><Layout><PageTransition><SocialHub /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Layout><PageTransition><Leaderboard /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/loan-agreement" element={<ProtectedRoute><Layout><PageTransition><LoanAgreement /></PageTransition></Layout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Layout><PageTransition><Profile /></PageTransition></Layout></ProtectedRoute>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
};

import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <LoanProvider>
            <Toaster position="top-right" />
            <Chatbot />
            <AnimatedRoutes />
          </LoanProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

