import { useEffect } from 'react';
import { app } from './firebase';
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

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useLoan();
  if (loading) return <div>Loading...</div>;
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

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  useEffect(() => {
    console.log('Supabase client initialized:', supabase);
  }, []);

  return (
    <Router>
      <LoanProvider>
        <Toaster position="top-right" />
        <CustomCursor />
        <Chatbot />
        <AnimatedRoutes />
      </LoanProvider>
    </Router>
  );
}

export default App;
