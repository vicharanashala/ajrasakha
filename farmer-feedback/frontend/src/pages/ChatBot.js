import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Alert,
  Avatar,
  Zoom,
  Fade,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  ThumbUp as HelpfulIcon,
  ThumbDown as NotHelpfulIcon,
  Schedule as DisclaimerIcon,
  Home as HomeIcon,
  Psychology as AiIcon,
  Agriculture as FarmIcon,
  TipsAndUpdates as TipIcon,
  Translate as TranslateIcon,
} from '@mui/icons-material';
import {
  MenuItem,
  Select,
  FormControl,
} from '@mui/material';
import { dashboardAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SUGGESTED_QUESTIONS = {
  english: [
    'How to control brown planthopper in rice?',
    'Best drip irrigation schedule for sugarcane',
    'Urea application timing for wheat',
    'How to protect crops from frost?',
    'Natural pest control for vegetables',
  ],
  auto: [
    'How to control brown planthopper in rice?',
    'Best drip irrigation schedule for sugarcane',
    'Urea application timing for wheat',
    'How to protect crops from frost?',
    'Natural pest control for vegetables',
  ],
};

const LANGUAGES = [
  { code: 'auto', name: '🌐 Auto Detect' },
  { code: 'english', name: 'English' },
  { code: 'hindi', name: 'हिन्दी (Hindi)' },
  { code: 'bengali', name: 'বাংলা (Bengali)' },
  { code: 'tamil', name: 'தமிழ் (Tamil)' },
  { code: 'telugu', name: 'తెలుగు (Telugu)' },
  { code: 'marathi', name: 'मराठी (Marathi)' },
  { code: 'gujarati', name: 'ગુજરાતી (Gujarati)' },
  { code: 'punjabi', name: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'kannada', name: 'ಕನ್ನಡ (Kannada)' },
  { code: 'malayalam', name: 'മലയാളം (Malayalam)' },
  { code: 'odia', name: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'urdu', name: 'اردو (Urdu)' },
];

const LANGUAGE_LABELS = {
  english: 'English', hindi: 'हिन्दी', bengali: 'বাংলা', tamil: 'தமிழ்',
  telugu: 'తెలుగు', marathi: 'मराठी', gujarati: 'ગુજરાતી', punjabi: 'ਪੰਜਾਬੀ',
  kannada: 'ಕನ್ನಡ', malayalam: 'മലയാളം', odia: 'ଓଡ଼ିଆ', urdu: 'اردو',
};

const UI_COPY = {
  english: {
    title: 'AjraSakha Farmer Assistant',
    subtitle: 'AI-Powered Agricultural Advisory',
    welcome: 'Welcome to AjraSakha!',
    welcome_desc: 'Your intelligent farming assistant. Ask any agriculture-related question and get expert-backed answers powered by AI and our comprehensive knowledge base.',
    try: 'Try asking these questions',
    placeholder: 'Ask your farming question...',
    feedback: 'Was this helpful?',
    feedback_yes: 'Thanks for your feedback!',
    feedback_no: "Thank you. We'll improve this.",
    typing: 'Searching agricultural knowledge base...',
    error: "Sorry, I could not find an answer to your question. Please try again or contact support.",
  },
  hindi: {
    subtitle: 'एआई-संचालित कृषि सलाह',
    welcome: 'अजरा सखा में आपका स्वागत है!',
    welcome_desc: 'आपका बुद्धिमान कृषि सहायक। कोई भी कृषि संबंधी प्रश्न पूछें और एआई व हमारे ज्ञानकोश द्वारा समर्थित उत्तर पाएं।',
    placeholder: 'अपना कृषि प्रश्न पूछें...',
    feedback: 'क्या यह सहायक था?',
    feedback_yes: 'आपकी प्रतिक्रिया के लिए धन्यवाद!',
    feedback_no: 'धन्यवाद, हम इसे सुधारेंगे।',
    typing: 'कृषि ज्ञानकोश खोज रहे हैं...',
  },
};

function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState({});
  const [language, setLanguage] = useState('auto');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const langKey = language === 'auto' ? 'english' : language;
  const t = (key) => (UI_COPY[langKey] && UI_COPY[langKey][key]) || UI_COPY.english[key] || key;
  const suggestions = SUGGESTED_QUESTIONS[language] || SUGGESTED_QUESTIONS.english;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading]);

  const handleHomeClick = () => {
    navigate(isAuthenticated ? '/dashboard' : '/');
  };

  const addUserMessage = (text) => {
    setMessages((prev) => [...prev, { id: Date.now(), type: 'user', text, time: new Date() }]);
  };

  const addBotMessage = (text, entry) => {
    setMessages((prev) => [...prev, {
      id: Date.now(),
      type: 'bot',
      text,
      entry,
      feedback: null,
      time: new Date(),
    }]);
  };

  const handleFeedback = async (messageId, isHelpful, entryId) => {
    setFeedbackLoading((prev) => ({ ...prev, [messageId]: true }));
    try {
      await dashboardAPI.submitFeedback({
        gdb_entry_id: entryId,
        farmer_id: 'dashboard_user',
        message_id: `chat_${messageId}`,
        response: isHelpful ? '1' : '2',
        source: 'chat',
      });
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, feedback: isHelpful ? '1' : '2' } : msg
        )
      );
    } catch (err) {
      console.error('Feedback error:', err);
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
      const langToSend = language === 'auto' ? 'Auto' : LANGUAGE_LABELS[language] || 'English';
      const res = await dashboardAPI.chatQuery(query, langToSend);
      const data = res.data;
      addBotMessage(data.answer, {
        entry_id: data.entry_id,
        domain: data.domain,
        question: data.question,
        match_type: data.match_type || 'existing',
        confidence: data.confidence,
        show_disclaimer: data.show_disclaimer,
        disclaimer_message: data.disclaimer_message,
        language: data.language,
      });
    } catch (err) {
      addBotMessage(t('error'), { match_type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (question) => {
    handleQuery(question);
  };

  const formatTime = (date) => {
    return date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageContent = (msg) => {
    if (msg.type === 'user') {
      return <Typography variant="body1" sx={{ color: '#fff', lineHeight: 1.6 }}>{msg.text}</Typography>;
    }

    const matchType = msg.entry?.match_type || 'existing';

    return (
      <>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
          {msg.entry?.domain && (
            <Chip
              size="small"
              label={msg.entry.domain}
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
                color: '#2E7D32',
              }}
            />
          )}
          {matchType === 'ai_generated' && (
            <Chip
              size="small"
              icon={<AiIcon sx={{ fontSize: 14 }} />}
              label="AI Generated"
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)',
                color: '#E65100',
              }}
            />
          )}
          {matchType === 'pending_review' && (
            <Chip
              size="small"
              label="Pending Review"
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
                color: '#1565C0',
              }}
            />
          )}
          {matchType === 'off_topic' && (
            <Chip
              size="small"
              label="Off-topic"
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #FFEBEE, #FFCDD2)',
                color: '#C62828',
              }}
            />
          )}
        </Box>

        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.7,
            color: '#37474F',
            fontSize: '0.95rem',
          }}
        >
          {msg.text}
        </Typography>

        {msg.entry?.show_disclaimer && msg.entry?.disclaimer_message && (
          <Alert
            severity="warning"
            icon={<DisclaimerIcon />}
            sx={{
              mt: 2,
              background: 'linear-gradient(135deg, #FFF8E1, #FFECB3)',
              border: '1px solid #FFD54F',
              borderRadius: 2,
              '& .MuiAlert-message': { p: 0 },
            }}
          >
            <Typography variant="subtitle2" fontWeight="bold" color="#E65100" sx={{ mb: 0.5 }}>
              ⏰ 2-Hour Disclaimer
            </Typography>
            <Typography variant="body2" color="#5D4037">
              {msg.entry.disclaimer_message}
            </Typography>
          </Alert>
        )}

        {msg.entry?.entry_id && matchType !== 'off_topic' && !msg.feedback && (
          <Fade in timeout={400}>
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                {t('feedback')}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleFeedback(msg.id, true, msg.entry.entry_id)}
                disabled={feedbackLoading[msg.id]}
                sx={{
                  color: '#4CAF50',
                  bgcolor: '#E8F5E9',
                  '&:hover': { bgcolor: '#C8E6C9' },
                  width: 32,
                  height: 32,
                }}
              >
                {feedbackLoading[msg.id] ? <CircularProgress size={14} /> : <HelpfulIcon sx={{ fontSize: 18 }} />}
              </IconButton>
              <IconButton
                size="small"
                onClick={() => handleFeedback(msg.id, false, msg.entry.entry_id)}
                disabled={feedbackLoading[msg.id]}
                sx={{
                  color: '#EF5350',
                  bgcolor: '#FFEBEE',
                  '&:hover': { bgcolor: '#FFCDD2' },
                  width: 32,
                  height: 32,
                }}
              >
                {feedbackLoading[msg.id] ? <CircularProgress size={14} /> : <NotHelpfulIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Box>
          </Fade>
        )}

        {msg.feedback && (
          <Box sx={{ mt: 1.5 }}>
            <Chip
              size="small"
              icon={msg.feedback === '1' ? <HelpfulIcon /> : <NotHelpfulIcon />}
              label={msg.feedback === '1' ? t('feedback_yes') : t('feedback_no')}
              sx={{
                height: 28,
                fontWeight: 600,
                fontSize: '0.75rem',
                bgcolor: msg.feedback === '1' ? '#E8F5E9' : '#FFF3E0',
                color: msg.feedback === '1' ? '#2E7D32' : '#E65100',
              }}
            />
          </Box>
        )}
      </>
    );
  };

  return (
    <Box
      sx={{
        height: 'calc(100vh - 100px)',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 900,
        mx: 'auto',
        width: '100%',
      }}
    >
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 2,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #0288D1 100%)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            🌾
          </Box>
          <Box>
            <Typography variant="h6" fontWeight="700" sx={{ lineHeight: 1.2 }}>
              {t('title')}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FarmIcon sx={{ fontSize: 14 }} />
              {t('subtitle')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'white' },
                '.MuiSvgIcon-root': { color: 'white' },
                fontSize: '0.8rem',
                borderRadius: 2,
              }}
              renderValue={(val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TranslateIcon sx={{ fontSize: 16 }} />
                  {LANGUAGES.find((l) => l.code === val)?.name || 'Auto'}
                </Box>
              )}
            >
              {LANGUAGES.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>{lang.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            onClick={handleHomeClick}
            size="small"
            startIcon={<HomeIcon />}
            sx={{
              color: 'white',
              borderColor: 'rgba(255,255,255,0.4)',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              '&:hover': {
                borderColor: 'white',
                background: 'rgba(255,255,255,0.1)',
              },
            }}
          >
            Home
          </Button>
        </Box>
      </Paper>

      {/* Chat Area */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          overflow: 'auto',
          mb: 2,
          p: 2,
          borderRadius: 3,
          border: '1px solid #E8F5E9',
          bgcolor: '#FAFFFA',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: '#C8E6C9',
            borderRadius: 3,
            '&:hover': { background: '#A5D6A7' },
          },
        }}
      >
        {messages.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', px: 3 }}>
            <Zoom in timeout={600}>
              <Box
                sx={{
                  width: 100,
                  height: 100,
                  borderRadius: 4,
                  background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                  fontSize: 48,
                }}
              >
                🌱
              </Box>
            </Zoom>
            <Typography variant="h5" fontWeight="700" color="#1B5E20" gutterBottom>
              {t('welcome')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500, mb: 4, lineHeight: 1.7 }}>
              {t('welcome_desc')}
            </Typography>

            <Box sx={{ width: '100%', maxWidth: 600 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                <TipIcon sx={{ fontSize: 18, color: '#FF9800' }} />
                {t('try')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
                {suggestions.map((q, i) => (
                  <Fade in timeout={(i + 1) * 200} key={i}>
                    <Chip
                      label={q}
                      onClick={() => handleSuggestionClick(q)}
                      sx={{
                        cursor: 'pointer',
                        height: 40,
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        bgcolor: 'white',
                        border: '1.5px solid #C8E6C9',
                        color: '#2E7D32',
                        borderRadius: 3,
                        px: 1,
                        boxShadow: '0 2px 8px rgba(46,125,50,0.08)',
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: '#E8F5E9',
                          borderColor: '#66BB6A',
                          boxShadow: '0 4px 12px rgba(46,125,50,0.15)',
                          transform: 'translateY(-1px)',
                        },
                      }}
                    />
                  </Fade>
                ))}
              </Box>
            </Box>
          </Box>
        ) : (
          <Box sx={{ px: 1 }}>
            {messages.map((msg, idx) => (
              <Fade in timeout={300} key={msg.id}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    mb: 2.5,
                    animation: 'slideUp 0.3s ease',
                  }}
                >
                  <Avatar
                    sx={{
                      width: 38,
                      height: 38,
                      bgcolor: msg.type === 'bot'
                        ? 'linear-gradient(135deg, #2E7D32, #0288D1)'
                        : 'linear-gradient(135deg, #FF6F00, #F57C00)',
                      fontSize: 20,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      flexShrink: 0,
                    }}
                  >
                    {msg.type === 'bot' ? <BotIcon sx={{ fontSize: 20 }} /> : <PersonIcon sx={{ fontSize: 20 }} />}
                  </Avatar>

                  <Box sx={{ maxWidth: '75%', minWidth: 0 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: msg.type === 'user'
                          ? '18px 18px 4px 18px'
                          : '18px 18px 18px 4px',
                        background: msg.type === 'user'
                          ? 'linear-gradient(135deg, #2E7D32, #388E3C)'
                          : 'white',
                        border: msg.type === 'user' ? 'none' : '1px solid #E8F5E9',
                        boxShadow: msg.type === 'user'
                          ? '0 4px 12px rgba(46,125,50,0.25)'
                          : '0 2px 8px rgba(0,0,0,0.04)',
                        position: 'relative',
                      }}
                    >
                      {renderMessageContent(msg)}
                    </Paper>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{
                        display: 'block',
                        mt: 0.5,
                        textAlign: msg.type === 'user' ? 'right' : 'left',
                        fontSize: '0.65rem',
                        px: 0.5,
                      }}
                    >
                      {formatTime(msg.time)}
                    </Typography>
                  </Box>
                </Box>
              </Fade>
            ))}

            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                <Avatar
                  sx={{
                    width: 38,
                    height: 38,
                    background: 'linear-gradient(135deg, #2E7D32, #0288D1)',
                    fontSize: 20,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                >
                  <BotIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: '18px 18px 18px 4px',
                    bgcolor: 'white',
                    border: '1px solid #E8F5E9',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    maxWidth: 360,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={18} sx={{ color: '#2E7D32' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      {t('typing')}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
            )}

            <div ref={messagesEndRef} />
          </Box>
        )}
      </Paper>

      {/* Input Area */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          borderRadius: 3,
          border: '1px solid #E8F5E9',
          bgcolor: 'white',
          display: 'flex',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <TextField
          fullWidth
          placeholder={t('placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleQuery(input);
            }
          }}
          disabled={loading}
          inputRef={inputRef}
          variant="outlined"
          multiline
          maxRows={3}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2.5,
              bgcolor: '#F5F9F5',
              '& fieldset': { borderColor: 'transparent' },
              '&:hover fieldset': { borderColor: '#A5D6A7' },
              '&.Mui-focused fieldset': { borderColor: '#4CAF50', borderWidth: 2 },
            },
            '& .MuiInputBase-input': {
              fontSize: '0.95rem',
              py: 1.5,
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => handleQuery(input)}
          disabled={loading || !input.trim()}
          sx={{
            minWidth: 56,
            height: 48,
            borderRadius: 2.5,
            background: 'linear-gradient(135deg, #2E7D32, #43A047)',
            '&:hover': { background: 'linear-gradient(135deg, #1B5E20, #2E7D32)' },
            '&.Mui-disabled': { background: '#E0E0E0' },
            boxShadow: '0 4px 12px rgba(46,125,50,0.3)',
          }}
        >
          <SendIcon />
        </Button>
      </Paper>
    </Box>
  );
}

export default ChatBot;
