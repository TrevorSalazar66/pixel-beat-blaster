export const TILE = 40;
export const ROOM_W = 15;
export const ROOM_H = 11;

export const T = {
  FLOOR: 0,
  WALL: 1,
  CHASM: 2,
  ROCK: 3,
  SPIKE: 4,
  DOOR: 5,
  PORTAL: 6,
  PILLAR: 7,
  BPM_UP: 8,
  BPM_DOWN: 9,
  AMPLIFIER: 10,
} as const;

export type TileId = (typeof T)[keyof typeof T];

export type TileProps = {
  id: TileId;
  name: string;
  /** blocks walking units (flyers ignore chasms) */
  solid: boolean;
  /** blocks projectiles */
  blocksShots: boolean;
  color: string;
};

export const TILE_PROPS: Record<number, TileProps> = {
  [T.FLOOR]: { id: T.FLOOR, name: "Chão", solid: false, blocksShots: false, color: "#12141f" },
  [T.WALL]: { id: T.WALL, name: "Parede", solid: true, blocksShots: true, color: "#1d2740" },
  [T.CHASM]: { id: T.CHASM, name: "Fosso", solid: true, blocksShots: false, color: "#05060b" },
  [T.ROCK]: { id: T.ROCK, name: "Obstáculo", solid: true, blocksShots: true, color: "#2a2140" },
  [T.SPIKE]: { id: T.SPIKE, name: "Espinho", solid: false, blocksShots: false, color: "#1a1420" },
  [T.DOOR]: { id: T.DOOR, name: "Porta", solid: false, blocksShots: false, color: "#101828" },
  [T.PORTAL]: { id: T.PORTAL, name: "Portal", solid: false, blocksShots: false, color: "#160b24" },
  [T.PILLAR]: { id: T.PILLAR, name: "Pilar", solid: true, blocksShots: true, color: "#2b2f4d" },
  [T.BPM_UP]: { id: T.BPM_UP, name: "Piso Acelerador", solid: false, blocksShots: false, color: "#2a1420" },
  [T.BPM_DOWN]: { id: T.BPM_DOWN, name: "Piso Desacelerador", solid: false, blocksShots: false, color: "#101c2a" },
  [T.AMPLIFIER]: { id: T.AMPLIFIER, name: "Piso Amplificador", solid: false, blocksShots: false, color: "#241a2e" },
};

/** Pilares destrutiveis comecam com esta vida. */
export const PILLAR_HP = 12;

export const DOOR_COLS = [6, 7];
export const DOOR_ROWS = [4, 5];
