import { useState, useEffect, useMemo } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Feedback as FeedbackIcon,
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

const COLORS = ['#2E7D32', '#dc004e', '#1976d2', '#FF8F00', '#7B1FA2', '#00838F'];

function toBreakdownData(arr, keyField) {
  return (arr || []).map((r) => ({
    name: r[keyField] || 'Unknown',
    total_responses: r.total_responses,
    helpful_count: r.helpful_count,
    not_helpful_count: r.not_helpful_count,
    helpfulness_score: r.helpfulness_score,
  }));
}

function FeedbackChart({ title, data, color, horizontal }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Box sx={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(data || []).slice(0, 12)} layout={horizontal ? 'vertical' : 'horizontal'}>
              <CartesianGrid strokeDasharray="3 3" />
              {horizontal ? (
                <>
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={110} />
                </>
              ) : (
                <>
                  <XAxis dataKey="name" />
                  <YAxis />
                </>
              )}
              <Tooltip />
              <Bar dataKey="total_responses" fill={color} name="Responses" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box sx={{ mt: 2 }}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Group</TableCell>
                  <TableCell align="right">Responses</TableCell>
                  <TableCell align="right">Helpful</TableCell>
                  <TableCell align="right">Not Helpful</TableCell>
                  <TableCell align="right">Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data || []).slice(0, 12).map((r) => (
                  <TableRow key={r.name} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right">{r.total_responses}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>{r.helpful_count}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>{r.not_helpful_count}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${r.helpfulness_score}%`}
                        size="small"
                        color={r.helpfulness_score >= 60 ? 'success' : 'error'}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </CardContent>
    </Card>
  );
}

function FeedbackDashboard() {
  const [overview, setOverview] = useState(null);
  const [domain, setDomain] = useState([]);
  const [language, setLanguage] = useState([]);
  const [state, setState] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sortColumn, setSortColumn] = useState('helpfulness_score');
  const [sortDir, setSortDir] = useState('asc');
  const [domainFilter, setDomainFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [o, d, l, s, e] = await Promise.all([
        dashboardAPI.getOverview(),
        dashboardAPI.getDomainBreakdown(),
        dashboardAPI.getLanguageBreakdown(),
        dashboardAPI.getStateBreakdown(),
        dashboardAPI.getEntries({ limit: 200, include_qa: false, sort_by: 'total_responses', order: 'desc' }),
      ]);
      setOverview(o.data);
      setDomain(toBreakdownData(d.data, 'domain'));
      setLanguage(toBreakdownData(l.data, 'language'));
      setState(toBreakdownData(s.data, 'state'));
      setEntries(e.data || []);
    } catch (err) {
      setError('Failed to load feedback dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const sortedEntries = useMemo(() => {
    let list = [...entries];
    if (domainFilter) list = list.filter((e) => e.domain === domainFilter);
    if (stateFilter) list = list.filter((e) => e.state === stateFilter);
    const multiplier = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortColumn] ?? 0;
      const bv = b[sortColumn] ?? 0;
      return (av - bv) * multiplier;
    });
    return list;
  }, [entries, domainFilter, stateFilter, sortColumn, sortDir]);

  const uniqueDomains = useMemo(() => [...new Set(entries.map((e) => e.domain).filter(Boolean))], [entries]);
  const uniqueStates = useMemo(() => [...new Set(entries.map((e) => e.state).filter(Boolean))], [entries]);

  const handleSortChange = (col) => {
    if (sortColumn === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir(col === 'helpfulness_score' ? 'asc' : 'desc');
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

  const pieData = [
    { name: 'Helpful', value: overview?.helpful_count || 0 },
    { name: 'Not Helpful', value: overview?.not_helpful_count || 0 },
  ];

  const statCards = [
    { title: 'Total Feedback', value: overview?.total_feedback || 0, icon: <FeedbackIcon fontSize="large" />, color: '#1976d2' },
    { title: 'Helpful', value: overview?.helpful_count || 0, icon: <ThumbUpIcon fontSize="large" />, color: '#2E7D32' },
    { title: 'Not Helpful', value: overview?.not_helpful_count || 0, icon: <ThumbDownIcon fontSize="large" />, color: '#dc004e' },
    { title: 'Helpfulness Score', value: `${overview?.helpfulness_score || 0}%`, icon: <TrendingUpIcon fontSize="large" />, color: '#FF8F00' },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Feedback Dashboard
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Helpful / not-helpful ratio across GDB entries, domains, languages and states.
      </Typography>

      <Grid container spacing={3}>
        {statCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="subtitle2">{card.title}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ mt: 1 }}>{card.value}</Typography>
                  </Box>
                  <Box sx={{ color: card.color, opacity: 0.8 }}>{card.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Overall Helpfulness</Typography>
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

        <Grid item xs={12} md={8}>
          <FeedbackChart title="Per Domain" data={domain} color="#1976d2" horizontal />
        </Grid>

        <Grid item xs={12} md={6}>
          <FeedbackChart title="Per Language" data={language} color="#7B1FA2" horizontal={false} />
        </Grid>
        <Grid item xs={12} md={6}>
          <FeedbackChart title="Per State" data={state} color="#FF8F00" horizontal={false} />
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Per GDB Entry</Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <TextField select label="Domain" size="small" sx={{ minWidth: 200 }} value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
                  <MenuItem value="">All</MenuItem>
                  {uniqueDomains.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </TextField>
                <TextField select label="State" size="small" sx={{ minWidth: 200 }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                  <MenuItem value="">All</MenuItem>
                  {uniqueStates.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>GDB Entry</TableCell>
                      <TableCell>Tags</TableCell>
                      <TableCell>Question</TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={sortColumn === 'total_responses'} direction={sortDir} onClick={() => handleSortChange('total_responses')}>Responses</TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={sortColumn === 'helpful_count'} direction={sortDir} onClick={() => handleSortChange('helpful_count')}>Helpful</TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={sortColumn === 'not_helpful_count'} direction={sortDir} onClick={() => handleSortChange('not_helpful_count')}>Not Helpful</TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel active={sortColumn === 'helpfulness_score'} direction={sortDir} onClick={() => handleSortChange('helpfulness_score')}>Score</TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedEntries.map((e) => (
                      <TableRow key={e.gdb_entry_id} hover>
                        <TableCell>
                          <Typography fontFamily="monospace" fontSize="small">{e.gdb_entry_id.slice(0, 16)}...</Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {e.domain && <Chip label={e.domain} size="small" variant="outlined" />}
                            {e.state && <Chip label={e.state} size="small" variant="outlined" />}
                            <Chip label={e.language || 'English'} size="small" variant="outlined" />
                          </Box>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 300 }}>
                          <Typography noWrap variant="body2">{e.question}</Typography>
                        </TableCell>
                        <TableCell align="right">{e.total_responses}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{e.helpful_count}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>{e.not_helpful_count}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${e.helpfulness_score}%`}
                            size="small"
                            color={e.helpfulness_score >= 60 ? 'success' : 'error'}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {sortedEntries.length === 0 && (
                <Typography color="text.secondary" sx={{ mt: 2 }}>No entries match the current filters.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default FeedbackDashboard;