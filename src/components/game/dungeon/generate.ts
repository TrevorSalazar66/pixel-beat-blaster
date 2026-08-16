import { DOOR_COLS, DOOR_ROWS, PILLAR_HP, ROOM_H, ROOM_W, T } from "./tiles";
import {
  COMMON_ENEMY_IDS,
  MAX_ENEMIES_PER_ROOM,
  enemyCount,
  getDef,
  rollEnemyId,
  scaledDamage,
  scaledHp,
  type Enemy,
} from "./enemies";
import { TILE } from "./tiles";

export type Dir = "NORTH" | "SOUTH" | "EAST" | "WEST";
export type RoomType = "SPAWN" | "NORMAL" | "SHOP" | "REWARD" | "BOSS" | "FORGE";
export type RoomState = "UNVISITED" | "COMBAT" | "CLEARED";
export type RoomLayout = "STANDARD" | "L_SHAPE" | "T_SHAPE" | "ISLAND" | "PILLARS";

export type Door = { direction: Dir; locked: boolean };

export type Room = {
  id: string;
  gridX: number;
  gridY: number;
  type: RoomType;
  state: RoomState;
  tiles: number[][];
  enemies: Enemy[];
  doors: Door[];
  rewardTaken: boolean;
  layout: RoomLayout;
  /** vida dos pilares destrutiveis, indexada por "tx,ty" */
  pillars: Record<string, number>;
};

export type Floor = {
  level: number;
  rooms: Record<string, Room>;
  startId: string;
  bossId: string;
};

export const GRID = 5;
export const key = (x: number, y: number) => `${x},${y}`;

const DIRS: { dir: Dir; dx: number; dy: number }[] = [
  { dir: "NORTH", dx: 0, dy: -1 },
  { dir: "SOUTH", dx: 0, dy: 1 },
  { dir: "EAST", dx: 1, dy: 0 },
  { dir: "WEST", dx: -1, dy: 0 },
];

export const opposite = (d: Dir): Dir =>
  d === "NORTH" ? "SOUTH" : d === "SOUTH" ? "NORTH" : d === "EAST" ? "WEST" : "EAST";

export const dirDelta = (d: Dir) => DIRS.find((x) => x.dir === d)!;

function emptyTiles(): number[][] {
  const t: number[][] = [];
  for (let y = 0; y < ROOM_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < ROOM_W; x++) {
      row.push(x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1 ? T.WALL : T.FLOOR);
    }
    t.push(row);
  }
  return t;
}

function protectedCell(x: number, y: number) {
  // keep 2-tile-wide cross corridors from every door to the room center clear
  return DOOR_COLS.includes(x) || DOOR_ROWS.includes(y);
}

const LAYOUT_POOL: RoomLayout[] = ["STANDARD", "L_SHAPE", "T_SHAPE", "ISLAND", "PILLARS"];

export const pickLayout = (type: RoomType): RoomLayout => {
  if (type === "SHOP" || type === "SPAWN" || type === "FORGE") return "STANDARD";
  if (type === "BOSS") return Math.random() < 0.5 ? "PILLARS" : "STANDARD";
  return LAYOUT_POOL[Math.floor(Math.random() * LAYOUT_POOL.length)]!;
};

const setTile = (tiles: number[][], x: number, y: number, id: number) => {
  if (x < 1 || y < 1 || x > ROOM_W - 2 || y > ROOM_H - 2) return;
  if (protectedCell(x, y)) return;
  tiles[y]![x] = id;
};

/** Paredes internas / fossos / pilares conforme o formato da sala. */
function applyLayout(room: Room) {
  const tiles = room.tiles;
  const layout = room.layout;

  if (layout === "L_SHAPE") {
    for (const y of [1, 2, 3, 6, 7, 8, 9]) setTile(tiles, 4, y, T.WALL);
    for (const x of [1, 2, 3, 4]) setTile(tiles, x, 8, T.WALL);
  } else if (layout === "T_SHAPE") {
    for (const y of [1, 2, 3, 6, 7, 8, 9]) setTile(tiles, 10, y, T.WALL);
    for (const x of [2, 3, 4, 5, 9, 10, 11, 12]) setTile(tiles, x, 2, T.WALL);
  } else if (layout === "ISLAND") {
    for (let y = 3; y <= ROOM_H - 4; y++)
      for (let x = 5; x <= ROOM_W - 6; x++) tiles[y]![x] = T.CHASM;
  } else if (layout === "PILLARS") {
    const spots = [
      [3, 2],
      [10, 2],
      [3, 7],
      [10, 7],
    ] as const;
    for (const [px, py] of spots) {
      for (let y = py; y <= py + 1; y++)
        for (let x = px; x <= px + 1; x++) {
          setTile(tiles, x, y, T.PILLAR);
          if (tiles[y]?.[x] === T.PILLAR) room.pillars[`${x},${y}`] = PILLAR_HP;
        }
    }
  }
}

