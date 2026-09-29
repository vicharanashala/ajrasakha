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
  CircularProgress,
  Alert,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as ResolvedIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { flaggedAPI } from '../utils/api';

const STATUS_COLORS = {
  flagged: 'error',
  in_review: 'warning',
  resolved: 'success',
};

function Flagged() {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDialog, setEditDialog] = useState({ open: false, entry: null });
  const [reviewNotes, setReviewNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [entriesRes, summaryRes] = await Promise.all([
        flaggedAPI.getFlaggedEntries({}),
        flaggedAPI.getSummary(),
      ]);
      setEntries(entriesRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      setError('Failed to load flagged entries');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (gdbEntryId, newStatus) => {
    try {
      await flaggedAPI.updateStatus(gdbEntryId, {
        status: newStatus,
        review_notes: reviewNotes,
      });
      setEditDialog({ open: false, entry: null });
      setReviewNotes('');
      fetchData();
    } catch (err) {
      setError('Failed to update status');
    }
  };

  const handleDelete = async (gdbEntryId) => {
    if (!window.confirm('Are you sure you want to remove this entry from the flagged list?')) return;
    try {
      await flaggedAPI.removeEntry(gdbEntryId);
      fetchData();
    } catch (err) {
      setError('Failed to remove entry');
    }
  };

  const openEditDialog = (entry) => {
    setEditDialog({ open: true, entry });
    setReviewNotes(entry.review_notes || '');
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
        Flagged Entries for Re-review
      </Typography>

      {summary && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Chip label={`Total: ${summary.total}`} color="primary" />
          <Chip label={`Flagged: ${summary.flagged}`} color="error" />
          <Chip label={`In Review: ${summary.in_review}`} color="warning" />
          <Chip label={`Resolved: ${summary.resolved}`} color="success" />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {entries.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <ResolvedIcon sx={{ fontSize: 60, color: '#2E7D32', mb: 2 }} />
            <Typography variant="h6">No flagged entries!</Typography>
            <Typography color="text.secondary">
              All GDB entries are meeting the helpfulness threshold.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>GDB Entry ID</TableCell>
                <TableCell>Domain</TableCell>
                <TableCell>Responses</TableCell>
                <TableCell align="center">Score</TableCell>
                <TableCell align="center">Priority</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Flagged At</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.gdb_entry_id}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {entry.gdb_entry_id.slice(0, 12)}...
                  </TableCell>
                  <TableCell>{entry.domain || '-'}</TableCell>
                  <TableCell align="center">{entry.total_responses}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${entry.helpfulness_score}%`}
                      color="error"
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      icon={<WarningIcon />}
                      label={entry.priority_score.toFixed(1)}
                      color="warning"
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={entry.status}
                      color={STATUS_COLORS[entry.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(entry.flagged_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      onClick={() => openEditDialog(entry)}
                      startIcon={<EditIcon />}
                    >
                      Review
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDelete(entry.gdb_entry_id)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, entry: null })}>
        <DialogTitle>Review Entry</DialogTitle>
        <DialogContent>
          {editDialog.entry && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Entry: {editDialog.entry.gdb_entry_id}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Helpfulness Score: {editDialog.entry.helpfulness_score}%
              </Typography>
              <Typography variant="body2" gutterBottom>
                Total Responses: {editDialog.entry.total_responses}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Review Notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                sx={{ mt: 2 }}
              />
              <Typography variant="subtitle2" sx={{ mt: 2 }}>
                Update Status:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  onClick={() => handleStatusUpdate(editDialog.entry.gdb_entry_id, 'in_review')}
                >
                  In Review
                </Button>
                <Button
                  variant="outlined"
                  color="success"
                  size="small"
                  onClick={() => handleStatusUpdate(editDialog.entry.gdb_entry_id, 'resolved')}
                >
                  Resolved
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, entry: null })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Flagged;