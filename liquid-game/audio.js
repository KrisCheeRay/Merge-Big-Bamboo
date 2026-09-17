const STORAGE_KEY = 'merge-soft-bamboo-sfx-v1';
const PENTATONIC = [0, 2, 4, 7, 9];

function loadEnabled() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null ? true : JSON.parse(value) !== false;
  } catch {
    return true;
  }
}

function saveEnabled(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
  }
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

class LiquidAudio {
  constructor() {
    this.enabled = loadEnabled();
    this.context = null;
    this.master = null;
    this.effects = null;
    this.reverb = null;
    this.noiseBuffer = null;
    this.lastSquish = 0;
  }

  init() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return true;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.82;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);

      this.effects = this.context.createGain();
      this.effects.gain.value = this.enabled ? 1 : 0;
      this.effects.connect(this.master);

      this.reverb = this.context.createDelay(1);
      this.reverb.delayTime.value = 0.19;
      const feedback = this.context.createGain();
      feedback.gain.value = 0.38;
      const lowPass = this.context.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 1800;
      const wet = this.context.createGain();
      wet.gain.value = 0.28;
      this.reverb.connect(lowPass);
      lowPass.connect(feedback);
      feedback.connect(this.reverb);
      lowPass.connect(wet);
      wet.connect(this.master);

      this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 0.5, this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      return true;
    } catch {
      this.context = null;
      return false;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    saveEnabled(this.enabled);
    if (this.effects && this.context) {
      this.effects.gain.setTargetAtTime(this.enabled ? 1 : 0, this.context.currentTime, 0.015);
    }
    return this.enabled;
  }

  tone(startFrequency, endFrequency, duration, type, volume, delay = 0, reverb = 0) {
    if (!this.context || !this.enabled) return;
    const time = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(this.effects);
    if (reverb > 0) {
      const send = this.context.createGain();
      send.gain.value = reverb;
      gain.connect(send);
      send.connect(this.reverb);
    }
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  noise(duration, frequency, q, volume, delay = 0) {
    if (!this.context || !this.enabled || !this.noiseBuffer) return;
    const time = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.35, time + duration);
    filter.Q.value = q;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    source.start(time);
    source.stop(time + duration);
  }

  drop(level) {
    const frequency = 520 - level * 40;
    this.tone(frequency, frequency * 0.55, 0.16, 'sine', 0.25);
    this.noise(0.08, 1400, 2, 0.05);
  }

  squish(speed, level) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    if (now - this.lastSquish < 0.06) return;
    this.lastSquish = now;
    const volume = Math.min(0.16, Math.max(0.02, speed / 1400));
    const frequency = 260 - level * 14 + Math.random() * 30;
    this.tone(frequency * 1.3, frequency * 0.7, 0.12, 'triangle', volume);
  }

  merge(level, combo) {
    const base = 76 - level * 2.2;
    const note = midi(base + PENTATONIC[combo % 5] + 12 * Math.floor(combo / 5));
    this.tone(note * 0.5, note, 0.09, 'sine', 0.32, 0, 0.25);
    this.tone(note, note * 1.5, 0.22, 'sine', 0.22, 0.06, 0.4);
    this.tone(note * 2, note * 2.01, 0.35, 'triangle', 0.06, 0.08, 0.5);
    this.noise(0.18, 900 + level * 60, 1.4, 0.09, 0.02);
  }

  burst() {
    [60, 64, 67, 72, 76, 79].forEach((note, index) => {
      const frequency = midi(note);
      this.tone(frequency, frequency * 1.005, 0.6, 'triangle', 0.14, index * 0.07, 0.6);
    });
    this.noise(0.6, 600, 0.8, 0.2);
  }

  danger() {
    this.tone(880, 860, 0.1, 'square', 0.04);
  }

  over() {
    [72, 67, 63, 60, 55].forEach((note, index) => {
      const frequency = midi(note);
      this.tone(frequency, frequency * 0.97, 0.5, 'triangle', 0.15, index * 0.16, 0.5);
    });
  }

  win() {
    [72, 76, 79, 84].forEach((note, index) => {
      const frequency = midi(note);
      this.tone(frequency, frequency, 0.3, 'sine', 0.12, index * 0.08, 0.6);
    });
  }

  click() {
    this.tone(900, 700, 0.05, 'sine', 0.08);
  }
}

export const liquidAudio = new LiquidAudio();
