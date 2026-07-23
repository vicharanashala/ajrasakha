import { useState, useEffect, useRef, useCallback } from 'react';

interface UseLiveAudioPlayerReturn {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playChunk: (base64Payload: string) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  stop: () => void;
}

export const useLiveAudioPlayer = (initialVolume: number = 1.0): UseLiveAudioPlayerReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(initialVolume);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Initialize or get AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass({ sampleRate: 16000 });
      const gainNode = ctx.createGain();
      gainNode.gain.value = isMuted ? 0 : volume;
      gainNode.connect(ctx.destination);

      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;
      nextStartTimeRef.current = 0;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, gainNode: gainNodeRef.current! };
  }, [isMuted, volume]);

  // Decode base64 16-bit PCM (16kHz mono) to AudioBuffer
  const decodePCMChunk = useCallback((ctx: AudioContext, base64: string): AudioBuffer | null => {
    try {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 16-bit PCM = 2 bytes per sample
      const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const float32Array = new Float32Array(int16Array.length);

      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32Array.length, 16000);
      buffer.getChannelData(0).set(float32Array);
      return buffer;
    } catch (err) {
      console.error('❌ Failed to decode PCM audio chunk:', err);
      return null;
    }
  }, []);

  const playChunk = useCallback((base64Payload: string) => {
    if (!base64Payload) return;
    try {
      const { ctx, gainNode } = getAudioContext();
      const buffer = decodePCMChunk(ctx, base64Payload);
      if (!buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime + 0.02, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;

      setIsPlaying(true);
      activeSourcesRef.current.push(source);

      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source);
        if (idx > -1) {
          activeSourcesRef.current.splice(idx, 1);
        }
        if (activeSourcesRef.current.length === 0) {
          setIsPlaying(false);
        }
      };
    } catch (err) {
      console.error('❌ Error playing audio chunk:', err);
    }
  }, [getAudioContext, decodePCMChunk]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : v;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  const stop = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {
        // ignore
      }
    });
    activeSourcesRef.current = [];
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    gainNodeRef.current = null;
    nextStartTimeRef.current = 0;
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isPlaying,
    isMuted,
    volume,
    playChunk,
    setVolume,
    toggleMute,
    stop,
  };
};
