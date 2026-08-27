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
  Chip,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  IconButton,
  Tabs,
  Tab,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  AutoAwesome as AIIcon,
} from '@mui/icons-material';
import { dashboardAPI } from '../utils/api';

function AdminPanel() {
  const [pendingEntries, setPendingEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    fetchPendingEntries();
  }, []);

  const fetchPendingEntries = async () => {
    try {
      setLoading(true);
      const res = await dashboardAPI.getPendingEntries();
      setPendingEntries(res.data || []);
    } catch (err) {
      setError('Failed to load pending entries');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (entryId) => {
    try {
      await dashboardAPI.approveEntry(entryId, {
        answer: editedAnswer || undefined,
        notes: reviewNotes
      });
      setDialogOpen(false);
      setSelectedEntry(null);
      setEditedAnswer('');
      setReviewNotes('');
      fetchPendingEntries();
    } catch (err) {
      setError('Failed to approve entry');
    }
  };

  const handleReject = async (entryId) => {
    if (!window.confirm('Are you sure you want to reject this entry?')) return;
    try {
      await dashboardAPI.rejectEntry(entryId, { notes: reviewNotes });
      setDialogOpen(false);
      setSelectedEntry(null);
      setReviewNotes('');
      fetchPendingEntries();
    } catch (err) {
      setError('Failed to reject entry');
    }
  };

  const openReviewDialog = (entry) => {
    setSelectedEntry(entry);
    setEditedAnswer(entry.ai_answer || entry.answer || '');
    setReviewNotes('');
    setDialogOpen(true);
    setActiveTab(0);
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
      <Typography variant="h4" gutterBottom fontWeight="bold">
        🤖 AI-Generated Review Queue
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Review and approve AI-generated answers before they go live to farmers
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {pendingEntries.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <ApproveIcon sx={{ fontSize: 60, color: '#2E7D32', mb: 2 }} />
            <Typography variant="h6">No pending entries to review!</Typography>
            <Typography color="text.secondary">
              All AI-generated answers have been reviewed.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Question</TableCell>
                  <TableCell>Domain</TableCell>
                  <TableCell>Language</TableCell>
                  <TableCell align="center">Generated</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingEntries.map((entry) => (
                  <TableRow key={entry._id} hover>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography variant="body2" noWrap>
                        {entry.question}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={entry.domain} size="small" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell>{entry.language || 'English'}</TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={<AIIcon />}
                        label="AI Generated"
                        color="secondary"
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={<ViewIcon />}
                        onClick={() => openReviewDialog(entry)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Review Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon color="secondary" />
            <Typography variant="h6">Review AI-Generated Entry</Typography>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {selectedEntry && (
            <>
              <Box sx={{ mb: 2 }}>
                <Chip label={`ID: ${selectedEntry._id}`} size="small" sx={{ mb: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Question
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'medium', mb: 2 }}>
                  {selectedEntry.question}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Chip label={`Domain: ${selectedEntry.domain}`} size="small" />
                  <Chip label={`Language: ${selectedEntry.language}`} size="small" />
                  <Chip
                    icon={<AIIcon />}
                    label="AI Generated"
                    color="secondary"
                    size="small"
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                <Tab label="Edit Answer" />
                <Tab label="Original AI Answer" />
                <Tab label="Review Notes" />
              </Tabs>

              <Box sx={{ pt: 2 }}>
                {activeTab === 0 && (
                  <TextField
                    fullWidth
                    multiline
                    rows={10}
                    label="Approved Answer (edit if needed)"
                    value={editedAnswer}
                    onChange={(e) => setEditedAnswer(e.target.value)}
                    placeholder="Edit the answer that farmers will see..."
                  />
                )}

                {activeTab === 1 && (
                  <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selectedEntry.ai_answer || selectedEntry.answer}
                    </Typography>
                  </Box>
                )}

                {activeTab === 2 && (
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="Internal Review Notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add notes for the team..."
                  />
                )}
              </Box>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => handleReject(selectedEntry._id)}
            color="error"
            startIcon={<RejectIcon />}
          >
            Reject
          </Button>
          <Button
            onClick={() => setDialogOpen(false)}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleApprove(selectedEntry._id)}
            variant="contained"
            color="success"
            startIcon={<ApproveIcon />}
          >
            Approve & Publish
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AdminPanel;
