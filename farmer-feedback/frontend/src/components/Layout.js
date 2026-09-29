import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ListAlt as EntriesIcon,
  Flag as FlagIcon,
  Assessment as DigestIcon,
  Menu as MenuIcon,
  Chat as ChatIcon,
  Feedback as FeedbackIcon,
  AdminPanelSettings as AdminIcon,
  Map as MapIcon,
  Home as HomeIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const drawerWidth = 240;

const navItems = [
  { text: 'Home', path: '/', icon: <HomeIcon /> },
  { text: 'Farmer Chat', path: '/chat', icon: <ChatIcon /> },
  { text: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { text: 'GDB Entries', path: '/entries', icon: <EntriesIcon /> },
  { text: 'Feedback', path: '/feedback', icon: <FeedbackIcon /> },
  { text: 'Flagged Entries', path: '/flagged', icon: <FlagIcon /> },
  { text: 'Coverage Gaps', path: '/gaps', icon: <MapIcon /> },
  { text: 'Weekly Digest', path: '/weekly-digest', icon: <DigestIcon /> },
  { text: 'AI Review', path: '/admin', icon: <AdminIcon /> },
];

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);
  const handleLogout = () => {
    logout();
    handleMenuClose();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(10px)',
          color: '#2E7D32',
          borderBottom: '1px solid rgba(46, 125, 50, 0.1)',
        }}
      >
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Box sx={{ fontSize: 28, mr: 1, animation: 'sway 3s ease-in-out infinite' }}>🌾</Box>
            <Typography
              variant="h6"
              sx={{
                fontFamily: '"Playfair Display", serif',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #2E7D32 0%, #0288D1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AjraSakha
            </Typography>
            <Chip
              label="Admin"
              size="small"
              sx={{
                ml: 2,
                background: 'linear-gradient(135deg, #2E7D32, #43A047)',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.7rem',
              }}
            />
          </Box>

          {/* Admin Profile Menu */}
          {admin && (
            <>
              <IconButton onClick={handleMenuOpen} sx={{ ml: 1 }}>
                <Avatar sx={{ bgcolor: '#2E7D32', width: 36, height: 36 }}>
                  {admin.email?.[0]?.toUpperCase() || 'A'}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem disabled>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">
                      {admin.email}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Role: {admin.role}
                    </Typography>
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </>
          )}

          <IconButton color="inherit" sx={{ display: { sm: 'none' }, ml: 1 }}>
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #F1F8E9 0%, #E1F5FE 100%)',
            borderRight: '1px solid rgba(46, 125, 50, 0.1)',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 1 }}>
          <List>
            {navItems.map((item) => (
              <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    '&.Mui-selected': {
                      background: 'linear-gradient(135deg, rgba(46, 125, 50, 0.15), rgba(2, 136, 209, 0.1))',
                      '&:hover': {
                        background: 'linear-gradient(135deg, rgba(46, 125, 50, 0.2), rgba(2, 136, 209, 0.15))',
                      },
                    },
                    '&:hover': {
                      background: 'rgba(46, 125, 50, 0.08)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: '#2E7D32', minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontWeight: location.pathname === item.path ? 700 : 500
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2, borderColor: 'rgba(46, 125, 50, 0.2)' }} />

          {/* User info at bottom */}
          {admin && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Avatar sx={{ mx: 'auto', bgcolor: '#2E7D32', mb: 1 }}>
                {admin.email?.[0]?.toUpperCase()}
              </Avatar>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                {admin.email?.split('@')[0]}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Admin
              </Typography>
              <Box sx={{ fontSize: 40, mt: 1, animation: 'pulse 2s ease-in-out infinite' }}>🌱</Box>
            </Box>
          )}
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #F5F9F5 0%, #FAFAFA 100%)',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default Layout;