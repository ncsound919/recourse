// src/lib/voice.ts — Intelligent Event Vocalization & Acoustic Sonification Engine

let voiceEnabled = false;

// Attempt to load initial state from localStorage
if (typeof window !== 'undefined') {
  try {
    voiceEnabled = localStorage.getItem('recourse_voice_narration') === 'true';
  } catch (e) {
    console.warn('LocalStorage unavailable for voice status:', e);
  }
}

export function isVoiceEnabled(): boolean {
  return voiceEnabled;
}

export function setVoiceEnabled(enabled: boolean): void {
  voiceEnabled = enabled;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('recourse_voice_narration', String(enabled));
    } catch (e) {
      console.warn(e);
    }
  }
}

export function speak(text: string, force = false): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  if (!voiceEnabled && !force) return;

  // Cancel any ongoing speaking to avoid delayed stacking
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    console.error(e);
  }

  // Create utterance with optimal robotic telemetry tone
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Try to find a nice English voice (prefer Google US English, premium or natural voice if available)
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => 
    v.name.includes('Google US English') || 
    v.name.includes('Natural') || 
    (v.lang.startsWith('en') && v.name.includes('Zira')) ||
    v.lang.startsWith('en-US')
  ) || voices[0];

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.pitch = 0.95; // Slightly deeper, more structured mechanical cadence
  utterance.rate = 1.05;  // Slightly faster for immediate system telemetry reading

  try {
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
}

// Sonification frequency trigger (uses Web Audio API to play sleek, retro-futuristic telemetry chirps!)
export function playChirp(type: 'success' | 'failure' | 'synthesize' | 'loop_tick' | 'alert'): void {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  if (!voiceEnabled) return;

  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15); // C6
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'failure') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'synthesize') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'loop_tick') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'alert') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.linearRampToValueAtTime(330, now + 0.12);
      osc.frequency.setValueAtTime(440, now + 0.16);
      osc.frequency.linearRampToValueAtTime(220, now + 0.3);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  } catch (e) {
    console.debug('Web Audio chirp failed:', e);
  }
}
