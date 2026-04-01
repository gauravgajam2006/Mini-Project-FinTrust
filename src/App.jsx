import { useEffect } from 'react';
import { supabase } from './supabase';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { LoanProvider, useLoan } from './context/LoanContext';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import LoginSignup from './components/LoginSignup';
import Dashboard from './pages/Dashboard';
import CreateLoan from './pages/CreateLoan';
import LoansList from './pages/LoansList';
import LoanDetails from './pages/LoanDetails';
import UpdateLoan from './pages/UpdateLoan';
import Profile from './pages/Profile';
import SocialHub from './pages/SocialHub';
import Leaderboard from './pages/Leaderboard';
import Chatbot from './components/Chatbot';
import CustomCursor from './components/CustomCursor';
import PageTransition from './components/PageTransition';

// Simple loading spinner component
const LoadingSpinner = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0f172a', color: '#94a3b8'
    }}>
        <div style={{ textAlign: 'center' }}>
            <div style={{
                width: '40px', height: '40px', border: '3px solid #1e293b',
                borderTop: '3px solid #06b6d4', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
            }} />
            <p>Loading FinTrust...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    </div>
);

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
  if (loading) return <div>Loading...</div>;
  return isAuthenticated ? <Navigate to="/dashboard" /> : children;
};

// Animated Routes Component
const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
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
        <Route path="/profile" element={<ProtectedRoute><Layout><PageTransition><Profile /></PageTransition></Layout></ProtectedRoute>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  // Detect touch device for custom cursor
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  return (
    <Router>
      <LoanProvider>
        <Toaster position="top-right" />
        {!isTouchDevice && <CustomCursor />}
        <Chatbot />
        <AnimatedRoutes />
      </LoanProvider>
    </Router>
  );
}

export default App;
