import type { TrackId } from "@/lib/chiptune";

export type BlockDrop = {
  id: TrackId;
  label: string;
  color: string;
  chance: number;
  effect: string;
};

export const BLOCK_POOL: BlockDrop[] = [
  {
    id: "kick",
    label: "Kick",
    color: "#ff0055",
    chance: 0.35,
    effect: "Projétil pesado na direção da mira",
  },
  {
    id: "snare",
    label: "Snare",
    color: "#2ec8ff",
    chance: 0.25,
    effect: "Onda de choque: empurra e anula projéteis",
  },
  {
    id: "hat",
    label: "Hi-Hat",
    color: "#ffe23d",
    chance: 0.25,
    effect: "3 projéteis rápidos em leque",
  },
  {
    id: "synth",
    label: "Synth",
    color: "#b14dff",
    chance: 0.15,
    effect: "Área circular de dano contínuo",
  },
];

export function rollBlock(rand: () => number = Math.random): TrackId {
  const r = rand();
  let acc = 0;
  for (const b of BLOCK_POOL) {
    acc += b.chance;
    if (r <= acc) return b.id;
  }
  return "kick";
}
