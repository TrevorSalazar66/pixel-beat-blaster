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

export function playTrack(track: TrackId, time?: number) {
  const ac = getAudio();
  const t = time ?? ac.currentTime;

  if (track === "kick") {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(out());
    osc.start(t);
    osc.stop(t + 0.2);
    return;
  }

  if (track === "snare" || track === "hat") {
    const isSnare = track === "snare";
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, isSnare ? 0.2 : 0.06);
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = isSnare ? 1200 : 6000;
    const g = ac.createGain();
    g.gain.setValueAtTime(isSnare ? 0.6 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (isSnare ? 0.18 : 0.05));
    src.connect(filter).connect(g).connect(out());
    src.start(t);
    src.stop(t + 0.22);
    return;
  }

  // synth: short arpeggio blip
  const notes = [523.25, 784, 1046.5];
  notes.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, t + i * 0.045);
    g.gain.setValueAtTime(0.0001, t + i * 0.045);
    g.gain.linearRampToValueAtTime(0.5, t + i * 0.045 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + 0.12);
    osc.connect(g).connect(out());
    osc.start(t + i * 0.045);
    osc.stop(t + i * 0.045 + 0.14);
  });
}
