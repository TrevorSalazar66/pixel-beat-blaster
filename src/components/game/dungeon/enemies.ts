export type Behavior =
  | "RUSH_PLAYER"
  | "SHOOT_AT_PLAYER_PERIODIC"
  | "FLY_IGNORES_CHASMS"
  | "BOSS_PATTERN_WAVES_AND_PROJECTILES";

export type EnemyDef = {
  id: string;
  name: string;
  hpBase: number;
  damageBase: number;
  speed: number;
  behavior: Behavior;
  fireRate?: number;
  color: string;
};

export const ENEMY_DEFS: EnemyDef[] = [
  {
    id: "chaser_neon",
    name: "Perseguidor Neon",
    hpBase: 15,
    damageBase: 1,
    speed: 2.2,
    behavior: "RUSH_PLAYER",
    color: "#ff0055",
  },
  {
    id: "turret_pixel",
    name: "Torre Atiradora",
    hpBase: 20,
    damageBase: 1,
    speed: 0,
    behavior: "SHOOT_AT_PLAYER_PERIODIC",
    fireRate: 2.0,
    color: "#00ffcc",
  },
  {
    id: "floater_glitch",
    name: "Glitch Flutuante",
    hpBase: 10,
    damageBase: 1,
    speed: 1.8,
    behavior: "FLY_IGNORES_CHASMS",
    color: "#ffff00",
  },
  {
    id: "boss_synth_lord",
    name: "O Maestro Subwoofer",
    hpBase: 150,
    damageBase: 2,
    speed: 1.0,
    behavior: "BOSS_PATTERN_WAVES_AND_PROJECTILES",
    color: "#aa00ff",
  },
];

export const getDef = (id: string) => ENEMY_DEFS.find((e) => e.id === id) ?? ENEMY_DEFS[0]!;

/** Infinite difficulty scaling */
export const scaledHp = (base: number, floor: number) => Math.round(base * (1 + (floor - 1) * 0.25));
export const scaledDamage = (base: number, floor: number) => base + Math.floor((floor - 1) / 3);
export const enemyCount = (floor: number) => Math.min(3 + floor, 10);

export type Enemy = {
  uid: string;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  behavior: Behavior;
  color: string;
  size: number;
  cooldown: number;
  spawnT: number;
  hitFlash: number;
  spikeT: number;
};
