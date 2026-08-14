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
};

export const DOOR_COLS = [6, 7];
export const DOOR_ROWS = [4, 5];
