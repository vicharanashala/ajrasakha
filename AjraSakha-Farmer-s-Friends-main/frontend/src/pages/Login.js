import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import {
  Lock as LockIcon,
  Email as EmailIcon,
  Agriculture as FarmIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1B5E20 0%, #0288D1 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Home button */}
      <Button
        component={Link}
        to="/"
        startIcon={<HomeIcon />}
        sx={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: 'white',
          borderColor: 'rgba(255,255,255,0.5)',
          '&:hover': {
            borderColor: 'white',
            background: 'rgba(255,255,255,0.1)',
          },
          textTransform: 'none',
        }}
        variant="outlined"
        size="small"
      >
        Home
      </Button>

      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: `${30 + i * 15}px`,
            height: `${30 + i * 15}px`,
            top: `${15 + i * 12}%`,
            left: `${5 + i * 14}%`,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%)',
            animation: `float ${4 + i}s ease-in-out infinite ${i * 0.5}s`,
          }}
        />
      ))}

      <Container maxWidth="sm">
        <Paper
          elevation={10}
          sx={{
            p: 4,
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(10px)',
            animation: 'fadeInUp 0.6s ease-out',
          }}
        >
          {/* Logo Header */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                fontSize: 64,
                mb: 1,
                animation: 'bounce 2s ease-in-out infinite',
              }}
            >
              🌾
            </Box>
            <Typography
              variant="h4"
              fontWeight="800"
              sx={{
                fontFamily: '"Playfair Display", serif',
                background: 'linear-gradient(135deg, #2E7D32 0%, #0288D1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              AjraSakha
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Admin Dashboard Login
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: (
                  <EmailIcon sx={{ color: '#2E7D32', mr: 1 }} />
                ),
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <LockIcon sx={{ color: '#2E7D32', mr: 1 }} />
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                background: 'linear-gradient(135deg, #2E7D32, #43A047)',
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #1B5E20, #2E7D32)',
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Button
              component={Link}
              to="/chat"
              startIcon={<FarmIcon />}
              sx={{
                color: '#2E7D32',
                textTransform: 'none',
                fontSize: '0.9rem',
              }}
            >
              Continue as Farmer (Public Access)
            </Button>
          </Box>

          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              bgcolor: '#f1f8e9',
              border: '1px solid #c8e6c9',
            }}
          >
            <Typography variant="caption" sx={{ color: '#2E7D32', fontWeight: 600 }}>
              🔐 Admin Access Required
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
              The admin dashboard contains sensitive agricultural data and analytics.
              Public farmers can only access the chat feature.
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default Login;