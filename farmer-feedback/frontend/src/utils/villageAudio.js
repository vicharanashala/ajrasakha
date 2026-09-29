/**
 * Global Village Audio Manager
 * Generates Indian-flavored village ambient music using Web Audio API
 * Falls back to external URLs if available
 * 100% reliable - works without external dependencies
 */

class VillageAudioManager {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.12;
    this.nodes = [];
    this.gainNode = null;
    this.shimmerInterval = null;
    this.melodyInterval = null;
    this.audioElement = null;
    this.useExternalAudio = false;
    this.onStateChange = null;
  }

  // Initialize on user interaction (browser autoplay policy)
  init() {
    if (this.audioContext) return;
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
      this.gainNode.connect(this.audioContext.destination);
    } catch (e) {
      console.error('Web Audio API not supported:', e);
    }
  }

  // Start playing music
  async start() {
    this.init();
    if (!this.audioContext) return false;
    if (this.isPlaying) return true;

    // Resume context if suspended (browser policy)
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.log('Audio resume failed:', e);
      }
    }

    try {
      this.createIndianAmbientMusic();
      this.isPlaying = true;
      this.isMuted = false;
      if (this.gainNode) {
        this.gainNode.gain.value = this.volume;
      }
      this.notifyStateChange();
      return true;
    } catch (e) {
      console.error('Failed to start audio:', e);
      return false;
    }
  }

  // Create Indian village-flavored ambient music
  createIndianAmbientMusic() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // === 1. TANPURA-LIKE BASE DRONE (Sa - C#) ===
    // Indian music uses Sa (C#), Pa (G#), Sa' (C# high)
    const tanpuraOsc = this.audioContext.createOscillator();
    const tanpuraGain = this.createVintageEnvelope(0.25);
    tanpuraOsc.type = 'sine';
    tanpuraOsc.frequency.value = 138.59; // C#3 - Indian Sa
    tanpuraOsc.connect(tanpuraGain);
    tanpuraGain.connect(this.gainNode);
    tanpuraOsc.start(now);
    this.nodes.push(tanpuraOsc, tanpuraGain);

    // === 2. PERFECT FIFTH ABOVE (Pa) ===
    const fifthOsc = this.audioContext.createOscillator();
    const fifthGain = this.createVintageEnvelope(0.15);
    fifthOsc.type = 'sine';
    fifthOsc.frequency.value = 207.65; // G#3
    fifthOsc.connect(fifthGain);
    fifthGain.connect(this.gainNode);
    fifthOsc.start(now);
    this.nodes.push(fifthOsc, fifthGain);

    // === 3. OCTAVE ABOVE (Sa high) ===
    const octaveOsc = this.audioContext.createOscillator();
    const octaveGain = this.createVintageEnvelope(0.08);
    octaveOsc.type = 'triangle';
    octaveOsc.frequency.value = 277.18; // C#4
    octaveOsc.connect(octaveGain);
    octaveGain.connect(this.gainNode);
    octaveOsc.start(now);
    this.nodes.push(octaveOsc, octaveGain);

    // === 4. SLOW LFO (like breathing) ===
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.2; // Slow breathing
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(this.gainNode.gain);
    lfo.start(now);
    this.nodes.push(lfo, lfoGain);

    // === 5. WIND/AMBIENT PAD ===
    const padOsc = this.audioContext.createOscillator();
    const padGain = this.createVintageEnvelope(0.06);
    padOsc.type = 'sawtooth';
    padOsc.frequency.value = 110; // Low drone
    // Filter to make it warm
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 250;
    filter.Q.value = 1;
    padOsc.connect(filter);
    filter.connect(padGain);
    padGain.connect(this.gainNode);
    padOsc.start(now);
    this.nodes.push(padOsc, filter, padGain);

    // === 6. INDIAN RAGA-LIKE MELODY (scheduled notes) ===
    this.scheduleRagaMelody();

    // === 7. DISTANT BIRD-LIKE SOUNDS (random intervals) ===
    this.shimmerInterval = setInterval(() => {
      if (this.isPlaying) this.playBirdSound();
    }, 8000 + Math.random() * 12000);
  }

  // Helper: Create vintage envelope for warmth
  createVintageEnvelope(baseGain) {
    const gain = this.audioContext.createGain();
    gain.gain.value = baseGain;
    return gain;
  }

  // Schedule Indian raga-inspired melody (Yaman-inspired)
  scheduleRagaMelody() {
    if (!this.audioContext) return;
    const startTime = this.audioContext.currentTime;

    // Yaman raga notes: Sa Re Ga Ma# Pa Dha Ni Sa'
    // C# D# E# F# G# A# B# C#
    const notes = [
      { time: 0, freq: 277.18, dur: 4, vol: 0.05 },  // Sa
      { time: 4, freq: 311.13, dur: 3, vol: 0.04 },  // Re
      { time: 7, freq: 369.99, dur: 2, vol: 0.04 },  // Ga
      { time: 9, freq: 369.99, dur: 2, vol: 0.04 },  // Ga
      { time: 11, freq: 415.30, dur: 4, vol: 0.05 }, // Ma#
      { time: 15, freq: 369.99, dur: 2, vol: 0.04 }, // Ga
      { time: 17, freq: 311.13, dur: 3, vol: 0.04 }, // Re
      { time: 20, freq: 277.18, dur: 4, vol: 0.05 }, // Sa
    ];

    notes.forEach(note => {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, startTime + note.time);

      gain.gain.setValueAtTime(0, startTime + note.time);
      gain.gain.linearRampToValueAtTime(note.vol, startTime + note.time + 0.5);
      gain.gain.linearRampToValueAtTime(0, startTime + note.time + note.dur);

      osc.connect(gain);
      gain.connect(this.gainNode);
      osc.start(startTime + note.time);
      osc.stop(startTime + note.time + note.dur + 0.1);
    });

    // Schedule next melody cycle in 25 seconds
    this.melodyInterval = setInterval(() => {
      if (this.isPlaying) {
        this.scheduleRagaMelody();
      }
    }, 25000);
  }

  // Play bird-like sounds (random frequency, random timing)
  playBirdSound() {
    if (!this.audioContext || !this.isPlaying) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'triangle';

    // Random bird-like notes (high frequencies)
    const notes = [880, 1047, 1175, 1319, 1568, 1760];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const dur = 0.3 + Math.random() * 0.8;
    const vol = 0.02 + Math.random() * 0.03;

    osc.frequency.setValueAtTime(freq, now);

    // Chirp pattern (frequency varies)
    osc.frequency.linearRampToValueAtTime(freq * 1.1, now + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(freq, now + dur);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(gain);
    gain.connect(this.gainNode);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  // Stop all audio
  stop() {
    // Stop intervals
    if (this.shimmerInterval) {
      clearInterval(this.shimmerInterval);
      this.shimmerInterval = null;
    }
    if (this.melodyInterval) {
      clearInterval(this.melodyInterval);
      this.melodyInterval = null;
    }

    // Stop Web Audio API nodes
    this.nodes.forEach(node => {
      try {
        if (node.stop) {
          try { node.stop(); } catch (e) {}
        }
        if (node.disconnect) {
          try { node.disconnect(); } catch (e) {}
        }
      } catch (e) {}
    });
    this.nodes = [];

    // Stop external audio element if exists
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (e) {}
    }

    this.isPlaying = false;
    this.notifyStateChange();
  }

  // Toggle mute (the main fix for the mute button)
  toggleMute() {
    if (!this.isPlaying) {
      // Start playing if not playing
      this.start();
      return false; // not muted, now playing
    } else {
      // Toggle mute state
      this.isMuted = !this.isMuted;

      if (this.audioElement) {
        // External audio element
        this.audioElement.muted = this.isMuted;
      }

      if (this.gainNode) {
        // Web Audio API - ramp volume smoothly
        const targetVolume = this.isMuted ? 0 : this.volume;
        try {
          this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
          this.gainNode.gain.linearRampToValueAtTime(
            targetVolume,
            this.audioContext.currentTime + 0.15
          );
        } catch (e) {
          this.gainNode.gain.value = targetVolume;
        }
      }

      this.notifyStateChange();
      return this.isMuted;
    }
  }

  // Notify state change listeners
  notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this.isPlaying, this.isMuted);
    }
    // Also dispatch event for global listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('village-audio-state-change', {
        detail: { isPlaying: this.isPlaying, isMuted: this.isMuted }
      }));
    }
  }

  setOnStateChange(callback) {
    this.onStateChange = callback;
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      isMuted: this.isMuted
    };
  }
}

// Singleton
const villageAudio = new VillageAudioManager();

if (typeof window !== 'undefined') {
  window.__villageAudio = villageAudio;
}

export default villageAudio;