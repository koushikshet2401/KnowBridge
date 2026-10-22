/**
 * Chaty Sound Service
 * Web Audio API synthesizer for crisp, zero-dependency notification sounds:
 * - Drop sound on widget embed / load
 * - Drop sound on bubble open / outgoing message
 * - WhatsApp-style soft double chime on incoming AI / Agent messages
 * - LocalStorage persistence for user mute preference
 */

const STORAGE_KEY = 'chaty_widget_sound_muted';

let audioCtx = null;
let hasPlayedEmbedSound = false;
const listeners = new Set();

export const isMuted = () => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setMuted = (muted) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? 'true' : 'false');
    listeners.forEach(fn => fn(muted));
  } catch {}
};

export const toggleMuted = () => {
  const next = !isMuted();
  setMuted(next);
  return next;
};

export const subscribeMuteChange = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

/**
 * Water drop / bubble pop sound (used for embed, open widget, outgoing msg)
 */
export const playDropSound = (volume = 0.22) => {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Frequency sweep imitating water droplet / bubble pop
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(1150, now + 0.035);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  } catch (e) {
    // Ignore audio autoplay restrictions gracefully
  }
};

/**
 * Soft WhatsApp-style incoming message chime (2 harmonic tones)
 */
export const playMessageSound = (volume = 0.25) => {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // First tone (warm mid)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(volume * 0.75, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.13);

    // Second tone (higher crisp chime)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.05); // A5
    gain2.gain.setValueAtTime(0.001, now + 0.05);
    gain2.gain.linearRampToValueAtTime(volume, now + 0.065);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.27);
  } catch (e) {
    // Ignore audio autoplay restrictions gracefully
  }
};

/**
 * Initialize sound on widget embed / mount
 * Attempts to play the drop sound immediately, or on first user gesture if blocked by browser policy
 */
export const initEmbedSound = () => {
  if (typeof window === 'undefined') return;
  if (hasPlayedEmbedSound) return;

  const tryPlay = () => {
    if (hasPlayedEmbedSound) return;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'running') {
      hasPlayedEmbedSound = true;
      playDropSound(0.20);
      removeListeners();
    } else if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (!hasPlayedEmbedSound) {
          hasPlayedEmbedSound = true;
          playDropSound(0.20);
        }
        removeListeners();
      }).catch(() => {});
    }
  };

  const removeListeners = () => {
    window.removeEventListener('pointerdown', tryPlay);
    window.removeEventListener('click', tryPlay);
    window.removeEventListener('keydown', tryPlay);
    window.removeEventListener('touchstart', tryPlay);
  };

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'running') {
      hasPlayedEmbedSound = true;
      playDropSound(0.20);
      return;
    }
  } catch {}

  window.addEventListener('pointerdown', tryPlay, { once: true, passive: true });
  window.addEventListener('click', tryPlay, { once: true, passive: true });
  window.addEventListener('keydown', tryPlay, { once: true, passive: true });
  window.addEventListener('touchstart', tryPlay, { once: true, passive: true });
};
