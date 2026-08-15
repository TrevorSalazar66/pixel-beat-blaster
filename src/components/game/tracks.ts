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

/** 0 = Base, 1 = Variacao A, 2 = Variacao B */
export type Variant = 0 | 1 | 2;

/** A step slot: empty (null) or holding a sound block. */
export type Cell = null | { rare: boolean; variant: Variant };
export type Pattern = Cell[][];

/** Nomes das variacoes por trilha (indice = Variant). */
export const VARIANTS: Record<TrackId, [string, string, string]> = {
  kick: ["Kick", "Sub-Kick", "Explosive Kick"],
  snare: ["Snare", "Shield Snare", "Stun Snare"],
  hat: ["Hi-Hat", "Dash Hat", "Homing Hat"],
  synth: ["Synth", "Beam Synth", "Vamp Bass"],
};

export const VARIANT_TAG = ["", "A", "B"] as const;

const b = (rare = false, variant: Variant = 0): Cell => ({ rare, variant });
const _ = null;

export const createPattern = (): Pattern => [
  [b(), _, _, _, b(), _, _, _, b(), _, _, _, b(), _, _, _],
  [_, _, _, _, b(), _, _, _, _, _, _, _, b(), _, _, _],
  [_, _, b(), _, _, _, b(), _, _, _, b(), _, _, _, b(), _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, b(), _],
];

export const countNotes = (p: Pattern) =>
  p.reduce((acc, row) => acc + row.filter(Boolean).length, 0);
