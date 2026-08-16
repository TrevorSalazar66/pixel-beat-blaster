export type Behavior =
  | "RUSH_PLAYER"
  | "SHOOT_AT_PLAYER_PERIODIC"
  | "FLY_IGNORES_CHASMS"
  | "BOSS_PATTERN_WAVES_AND_PROJECTILES"
  | "SIREN_SPEED_AURA"
  | "BASS_DROP_SHOCKWAVE"
  | "LASER_SNIPER_LOCK"
  | "INFECTED_SPEAKER_SPAWNER"
  /* variantes */
  | "DASH_CHARGE"
  | "SHOOT_SPREAD_BURST"
  | "FLY_TELEPORT_BLINK"
  | "SIREN_HEALER"
  | "BASS_QUAKE_DOUBLE"
  /* bosses alternativos */
  | "BOSS_BOUNCE_SPLIT"
  | "BOSS_TRI_SPIRAL"
  /* emboscada pos-sala */
  | "PENTAGON_AMBUSH";

/** Forma desenhada do inimigo. */
export type EnemyShape = "square" | "circle" | "triangle" | "pentagon";

export type EnemyDef = {
  id: string;
  name: string;
  hpBase: number;
  damageBase: number;
  speed: number;
  behavior: Behavior;
  fireRate?: number;
  color: string;
  /** inimigo variante (elite) */
  variant?: boolean;
  shape?: EnemyShape;
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
    hpBase: 210,
    damageBase: 3,
    speed: 1.25,
    behavior: "BOSS_PATTERN_WAVES_AND_PROJECTILES",
    color: "#aa00ff",
  },
  {
    id: "siren_support",
    name: "Siren",
    hpBase: 14,
    damageBase: 1,
    speed: 1.4,
    behavior: "SIREN_SPEED_AURA",
    color: "#ff8ad8",
  },
  {
    id: "bass_dropper",
    name: "Bass-Dropper",
    hpBase: 34,
    damageBase: 2,
    speed: 0.8,
    behavior: "BASS_DROP_SHOCKWAVE",
    fireRate: 2.6,
    color: "#ff6a00",
  },
  {
    id: "laser_sniper",
    name: "Laser-Sniper",
    hpBase: 16,
    damageBase: 2,
    speed: 0,
    behavior: "LASER_SNIPER_LOCK",
    color: "#ff2e5b",
  },
  {
    id: "infected_speaker",
    name: "Caixa de Som Infectada",
    hpBase: 40,
    damageBase: 1,
    speed: 0,
    behavior: "INFECTED_SPEAKER_SPAWNER",
    color: "#3dff9e",
  },
  /* ---------- variantes (elites) ---------- */
  {
    id: "chaser_neon_elite",
    name: "Perseguidor Distorcido",
    hpBase: 22,
    damageBase: 2,
    speed: 2.0,
    behavior: "DASH_CHARGE",
    fireRate: 2.2,
    color: "#ff3ad0",
    variant: true,
  },
  {
    id: "turret_pixel_burst",
    name: "Torre Tripla",
    hpBase: 26,
    damageBase: 1,
    speed: 0,
    behavior: "SHOOT_SPREAD_BURST",
    fireRate: 2.4,
    color: "#00e0ff",
    variant: true,
  },
  {
    id: "floater_glitch_blink",
    name: "Glitch Teleporte",
    hpBase: 14,
    damageBase: 1,
    speed: 1.6,
    behavior: "FLY_TELEPORT_BLINK",
    fireRate: 2.8,
    color: "#eaff00",
    variant: true,
  },
  {
    id: "siren_healer",
    name: "Siren Curandeira",
    hpBase: 20,
    damageBase: 1,
    speed: 1.5,
    behavior: "SIREN_HEALER",
    fireRate: 3.0,
    color: "#ff5fa8",
    variant: true,
  },
  {
    id: "bass_dropper_quake",
    name: "Bass-Quake",
    hpBase: 46,
    damageBase: 2,
    speed: 0.9,
    behavior: "BASS_QUAKE_DOUBLE",
    fireRate: 3.2,
    color: "#ff9500",
    variant: true,
  },
];

/** Inimigos que aparecem no sorteio normal das salas. */
export const COMMON_ENEMY_IDS = [
  "chaser_neon",
  "turret_pixel",
  "floater_glitch",
  "siren_support",
  "bass_dropper",
  "laser_sniper",
];

/** Variantes elite: sorteadas com chance menor conforme o andar. */
export const VARIANT_ENEMY_IDS = [
  "chaser_neon_elite",
  "turret_pixel_burst",
  "floater_glitch_blink",
  "siren_healer",
  "bass_dropper_quake",
];

/** Chance de um slot de inimigo virar variante elite. */
export const variantChance = (floor: number) => Math.min(0.4, 0.08 + (floor - 1) * 0.05);

/** Sorteia um id de inimigo comum ou variante. */
export const rollEnemyId = (floor: number) =>
  Math.random() < variantChance(floor)
    ? VARIANT_ENEMY_IDS[Math.floor(Math.random() * VARIANT_ENEMY_IDS.length)]!
    : COMMON_ENEMY_IDS[Math.floor(Math.random() * COMMON_ENEMY_IDS.length)]!;

export const getDef = (id: string) => ENEMY_DEFS.find((e) => e.id === id) ?? ENEMY_DEFS[0]!;

/** Infinite difficulty scaling */
export const scaledHp = (base: number, floor: number) =>
  Math.round(base * (1 + (floor - 1) * 0.25));
export const scaledDamage = (base: number, floor: number) => base + Math.floor((floor - 1) / 3);
/** Limite duro de inimigos vivos por sala. */
export const MAX_ENEMIES_PER_ROOM = 12;
/** Limite de inimigos simultaneos que um spawner mantem em campo. */
export const SPAWNER_ACTIVE_LIMIT = 6;
/** Total que cada Caixa de Som Infectada pode invocar. */
export const SPAWNER_BUDGET = 8;

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
  /** paralisia restante em segundos (Stun Snare) */
  stun: number;
  /** passos do sequenciador acumulados (sniper / spawner) */
  steps: number;
  /** mira laser travada no jogador */
  lock: { x: number; y: number } | null;
  /** janela de efeito do Vamp Bass */
  vamp: number;
  /** quantos inimigos esta estrutura ja invocou (limite de spawner) */
  spawned?: number;
  /** investida ativa (DASH_CHARGE): tempo restante */
  dashT?: number;
  dvx?: number;
  dvy?: number;
};
