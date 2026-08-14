import type { TrackId } from "@/lib/chiptune";

export type Track = {
  id: TrackId;
  label: string;
  short: string;
  color: string;
};

export const TRACKS: Track[] = [
  { id: "kick", label: "Kick / Ataque", short: "KICK", color: "#ff2e5b" },
  { id: "snare", label: "Snare / Escudo", short: "SNARE", color: "#2ec8ff" },
  { id: "hat", label: "Hi-Hat / Rápido", short: "HAT", color: "#ffe23d" },
  { id: "synth", label: "Synth / Área", short: "SYNTH", color: "#b14dff" },
];

export const STEPS = 16;

/** A step slot: empty (null) or holding a sound block. */
export type Cell = null | { rare: boolean };
export type Pattern = Cell[][];

const b = (rare = false): Cell => ({ rare });
const _ = null;

export const createPattern = (): Pattern => [
  [b(), _, _, _, b(), _, _, _, b(), _, _, _, b(), _, _, _],
  [_, _, _, _, b(), _, _, _, _, _, _, _, b(), _, _, _],
  [_, _, b(), _, _, _, b(), _, _, _, b(), _, _, _, b(), _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, b(), _],
];

export const countNotes = (p: Pattern) =>
  p.reduce((acc, row) => acc + row.filter(Boolean).length, 0);