/** Perigos ambientais e pisos ritmicos. */
function decorate(tiles: number[][], type: RoomType) {
  if (type === "SHOP" || type === "SPAWN" || type === "FORGE") return;
  const density = type === "BOSS" ? 0.05 : 0.11;
  for (let y = 1; y < ROOM_H - 1; y++) {
    for (let x = 1; x < ROOM_W - 1; x++) {
      if (protectedCell(x, y)) continue;
      if (tiles[y]![x] !== T.FLOOR) continue;
      if (Math.random() > density) continue;
      const r = Math.random();
      tiles[y]![x] = r < 0.45 ? T.ROCK : r < 0.8 ? T.CHASM : T.SPIKE;
    }
  }
}

/** Plataformas de BPM e piso amplificador, em manchas 2x2. */
function paintRhythmFloors(tiles: number[][], type: RoomType) {
  if (type === "SHOP" || type === "SPAWN" || type === "FORGE") return;
  const patches: number[] = [];
  if (Math.random() < 0.5) patches.push(T.BPM_UP);
  if (Math.random() < 0.4) patches.push(T.BPM_DOWN);
  if (Math.random() < 0.35) patches.push(T.AMPLIFIER);
  for (const id of patches) {
    const bx = 1 + Math.floor(Math.random() * (ROOM_W - 3));
    const by = 1 + Math.floor(Math.random() * (ROOM_H - 3));
    for (let y = by; y <= by + 1; y++)
      for (let x = bx; x <= bx + 1; x++) {
        if (x < 1 || y < 1 || x > ROOM_W - 2 || y > ROOM_H - 2) continue;
        if (tiles[y]![x] === T.FLOOR) tiles[y]![x] = id;
      }
  }
}

function carveDoors(room: Room) {
  for (const d of room.doors) {
    const t = room.tiles;
    if (d.direction === "NORTH") for (const c of DOOR_COLS) t[0]![c] = T.DOOR;
    if (d.direction === "SOUTH") for (const c of DOOR_COLS) t[ROOM_H - 1]![c] = T.DOOR;
    if (d.direction === "WEST") for (const r of DOOR_ROWS) t[r]![0] = T.DOOR;
    if (d.direction === "EAST") for (const r of DOOR_ROWS) t[r]![ROOM_W - 1] = T.DOOR;
  }
}

