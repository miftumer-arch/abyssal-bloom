// Procedural sound only: every effect is synthesised with WebAudio, so the
// game ships no audio files and makes no network request. The context is
// created lazily on the first user gesture (browsers block audio before
// one); every call before that is a silent no-op.
//
// audio-design: buses Master <- SFX, UI, Ambience. Every sound routes to a
// bus (nothing plays on Master directly), so Mute silences everything at
// once. Repeated SFX get +/-6% pitch and +/-10% volume jitter so the
// machine-gun repeat never happens. A low ambient drone runs under play and
// ducks -12 dB under big impacts. A compressor on Master leaves headroom.

export function createAudio() {
  let context = null;
  let master = null;
  let sfxBus = null;
  let uiBus = null;
  let ambBus = null;
  let ambStarted = false;
  let ambBase = 0.05;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      const comp = context.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      comp.connect(context.destination);
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(comp);
      sfxBus = context.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      uiBus = context.createGain();
      uiBus.gain.value = 0.8;
      uiBus.connect(master);
      ambBus = context.createGain();
      ambBus.gain.value = 0;
      ambBus.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  // Two detuned sines + a slow LFO: the abyss hums. Intensity rises with
  // the wave (boss waves push it up); duck() dips it under big impacts.
  function startAmbient() {
    if (ambStarted || !context) return;
    ambStarted = true;
    const t = context.currentTime;
    const o1 = context.createOscillator();
    o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = context.createOscillator();
    o2.type = 'sine'; o2.frequency.value = 55.6;
    const g = context.createGain();
    g.gain.value = 0.5;
    const lfo = context.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    o1.connect(g); o2.connect(g);
    g.connect(ambBus);
    ambBus.gain.setValueAtTime(0, t);
    ambBus.gain.linearRampToValueAtTime(ambBase, t + 2);
    o1.start(t); o2.start(t); lfo.start(t);
  }

  function tone(freq, dur, type, vol, slideTo, bus) {
    if (!ensure() || muted) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    // +/-6% pitch jitter, +/-10% volume jitter: kills the machine-gun repeat.
    const jf = 1 + (Math.random() * 2 - 1) * 0.06;
    const jv = 1 + (Math.random() * 2 - 1) * 0.1;
    osc.frequency.setValueAtTime(freq * jf, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo * jf), t + dur);
    gain.gain.setValueAtTime(vol * jv, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(bus || sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass, bus) {
    if (!ensure() || muted) return;
    const t = context.currentTime;
    const len = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol * (1 + (Math.random() * 2 - 1) * 0.1), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus || sfxBus);
    src.start(t);
  }

  return {
    unlock() { if (ensure()) startAmbient(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    /** 0..1: the ambient drone's base level (rises with wave intensity). */
    setIntensity(v) {
      ambBase = 0.03 + 0.07 * Math.max(0, Math.min(1, v));
      if (context && ambStarted) ambBus.gain.linearRampToValueAtTime(ambBase, context.currentTime + 1);
    },
    /** Dip the ambience -12 dB briefly under a big impact, then restore. */
    duck() {
      if (!context || !ambStarted || muted) return;
      const t = context.currentTime;
      ambBus.gain.cancelScheduledValues(t);
      ambBus.gain.setValueAtTime(ambBus.gain.value, t);
      ambBus.gain.linearRampToValueAtTime(ambBase * 0.25, t + 0.05);
      ambBus.gain.linearRampToValueAtTime(ambBase, t + 0.45);
    },
    shoot() { tone(880, 0.07, 'square', 0.10, 440); },
    hit() { noise(0.08, 0.18, 900); },
    hurt() { tone(160, 0.18, 'sawtooth', 0.22, 60); },
    pickup(step) { tone(660 + step * 40, 0.09, 'sine', 0.16, 990 + step * 40); },
    levelup() {
      tone(523, 0.12, 'sine', 0.18, 0, uiBus);
      setTimeout(() => tone(659, 0.12, 'sine', 0.18, 0, uiBus), 90);
      setTimeout(() => tone(784, 0.2, 'sine', 0.2, 0, uiBus), 180);
    },
    waveclear() { tone(392, 0.1, 'triangle', 0.18, 523, uiBus); setTimeout(() => tone(523, 0.16, 'triangle', 0.18, 0, uiBus), 100); },
    boss() { tone(70, 0.6, 'sawtooth', 0.28, 45); noise(0.5, 0.13, 300); },
    dash() { noise(0.12, 0.12, 2400); },
    gameover() { tone(392, 0.25, 'triangle', 0.2, 196, uiBus); setTimeout(() => tone(196, 0.5, 'triangle', 0.2, 98, uiBus), 240); },
    victory() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.2, 0, uiBus), i * 130));
    },
  };
}
