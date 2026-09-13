import { useState, useEffect } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import {
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';
import villageAudio from '../utils/villageAudio';

/**
 * Global Audio Control Button - ALWAYS VISIBLE on every page
 * Click to toggle between play and mute
 */
function AudioControl() {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const handleStateChange = (event) => {
      const { isPlaying, isMuted } = event.detail;
      setIsPlaying(isPlaying);
      setIsMuted(isMuted);
      setAnimating(true);
      setTimeout(() => setAnimating(false), 300);
    };

    window.addEventListener('village-audio-state-change', handleStateChange);

    // Initial state
    const state = villageAudio.getState();
    setIsPlaying(state.isPlaying);
    setIsMuted(state.isMuted);

    return () => {
      window.removeEventListener('village-audio-state-change', handleStateChange);
    };
  }, []);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    villageAudio.toggleMute();
  };

  const showMutedIcon = isMuted || !isPlaying;
  const tooltipText = !isPlaying
    ? 'Click to play Indian village music'
    : isMuted
    ? 'Click to unmute'
    : 'Click to mute';

  return (
    <Tooltip title={tooltipText} placement="left">
      <Box
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleToggle(e);
        }}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 99999,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: showMutedIcon
            ? 'linear-gradient(135deg, #757575, #9E9E9E)'
            : 'linear-gradient(135deg, #2E7D32, #43A047)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          boxShadow: showMutedIcon
            ? '0 6px 20px rgba(0, 0, 0, 0.3)'
            : '0 6px 20px rgba(46, 125, 50, 0.5)',
          transition: 'all 0.3s ease',
          transform: animating ? 'scale(0.9)' : 'scale(1)',
          animation: isPlaying && !isMuted ? 'pulse 3s ease-in-out infinite' : 'none',
          '&:hover': {
            transform: 'scale(1.1) rotate(15deg)',
            boxShadow: '0 8px 25px rgba(46, 125, 50, 0.6)',
          },
          '&:active': {
            transform: 'scale(0.95)',
          },
          '&::after': isPlaying && !isMuted ? {
            content: '""',
            position: 'absolute',
            top: -6,
            left: -6,
            right: -6,
            bottom: -6,
            borderRadius: '50%',
            border: '2px solid rgba(46, 125, 50, 0.4)',
            animation: 'ripple 2s ease-out infinite',
          } : {},
        }}
      >
        {showMutedIcon ? (
          <VolumeOffIcon sx={{ fontSize: 30 }} />
        ) : (
          <VolumeUpIcon sx={{ fontSize: 30 }} />
        )}

        {/* Status label */}
        <Typography
          sx={{
            position: 'absolute',
            bottom: -22,
            right: 0,
            fontSize: 10,
            fontWeight: 700,
            color: showMutedIcon ? '#757575' : '#2E7D32',
            background: 'rgba(255,255,255,0.95)',
            padding: '2px 8px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            pointerEvents: 'none',
          }}
        >
          {!isPlaying ? 'CLICK TO PLAY' : isMuted ? 'MUTED' : 'PLAYING'}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export default AudioControl;