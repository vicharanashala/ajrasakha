import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Download, 
  Loader2, 
  AlertCircle, 
  Radio
} from 'lucide-react';
import { Button } from './button';
import { plivoApi, type CallRecordingItem } from '@/hooks/api/plivo/api';


interface AudioPlayerProps {
  callUuid: string;
  initialUrl?: string;
  duration?: number;
  recording?: CallRecordingItem;
  className?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  callUuid,
  initialUrl,
  duration: propDuration = 0,
  recording,
  className = '',
}) => {
  if (recording && !recording.storagePath && !initialUrl) {
    return null;
  }

  const [audioUrl, setAudioUrl] = useState<string | null>(initialUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(propDuration);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLInputElement | null>(null);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Fetch / Refresh Signed URL
  const fetchAudioUrl = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await plivoApi.getCallRecordingUrl(callUuid);
      if (res.hasRecording && res.url) {
        setAudioUrl(res.url);
        if (res.duration && !totalDuration) {
          setTotalDuration(res.duration);
        }
        return res.url;
      } else {
        setErrorMessage(res.message || 'No recording available for this call');
        return null;
      }
    } catch (err: any) {
      console.error('Failed to load recording URL:', err);
      setErrorMessage('Could not load recording');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [callUuid, totalDuration]);

  // Handle Play/Pause toggle
  const togglePlayPause = async () => {
    if (!audioRef.current) return;

    if (!audioUrl) {
      const url = await fetchAudioUrl();
      if (!url) return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err: any) {
        console.warn('Audio play failed, refreshing signed URL...', err);
        // Signed URL might have expired, try refreshing
        const freshUrl = await fetchAudioUrl();
        if (freshUrl && audioRef.current) {
          audioRef.current.src = freshUrl;
          await audioRef.current.play();
          setIsPlaying(true);
        }
      }
    }
  };

  // Handle audio time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  // Handle audio metadata loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      if (audioDuration && !isNaN(audioDuration) && isFinite(audioDuration)) {
        setTotalDuration(Math.round(audioDuration));
      }
      setIsLoading(false);
    }
  };

  // Handle seek bar change
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  // Handle playback rate change
  const handleSpeedChange = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      audioRef.current.muted = newVolume === 0;
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    if (audioRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      audioRef.current.muted = nextMuted;
    }
  };

  // Handle replay / restart
  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Handle direct download
  const handleDownload = async () => {
    let urlToDownload = audioUrl;
    if (!urlToDownload) {
      urlToDownload = await fetchAudioUrl();
      if (!urlToDownload) return;
    }
    const a = document.createElement('a');
    a.href = urlToDownload;
    a.download = `call_${callUuid}.mp3`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Audio element ended event
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Progress percentage
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/90 dark:bg-zinc-900/90 p-3.5 shadow-sm backdrop-blur-md transition-all ${className}`}
    >
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={() => {
          setIsLoading(false);
          setIsPlaying(false);
        }}
        preload="metadata"
      />

      <div className="flex flex-col gap-2.5">
        {/* Header bar: Recording tag + Status */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-zinc-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? 'bg-emerald-500' : 'bg-zinc-500'}`}></span>
            </span>
            <span className="tracking-wide uppercase text-[11px] font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              Call Recording
            </span>
            {recording?.format && (
              <span className="rounded-full bg-zinc-200/70 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400 uppercase font-mono">
                {recording.format}
              </span>
            )}
          </div>


          <div className="flex items-center gap-2">
            {errorMessage ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <AlertCircle className="h-3 w-3" />
                {errorMessage}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 font-medium">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
              </span>
            )}
          </div>
        </div>

        {/* Timeline Scrub Bar */}
        <div className="relative flex items-center group w-full py-1">
          <div className="relative w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden cursor-pointer">
            <div
              className="absolute left-0 top-0 h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            ref={progressBarRef}
            type="range"
            min="0"
            max={totalDuration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!audioUrl && !totalDuration}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        {/* Control Buttons Bar */}
        <div className="flex items-center justify-between pt-0.5">
          {/* Left: Playback controls */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={togglePlayPause}
              disabled={isLoading}
              className="h-8 w-8 rounded-full p-0 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-transform active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRestart}
              disabled={!audioUrl}
              className="h-7 w-7 rounded-full p-0 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              title="Restart"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>

            {/* Speed Multiplier */}
            <button
              type="button"
              onClick={handleSpeedChange}
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-200/60 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
              title="Change Speed"
            >
              {playbackRate}x
            </button>
          </div>

          {/* Right: Volume & Download */}
          <div className="flex items-center gap-3">
            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-1.5 group">
              <button
                type="button"
                onClick={toggleMute}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg accent-emerald-600 cursor-pointer"
              />
            </div>

            {/* Download MP3 */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-7 px-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center gap-1 rounded"
              title="Download Recording"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">MP3</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
