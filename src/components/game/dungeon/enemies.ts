export type Behavior =
  | "RUSH_PLAYER"
  | "SHOOT_AT_PLAYER_PERIODIC"
  | "FLY_IGNORES_CHASMS"
  | "BOSS_PATTERN_WAVES_AND_PROJECTILES"
  | "BOSS_BOUNCING_DIVIDER"
  | "BOSS_TRIANGLE_SPIRAL"
  | "SIREN_SPEED_AURA"
  | "BASS_DROP_SHOCKWAVE"
  | "LASER_SNIPER_LOCK"
  | "INFECTED_SPEAKER_SPAWNER"
  | "PENTAGON_SPECIAL_ASSAULT"
  | "VARIANT_CHASER_BURST"
  | "VARIANT_TURRET_SPREAD"
  | "VARIANT_FLOATER_HOMING";

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
    id: "variant_chaser",
    name: "Perseguidor Frenético",
    hpBase: 18,
    damageBase: 1,
    speed: 2.7,
    behavior: "VARIANT_CHASER_BURST",
    color: "#ff5500",
  },
  {
    id: "turret_pixel",
    name: "Torre Atiradora",
    hpBase: 20,
    damageBase: 1,
    speed: 0,
    behavior: "SHOOT_AT_PLAYER_PERIODIC",
    fireRate: 2.2,
    color: "#00ffcc",
  },
  {
    id: "variant_turret",
    name: "Torre Multidirecional",
    hpBase: 26,
    damageBase: 1,
    speed: 0,
    behavior: "VARIANT_TURRET_SPREAD",
    fireRate: 2.5,
    color: "#00ccff",
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
    id: "variant_floater",
    name: "Glitch Teleguiado",
    hpBase: 14,
    damageBase: 1,
    speed: 1.6,
    behavior: "VARIANT_FLOATER_HOMING",
    fireRate: 3.0,
    color: "#e6ff00",
  },
  {
    id: "boss_synth_lord",
    name: "O Maestro Subwoofer",
    hpBase: 180,
    damageBase: 2,
    speed: 1.2,
    behavior: "BOSS_PATTERN_WAVES_AND_PROJECTILES",
    color: "#aa00ff",
  },
  {
    id: "boss_bouncing_orb",
    name: "Bouncing Core / Núcleo Divisor",
    hpBase: 160,
    damageBase: 2,
    speed: 2.8,
    behavior: "BOSS_BOUNCING_DIVIDER",
    color: "#ff0077",
  },
  {
    id: "boss_triangle_spiral",
    name: "Trigon / Espiral Vórtice",
    hpBase: 170,
    damageBase: 2,
    speed: 0.9,
    behavior: "BOSS_TRIANGLE_SPIRAL",
    fireRate: 0.25,
    color: "#00ffea",
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
  {
    id: "pentagon_overlord",
    name: "Pentágono Dimensional",
    hpBase: 45,
    damageBase: 2,
    speed: 1.1,
    behavior: "PENTAGON_SPECIAL_ASSAULT",
    fireRate: 1.8,
    color: "#ff00ea",
  },
];

/** Inimigos que aparecem no sorteio normal das salas (incluindo variantes). */
export const COMMON_ENEMY_IDS = [
  "chaser_neon",
  "variant_chaser",
  "turret_pixel",
  "variant_turret",
  "floater_glitch",
  "variant_floater",
  "siren_support",
  "bass_dropper",
  "laser_sniper",
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
  /** paralisia restante em segundos (Stun Snare) */
  stun: number;
  /** passos do sequenciador acumulados (sniper / spawner) */
  steps: number;
  /** mira laser travada no jogador */
  lock: { x: number; y: number } | null;
  /** janela de efeito do Vamp Bass */
  vamp: number;
  /** Velocidade vetorial extra para bosses saltitantes ou projéteis */
  vx?: number;
  vy?: number;
  splitStage?: number;
  angle?: number;
};

