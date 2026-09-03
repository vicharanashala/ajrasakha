import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  ThumbUp as HelpfulIcon,
  ThumbDown as NotHelpfulIcon,
} from '@mui/icons-material';

/**
 * FeedbackButtons Component
 *
 * Add this after any answer displayed in the chat or GDB view.
 *
 * Usage:
 *   <FeedbackButtons
 *     gdbEntryId="gdb_crop_disease_001"
 *     farmerId={user.id}
 *     domain="Crop Disease"
 *     onFeedbackGiven={(isHelpful) => console.log(isHelpful)}
 *   />
 */

const API_BASE = process.env.VITE_API_BASE_URL || '/api';

export default function FeedbackButtons({
  gdbEntryId,
  farmerId,
  messageId = null,
  domain = null,
  language = null,
  state = null,
  source = 'web',
  onFeedbackGiven = null,
  variant = 'buttons', // 'buttons' | 'inline'
  align = 'left',
}) {
  const [loading, setLoading] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleFeedback = useCallback(async (isHelpful) => {
    if (loading || feedbackGiven) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gdb_entry_id: gdbEntryId,
          farmer_id: farmerId || 'anonymous',
          message_id: messageId || `web_${Date.now()}`,
          response: isHelpful ? '1' : '2',
          domain,
          language,
          state,
          source,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      setFeedbackGiven(isHelpful ? '1' : '2');
      setSnackbarMessage(
        isHelpful
          ? 'Thank you for your feedback!'
          : 'Thank you. We will work to improve this answer.'
      );
      setShowSnackbar(true);

      if (onFeedbackGiven) {
        onFeedbackGiven(isHelpful);
      }
    } catch (error) {
      console.error('Feedback error:', error);
      setSnackbarMessage('Failed to submit feedback. Please try again.');
      setShowSnackbar(true);
    } finally {
      setLoading(false);
    }
  }, [gdbEntryId, farmerId, messageId, domain, language, state, source, loading, feedbackGiven, onFeedbackGiven]);

  if (feedbackGiven) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
          py: 1,
        }}
      >
        <Typography variant="body2" color={feedbackGiven === '1' ? 'success.main' : 'warning.main'}>
          {feedbackGiven === '1' ? '✓ Thank you! Answer was helpful.' : '✓ Thank you. We will improve this.'}
        </Typography>
      </Box>
    );
  }

  if (variant === 'inline') {
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Helpful?
        </Typography>
        <IconButton
          size="small"
          onClick={() => handleFeedback(true)}
          disabled={loading}
          sx={{ color: '#2E7D32' }}
        >
          {loading ? <CircularProgress size={16} /> : <HelpfulIcon fontSize="small" />}
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleFeedback(false)}
          disabled={loading}
          sx={{ color: '#dc004e' }}
        >
          {loading ? <CircularProgress size={16} /> : <NotHelpfulIcon fontSize="small" />}
        </IconButton>
        <Snackbar
          open={showSnackbar}
          autoHideDuration={3000}
          onClose={() => setShowSnackbar(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={snackbarMessage.includes('Failed') ? 'error' : 'success'} onClose={() => setShowSnackbar(false)}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        py: 2,
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Was this helpful?
      </Typography>
      <Button
        variant="outlined"
        color="success"
        size="small"
        startIcon={loading ? <CircularProgress size={16} /> : <HelpfulIcon />}
        onClick={() => handleFeedback(true)}
        disabled={loading}
      >
        Yes
      </Button>
      <Button
        variant="outlined"
        color="error"
        size="small"
        startIcon={loading ? <CircularProgress size={16} /> : <NotHelpfulIcon />}
        onClick={() => handleFeedback(false)}
        disabled={loading}
      >
        No
      </Button>
      <Snackbar
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => setShowSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbarMessage.includes('Failed') ? 'error' : 'success'} onClose={() => setShowSnackbar(false)}>
          {snackbarMessage}
        </Alert>
        </Snackbar>
    </Box>
  );
}