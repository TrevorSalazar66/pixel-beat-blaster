import type { TrackId } from "@/lib/chiptune";

export type Track = {
  id: TrackId;
  label: string;
  color: string;
};

export const TRACKS: Track[] = [
  { id: "kick", label: "Kick / Ataque", color: "#ff2e5b" },
  { id: "snare", label: "Snare / Escudo", color: "#2ec8ff" },
  { id: "hat", label: "Hi-Hat / Rápido", color: "#ffe23d" },
  { id: "synth", label: "Synth / Área", color: "#b14dff" },
];

export const STEPS = 16;

export type Pattern = boolean[][];

export const createPattern = (): Pattern => [
  [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true],
];
