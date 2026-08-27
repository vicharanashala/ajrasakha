import { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Feedback as FeedbackIcon,
  Flag as FlagIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { dashboardAPI } from '../utils/api';

const COLORS = ['#2E7D32', '#FF8F00', '#1976d2', '#dc004e'];

function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [domainBreakdown, setDomainBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [overviewRes, domainRes] = await Promise.all([
        dashboardAPI.getOverview(),
        dashboardAPI.getDomainBreakdown(),
      ]);
      setOverview(overviewRes.data);
      setDomainBreakdown(domainRes.data || []);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const statCards = [
    {
      title: 'Total Feedback',
      value: overview?.total_feedback || 0,
      icon: <FeedbackIcon fontSize="large" />,
      color: '#1976d2',
    },
    {
      title: 'Helpful',
      value: overview?.helpful_count || 0,
      icon: <ThumbUpIcon fontSize="large" />,
      color: '#2E7D32',
    },
    {
      title: 'Not Helpful',
      value: overview?.not_helpful_count || 0,
      icon: <ThumbDownIcon fontSize="large" />,
      color: '#dc004e',
    },
    {
      title: 'Helpfulness Score',
      value: `${overview?.helpfulness_score || 0}%`,
      icon: <TrendingUpIcon fontSize="large" />,
      color: '#FF8F00',
    },
    {
      title: 'GDB Entries',
      value: overview?.total_gdb_entries || 0,
      icon: <FeedbackIcon fontSize="large" />,
      color: '#7B1FA2',
    },
    {
      title: 'Flagged Entries',
      value: overview?.flagged_entries_count || 0,
      icon: <FlagIcon fontSize="large" />,
      color: '#C62828',
    },
  ];

  const pieData = [
    { name: 'Helpful', value: overview?.helpful_count || 0 },
    { name: 'Not Helpful', value: overview?.not_helpful_count || 0 },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Dashboard Overview
      </Typography>

      <Grid container spacing={3}>
        {statCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="subtitle2">
                      {card.title}
                    </Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ mt: 1 }}>
                      {card.value}
                    </Typography>
                  </Box>
                  <Box sx={{ color: card.color, opacity: 0.8 }}>
                    {card.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Helpfulness Ratio
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Feedback by Domain
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={domainBreakdown.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="domain" type="category" width={100} />
                    <Tooltip />
                    <Bar dataKey="total_responses" fill="#1976d2" name="Responses" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                This Week Summary
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip
                  label={`${overview?.this_week_feedback || 0} feedback received`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`${overview?.this_week_helpfulness || 0}% helpfulness`}
                  color={overview?.this_week_helpfulness >= 60 ? 'success' : 'error'}
                  variant="outlined"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;