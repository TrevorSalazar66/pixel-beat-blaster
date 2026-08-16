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

function noiseBuffer(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeDistortionCurve(amount = 20): Float32Array {
  const k = amount;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export function playTrack(track: TrackId, time?: number, variant: number = 0) {
  const ac = getAudio();
  const t = time ?? ac.currentTime;

  if (track === "kick") {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = variant === 2 ? "sawtooth" : "square";
    const startFreq = variant === 1 ? 220 : variant === 2 ? 140 : 160;
    const endFreq = variant === 1 ? 55 : variant === 2 ? 30 : 40;
    const dur = variant === 1 ? 0.11 : variant === 2 ? 0.24 : 0.16;

    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);

    if (variant === 2) {
      // Overdrive / WaveShaper distortion for Explosive Kick
      const ws = ac.createWaveShaper();
      ws.curve = makeDistortionCurve(40);
      osc.connect(ws).connect(g).connect(out());
    } else {
      osc.connect(g).connect(out());
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return;
  }

  if (track === "snare" || track === "hat") {
    const isSnare = track === "snare";
    const src = ac.createBufferSource();
    const dur = isSnare
      ? variant === 1 ? 0.32 : variant === 2 ? 0.26 : 0.2
      : variant === 1 ? 0.09 : variant === 2 ? 0.12 : 0.06;

    src.buffer = noiseBuffer(ac, dur);
    const filter = ac.createBiquadFilter();
    filter.type = isSnare ? (variant === 2 ? "bandpass" : "highpass") : (variant === 2 ? "bandpass" : "highpass");
    filter.frequency.value = isSnare ? (variant === 1 ? 800 : 1200) : (variant === 2 ? 4000 : 6000);

    const g = ac.createGain();
    g.gain.setValueAtTime(isSnare ? 0.65 : 0.35, t);
    // Smooth exponential fadeout
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    if (variant === 1 || variant === 2) {
      const ws = ac.createWaveShaper();
      ws.curve = makeDistortionCurve(15);
      src.connect(filter).connect(ws).connect(g).connect(out());
    } else {
      src.connect(filter).connect(g).connect(out());
    }

    src.start(t);
    src.stop(t + dur + 0.02);
    return;
  }

  // synth: short arpeggio / tone with unique waveform depending on variant
  const baseFreqs =
    variant === 1
      ? [659.25, 987.77, 1318.5] // Beam laser chord
      : variant === 2
      ? [220, 329.63, 440] // Vamp deep bass chord
      : [523.25, 784, 1046.5]; // Standard chiptune

  baseFreqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = variant === 1 ? "sawtooth" : variant === 2 ? "triangle" : "triangle";
    osc.frequency.setValueAtTime(f, t + i * 0.04);
    g.gain.setValueAtTime(0.0001, t + i * 0.04);
    g.gain.linearRampToValueAtTime(0.5, t + i * 0.04 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.04 + 0.16);

    if (variant === 1) {
      const ws = ac.createWaveShaper();
      ws.curve = makeDistortionCurve(25);
      osc.connect(ws).connect(g).connect(out());
    } else {
      osc.connect(g).connect(out());
    }

    osc.start(t + i * 0.04);
    osc.stop(t + i * 0.04 + 0.18);
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

