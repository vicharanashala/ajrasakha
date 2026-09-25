import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Paper,
  Collapse,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  QuestionAnswer as QuestionIcon,
  CheckCircle as HelpfulIcon,
  Cancel as NotHelpfulIcon,
  Person as PersonIcon,
  Telegram as TelegramIcon,
  Language as WebIcon,
  Chat as ChatIcon,
} from '@mui/icons-material';
import { dashboardAPI, feedbackAPI } from '../utils/api';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ paddingTop: 16 }}>
      {value === index && children}
    </div>
  );
}

function Entries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [domainFilter, setDomainFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Details dialog state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [entryDetails, setEntryDetails] = useState(null);
  const [gdbEntry, setGdbEntry] = useState(null);
  const [feedbackList, setFeedbackList] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Inline expansion for question/answer
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainFilter, languageFilter]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await dashboardAPI.getEntries({
        domain: domainFilter || undefined,
        language: languageFilter || undefined,
        limit: 100,
        include_qa: true,
      });
      setEntries(res.data);
    } catch (err) {
      setError('Failed to load entries');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 70) return 'success';
    if (score >= 50) return 'warning';
    return 'error';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending_review': return 'warning';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  const getSourceIcon = (source) => {
    switch (source) {
      case 'telegram': return <TelegramIcon fontSize="small" />;
      case 'ai_generated': return <QuestionIcon fontSize="small" />;
      case 'chat': return <ChatIcon fontSize="small" />;
      default: return <WebIcon fontSize="small" />;
    }
  };

  const handleViewDetails = async (entry) => {
    setSelectedEntry(entry);
    setDetailsOpen(true);
    setDetailsLoading(true);
    setActiveTab(0);

    try {
      // Fetch GDB entry details (question + answer)
      const gdbRes = await dashboardAPI.getGDBEntry(entry.gdb_entry_id);
      setGdbEntry(gdbRes.data || gdbRes);

      // Fetch feedback statistics
      const detailsRes = await feedbackAPI.getEntryStats(entry.gdb_entry_id);
      setEntryDetails(detailsRes.data);

      // Fetch all feedback for this entry
      const feedbackRes = await feedbackAPI.getEntryFeedback(entry.gdb_entry_id);
      setFeedbackList(feedbackRes.data || []);
    } catch (err) {
      console.error('Failed to load details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedEntry(null);
    setEntryDetails(null);
    setGdbEntry(null);
    setFeedbackList([]);
    setActiveTab(0);
  };

  const handleToggleRow = (entryId) => {
    setExpandedRow(expandedRow === entryId ? null : entryId);
  };

  const filteredEntries = entries.filter(entry => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      entry.gdb_entry_id.toLowerCase().includes(term) ||
      (entry.question || '').toLowerCase().includes(term) ||
      (entry.domain || '').toLowerCase().includes(term) ||
      (entry.answer || '').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        🌾 GDB Entry Library
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        All questions and answers from our Golden Dataset, including AI-generated entries
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>Domain</InputLabel>
              <Select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                label="Domain"
              >
                <MenuItem value="">All</MenuItem>
                {[...new Set(entries.map(e => e.domain).filter(Boolean))].map(d => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>Language</InputLabel>
              <Select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                label="Language"
              >
                <MenuItem value="">All</MenuItem>
                {[...new Set(entries.map(e => e.language).filter(Boolean))].map(l => (
                  <MenuItem key={l} value={l}>{l}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Search Question / Answer"
              variant="outlined"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ minWidth: 250 }}
            />
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Showing {filteredEntries.length} of {entries.length} entries
      </Typography>

      <TableContainer component={Card}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#e8f5e9' }}>
              <TableCell sx={{ fontWeight: 700 }}>Question</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Answer</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Domain</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Feedback</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Score</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEntries.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((entry) => (
              <TableRow key={entry.gdb_entry_id} hover>
                <TableCell sx={{ maxWidth: 300 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#1B5E20' }}>
                        {entry.question || '(no question)'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {entry.gdb_entry_id}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell sx={{ maxWidth: 350 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#333',
                    }}
                  >
                    {entry.answer || '(no answer)'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, alignItems: 'center' }}>
                    {getSourceIcon(entry.source)}
                    <Typography variant="caption" color="text.secondary">
                      {entry.source === 'ai_generated' ? 'AI-Generated' :
                       entry.source === 'telegram' ? 'From Telegram' :
                       'Original'}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  {entry.domain && (
                    <Chip label={entry.domain} size="small" color="primary" variant="outlined" />
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={entry.status || 'verified'}
                    size="small"
                    color={getStatusColor(entry.status)}
                    variant={entry.status === 'pending_review' ? 'outlined' : 'filled'}
                  />
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="caption">
                      {entry.total_responses > 0 ? entry.total_responses : 'No feedback'}
                    </Typography>
                    {entry.total_responses > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, fontSize: 11 }}>
                        <Typography variant="caption" sx={{ color: '#2E7D32' }}>
                          👍{entry.helpful_count}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#dc004e' }}>
                          👎{entry.not_helpful_count}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="center">
                  {entry.total_responses > 0 ? (
                    <Chip
                      label={`${entry.helpfulness_score}%`}
                      color={getScoreColor(entry.helpfulness_score)}
                      size="small"
                    />
                  ) : (
                    <Chip label="—" size="small" variant="outlined" />
                  )}
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="View full details">
                    <IconButton size="small" color="primary" onClick={() => handleViewDetails(entry)}>
                      <ViewIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {filteredEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No entries found. Try adjusting your filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredEntries.length}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </TableContainer>

      {/* Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#e8f5e9' }}>
          <Box>
            <Typography variant="h6" component="div">
              📚 GDB Entry Details
            </Typography>
            {selectedEntry && (
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                {selectedEntry.gdb_entry_id}
              </Typography>
            )}
          </Box>
          <IconButton onClick={handleCloseDetails}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {detailsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {gdbEntry && (
                <Box>
                  {/* Status banner */}
                  {gdbEntry.status === 'pending_review' && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      ⏳ <strong>Pending Expert Review</strong>
                    </Alert>
                  )}
                  {gdbEntry.status === 'approved' && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      ✅ <strong>Expert Approved</strong>
                    </Alert>
                  )}

                  {/* Metadata chips */}
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    {gdbEntry.domain && <Chip label={`🏷️ ${gdbEntry.domain}`} size="small" color="primary" />}
                    {gdbEntry.language && <Chip label={`🌐 ${gdbEntry.language}`} size="small" />}
                    {gdbEntry.status && <Chip label={`📊 ${gdbEntry.status}`} size="small" color="secondary" />}
                    {gdbEntry.source && <Chip label={`📥 ${gdbEntry.source}`} size="small" variant="outlined" />}
                  </Box>

                  {/* Question */}
                  <Box sx={{ mb: 2, p: 2, bgcolor: '#e3f2fd', borderRadius: 2, borderLeft: '4px solid #1976d2' }}>
                    <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>
                      ❓ QUESTION
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 'medium' }}>
                      {gdbEntry.question || 'No question available'}
                    </Typography>
                  </Box>

                  {/* Answer */}
                  <Box sx={{ mb: 2, p: 2, bgcolor: '#e8f5e9', borderRadius: 2, borderLeft: '4px solid #2E7D32' }}>
                    <Typography variant="caption" sx={{ color: '#2E7D32', fontWeight: 'bold' }}>
                      💡 ANSWER
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {gdbEntry.answer || 'No answer available'}
                    </Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* Tabs */}
                  <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                    <Tab label={`Feedback (${feedbackList.length})`} />
                    <Tab label="Metadata" />
                  </Tabs>

                  <TabPanel value={activeTab} index={0}>
                    {feedbackList.length === 0 ? (
                      <Alert severity="info">No feedback received yet for this entry.</Alert>
                    ) : (
                      <List>
                        {feedbackList.map((fb, index) => (
                          <ListItem key={fb.id || index} alignItems="flex-start"
                            sx={{ border: '1px solid #e0e0e0', borderRadius: 1, mb: 1 }}>
                            <ListItemAvatar>
                              <Avatar sx={{ bgcolor: fb.response === '1' ? '#2E7D32' : '#dc004e' }}>
                                {fb.response === '1' ? <HelpfulIcon /> : <NotHelpfulIcon />}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                  <Typography variant="subtitle2">Farmer: {fb.farmer_id}</Typography>
                                  <Chip label={fb.source || 'web'} size="small" />
                                </Box>
                              }
                              secondary={
                                <Typography variant="caption">
                                  {new Date(fb.timestamp).toLocaleString()}
                                </Typography>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </TabPanel>

                  <TabPanel value={activeTab} index={1}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Keywords</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          {gdbEntry.keywords?.length > 0 ? gdbEntry.keywords.map((kw, i) => (
                            <Chip key={i} label={kw} size="small" variant="outlined" />
                          )) : <Typography variant="body2">None</Typography>}
                        </Box>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Created</Typography>
                        <Typography variant="body2">
                          {gdbEntry.generated_at ? new Date(gdbEntry.generated_at).toLocaleString() : 'Original'}
                        </Typography>
                      </Box>
                      {gdbEntry.reviewed_at && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">Reviewed</Typography>
                          <Typography variant="body2">
                            {new Date(gdbEntry.reviewed_at).toLocaleString()} by {gdbEntry.reviewer}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </TabPanel>
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDetails} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Entries;