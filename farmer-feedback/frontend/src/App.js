import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Entries from './pages/Entries';
import Flagged from './pages/Flagged';
import WeeklyDigest from './pages/WeeklyDigest';
import FeedbackDashboard from './pages/FeedbackDashboard';
import ChatBot from './pages/ChatBot';
import AdminPanel from './pages/AdminPanel';
import CoverageGaps from './pages/CoverageGaps';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import AudioControl from './components/AudioControl';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes - No Authentication Required */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<ChatBot />} />

        {/* Protected Admin Routes - Authentication Required */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
        </Route>
        <Route
          path="/entries"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Entries />} />
        </Route>
        <Route
          path="/flagged"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Flagged />} />
        </Route>
        <Route
          path="/weekly-digest"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<WeeklyDigest />} />
        </Route>
        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<FeedbackDashboard />} />
        </Route>
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminPanel />} />
        </Route>
        <Route
          path="/gaps"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<CoverageGaps />} />
        </Route>

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AudioControl />
    </AuthProvider>
  );
}

export default App;