// 8-bit style synthesis with the Web Audio API (no external audio files).

export type TrackId = "kick" | "snare" | "hat" | "synth";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function getAudio(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function out(): AudioNode {
  getAudio();
  return master as AudioNode;
}

/** Curva de distorcao (drive) usada nas variacoes A e B. */
function driveCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 60;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Cadeia de saida para variacoes: drive (waveshaper) + fade-out suave.
 * variant 0 = som limpo, 1 = drive medio, 2 = drive forte + tom mais escuro.
 */
function variantOut(ac: AudioContext, t: number, variant: 0 | 1 | 2, dur: number): AudioNode {
  if (!variant) return out();
  const shaper = ac.createWaveShaper();
  shaper.curve = driveCurve(variant === 1 ? 0.35 : 0.8);
  shaper.oversample = "2x";
  const tone = ac.createBiquadFilter();
  tone.type = variant === 1 ? "highshelf" : "lowpass";
  tone.frequency.value = variant === 1 ? 2600 : 1500;
  if (variant === 1) tone.gain.value = 6;
  const fade = ac.createGain();
  const peak = variant === 1 ? 0.8 : 0.7;
  fade.gain.setValueAtTime(peak, t);
  fade.gain.setTargetAtTime(0.0001, t + dur * 0.35, Math.max(0.03, dur * 0.4));
  shaper.connect(tone).connect(fade).connect(out());
  return shaper;
}

function noiseBuffer(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function playTrack(track: TrackId, time?: number, variant: 0 | 1 | 2 = 0) {
  const ac = getAudio();
  const t = time ?? ac.currentTime;
  const dur = track === "kick" ? 0.3 : track === "snare" ? 0.28 : track === "hat" ? 0.14 : 0.4;
  const dest = variantOut(ac, t, variant, dur);

  if (track === "kick") {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = variant === 2 ? "sawtooth" : "square";
    osc.frequency.setValueAtTime(variant === 1 ? 200 : variant === 2 ? 130 : 160, t);
    osc.frequency.exponentialRampToValueAtTime(variant === 2 ? 28 : 40, t + (variant === 1 ? 0.1 : 0.16));
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (variant === 1 ? 0.12 : variant === 2 ? 0.26 : 0.18));
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.32);
    return;
  }

  if (track === "snare" || track === "hat") {
    const isSnare = track === "snare";
    const src = ac.createBufferSource();
    const len = isSnare ? (variant === 2 ? 0.3 : 0.2) : variant === 1 ? 0.1 : 0.06;
    src.buffer = noiseBuffer(ac, len);
    src.playbackRate.value = variant === 2 ? 0.72 : variant === 1 ? 1.25 : 1;
    const filter = ac.createBiquadFilter();
    filter.type = variant === 2 ? "bandpass" : "highpass";
    filter.frequency.value = isSnare ? (variant === 2 ? 700 : 1200) : variant === 2 ? 3200 : 6000;
    if (variant === 2) filter.Q.value = 2.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(isSnare ? 0.6 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (isSnare ? (variant === 2 ? 0.3 : 0.18) : 0.05));
    src.connect(filter).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.34);
    return;
  }

  // synth: short arpeggio blip
  const notes =
    variant === 1
      ? [659.25, 987.77, 1318.5]
      : variant === 2
        ? [130.81, 98, 65.41]
        : [523.25, 784, 1046.5];
  notes.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = variant === 2 ? "sawtooth" : variant === 1 ? "square" : "triangle";
    osc.frequency.setValueAtTime(f, t + i * 0.045);
    g.gain.setValueAtTime(0.0001, t + i * 0.045);
    g.gain.linearRampToValueAtTime(variant === 2 ? 0.6 : 0.5, t + i * 0.045 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + (variant === 2 ? 0.3 : 0.12));
    osc.connect(g).connect(dest);
    osc.start(t + i * 0.045);
    osc.stop(t + i * 0.045 + (variant === 2 ? 0.34 : 0.16));
  });
}

/** Death: synth slowing down with a pitch-bend downwards. */
export function playDeath() {
  const ac = getAudio();
  const t = ac.currentTime;
  [220, 165, 110].forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(f, t + i * 0.18);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f / 6), t + i * 0.18 + 0.9);
    g.gain.setValueAtTime(0.35, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 1.1);
    osc.connect(g).connect(out());
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 1.2);
  });
}

/** Master volume (0 – 1). */
export function setMasterVolume(v: number) {
  getAudio();
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}
