import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Grid,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  LocationOn as LocationIcon,
  Public as GlobalIcon,
  Download as DownloadIcon,
  Description as TextIcon,
  Code as HtmlIcon,
} from '@mui/icons-material';
import { dashboardAPI } from '../utils/api';

function CoverageGaps() {
  const [report, setReport] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [recentDisclaimers, setRecentDisclaimers] = useState([]);
  const [disclaimerStats, setDisclaimerStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reportRes, heatmapRes, disclaimersRes, statsRes] = await Promise.all([
        dashboardAPI.getLatestGapReport(),
        dashboardAPI.getCoverageHeatmap(),
        dashboardAPI.getRecentDisclaimers({ days: 30, limit: 20 }),
        dashboardAPI.getDisclaimerStats()
      ]);

      setReport(reportRes.data || reportRes);
      setHeatmap(heatmapRes.data || heatmapRes);
      setRecentDisclaimers(disclaimersRes.data?.disclaimers || []);
      setDisclaimerStats(statsRes.data || statsRes);
    } catch (err) {
      console.error('Failed to load gap data:', err);
      setError('Failed to load coverage data');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      setGenerating(true);
      const res = await dashboardAPI.generateGapReport({ days: 7, top_n: 20 });
      setReport(res.data || res);
      setError(null);
    } catch (err) {
      setError('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = async (format = 'html') => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/gaps/report/download?format=${format}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'html' ? 'html' : 'txt';
      a.download = `AjraSakha_Gap_Report_${new Date().toISOString().split('T')[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download report. Make sure you are logged in as admin.');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'CRITICAL': return 'error';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      default: return 'default';
    }
  };

  const getHeatmapColor = (score) => {
    if (score >= 70) return '#2E7D32';
    if (score >= 50) return '#66BB6A';
    if (score >= 30) return '#FFA726';
    return '#E53935';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            🗺️ GDB Coverage Gap Detector
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Identify questions triggering disclaimers and prioritize GDB growth
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={generateReport}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate Weekly Report'}
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={<HtmlIcon />}
            onClick={() => downloadReport('html')}
            disabled={!report}
          >
            HTML
          </Button>
          <Button
            variant="outlined"
            color="info"
            startIcon={<TextIcon />}
            onClick={() => downloadReport('txt')}
            disabled={!report}
          >
            TXT
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stats Cards */}
      {disclaimerStats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Total Disclaimers
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  {disclaimerStats.total_disclaimers || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Last 7 Days
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="warning.main">
                  {disclaimerStats.last_7_days || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Last 30 Days
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  {disclaimerStats.last_30_days || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Coverage Combinations
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="success.main">
                  {heatmap?.covered || 0}/{heatmap?.total_combinations || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Top Gaps */}
      {report && report.top_gaps && report.top_gaps.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <WarningIcon color="warning" sx={{ mr: 1 }} />
              <Typography variant="h6" fontWeight="bold">
                Top {report.top_gaps.length} GDB Gaps (Priority Ranked)
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Report period: {new Date(report.start_date).toLocaleDateString()} - {new Date(report.end_date).toLocaleDateString()}
            </Typography>

            <List>
              {report.top_gaps.map((gap, idx) => (
                <Paper
                  key={gap.cluster_id}
                  elevation={1}
                  sx={{
                    p: 2,
                    mb: 2,
                    borderLeft: `4px solid ${getPriorityColor(gap.priority_level) === 'error' ? '#E53935' : getPriorityColor(gap.priority_level) === 'warning' ? '#FFA726' : '#66BB6A'}`
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        #{idx + 1} - {gap.cluster_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Cluster ID: {gap.cluster_id}
                      </Typography>
                    </Box>
                    <Chip
                      label={gap.priority_level}
                      color={getPriorityColor(gap.priority_level)}
                      size="small"
                    />
                  </Box>

                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="caption" color="text.secondary">Sample Questions:</Typography>
                      {gap.sample_queries.map((q, i) => (
                        <Typography key={i} variant="body2" sx={{ fontStyle: 'italic' }}>
                          • {q}
                        </Typography>
                      ))}
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Stats:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip label={`👨‍🌾 ${gap.farmer_demand} farmers`} size="small" />
                          <Chip label={`📈 Growth: ${(gap.growth_rate * 100).toFixed(0)}%`} size="small" />
                          <Chip label={`⭐ Priority: ${gap.priority_score}`} size="small" color="primary" />
                        </Box>
                        {gap.domains?.length > 0 && (
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            🏷️ Domains: {gap.domains.join(', ')}
                          </Typography>
                        )}
                        {gap.states?.length > 0 && (
                          <Typography variant="body2">
                            📍 States: {gap.states.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 1.5 }} />

                  <Alert severity={getPriorityColor(gap.priority_level)} icon={<TrendingUpIcon />}>
                    <Typography variant="caption">
                      <strong>Action:</strong> {gap.recommended_action}
                    </Typography>
                  </Alert>
                </Paper>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Coverage Heatmap */}
      {heatmap && heatmap.heatmap && heatmap.heatmap.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <GlobalIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h6" fontWeight="bold">
                Coverage Heatmap (Domain × State)
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Chip label={`✅ Covered: ${heatmap.covered}`} sx={{ bgcolor: '#2E7D32', color: 'white' }} />
              <Chip label={`⚠️ Partial: ${heatmap.partial}`} sx={{ bgcolor: '#FFA726', color: 'white' }} />
              <Chip label={`❌ Gaps: ${heatmap.gaps}`} sx={{ bgcolor: '#E53935', color: 'white' }} />
            </Box>

            <Box sx={{ overflowX: 'auto' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '200px repeat(auto-fill, minmax(80px, 1fr))', gap: 0.5, minWidth: 600 }}>
                {/* Header row - states */}
                <Box sx={{ p: 1, fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Domain ↓ / State →</Box>
                {[...new Set(heatmap.heatmap.map(h => h.state))].map(state => (
                  <Box key={state} sx={{ p: 1, fontWeight: 'bold', bgcolor: '#f5f5f5', textAlign: 'center', fontSize: 11 }}>
                    {state}
                  </Box>
                ))}

                {/* Data rows */}
                {[...new Set(heatmap.heatmap.map(h => h.domain))].map(domain => (
                  <Box key={domain} sx={{ display: 'contents' }}>
                    <Box sx={{ p: 1, fontWeight: 'bold', bgcolor: '#f9f9f9' }}>
                      {domain}
                    </Box>
                    {[...new Set(heatmap.heatmap.map(h => h.state))].map(state => {
                      const cell = heatmap.heatmap.find(h => h.domain === domain && h.state === state);
                      if (!cell) {
                        return <Box key={state} sx={{ p: 1, bgcolor: '#fafafa', textAlign: 'center', fontSize: 10 }}>-</Box>;
                      }
                      return (
                        <Tooltip
                          key={state}
                          title={`${domain} / ${state}: ${cell.gdb_count} GDB entries, ${cell.disclaimer_count} disclaimers, Score: ${cell.coverage_score}%`}
                        >
                          <Box
                            sx={{
                              p: 1,
                              bgcolor: getHeatmapColor(cell.coverage_score),
                              color: 'white',
                              textAlign: 'center',
                              fontSize: 10,
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              '&:hover': { opacity: 0.8 }
                            }}
                          >
                            {cell.coverage_score}%
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Outreach Recommendations */}
      {report && report.outreach_recommendations && report.outreach_recommendations.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LocationIcon color="action" sx={{ mr: 1 }} />
              <Typography variant="h6" fontWeight="bold">
                📍 Outreach Team Recommendations
              </Typography>
            </Box>
            <List>
              {report.outreach_recommendations.map((rec, idx) => (
                <ListItem
                  key={idx}
                  sx={{
                    bgcolor: idx % 2 === 0 ? '#fafafa' : 'transparent',
                    borderRadius: 1,
                    mb: 1
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle2">
                        {rec.target_state} - {rec.focus_domain}
                      </Typography>
                      <Chip label={rec.priority} size="small" color={rec.priority === 'HIGH' ? 'error' : 'warning'} />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {rec.recommendation}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {rec.gap_questions} unanswered questions in this region/domain
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Recent Disclaimers */}
      {recentDisclaimers.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
              📝 Recent Disclaimer-Triggered Queries (Last 30 Days)
            </Typography>
            <List dense>
              {recentDisclaimers.slice(0, 15).map((disc, idx) => (
                <ListItem key={idx} sx={{ borderBottom: '1px solid #eee' }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                          "{disc.query}"
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Chip label={disc.source || 'unknown'} size="small" />
                        {disc.domain && <Chip label={disc.domain} size="small" color="primary" variant="outlined" />}
                        {disc.state && <Chip label={disc.state} size="small" variant="outlined" />}
                        {disc.timestamp && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                            {new Date(disc.timestamp).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default CoverageGaps;