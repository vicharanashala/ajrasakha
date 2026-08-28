import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  ThumbUp as HelpfulIcon,
  ThumbDown as NotHelpfulIcon,
} from '@mui/icons-material';

const API_BASE = process.env.VITE_API_BASE_URL || '/api';

const SUGGESTED_QUESTIONS = [
  'How to control brown planthopper in rice?',
  'Best drip irrigation schedule for sugarcane',
  'Urea application timing for wheat',
  'How to protect crops from frost?',
  'Natural pest control for vegetables',
];

/**
 * FarmerChat Component
 *
 * A complete chat interface with feedback collection.
 * Drop this into any page that needs farmer Q&A.
 *
 * Usage:
 *   <FarmerChat userId={user.id} />
 */

export default function FarmerChat({ userId = 'anonymous', onAnswerDelivered = null }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addBotMessage = (text, entry = null) => {
    const botMsg = {
      id: Date.now(),
      type: 'bot',
      text,
      entry,
      feedback: null,
    };
    setMessages((prev) => [...prev, botMsg]);

    if (onAnswerDelivered && entry) {
      onAnswerDelivered(entry);
    }
  };

  const addUserMessage = (text) => {
    const userMsg = {
      id: Date.now(),
      type: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
  };

  const handleFeedback = async (messageId, isHelpful, entryId) => {
    setFeedbackLoading((prev) => ({ ...prev, [messageId]: true }));

    try {
      const response = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gdb_entry_id: entryId,
          farmer_id: userId,
          message_id: `chat_${messageId}`,
          response: isHelpful ? '1' : '2',
          source: 'chat',
        }),
      });

      if (response.ok) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, feedback: isHelpful ? '1' : '2' } : msg
          )
        );
      }
    } catch (error) {
      console.error('Feedback error:', error);
    } finally {
      setFeedbackLoading((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const handleQuery = async (query) => {
    if (!query.trim()) return;

    addUserMessage(query);
    setInput('');
    setLoading(true);

    try {
      // Search for matching GDB entry
      // This assumes there's a /search or /gdb/search endpoint
      const searchRes = await fetch(`${API_BASE}/gdb/search?q=${encodeURIComponent(query)}`);

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const entry = searchData.entries?.[0];

        if (entry) {
          addBotMessage(entry.answer, {
            entry_id: entry.id || entry._id,
            domain: entry.domain,
            question: entry.question,
          });
          return;
        }
      }

      // Fallback: try chat-query endpoint
      const chatRes = await fetch(`${API_BASE}/feedback/chat-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (chatRes.ok) {
        const chatData = await chatRes.json();
        addBotMessage(chatData.answer, {
          entry_id: chatData.entry_id,
          domain: chatData.domain,
          question: chatData.question,
        });
        return;
      }

      addBotMessage(
        'Sorry, I could not find an answer to your question. Please try again or contact support.',
        null
      );
    } catch (error) {
      console.error('Query error:', error);
      addBotMessage(
        'Sorry, an error occurred while searching for an answer. Please try again.',
        null
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (question) => {
    handleQuery(question);
  };

  const renderMessageContent = (msg) => {
    if (msg.type === 'user') {
      return <Typography variant="body1">{msg.text}</Typography>;
    }

    return (
      <>
        {msg.entry && (
          <Chip size="small" label={msg.entry.domain} sx={{ mb: 1, mr: 1 }} />
        )}
        <Typography variant="body1">{msg.text}</Typography>

        {msg.entry && !msg.feedback && (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Was this helpful?
            </Typography>
            <IconButton
              size="small"
              onClick={() => handleFeedback(msg.id, true, msg.entry.entry_id)}
              disabled={feedbackLoading[msg.id]}
              sx={{ color: '#2E7D32' }}
            >
              {feedbackLoading[msg.id] ? (
                <CircularProgress size={16} />
              ) : (
                <HelpfulIcon fontSize="small" />
              )}
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleFeedback(msg.id, false, msg.entry.entry_id)}
              disabled={feedbackLoading[msg.id]}
              sx={{ color: '#dc004e' }}
            >
              {feedbackLoading[msg.id] ? (
                <CircularProgress size={16} />
              ) : (
                <NotHelpfulIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        )}

        {msg.feedback && (
          <Box sx={{ mt: 1 }}>
            <Chip
              size="small"
              icon={msg.feedback === '1' ? <HelpfulIcon /> : <NotHelpfulIcon />}
              label={
                msg.feedback === '1'
                  ? 'Thank you for your feedback!'
                  : 'We will improve this answer.'
              }
              color={msg.feedback === '1' ? 'success' : 'warning'}
            />
          </Box>
        )}
      </>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ flex: 1, overflow: 'auto', p: 2, mb: 2 }}>
        <List sx={{ height: '100%', overflow: 'auto' }}>
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <BotIcon sx={{ fontSize: 60, color: '#2E7D32', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Welcome to AjraSakha!
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Ask me anything about farming. I will find the best answer from our expert-verified database.
              </Typography>

              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Suggested Questions:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <Chip
                    key={i}
                    label={q}
                    onClick={() => handleSuggestionClick(q)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {messages.map((msg) => (
            <ListItem
              key={msg.id}
              sx={{
                flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                mb: 2,
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {msg.type === 'bot' ? (
                  <BotIcon color="primary" />
                ) : (
                  <PersonIcon color="secondary" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: msg.type === 'bot' ? '#e8f5e9' : '#fff3e0',
                      maxWidth: '80%',
                    }}
                  >
                    {renderMessageContent(msg)}
                  </Paper>
                }
              />
            </ListItem>
          ))}

          {loading && (
            <ListItem>
              <ListItemIcon>
                <BotIcon color="primary" />
              </ListItemIcon>
              <ListItemText primary={<CircularProgress size={20} />} />
            </ListItem>
          )}

          <div ref={messagesEndRef} />
        </List>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          placeholder="Type your farming question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleQuery(input)}
          disabled={loading}
        />
        <Button
          variant="contained"
          onClick={() => handleQuery(input)}
          disabled={loading || !input.trim()}
          endIcon={<SendIcon />}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
}