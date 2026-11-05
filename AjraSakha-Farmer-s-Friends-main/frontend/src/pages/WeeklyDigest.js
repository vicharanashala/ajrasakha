import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { digestAPI } from '../utils/api';

function WeeklyDigest() {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLatestDigest();
  }, []);

  const fetchLatestDigest = async () => {
    try {
      setLoading(true);
      const res = await digestAPI.getLatest();
      setDigest(res.data);
    } catch (err) {
      setError('No weekly digest available yet');
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
    return (
      <Box>
        <Typography variant="h4" gutterBottom fontWeight="bold">
          Weekly Digest
        </Typography>
        <Alert severity="info">{error}</Alert>
      </Box>
    );
  }

  const formatDateRange = (start, end) => {
    const s = new Date(start).toLocaleDateString();
    const e = new Date(end).toLocaleDateString();
    return `${s} - ${e}`;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Weekly Digest
      </Typography>

      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {formatDateRange(digest.week_start, digest.week_end)}
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="subtitle2">
                Total Feedback
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {digest.total_feedback_count}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="subtitle2">
                Overall Helpfulness
              </Typography>
              <Typography
                variant="h3"
                fontWeight="bold"
                color={digest.overall_helpfulness_score >= 60 ? 'success.main' : 'error.main'}
              >
                {digest.overall_helpfulness_score}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="subtitle2">
                Helpful
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="success.main">
                {digest.total_helpful}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="subtitle2">
                Not Helpful
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="error.main">
                {digest.total_not_helpful}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Domain Breakdown
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={digest.domain_breakdown?.slice(0, 8) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total_responses" fill="#2E7D32" name="Responses" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Language Breakdown
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={digest.language_breakdown?.slice(0, 8) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
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
                Lowest Rated Entries - Priority for Review
              </Typography>
              {digest.lowest_rated_entries?.length > 0 ? (
                <List>
                  {digest.lowest_rated_entries.map((entry, index) => (
                    <React.Fragment key={entry.gdb_entry_id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip label={`#${index + 1}`} size="small" />
                              <Typography fontFamily="monospace" fontSize="small">
                                {entry.gdb_entry_id.slice(0, 16)}...
                              </Typography>
                              <Chip
                                label={`${entry.helpfulness_score}%`}
                                color="error"
                                size="small"
                              />
                              {entry.domain && (
                                <Chip label={entry.domain} size="small" variant="outlined" />
                              )}
                            </Box>
                          }
                          secondary={`${entry.total_responses} responses`}
                        />
                      </ListItem>
                      {index < digest.lowest_rated_entries.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">
                  No entries to display
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default WeeklyDigest;