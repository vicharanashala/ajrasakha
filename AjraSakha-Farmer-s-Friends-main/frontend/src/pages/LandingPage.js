import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Card,
  Chip,
  AppBar,
  Toolbar,
  Stack,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Assessment as ChartIcon,
  EmojiNature as NatureIcon,
  WaterDrop as WaterIcon,
  Psychology as AIIcon,
  ArrowForward as ArrowIcon,
  Groups as GroupsIcon,
  Shield as ShieldIcon,
  Speed as SpeedIcon,
  Lightbulb as IdeaIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import villageAudio from '../utils/villageAudio';

function LandingPage() {
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(true);

  // Hide welcome screen and start music after a brief delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
      // Start village music
      try {
        villageAudio.start();
      } catch (e) {
        console.log('Audio start failed:', e);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const stats = [
    { value: '20,000+', label: 'GDB Answers', icon: <ChartIcon /> },
    { value: '50,000+', label: 'Farmers Helped', icon: <GroupsIcon /> },
    { value: '12', label: 'Languages', icon: <AIIcon /> },
    { value: '24/7', label: 'Available', icon: <SpeedIcon /> },
  ];

  const features = [
    {
      icon: <AIIcon sx={{ fontSize: 50 }} />,
      title: 'AI-Powered Matching',
      description: 'Smart semantic search matches your question to expert-verified answers in our Golden Dataset',
      color: '#2E7D32',
    },
    {
      icon: <ChatIcon sx={{ fontSize: 50 }} />,
      title: 'Multi-Channel Support',
      description: 'Get help on Telegram, Web chat, or WhatsApp. Use voice, text, or images',
      color: '#0288D1',
    },
    {
      icon: <NatureIcon sx={{ fontSize: 50 }} />,
      title: 'Crop-Specific Guidance',
      description: 'Answers tailored to your specific crop, region, soil, and climate conditions',
      color: '#388E3C',
    },
    {
      icon: <WaterIcon sx={{ fontSize: 50 }} />,
      title: 'Real-Time Advisory',
      description: 'Weather-based recommendations and timely alerts for irrigation and pest control',
      color: '#0097A7',
    },
    {
      icon: <GroupsIcon sx={{ fontSize: 50 }} />,
      title: 'Farmer Community',
      description: 'Connect with other farmers, share experiences, and learn from peers',
      color: '#558B2F',
    },
    {
      icon: <ShieldIcon sx={{ fontSize: 50 }} />,
      title: 'Expert Verified',
      description: 'Every answer goes through expert review before reaching farmers',
      color: '#1565C0',
    },
  ];

  const domains = [
    { name: 'Crop Disease', icon: '🌾', color: '#66BB6A' },
    { name: 'Irrigation', icon: '💧', color: '#29B6F6' },
    { name: 'Pest Control', icon: '🐛', color: '#FFA726' },
    { name: 'Fertilizers', icon: '🌱', color: '#9CCC65' },
    { name: 'Weather', icon: '☀️', color: '#FFB300' },
    { name: 'Soil Health', icon: '🌍', color: '#8D6E63' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>

      {/* Welcome Animation Overlay */}
      {showWelcome && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #1B5E20 0%, #0277BD 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            animation: 'fadeIn 0.5s ease-out',
          }}
        >
          <Box
            sx={{
              fontSize: 100,
              mb: 2,
              animation: 'float 2s ease-in-out infinite',
            }}
          >
            🌾
          </Box>
          <Typography
            variant="h3"
            sx={{
              color: 'white',
              fontFamily: 'Playfair Display, serif',
              fontWeight: 800,
              mb: 1,
              animation: 'fadeInUp 1s ease-out 0.3s both',
            }}
          >
            AjraSakha
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: 'rgba(255,255,255,0.9)',
              fontFamily: 'Poppins, sans-serif',
              animation: 'fadeInUp 1s ease-out 0.6s both',
            }}
          >
            AI for Indian Farmers
          </Typography>
        </Box>
      )}

      {/* Top Navigation Bar */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(10px)',
          color: '#2E7D32',
          borderBottom: '1px solid rgba(46, 125, 50, 0.1)',
        }}
      >
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box
              sx={{
                fontSize: 32,
                mr: 1,
                animation: 'sway 3s ease-in-out infinite',
              }}
            >
              🌾
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #2E7D32 0%, #0288D1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AjraSakha
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={() => navigate('/chat')} startIcon={<ChatIcon />}>
              Chat
            </Button>
            <Button color="inherit" onClick={() => navigate('/dashboard')} startIcon={<ChartIcon />}>
              Dashboard
            </Button>
            <Button
              variant="contained"
              onClick={() => navigate('/chat')}
              sx={{
                background: 'linear-gradient(135deg, #2E7D32, #43A047)',
                borderRadius: 20,
                px: 3,
              }}
            >
              Get Started
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* HERO SECTION */}
      <Box
        className="bg-crop-field hero-section"
        sx={{ position: 'relative', overflow: 'hidden' }}
      >
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <Box
            key={i}
            className="particle"
            sx={{
              width: `${20 + i * 10}px`,
              height: `${20 + i * 10}px`,
              top: `${20 + i * 12}%`,
              left: `${10 + i * 14}%`,
              animation: `float ${3 + i}s ease-in-out infinite ${i * 0.3}s`,
            }}
          />
        ))}

        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 2 }}>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={7}>
              <Box className="fade-in-up">
                <Chip
                  label="🌾 Powered by AI • Expert Verified"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.25)',
                    color: 'white',
                    fontWeight: 600,
                    backdropFilter: 'blur(10px)',
                    mb: 3,
                  }}
                />
                <Typography variant="h1" className="hero-title" sx={{ mb: 3 }}>
                  AI for Indian
                  <br />
                  Farmers 🌾
                </Typography>
                <Typography variant="h6" className="hero-subtitle" sx={{ mb: 4, maxWidth: 600 }}>
                  Get instant, expert-verified answers to your farming questions in your own language.
                  Available on Telegram, Web & WhatsApp — anytime, anywhere.
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button
                    variant="contained"
                    size="large"
                    endIcon={<ArrowIcon />}
                    onClick={() => navigate('/chat')}
                    sx={{
                      background: 'linear-gradient(135deg, #FF6F00, #FBC02D)',
                      color: 'white',
                      fontWeight: 700,
                      px: 4,
                      py: 1.5,
                      borderRadius: 30,
                      boxShadow: '0 8px 25px rgba(255, 111, 0, 0.4)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #F57C00, #F9A825)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 12px 30px rgba(255, 111, 0, 0.5)',
                      },
                    }}
                  >
                    Ask a Question
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={() => navigate('/dashboard')}
                    sx={{
                      borderColor: 'white',
                      color: 'white',
                      fontWeight: 600,
                      px: 4,
                      py: 1.5,
                      borderRadius: 30,
                      borderWidth: 2,
                      backdropFilter: 'blur(10px)',
                      bgcolor: 'rgba(255,255,255,0.1)',
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.2)',
                        borderColor: 'white',
                      },
                    }}
                  >
                    View Dashboard
                  </Button>
                </Stack>

                {/* Stats inline */}
                <Grid container spacing={3} sx={{ mt: 5 }}>
                  {stats.slice(0, 4).map((stat, idx) => (
                    <Grid item xs={6} sm={3} key={idx}>
                      <Box
                        className={`fade-in-up delay-${(idx + 1) * 100}`}
                        sx={{ textAlign: 'center' }}
                      >
                        <Typography
                          sx={{
                            color: 'white',
                            fontWeight: 800,
                            fontSize: '2rem',
                            textShadow: '0 2px 10px rgba(0,0,0,0.2)',
                          }}
                        >
                          {stat.value}
                        </Typography>
                        <Typography
                          sx={{
                            color: 'rgba(255,255,255,0.9)',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          {stat.label}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Grid>

            <Grid item xs={12} md={5}>
              <Box
                className="slide-in-right"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  textAlign: 'center',
                }}
              >
                {/* Floating chat bubble illustration */}
                <Box
                  className="float-animation"
                  sx={{
                    position: 'relative',
                    display: 'inline-block',
                  }}
                >
                  <Box
                    sx={{
                      width: 120,
                      height: 120,
                      bgcolor: 'rgba(255,255,255,0.95)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 60,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                      animation: 'pulse 3s ease-in-out infinite',
                    }}
                  >
                    🌾
                  </Box>

                  {/* Orbiting icons */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      width: 300,
                      height: 300,
                      transform: 'translate(-50%, -50%)',
                      animation: 'rotate 20s linear infinite',
                    }}
                  >
                    {['💧', '☀️', '🐛', '🌱', '🌍', '🌾'].map((emoji, i) => (
                      <Box
                        key={i}
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          fontSize: 32,
                          transform: `rotate(${i * 60}deg) translate(140px) rotate(-${i * 60}deg)`,
                          transformOrigin: 'center',
                        }}
                      >
                        {emoji}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Container>

        {/* Wave divider */}
        <Box className="wave-divider">
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path
              d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6.01,68.36-19.32,101.71-31.06,33.42-11.74,67.61-23.07,103.69-26.65C996.52,21.51,1044.65,29.1,1135.83,42c68.94,9.81,131.41,24.3,182,46V0Z"
              fill="#ffffff"
            />
          </svg>
        </Box>
      </Box>

      {/* DOMAINS SECTION */}
      <Box sx={{ py: 8, bgcolor: 'white' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography
              variant="h3"
              fontWeight="800"
              sx={{
                fontFamily: 'Playfair Display, serif',
                mb: 2,
                animation: 'fadeInUp 0.8s ease-out',
              }}
            >
              <span className="gradient-text">Coverage Across All Farming Domains</span>
            </Typography>
            <div className="section-divider" />
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
              From sowing to harvesting, from pest control to irrigation — we cover every aspect of farming
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {domains.map((domain, idx) => (
              <Grid item xs={6} sm={4} md={2} key={idx}>
                <Card
                  className="feature-card hover-lift fade-in-up"
                  sx={{
                    textAlign: 'center',
                    py: 3,
                    cursor: 'pointer',
                    border: '2px solid transparent',
                    transition: 'all 0.3s',
                    '&:hover': {
                      borderColor: domain.color,
                      transform: 'translateY(-8px)',
                      boxShadow: `0 12px 28px ${domain.color}30`,
                    },
                    animation: `fadeInUp 0.8s ease-out ${idx * 0.1}s both`,
                  }}
                >
                  <Typography sx={{ fontSize: 50, mb: 1 }}>{domain.icon}</Typography>
                  <Typography variant="body1" fontWeight="600" sx={{ color: domain.color }}>
                    {domain.name}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FEATURES SECTION */}
      <Box
        className="bg-leaf-pattern"
        sx={{ py: 10, position: 'relative', overflow: 'hidden' }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Chip
              label="Why AjraSakha"
              sx={{
                bgcolor: 'rgba(46, 125, 50, 0.15)',
                color: '#1B5E20',
                fontWeight: 700,
                mb: 2,
              }}
            />
            <Typography
              variant="h3"
              fontWeight="800"
              sx={{
                fontFamily: 'Playfair Display, serif',
                mb: 2,
              }}
            >
              <span className="gradient-text">Built for Farmers, By Farmers</span>
            </Typography>
            <div className="section-divider" />
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
              Our AI learns from the best agricultural experts to bring you reliable, actionable farming advice
            </Typography>
          </Box>

          <Grid container spacing={4}>
            {features.map((feature, idx) => (
              <Grid item xs={12} sm={6} md={4} key={idx}>
                <Card
                  className="feature-card hover-lift"
                  sx={{
                    height: '100%',
                    p: 3,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(10px)',
                    animation: `fadeInUp 0.8s ease-out ${idx * 0.15}s both`,
                  }}
                >
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      mx: 'auto',
                      mb: 2,
                      borderRadius: '50%',
                      bgcolor: `${feature.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: feature.color,
                      animation: 'pulse 3s ease-in-out infinite',
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Typography variant="h5" fontWeight="700" gutterBottom sx={{ color: feature.color }}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {feature.description}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* HOW IT WORKS SECTION */}
      <Box className="bg-rice-field" sx={{ py: 10, color: 'white' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Chip
              label="Simple & Fast"
              sx={{
                bgcolor: 'rgba(255,255,255,0.25)',
                color: 'white',
                fontWeight: 700,
                mb: 2,
                backdropFilter: 'blur(10px)',
              }}
            />
            <Typography
              variant="h3"
              fontWeight="800"
              sx={{
                fontFamily: 'Playfair Display, serif',
                mb: 2,
                color: 'white',
              }}
            >
              How It Works
            </Typography>
            <div className="section-divider" style={{ background: 'linear-gradient(90deg, #FFC107, #FF9800)' }} />
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.95)' }}>
              Get answers in 3 simple steps
            </Typography>
          </Box>

          <Grid container spacing={4} alignItems="center">
            {[
              { num: '1', title: 'Ask Your Question', desc: 'Type your farming question in any language on Telegram, Web, or WhatsApp' },
              { num: '2', title: 'AI Finds Best Match', desc: 'Our AI searches the expert-verified Golden Dataset for the most relevant answer' },
              { num: '3', title: 'Get Trusted Answer', desc: 'Receive accurate, actionable advice tailored to your crop, region, and season' },
            ].map((step, idx) => (
              <Grid item xs={12} md={4} key={idx}>
                <Box
                  className="fade-in-up glass-dark"
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    borderRadius: 3,
                    animation: `fadeInUp 0.8s ease-out ${idx * 0.2}s both`,
                  }}
                >
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      mx: 'auto',
                      mb: 2,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #FFC107, #FF9800)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 36,
                      fontWeight: 800,
                      color: 'white',
                      boxShadow: '0 8px 25px rgba(255, 152, 0, 0.4)',
                      animation: 'pulse 2s ease-in-out infinite',
                    }}
                  >
                    {step.num}
                  </Box>
                  <Typography variant="h5" fontWeight="700" gutterBottom>
                    {step.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                    {step.desc}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA SECTION */}
      <Box
        sx={{
          py: 10,
          background: 'linear-gradient(135deg, #E8F5E9 0%, #E1F5FE 100%)',
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: 'center' }}>
            <Box
              sx={{
                fontSize: 80,
                mb: 2,
                animation: 'bounce 2s ease-in-out infinite',
              }}
            >
              🚜
            </Box>
            <Typography
              variant="h3"
              fontWeight="800"
              sx={{ fontFamily: 'Playfair Display, serif', mb: 2 }}
            >
              <span className="gradient-text">Ready to Transform Your Farming?</span>
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
              Join 50,000+ farmers already using AjraSakha to make better farming decisions every day.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                variant="contained"
                size="large"
                onClick={() => navigate('/chat')}
                endIcon={<ArrowIcon />}
                sx={{
                  background: 'linear-gradient(135deg, #2E7D32, #43A047)',
                  px: 5,
                  py: 1.8,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  borderRadius: 30,
                  boxShadow: '0 8px 25px rgba(46, 125, 50, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #1B5E20, #2E7D32)',
                    transform: 'translateY(-3px)',
                    boxShadow: '0 12px 30px rgba(46, 125, 50, 0.5)',
                  },
                }}
              >
                Start Chatting Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => navigate('/dashboard')}
                sx={{
                  borderColor: '#2E7D32',
                  color: '#2E7D32',
                  borderWidth: 2,
                  px: 5,
                  py: 1.8,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  borderRadius: 30,
                  '&:hover': {
                    borderColor: '#1B5E20',
                    bgcolor: 'rgba(46, 125, 50, 0.05)',
                  },
                }}
              >
                Explore Dashboard
              </Button>
            </Stack>

            {/* Trust badges */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 5, flexWrap: 'wrap' }}>
              {[
                { icon: <ShieldIcon />, text: 'Expert Verified' },
                { icon: <SpeedIcon />, text: 'Instant Answers' },
                { icon: <IdeaIcon />, text: 'AI-Powered' },
              ].map((badge, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 1,
                    borderRadius: 20,
                    bgcolor: 'rgba(255,255,255,0.8)',
                    color: '#2E7D32',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                  }}
                >
                  {badge.icon}
                  <Typography variant="body2" sx={{ color: '#2E7D32', fontWeight: 600 }}>
                    {badge.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ bgcolor: '#1B5E20', color: 'white', py: 4 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ fontSize: 32, mr: 1 }}>🌾</Box>
              <Typography variant="h6" fontWeight="700">
                AjraSakha
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Empowering Indian farmers with AI-powered knowledge 🌱
            </Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

export default LandingPage;