export function generateFloor(level: number): Floor {
  const target = 5 + level;
  const cells = new Map<string, { x: number; y: number }>();
  let cx = 2;
  let cy = 2;
  cells.set(key(cx, cy), { x: cx, y: cy });

  let guard = 0;
  while (cells.size < target && guard++ < 2000) {
    const options = DIRS.map((d) => ({ x: cx + d.dx, y: cy + d.dy })).filter(
      (c) => c.x >= 0 && c.y >= 0 && c.x < GRID && c.y < GRID,
    );
    const pick = options[Math.floor(Math.random() * options.length)]!;
    cx = pick.x;
    cy = pick.y;
    if (!cells.has(key(cx, cy))) cells.set(key(cx, cy), { x: cx, y: cy });
    // occasionally jump back to an existing room to branch out
    if (Math.random() < 0.25) {
      const all = [...cells.values()];
      const back = all[Math.floor(Math.random() * all.length)]!;
      cx = back.x;
      cy = back.y;
    }
  }

  const rooms: Record<string, Room> = {};
  for (const c of cells.values()) {
    const doors: Door[] = DIRS.filter((d) => cells.has(key(c.x + d.dx, c.y + d.dy))).map((d) => ({
      direction: d.dir,
      locked: false,
    }));
    rooms[key(c.x, c.y)] = {
      id: key(c.x, c.y),
      gridX: c.x,
      gridY: c.y,
      type: "NORMAL",
      state: "UNVISITED",
      tiles: emptyTiles(),
      enemies: [],
      doors,
      rewardTaken: false,
      layout: "STANDARD",
      pillars: {},
    };
  }

  const startId = key(2, 2);
  rooms[startId]!.type = "SPAWN";
  rooms[startId]!.state = "CLEARED";

  // boss = farthest manhattan distance from spawn
  let bossId = startId;
  let best = -1;
  for (const r of Object.values(rooms)) {
    const d = Math.abs(r.gridX - 2) + Math.abs(r.gridY - 2);
    if (d > best) {
      best = d;
      bossId = r.id;
    }
  }
  rooms[bossId]!.type = "BOSS";

  // dead-end branches become shop / reward
  const deadEnds = Object.values(rooms).filter(
    (r) => r.doors.length === 1 && r.id !== startId && r.id !== bossId,
  );
  if (deadEnds[0]) deadEnds[0].type = "SHOP";
  if (deadEnds[1]) deadEnds[1].type = "REWARD";
  /* Sala de Forja: semi-rara (nem todo andar tem) */
  if (deadEnds[2] && Math.random() < 0.55) deadEnds[2].type = "FORGE";
  else if (deadEnds[1] && Math.random() < 0.2) deadEnds[1].type = "FORGE";

  for (const r of Object.values(rooms)) {
    r.layout = pickLayout(r.type);
    applyLayout(r);
    decorate(r.tiles, r.type);
    paintRhythmFloors(r.tiles, r.type);
    carveDoors(r);
    if (r.type !== "SPAWN" && r.type !== "SHOP" && r.type !== "FORGE")
      r.enemies = spawnEnemies(r, level);
  }

  return { level, rooms, startId, bossId };
}

let uid = 0;
function makeEnemy(defId: string, x: number, y: number, level: number, boss = false): Enemy {
  const def = getDef(defId);
  const hp = scaledHp(def.hpBase, level);
  return {
    uid: `e${uid++}`,
    defId: def.id,
    x,
    y,
    hp,
    maxHp: hp,
    damage: scaledDamage(def.damageBase, level),
    speed: def.speed * 26,
    behavior: def.behavior,
    color: def.color,
    size: boss
      ? 64
      : def.id === "infected_speaker"
        ? 42
        : def.id === "bass_dropper" || def.id === "bass_dropper_quake"
          ? 36
          : def.variant
            ? 30
            : 26,
    cooldown: def.fireRate ?? 1.6,
    spawnT: 0.5,
    hitFlash: 0,
    spikeT: 0,
    stun: 0,
    steps: 0,
    lock: null,
    vamp: 0,
    spawned: 0,
    dashT: 0,
    dvx: 0,
    dvy: 0,
  };
}

export function spawnEnemies(room: Room, level: number): Enemy[] {
  const spots: { x: number; y: number }[] = [];
  for (let y = 2; y < ROOM_H - 2; y++)
    for (let x = 2; x < ROOM_W - 2; x++)
      if (room.tiles[y]![x] === T.FLOOR) spots.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });

  if (room.type === "BOSS") {
    const boss = makeEnemy(
      "boss_synth_lord",
      (ROOM_W * TILE) / 2,
      (ROOM_H * TILE) / 2 - 40,
      level,
      true,
    );
    return [boss];
  }

  const n = Math.min(enemyCount(level), spots.length, MAX_ENEMIES_PER_ROOM - 1);
  const out: Enemy[] = [];

  /* Caixa de Som Infectada: estrutura que invoca inimigos ate ser destruida */
  if (room.type === "NORMAL" && Math.random() < 0.3 && spots.length) {
    const s = spots.splice(Math.floor(Math.random() * spots.length), 1)[0]!;
    out.push(makeEnemy("infected_speaker", s.x, s.y, level));
  }

  for (let i = 0; i < n; i++) {
    if (!spots.length) break;
    const s = spots.splice(Math.floor(Math.random() * spots.length), 1)[0]!;
    const id = rollEnemyId(level);
    out.push(makeEnemy(id, s.x, s.y, level));
  }
  return out;
}
