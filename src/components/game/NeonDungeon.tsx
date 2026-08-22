import { useCallback, useEffect, useRef, useState } from "react";
import { getAudio, playDeath, playTrack, setMasterVolume, type TrackId } from "@/lib/chiptune";
import { TouchControls } from "./mobile/TouchControls";
import { MobileHUD } from "./mobile/MobileHUD";
import { SettingsModal } from "./mobile/SettingsModal";
import { DeviceModal } from "./mobile/DeviceModal";
import { createTouchInput } from "./mobile/types";
import { detectDevice, useGameSettings, useOrientation } from "@/hooks/useMobileControls";
import { useHudLayout } from "@/hooks/useHudLayout";
import { Sequencer } from "./Sequencer";
import { SequencerEditor } from "./SequencerEditor";
import { HUD } from "./HUD";
import { STEPS, TRACKS, countNotes, createPattern, type Pattern, type Variant } from "./tracks";
import { PILLAR_HP, ROOM_H, ROOM_W, TILE, TILE_PROPS, T } from "./dungeon/tiles";
import {
  dirDelta,
  generateFloor,
  key,
  makeEnemy,
  opposite,
  type Dir,
  type Floor,
  type Room,
} from "./dungeon/generate";
import { rollBlock } from "./dungeon/drops";
import {
  AMBUSH_CHANCE,
  MAX_ENEMIES_PER_ROOM,
  SPAWNER_ACTIVE_LIMIT,
  SPAWNER_BUDGET,
  getDef,
  rollEnemyId,
  scaledDamage,
  scaledHp,
  type Enemy,
} from "./dungeon/enemies";
import {
  FORGE_INPUT,
  FORGE_VARIANT_CHANCE,
  SHOP_ITEMS,
  forgeFee,
  itemCost,
  type ShopItemId,
} from "./dungeon/shop";
import { ForgeModal } from "./ForgeModal";

const W = ROOM_W * TILE;
const H = ROOM_H * TILE;
const SIZE = 28;
const SPEED = 190;
const START_HP = 3;

/** Traca um poligono regular centrado em (x,y) com raio r. */
function polyPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  sides: number,
  rot = 0,
) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI * 2) / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Estrela de N pontas (raio externo r, interno r*inner). */
function starPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  points = 5,
  inner = 0.45,
  rot = 0,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = rot - Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Desenha (fill ou stroke) a forma pedida no tamanho dado. */
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: string | undefined,
  x: number,
  y: number,
  r: number,
  rot: number,
  mode: "fill" | "stroke" = "fill",
) {
  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case "triangle":
      polyPath(ctx, x, y, r * 1.15, 3, rot);
      break;
    case "pentagon":
      polyPath(ctx, x, y, r * 1.1, 5, rot);
      break;
    case "diamond":
      polyPath(ctx, x, y, r * 1.2, 4, rot + Math.PI / 4);
      break;
    case "star":
      starPath(ctx, x, y, r * 1.3, 5, 0.45, rot);
      break;
    default:
      if (mode === "fill") ctx.fillRect(x - r, y - r, r * 2, r * 2);
      else ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      return;
  }
  if (mode === "fill") ctx.fill();
  else ctx.stroke();
}


type Vec = { x: number; y: number };
type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
  dmg: number;
  hostile: boolean;
  pierce: boolean;
  hit?: Set<string>;
  /** empurra o inimigo atingido (px) */
  knock?: number;
  /** explode em area ao impactar */
  explode?: boolean;
  /** persegue o inimigo mais proximo */
  homing?: number;
  /** skin do projetil por variacao do bloco */
  shape?: "square" | "circle" | "triangle" | "diamond" | "star";
  /** ricochetes restantes nas paredes */
  bounce?: number;
  /** explode sozinho ao fim da vida (bombas) */
  fuse?: boolean;
  /** raio/dano da explosao */
  boomR?: number;
};
type Blast = {
  x: number;
  y: number;
  t: number;
  hit: Set<string>;
  hostile?: boolean;
  dmg?: number;
  speed?: number;
  maxT?: number;
  color?: string;
  stun?: number;
};
/** Poca de som: dano continuo em area (Synth base). */
type Pool = {
  x: number;
  y: number;
  r: number;
  t: number;
  life: number;
  dmg: number;
  tick: number;
  /** empurra inimigos com 30% de chance por tique (SYNTH) */
  push?: number;
};
/** Feixe laser continuo (Beam Synth). */
type Beam = { x: number; y: number; a: number; t: number; life: number; dmg: number; tick: number };
type Pickup = { x: number; y: number; kind: "block" | "coin"; track?: TrackId; color: string };
type Pedestal = { x: number; y: number; item: ShopItemId; sold: boolean };

const emptyInv = (): Record<TrackId, number> => ({ kick: 0, snare: 0, hat: 0, synth: 0 });
const emptyVarInv = (): Record<TrackId, [number, number]> => ({
  kick: [0, 0],
  snare: [0, 0],
  hat: [0, 0],
  synth: [0, 0],
});

export function NeonDungeon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pattern, setPattern] = useState<Pattern>(createPattern);
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(true);
  const [bpmMod, setBpmMod] = useState(0);
  const [paused, setPaused] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inventory, setInventory] = useState<Record<TrackId, number>>(emptyInv);
  const [rareInventory, setRareInventory] = useState<Record<TrackId, number>>(emptyInv);
  /** blocos de variacao A/B: obtidos apenas na Forja */
  const [varInventory, setVarInventory] = useState<Record<TrackId, [number, number]>>(emptyVarInv);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeMsg, setForgeMsg] = useState<string | null>(null);
  const [coins, setCoins] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [maxHp, setMaxHp] = useState(START_HP);
  const [hp, setHp] = useState(START_HP);
  const [kills, setKills] = useState(0);
  const [floor, setFloor] = useState<Floor>(() => generateFloor(1));
  const [roomId, setRoomId] = useState<string>(() => key(2, 2));
  const [roomState, setRoomState] = useState<Room["state"]>("CLEARED");
  const [dead, setDead] = useState(false);
  const [transition, setTransition] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ---------- mobile / touch (Módulo 4) ---------- */
  const [touchMode, setTouchMode] = useState<boolean | null>(null);
  const [askDevice, setAskDevice] = useState(false);
  const orientation = useOrientation();
  const { settings, update: updateSettings } = useGameSettings();
  const hudLayout = useHudLayout(orientation);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hudEditing, setHudEditing] = useState(false);
  const touchInput = useRef(createTouchInput());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const touchRef = useRef(false);
  touchRef.current = touchMode === true;
  const fireCd = useRef(0);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm + bpmMod;
  const maxHpRef = useRef(START_HP);
  const bpmModRef = useRef(0);
  bpmModRef.current = bpmMod;

  useEffect(() => {
    const d = detectDevice();
    if (d === "AMBIGUOUS") setAskDevice(true);
    else setTouchMode(d === "TOUCH");
  }, []);

  useEffect(() => {
    if (mounted) setMasterVolume(settings.volume);
  }, [settings.volume, mounted]);

  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const floorRef = useRef(floor);
  floorRef.current = floor;
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const coinsRef = useRef(coins);
  maxHpRef.current = maxHp;
  coinsRef.current = coins;
  const invRef = useRef(inventory);
  invRef.current = inventory;
  const deadRef = useRef(dead);
  deadRef.current = dead;
  const frozenRef = useRef(false);
  frozenRef.current =
    paused || editorOpen || dead || settingsOpen || hudEditing || forgeOpen || transition !== null;

  const keys = useRef<Record<string, boolean>>({});
  const player = useRef<Vec>({ x: W / 2, y: H / 2 });
  const aimAngle = useRef(0);
  const aimVel = useRef(0);
  const mouse = useRef<Vec>({ x: W / 2 + 60, y: H / 2 });
  const shots = useRef<Shot[]>([]);
  const blasts = useRef<Blast[]>([]);
  const pickups = useRef<Pickup[]>([]);
  const pedestals = useRef<Record<string, Pedestal[]>>({});
  const pools = useRef<Pool[]>([]);
  const beams = useRef<Beam[]>([]);
  const dash = useRef({ x: 0, y: 0, t: 0 });
  const lastMove = useRef({ x: 0, y: 0 });
  const vamp = useRef(0);
  const shield = useRef(0);
  const pulse = useRef(0);
  const invuln = useRef(0);
  const spikeT = useRef(0);
  const glitch = useRef(0);
  const forgeNear = useRef(false);

  const room = () => floorRef.current.rooms[roomIdRef.current]!;

  /* ---------- editor actions ---------- */
  /** Move blocos entre as mochilas (normal / raro / variacao A-B). */
  const giveBlock = useCallback((track: TrackId, rare: boolean, variant: Variant, d: number) => {
    if (rare) {
      setRareInventory((inv) => ({ ...inv, [track]: Math.max(0, (inv[track] ?? 0) + d) }));
    } else if (variant === 0) {
      setInventory((inv) => ({ ...inv, [track]: Math.max(0, (inv[track] ?? 0) + d) }));
    } else {
      setVarInventory((inv) => {
        const cur = inv[track] ?? [0, 0];
        const a = cur[0] ?? 0;
        const bq = cur[1] ?? 0;
        const next: [number, number] =
          variant === 1 ? [Math.max(0, a + d), bq] : [a, Math.max(0, bq + d)];
        return { ...inv, [track]: next };
      });
    }
  }, []);

  const placeBlock = useCallback(
    (t: number, s: number, block: { track: TrackId; rare: boolean; variant: Variant }) => {
      const prev = patternRef.current[t]?.[s] ?? null;
      giveBlock(block.track, block.rare, block.variant, -1);
      if (prev) giveBlock(TRACKS[t]!.id, prev.rare, prev.variant, 1);
      setPattern((p) =>
        p.map((row, i) =>
          i === t
            ? row.map((c, j) => (j === s ? { rare: block.rare, variant: block.variant } : c))
            : row,
        ),
      );
    },
    [giveBlock],
  );

  const removeBlock = useCallback(
    (t: number, s: number) => {
      const prev = patternRef.current[t]?.[s] ?? null;
      if (!prev) return;
      giveBlock(TRACKS[t]!.id, prev.rare, prev.variant, 1);
      setPattern((p) =>
        p.map((row, i) => (i === t ? row.map((c, j) => (j === s ? null : c)) : row)),
      );
    },
    [giveBlock],
  );

  /* ---------- forja: unica fonte de blocos de variacao ---------- */
  const forge = useCallback(
    (track: TrackId) => {
      const level = floorRef.current.level;
      const fee = forgeFee(level);
      if (coinsRef.current < fee || (invRef.current[track] ?? 0) < FORGE_INPUT) {
        setForgeMsg("Blocos ou notas insuficientes.");
        return;
      }
      setCoins((c) => c - fee);
      setInventory((inv) => ({
        ...inv,
        [track]: Math.max(0, (inv[track] ?? 0) - FORGE_INPUT),
      }));
      const roll = Math.random();
      const variant: Variant =
        roll < FORGE_VARIANT_CHANCE ? 1 : roll < FORGE_VARIANT_CHANCE * 2 ? 2 : 0;
      giveBlock(track, false, variant, 1);
      setForgeMsg(
        variant === 0
          ? "A fusão colapsou num bloco normal."
          : `Forjado: variação ${variant === 1 ? "A" : "B"}!`,
      );
      playTrack(track);
    },
    [giveBlock],
  );

  /* ---------- helpers ---------- */
  const tileAt = (r: Room, px: number, py: number) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return T.WALL as number;
    return r.tiles[ty]![tx]!;
  };

  const solidFor = (r: Room, px: number, py: number, flying = false) => {
    const id = tileAt(r, px, py);
    if (id === T.DOOR) return r.doors.some((d) => d.locked);
    if (id === T.CHASM) return !flying;
    return TILE_PROPS[id]?.solid ?? true;
  };

  const blocksShot = (r: Room, px: number, py: number) => {
    const id = tileAt(r, px, py);
    if (id === T.DOOR) return r.doors.some((d) => d.locked);
    return TILE_PROPS[id]?.blocksShots ?? true;
  };

  const bump = () => setFloor((f) => ({ ...f }));

  /** Tile onde um inimigo ou item pode existir (portas/portais nao contam). */
  const passableForEnemy = (r: Room, px: number, py: number, flying: boolean) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 1 || ty < 1 || tx > ROOM_W - 2 || ty > ROOM_H - 2) return false;
    const id = r.tiles[ty]![tx]!;
    if (id === T.DOOR || id === T.PORTAL) return false;
    if (id === T.CHASM) return flying;
    return !(TILE_PROPS[id]?.solid ?? true);
  };

  /** Colisao do inimigo considerando o corpo inteiro: nunca sai da sala. */
  const enemyBlocked = (r: Room, px: number, py: number, flying: boolean, size: number) => {
    const h = Math.max(6, size / 2 - 4);
    return (
      !passableForEnemy(r, px - h, py - h, flying) ||
      !passableForEnemy(r, px + h, py - h, flying) ||
      !passableForEnemy(r, px - h, py + h, flying) ||
      !passableForEnemy(r, px + h, py + h, flying)
    );
  };

  /** Mantem o inimigo dentro dos limites internos da sala. */
  const clampToRoom = (e: { x: number; y: number; size: number }) => {
    const h = e.size / 2;
    e.x = Math.min(Math.max(e.x, TILE + h), W - TILE - h);
    e.y = Math.min(Math.max(e.y, TILE + h), H - TILE - h);
  };

  /** Linha de visao: inimigos so atiram se houver caminho livre. */
  const hasLineOfSight = (r: Room, ax: number, ay: number, bx: number, by: number) => {
    const d = Math.hypot(bx - ax, by - ay) || 1;
    for (let t = 16; t < d; t += 14) {
      if (blocksShot(r, ax + ((bx - ax) / d) * t, ay + ((by - ay) / d) * t)) return false;
    }
    return true;
  };

  /** Procura o piso acessivel mais proximo para nao dropar item em buraco/parede. */
  const safeDropSpot = (r: Room, px: number, py: number) => {
    const isOk = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 1 || ty < 1 || tx > ROOM_W - 2 || ty > ROOM_H - 2) return false;
      const id = r.tiles[ty]![tx]!;
      if (id === T.CHASM || id === T.SPIKE || id === T.DOOR || id === T.PORTAL) return false;
      return !(TILE_PROPS[id]?.solid ?? true);
    };
    if (isOk(px, py)) return { x: px, y: py };
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (let ring = 1; ring < Math.max(ROOM_W, ROOM_H); ring++) {
      for (let oy = -ring; oy <= ring; oy++) {
        for (let ox = -ring; ox <= ring; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
          const cx = (tx + ox) * TILE + TILE / 2;
          const cy = (ty + oy) * TILE + TILE / 2;
          if (isOk(cx, cy)) return { x: cx, y: cy };
        }
      }
    }
    return { x: W / 2, y: H / 2 };
  };

  /** Pilares destrutiveis absorvem dano ate serem destruidos. */
  const hitPillar = (r: Room, px: number, py: number, dmg: number) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (r.tiles[ty]?.[tx] !== T.PILLAR) return false;
    const k = `${tx},${ty}`;
    const left = (r.pillars[k] ?? PILLAR_HP) - dmg;
    if (left <= 0) {
      delete r.pillars[k];
      r.tiles[ty]![tx] = T.FLOOR;
    } else r.pillars[k] = left;
    return true;
  };

  const damagePlayer = useCallback((amount: number) => {
    if (invuln.current > 0 || deadRef.current) return;
    invuln.current = 1;
    setHp((h) => {
      const n = Math.max(0, h - amount);
      if (n === 0) {
        setDead(true);
        deadRef.current = true;
        glitch.current = 1;
        playDeath();
      }
      return n;
    });
  }, []);

  const clearRoom = useCallback((r: Room) => {
    r.state = "CLEARED";
    r.doors.forEach((d) => (d.locked = false));
    const n = r.type === "BOSS" ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const track = rollBlock();
      const t = TRACKS.find((x) => x.id === track)!;
      const spot = safeDropSpot(r, W / 2 + (i - (n - 1) / 2) * 46, H / 2);
      pickups.current.push({
        x: spot.x,
        y: spot.y,
        kind: "block",
        track,
        color: t.color,
      });
    }
    if (r.type === "BOSS") {
      r.tiles[Math.floor(ROOM_H / 2)]![Math.floor(ROOM_W / 2)] = T.PORTAL;
    }
    setRoomState("CLEARED");
    bump();
  }, []);

  const ensurePedestals = useCallback((r: Room) => {
    if (r.type !== "SHOP" || pedestals.current[r.id]) return;
    const items: ShopItemId[] = [...SHOP_ITEMS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((i) => i.id);
    pedestals.current[r.id] = items.map((item, i) => ({
      x: W / 2 + (i - 1) * 130,
      y: H / 2 + 40,
      item,
      sold: false,
    }));
  }, []);

  const enterRoom = useCallback(
    (r: Room) => {
      ensurePedestals(r);
      if (r.state === "UNVISITED") {
        if (r.enemies.length > 0) {
          r.state = "COMBAT";
          r.doors.forEach((d) => (d.locked = true));
          setRoomState("COMBAT");
        } else {
          clearRoom(r);
        }
      } else {
        setRoomState(r.state);
      }
      bump();
    },
    [clearRoom, ensurePedestals],
  );

  const goToFloor = useCallback((level: number) => {
    setTransition(`Carregando Andar B${level}...`);
    const f = generateFloor(level);
    floorRef.current = f;
    setFloor(f);
    setRoomId(f.startId);
    roomIdRef.current = f.startId;
    setRoomState("CLEARED");
    player.current = { x: W / 2, y: H / 2 };
    shots.current = [];
    blasts.current = [];
    pools.current = [];
    beams.current = [];
    pickups.current = [];
    pedestals.current = {};
    window.setTimeout(() => setTransition(null), 900);
  }, []);

  const restart = useCallback(() => {
    setInventory(emptyInv());
    setRareInventory(emptyInv());
    setVarInventory(emptyVarInv());
    setForgeOpen(false);
    setForgeMsg(null);
    setPattern(createPattern());
    setCoins(0);
    setKills(0);
    setBpm(120);
    setMaxHp(START_HP);
    setHp(START_HP);
    setDead(false);
    deadRef.current = false;
    glitch.current = 0;
    setPaused(false);
    setEditorOpen(false);
    goToFloor(1);
  }, [goToFloor]);

  /* ---- input ---- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (e.key.startsWith("Arrow") || [" ", "w", "a", "s", "d", "tab"].includes(k))
        e.preventDefault();
      if (deadRef.current) return;
      if (k === "tab" || k === " ") {
        const inCombat = floorRef.current.rooms[roomIdRef.current]?.state === "COMBAT";
        if (!inCombat) setEditorOpen((v) => !v);
      }
      if (k === "p" || k === "escape") setPaused((v) => !v);
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ---- shop purchase ---- */
  const buy = useCallback((p: Pedestal) => {
    const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
    const cost = itemCost(def, floorRef.current.level);
    if (p.sold || coinsRef.current < cost) return;
    p.sold = true;
    setCoins((c) => c - cost);
    if (def.id === "heal") setHp((h) => Math.min(h + 1, 99));
    if (def.id === "maxhp") {
      setMaxHp((m) => m + 1);
      setHp((h) => h + 1);
    }
    if (def.id === "bpm") setBpm((b) => b + 10);
    if (def.id === "rare") {
      const track = rollBlock();
      setRareInventory((inv) => ({ ...inv, [track]: (inv[track] ?? 0) + 1 }));
    }
    playTrack("synth");
  }, []);

  /* ---- sequencer actions: cada bloco dispara seu efeito a partir do personagem ---- */
  const fire = useCallback((trackIndex: number, rare: boolean, variant: Variant = 0) => {
    const track = TRACKS[trackIndex];
    if (!track || frozenRef.current) return;
    const cx = player.current.x;
    const cy = player.current.y;
    const a = aimAngle.current;
    const f = { x: Math.cos(a), y: Math.sin(a) };
    const r = room();

    /* Piso Amplificador: dobra tamanho e dano dos projeteis */
    const amp = tileAt(r, cx, cy) === T.AMPLIFIER;
    const dMul = (rare ? 1.35 : 1) * (amp ? 2 : 1);
    const sMul = amp ? 2 : 1;
    const stepDur = 60 / Math.max(30, bpmRef.current) / 4;

    const shoot = (opts: Partial<Shot> & { vx: number; vy: number }) => {
      shots.current.push({
        x: cx,
        y: cy,
        life: 2,
        color: rare ? "#ffffff" : track.color,
        r: 6 * sMul,
        dmg: 6 * dMul,
        hostile: false,
        pierce: rare,
        hit: new Set<string>(),
        ...opts,
      } as Shot);
    };

    if (track.id === "kick") {
      /* Acoes ofensivas diretas */
      if (variant === 1) {
        // Sub-Kick: disparo duplo rapido que ricocheteia nas paredes
        for (const off of [-0.07, 0.07])
          shoot({
            vx: Math.cos(a + off) * 420,
            vy: Math.sin(a + off) * 420,
            r: 5 * sMul,
            dmg: 5 * dMul,
            life: 2.2,
            shape: "diamond",
            bounce: 3,
            knock: Math.random() < 0.05 ? 6 : 0,
          });
      } else if (variant === 2) {
        // Explosive Kick: bomba lenta que explode em area media
        shoot({
          vx: f.x * 240,
          vy: f.y * 240,
          r: 10 * sMul,
          dmg: 7 * dMul,
          explode: true,
          fuse: true,
          life: 1.1,
          boomR: 360,
          shape: "circle",
          pierce: false,
        });
      } else {
        // Base: projetil pesado (5% de chance de um empurrao curto)
        shoot({
          vx: f.x * 300,
          vy: f.y * 300,
          r: 8 * sMul,
          dmg: 12 * dMul,
          shape: "square",
          knock: Math.random() < 0.05 ? 10 : 0,
        });
      }
      pulse.current = 1;
      return;
    }

    if (track.id === "hat") {
      /* Velocidade e projecao rapida */
      if (variant === 1) {
        // Dash Hat: impulso curto + rastro sonoro que fere quem tocar
        const mv = lastMove.current;
        const len = Math.hypot(mv.x, mv.y);
        const dx = len > 0.05 ? mv.x / len : f.x;
        const dy = len > 0.05 ? mv.y / len : f.y;
        dash.current = { x: dx, y: dy, t: 0.16 };
        invuln.current = Math.max(invuln.current, 0.16);
        pools.current.push({
          x: cx,
          y: cy,
          r: 34 * sMul,
          t: 0,
          life: 0.9,
          dmg: 2 * dMul,
          tick: 0,
        });
      } else if (variant === 2) {
        // Homing Hat: 2 triangulos teleguiados persistentes
        for (const off of [-0.25, 0.25])
          shoot({
            vx: Math.cos(a + off) * 460,
            vy: Math.sin(a + off) * 460,
            r: 4 * sMul,
            dmg: 3 * dMul,
            life: 3,
            homing: 9,
            shape: "triangle",
          });
      } else {
        // Base: leque triplo rapido
        for (const off of [-0.25, 0, 0.25])
          shoot({
            vx: Math.cos(a + off) * 720,
            vy: Math.sin(a + off) * 720,
            r: 3.5 * sMul,
            dmg: 2 * dMul,
            life: 1.2,
            shape: "square",
          });
      }
      return;
    }

    if (track.id === "snare") {
      /* Defensivo e controle de grupo */
      if (variant === 1) {
        // Shield Snare: 0.5s de invulnerabilidade + reflete tiros inimigos
        shield.current = Math.max(shield.current, 0.5);
        invuln.current = Math.max(invuln.current, 0.5);
        for (const sh of shots.current) {
          if (!sh.hostile) continue;
          if (Math.hypot(sh.x - cx, sh.y - cy) < 150) {
            sh.hostile = false;
            sh.vx *= -1;
            sh.vy *= -1;
            sh.color = "#2ec8ff";
            sh.shape = "star";
            sh.hit = new Set<string>();
          }
        }
        blasts.current.push({ x: cx, y: cy, t: 0, hit: new Set(), color: "#2ec8ff", dmg: 0 });
        return;
      }
      if (variant === 2) {
        // Stun Snare: paralisa em raio curto por 1.5s e anula bombas
        blasts.current.push({
          x: cx,
          y: cy,
          t: 0,
          hit: new Set(),
          color: "#8ad8ff",
          dmg: 1,
          speed: 150,
          maxT: 0.55,
          stun: 1.5,
        });
        shots.current = shots.current.filter(
          (sh) => !(sh.hostile && sh.fuse && Math.hypot(sh.x - cx, sh.y - cy) < 130),
        );
        for (const e of r.enemies) {
          if (Math.hypot(e.x - cx, e.y - cy) < 110) e.stun = Math.max(e.stun, 1.5);
        }
        return;
      }
      // Base: pulso de repulsao + anula projeteis inimigos proximos
      shield.current = Math.max(shield.current, 0.25);
      blasts.current.push({ x: cx, y: cy, t: 0, hit: new Set(), color: "#2ec8ff", dmg: 3 });
      shots.current = shots.current.filter(
        (sh) => !sh.hostile || Math.hypot(sh.x - cx, sh.y - cy) > 170,
      );
      for (const e of r.enemies) {
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 150) {
          const kx = e.x + (dx / d) * 46;
          const ky = e.y + (dy / d) * 46;
          if (!enemyBlocked(r, kx, e.y, true, e.size)) e.x = kx;
          if (!enemyBlocked(r, e.x, ky, true, e.size)) e.y = ky;
          clampToRoom(e);
        }
      }
      return;
    }

    /* synth / bass: area e modificadores */
    if (variant === 1) {
      // Beam Synth: dois feixes opostos que varrem a sala durante o step
      for (const off of [0, Math.PI])
        beams.current.push({
          x: cx,
          y: cy,
          a: a + off,
          t: 0,
          life: Math.max(0.14, stepDur * 1.4),
          dmg: 4 * dMul,
          tick: 0,
        });
      return;
    }
    if (variant === 2) {
      // Vamp Bass: janela de cura + estrelas de sucção lentas
      vamp.current = 2;
      for (const off of [-1, 1])
        shoot({
          vx: Math.cos(a + off * 0.9) * 180,
          vy: Math.sin(a + off * 0.9) * 180,
          r: 5 * sMul,
          dmg: 2 * dMul,
          life: 2.4,
          homing: 4,
          shape: "star",
          color: "#3dff9e",
        });
      pools.current.push({
        x: cx,
        y: cy,
        r: 70 * sMul,
        t: 0,
        life: 2,
        dmg: 1.5 * dMul,
        tick: 0,
        push: 34,
      });
      return;
    }
    // Base: poca de som no chao por 2s
    pools.current.push({
      x: cx + f.x * 40,
      y: cy + f.y * 40,
      r: 62 * sMul,
      t: 0,
      life: 2,
      dmg: 3 * dMul,
      tick: 0,
      push: 40,
    });
  }, []);

  /* ---- passo do sequenciador: inimigos ritmicos ---- */
  const handleStep = useCallback(() => {
    const r = room();
    if (frozenRef.current || r.state !== "COMBAT") return;
    const alive = r.enemies.filter(
      (e) => e.behavior !== "INFECTED_SPEAKER_SPAWNER" && e.hp > 0,
    ).length;
    let budget = Math.max(0, Math.min(MAX_ENEMIES_PER_ROOM, SPAWNER_ACTIVE_LIMIT) - alive);
    for (const e of [...r.enemies]) {
      if (e.spawnT > 0 || e.stun > 0) continue;
      e.steps += 1;
      if (e.behavior === "LASER_SNIPER_LOCK") {
        const see = hasLineOfSight(r, e.x, e.y, player.current.x, player.current.y);
        if (!see) {
          e.lock = null;
          e.steps = 0;
        } else if (e.steps % 8 === 0) {
          const target = e.lock ?? { x: player.current.x, y: player.current.y };
          const dx = target.x - e.x;
          const dy = target.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          shots.current.push({
            x: e.x,
            y: e.y,
            vx: (dx / d) * 900,
            vy: (dy / d) * 900,
            life: 1.4,
            color: "#ff2e5b",
            r: 4,
            dmg: e.damage,
            hostile: true,
            pierce: false,
          });
          e.lock = null;
        } else {
          e.lock = { x: player.current.x, y: player.current.y };
        }
      }
      if (e.behavior === "INFECTED_SPEAKER_SPAWNER" && e.steps % 8 === 0) {
        const spawned = e.spawned ?? 0;
        if (budget > 0 && spawned < SPAWNER_BUDGET && r.enemies.length < MAX_ENEMIES_PER_ROOM) {
          const def = getDef(rollEnemyId(floorRef.current.level));
          const lvl = floorRef.current.level;
          const hp = scaledHp(def.hpBase, lvl);
          const ang = Math.random() * Math.PI * 2;
          const size =
            def.id === "bass_dropper" || def.id === "bass_dropper_quake"
              ? 36
              : def.variant
                ? 30
                : 26;
          const spot = safeDropSpot(r, e.x + Math.cos(ang) * 46, e.y + Math.sin(ang) * 46);
          budget -= 1;
          e.spawned = spawned + 1;
          r.enemies.push({
            uid: `s${Math.random().toString(36).slice(2, 9)}`,
            defId: def.id,
            x: spot.x,
            y: spot.y,
            hp,
            maxHp: hp,
            damage: scaledDamage(def.damageBase, lvl),
            speed: def.speed * 26,
            behavior: def.behavior,
            color: def.color,
            size,
            cooldown: def.fireRate ?? 1.6,
            spawnT: 0.5,
            hitFlash: 0,
            spikeT: 0,
            stun: 0,
            steps: 0,
            lock: null,
            vamp: 0,
            spawned: 0,
          });
        }
      }
    }
  }, []);

  /* ---- audio clock ---- */
  useEffect(() => {
    if (!running || paused || dead || transition) return;
    const ac = getAudio();
    const stepDur = 60 / (bpm + bpmMod) / 4 / settings.gameSpeed;
    let next = ac.currentTime + 0.1;
    let step = 0;
    let raf = 0;
    const timers: number[] = [];

    const tick = () => {
      while (next < ac.currentTime + 0.12) {
        const s = step % STEPS;
        const when = next;
        patternRef.current.forEach((row, t) => {
          const track = TRACKS[t];
          const cellA = row[s];
          if (cellA && track) playTrack(track.id, when, cellA.variant);
        });
        timers.push(
          window.setTimeout(
            () => {
              setCurrentStep(s);
              handleStep();
              patternRef.current.forEach((row, t) => {
                const cell = row[s];
                if (cell) fire(t, cell.rare, cell.variant);
              });
            },
            Math.max(0, (when - ac.currentTime) * 1000),
          ),
        );
        next += stepDur;
        step++;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      setCurrentStep(-1);
    };
  }, [running, fire, handleStep, bpm, bpmMod, paused, dead, transition, settings.gameSpeed]);

  /* ---- simulation + render ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const rawDt = Math.min((now - last) / 1000, 0.05) * settingsRef.current.gameSpeed;
      last = now;
      const frozen = frozenRef.current;
      const dt = frozen ? 0 : rawDt;
      const r = room();
      const touch = touchRef.current;
      const ti = touchInput.current;

      /* aim: mouse (desktop) or right analog stick (touch), with rotational inertia */
      {
        const target = touch
          ? ti.aimActive
            ? Math.atan2(ti.aim.y, ti.aim.x)
            : aimAngle.current
          : Math.atan2(mouse.current.y - player.current.y, mouse.current.x - player.current.x);
        let diff = target - aimAngle.current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        aimVel.current += diff * 110 * dt;
        aimVel.current *= Math.pow(0.02, dt);
        aimAngle.current += aimVel.current * dt;
      }

      /* continuous touch fire, cadenced by the active BPM */
      if (touch && ti.aimActive && !frozen) {
        fireCd.current -= dt;
        if (fireCd.current <= 0) {
          fireCd.current = 60 / bpmRef.current / 2;
          fire(2, false);
        }
      }

      /* movement */
      const k = keys.current;
      let dx = 0;
      let dy = 0;
      if (!frozen) {
        if (touch) {
          dx = ti.move.x;
          dy = ti.move.y;
        } else {
          if (k["a"] || k["arrowleft"]) dx -= 1;
          if (k["d"] || k["arrowright"]) dx += 1;
          if (k["w"] || k["arrowup"]) dy -= 1;
          if (k["s"] || k["arrowdown"]) dy += 1;
        }
      }
      if (dx || dy) {
        const l0 = Math.hypot(dx, dy);
        lastMove.current = { x: dx / l0, y: dy / l0 };
      }
      /* Dash Hat: impulso curto */
      if (dash.current.t > 0) {
        dash.current.t = Math.max(0, dash.current.t - rawDt);
        dx += dash.current.x * 3.2;
        dy += dash.current.y * 3.2;
      }
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const boost = Math.min(3.4, len);
        dx = (dx / len) * boost;
        dy = (dy / len) * boost;
        const half = SIZE / 2 - 3;
        const nx = player.current.x + dx * SPEED * dt;
        const ny = player.current.y + dy * SPEED * dt;
        if (
          !solidFor(r, nx + Math.sign(dx) * half, player.current.y + half * 0.6) &&
          !solidFor(r, nx + Math.sign(dx) * half, player.current.y - half * 0.6)
        )
          player.current.x = nx;
        if (
          !solidFor(r, player.current.x + half * 0.6, ny + Math.sign(dy) * half) &&
          !solidFor(r, player.current.x - half * 0.6, ny + Math.sign(dy) * half)
        )
          player.current.y = ny;
      }

      if (!frozen) {
        /* spikes */
        const under = tileAt(r, player.current.x, player.current.y);

        /* Plataformas de BPM: aceleram / desaceleram a musica */
        const targetMod = under === T.BPM_UP ? 20 : under === T.BPM_DOWN ? -20 : 0;
        if (targetMod !== bpmModRef.current) {
          bpmModRef.current = targetMod;
          setBpmMod(targetMod);
        }

        if (under === T.SPIKE) {
          spikeT.current += dt;
          if (spikeT.current >= 1.5) {
            spikeT.current = 0;
            damagePlayer(1);
          }
        } else spikeT.current = 0;

        /* portal */
        if (under === T.PORTAL) {
          goToFloor(floorRef.current.level + 1);
          raf = requestAnimationFrame(loop);
          return;
        }

        /* room transitions through doors */
        if (under === T.DOOR && !r.doors.some((d) => d.locked)) {
          let dir: Dir | null = null;
          if (player.current.y < TILE) dir = "NORTH";
          else if (player.current.y > H - TILE) dir = "SOUTH";
          else if (player.current.x < TILE) dir = "WEST";
          else if (player.current.x > W - TILE) dir = "EAST";
          if (dir) {
            const d = dirDelta(dir);
            const nid = key(r.gridX + d.dx, r.gridY + d.dy);
            const nextRoom = floorRef.current.rooms[nid];
            if (nextRoom) {
              roomIdRef.current = nid;
              setRoomId(nid);
              const back = opposite(dir);
              player.current = {
                x: back === "WEST" ? TILE * 1.6 : back === "EAST" ? W - TILE * 1.6 : W / 2,
                y: back === "NORTH" ? TILE * 1.6 : back === "SOUTH" ? H - TILE * 1.6 : H / 2,
              };
              shots.current = [];
              pools.current = [];
              beams.current = [];
              blasts.current = [];
              pickups.current = [];
              enterRoom(nextRoom);
              raf = requestAnimationFrame(loop);
              return;
            }
          }
        }
      }

      /* pickups */
      if (!frozen) {
        pickups.current = pickups.current.filter((p) => {
          if (Math.hypot(p.x - player.current.x, p.y - player.current.y) < 24) {
            if (p.kind === "coin") setCoins((c) => c + 1);
            else if (p.track) {
              const tr = p.track;
              setInventory((inv) => ({ ...inv, [tr]: (inv[tr] ?? 0) + 1 }));
              playTrack(tr);
            }
            return false;
          }
          return true;
        });
      }

      /* shop pedestals */
      const shopPeds = pedestals.current[r.id] ?? [];
      if (!frozen) {
        for (const p of shopPeds) {
          if (p.sold) continue;
          const near = Math.hypot(p.x - player.current.x, p.y - player.current.y) < 34;
          if (near) {
            const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
            if (coinsRef.current >= itemCost(def, floorRef.current.level)) buy(p);
          }
        }

        /* Forja: abre ao encostar no altar (semi-rara) */
        if (r.type === "FORGE") {
          const near2 = Math.hypot(player.current.x - W / 2, player.current.y - (H / 2 - 20)) < 46;
          if (near2 && !forgeNear.current) {
            forgeNear.current = true;
            setForgeMsg(null);
            setForgeOpen(true);
          }
          if (!near2) forgeNear.current = false;
        } else forgeNear.current = false;
      }

      /* enemies */
      const cur = room();
      if (!frozen) {
        /* Siren: aura de velocidade para os outros inimigos da sala */
        const sirens = cur.enemies.filter(
          (e) => e.behavior === "SIREN_SPEED_AURA" && e.spawnT <= 0 && e.stun <= 0,
        ).length;
        const auraMul = 1 + Math.min(0.6, sirens * 0.3);

        /** inimigos gerados neste frame (divisao do boss redondo) */
        const born: Enemy[] = [];

        for (const e of cur.enemies) {
          if (e.spawnT > 0) {
            e.spawnT -= dt;
            continue;
          }
          e.hitFlash = Math.max(0, e.hitFlash - dt);
          e.vamp = Math.max(0, e.vamp - dt);
          if (e.stun > 0) {
            e.stun -= dt;
            continue;
          }
          const spd = e.behavior === "SIREN_SPEED_AURA" ? 1 : auraMul;
          const flying = e.behavior === "FLY_IGNORES_CHASMS" || e.behavior === "FLY_TELEPORT_BLINK";
          const ex = player.current.x - e.x;
          const ey = player.current.y - e.y;
          const dist = Math.hypot(ex, ey) || 1;

          if (
            e.behavior === "RUSH_PLAYER" ||
            flying ||
            e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES" ||
            e.behavior === "BASS_DROP_SHOCKWAVE" ||
            e.behavior === "SIREN_SPEED_AURA" ||
            e.behavior === "DASH_CHARGE" ||
            e.behavior === "SIREN_HEALER" ||
            e.behavior === "BASS_QUAKE_DOUBLE" ||
            e.behavior === "BOSS_TRI_SPIRAL" ||
            e.behavior === "PENTAGON_AMBUSH"
          ) {
            const nx = e.x + (ex / dist) * e.speed * spd * dt;
            const ny = e.y + (ey / dist) * e.speed * spd * dt;
            if (!enemyBlocked(cur, nx, e.y, flying, e.size)) e.x = nx;
            if (!enemyBlocked(cur, e.x, ny, flying, e.size)) e.y = ny;
          }
          clampToRoom(e);

          /* ---------- boss redondo: ricochete acelerando + divisao ---------- */
          if (e.behavior === "BOSS_BOUNCE_SPLIT") {
            e.bspeed = Math.min(620, (e.bspeed ?? 150) + dt * 26);
            const vx = e.dvx ?? 1;
            const vy = e.dvy ?? 0;
            const nx = e.x + vx * e.bspeed * dt;
            const ny = e.y + vy * e.bspeed * dt;
            if (!enemyBlocked(cur, nx, e.y, true, e.size)) e.x = nx;
            else e.dvx = -vx;
            if (!enemyBlocked(cur, e.x, ny, true, e.size)) e.y = ny;
            else e.dvy = -vy;
            clampToRoom(e);

            /* rastro de tiros no ricochete */
            e.cooldown = Math.max(-1, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = 1.1;
              for (let i = 0; i < 6; i++)
                shots.current.push({
                  x: e.x,
                  y: e.y,
                  vx: Math.cos((i / 6) * Math.PI * 2) * 180,
                  vy: Math.sin((i / 6) * Math.PI * 2) * 180,
                  life: 2.4,
                  color: e.color,
                  r: 5,
                  dmg: e.damage,
                  hostile: true,
                  pierce: false,
                  shape: "circle",
                });
            }

            /* metade da vida: 2 corpos; um quarto: 4 corpos */
            if (e.hp > 0 && e.hp <= e.maxHp / 2 && (e.splits ?? 0) < 2) {
              const gen = (e.splits ?? 0) + 1;
              e.maxHp = Math.max(8, Math.round(e.maxHp / 4));
              e.hp = Math.max(4, Math.round(e.hp / 2));
              e.size = Math.max(22, Math.round(e.size * 0.68));
              e.splits = gen;
              const a2 = Math.atan2(e.dvy ?? 0, e.dvx ?? 1) + Math.PI / 2;
              e.dvx = Math.cos(a2);
              e.dvy = Math.sin(a2);
              born.push({
                ...e,
                uid: `b${Math.random().toString(36).slice(2, 9)}`,
                dvx: Math.cos(a2 + Math.PI),
                dvy: Math.sin(a2 + Math.PI),
                bspeed: (e.bspeed ?? 150) * 1.15,
                hitFlash: 0.2,
                cooldown: 0.6,
              });
            }
          }

          /* ---------- boss triangular: espiral continua pelas 3 pontas ---------- */
          if (e.behavior === "BOSS_TRI_SPIRAL") {
            const frac = e.hp / Math.max(1, e.maxHp);
            const spin = 1.5 + (1 - frac) * 2.2;
            e.ang = (e.ang ?? 0) + spin * dt;
            e.cooldown = Math.max(-0.3, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = frac < 0.4 ? 0.09 : 0.14;
              for (let i = 0; i < 3; i++) {
                const ang = (e.ang ?? 0) + (i / 3) * Math.PI * 2;
                shots.current.push({
                  x: e.x + Math.cos(ang) * e.size * 0.6,
                  y: e.y + Math.sin(ang) * e.size * 0.6,
                  vx: Math.cos(ang) * 250,
                  vy: Math.sin(ang) * 250,
                  life: 3,
                  color: e.color,
                  r: 4.5,
                  dmg: e.damage,
                  hostile: true,
                  pierce: false,
                  shape: "triangle",
                });
              }
            }
          }

          /* ---------- pentagono emboscador ---------- */
          if (e.behavior === "PENTAGON_AMBUSH") {
            e.ang = (e.ang ?? 0) + dt * 1.2;
            e.cooldown = Math.max(-0.4, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = 1.3;
              e.steps = (e.steps ?? 0) + 1;
              const pat = e.steps % 3;
              const base = Math.atan2(ey, ex);
              if (pat === 0) {
                /* lasers snipers rapidos */
                e.lock = { x: player.current.x, y: player.current.y };
                for (const off of [-0.09, 0.09])
                  shots.current.push({
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(base + off) * 820,
                    vy: Math.sin(base + off) * 820,
                    life: 1.4,
                    color: "#ff2e5b",
                    r: 3.5,
                    dmg: e.damage,
                    hostile: true,
                    pierce: false,
                  });
              } else if (pat === 1) {
                /* bombas flutuantes que explodem em area media */
                e.lock = null;
                for (const off of [-0.4, 0.4])
                  shots.current.push({
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(base + off) * 90,
                    vy: Math.sin(base + off) * 90,
                    life: 1.8,
                    color: "#c8ff3d",
                    r: 9,
                    dmg: e.damage,
                    hostile: true,
                    pierce: false,
                    explode: true,
                    fuse: true,
                    boomR: 320,
                    shape: "circle",
                  });
              } else {
                /* triangulos lentos teleguiados */
                e.lock = null;
                for (const off of [-0.7, 0, 0.7])
                  shots.current.push({
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(base + off) * 130,
                    vy: Math.sin(base + off) * 130,
                    life: 4,
                    color: "#9dff2e",
                    r: 6,
                    dmg: e.damage,
                    hostile: true,
                    pierce: false,
                    homing: 3,
                    shape: "triangle",
                  });
              }
            }
          }

          /* ---------- variantes elite ---------- */
          if (e.behavior === "DASH_CHARGE") {
            /* investida reta em alta velocidade */
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            if ((e.dashT ?? 0) > 0) {
              e.dashT = Math.max(0, (e.dashT ?? 0) - dt);
              const nx = e.x + (e.dvx ?? 0) * 520 * dt;
              const ny = e.y + (e.dvy ?? 0) * 520 * dt;
              if (!enemyBlocked(cur, nx, e.y, false, e.size)) e.x = nx;
              else e.dashT = 0;
              if (!enemyBlocked(cur, e.x, ny, false, e.size)) e.y = ny;
              else e.dashT = 0;
              clampToRoom(e);
            } else if (e.cooldown <= 0 && dist < 320) {
              e.cooldown = getDef(e.defId).fireRate ?? 2.2;
              e.dashT = 0.3;
              e.dvx = ex / dist;
              e.dvy = ey / dist;
              e.hitFlash = 0.12;
            }
          }

          if (e.behavior === "SHOOT_SPREAD_BURST") {
            /* rajada tripla em leque */
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = getDef(e.defId).fireRate ?? 2.4;
              if (dist < 620 && hasLineOfSight(cur, e.x, e.y, player.current.x, player.current.y)) {
                const base = Math.atan2(ey, ex);
                for (const off of [-0.24, 0, 0.24])
                  shots.current.push({
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(base + off) * 300,
                    vy: Math.sin(base + off) * 300,
                    life: 2.4,
                    color: e.color,
                    r: 4,
                    dmg: e.damage,
                    hostile: true,
                    pierce: false,
                  });
              }
            }
          }

          if (e.behavior === "FLY_TELEPORT_BLINK") {
            /* pisca para perto do jogador */
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = getDef(e.defId).fireRate ?? 2.8;
              const ang = Math.random() * Math.PI * 2;
              const spot = safeDropSpot(
                cur,
                player.current.x + Math.cos(ang) * 76,
                player.current.y + Math.sin(ang) * 76,
              );
              e.x = spot.x;
              e.y = spot.y;
              clampToRoom(e);
              e.spawnT = 0.2;
              e.hitFlash = 0.2;
            }
          }

          if (e.behavior === "SIREN_HEALER") {
            /* cura aliados proximos em pulsos */
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = getDef(e.defId).fireRate ?? 3;
              let healed = false;
              for (const o of cur.enemies) {
                if (o.uid === e.uid || o.hp <= 0 || o.hp >= o.maxHp) continue;
                if (Math.hypot(o.x - e.x, o.y - e.y) < 170) {
                  o.hp = Math.min(o.maxHp, o.hp + Math.ceil(o.maxHp * 0.12));
                  healed = true;
                }
              }
              if (healed)
                blasts.current.push({
                  x: e.x,
                  y: e.y,
                  t: 0,
                  hit: new Set(),
                  dmg: 0,
                  speed: 210,
                  maxT: 0.55,
                  color: "#ff5fa8",
                });
            }
          }

          if (e.behavior === "BASS_QUAKE_DOUBLE") {
            /* onda dupla concentrica */
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = getDef(e.defId).fireRate ?? 3.2;
              if (dist < 240) {
                blasts.current.push({
                  x: e.x,
                  y: e.y,
                  t: 0,
                  hit: new Set(),
                  hostile: true,
                  dmg: e.damage,
                  speed: 320,
                  maxT: 0.6,
                  color: "#ff9500",
                });
                blasts.current.push({
                  x: e.x,
                  y: e.y,
                  t: 0,
                  hit: new Set(),
                  hostile: true,
                  dmg: e.damage,
                  speed: 170,
                  maxT: 0.95,
                  color: "#ffbd55",
                });
              }
            }
          }

          if (
            e.behavior === "SHOOT_AT_PLAYER_PERIODIC" ||
            e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES"
          ) {
            const boss = e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES";
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            const canSee =
              boss ||
              (dist < 620 && hasLineOfSight(cur, e.x, e.y, player.current.x, player.current.y));
            if (e.cooldown <= 0) {
              /* recarrega sempre, mesmo sem tiro: evita rajadas infinitas */
              if (!boss) e.cooldown = getDef(e.defId).fireRate ?? 2;
              if (!canSee && !boss) {
                /* sem linha de visao apenas espera o proximo ciclo */
              } else if (boss) {
                /* O Maestro Subwoofer: 3 fases, padroes encadeados */
                const frac = e.hp / Math.max(1, e.maxHp);
                const phase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
                const pat = (e.spawned ?? 0) % 4;
                e.spawned = (e.spawned ?? 0) + 1;
                e.cooldown = phase === 2 ? 0.75 : phase === 1 ? 1.0 : 1.3;
                const bshot = (ang: number, spd: number, extra: Partial<Shot> = {}) =>
                  shots.current.push({
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    life: 2.6,
                    color: e.color,
                    r: 5,
                    dmg: e.damage,
                    hostile: true,
                    pierce: false,
                    ...extra,
                  } as Shot);
                const toPlayer = Math.atan2(ey, ex);

                if (pat === 0) {
                  /* anel radial giratorio (mais denso nas fases finais) */
                  const n = 10 + phase * 6;
                  const rot = (e.spawned * 0.21) % (Math.PI * 2);
                  for (let i = 0; i < n; i++) bshot((i / n) * Math.PI * 2 + rot, 200 + phase * 30);
                } else if (pat === 1) {
                  /* rajada mirada em leque rapido */
                  const spread = 0.18;
                  const arms = 3 + phase;
                  for (let i = 0; i < arms; i++)
                    bshot(toPlayer + (i - (arms - 1) / 2) * spread, 340 + phase * 40, { r: 4.5 });
                  if (phase >= 1)
                    for (let i = 0; i < 2; i++)
                      bshot(toPlayer + (i ? 0.5 : -0.5), 260, { r: 4, homing: 2.5, life: 3 });
                } else if (pat === 2) {
                  /* espiral dupla */
                  const rot = e.spawned * 0.6;
                  for (let arm = 0; arm < 2 + phase; arm++) {
                    const base = rot + (arm / (2 + phase)) * Math.PI * 2;
                    for (let i = 0; i < 4; i++) bshot(base + i * 0.16, 210 + i * 40);
                  }
                } else {
                  /* onda de choque + parede de sub-bass */
                  blasts.current.push({
                    x: e.x,
                    y: e.y,
                    t: 0,
                    hit: new Set(),
                    hostile: true,
                    dmg: e.damage,
                    speed: 300 + phase * 60,
                    maxT: 0.75,
                    color: e.color,
                  });
                  const n = 8 + phase * 4;
                  for (let i = 0; i < n; i++)
                    bshot(toPlayer - 0.7 + (i / (n - 1)) * 1.4, 190 + phase * 40, { r: 6 });
                  if (phase === 2)
                    for (let i = 0; i < 12; i++)
                      bshot((i / 12) * Math.PI * 2 + 0.26, 150, { life: 3.2 });
                }
              } else {
                shots.current.push({
                  x: e.x,
                  y: e.y,
                  vx: (ex / dist) * 260,
                  vy: (ey / dist) * 260,
                  life: 2.4,
                  color: e.color,
                  r: 4.5,
                  dmg: e.damage,
                  hostile: true,
                  pierce: false,
                });
              }
            }
          }

          /* Bass-Dropper: onda de choque circular ao se aproximar */
          if (e.behavior === "BASS_DROP_SHOCKWAVE") {
            e.cooldown = Math.max(-0.5, e.cooldown - dt);
            if (e.cooldown <= 0) {
              e.cooldown = 2.6;
              if (dist < 190)
                blasts.current.push({
                  x: e.x,
                  y: e.y,
                  t: 0,
                  hit: new Set(),
                  hostile: true,
                  dmg: e.damage,
                  speed: 260,
                  maxT: 0.6,
                  color: "#ff6a00",
                });
            }
          }

          if (tileAt(cur, e.x, e.y) === T.SPIKE && !flying) {
            e.spikeT += dt;
            if (e.spikeT >= 1.5) {
              e.spikeT = 0;
              e.hp -= 1;
              e.hitFlash = 0.15;
            }
          }

          if (
            e.behavior !== "INFECTED_SPEAKER_SPAWNER" &&
            e.behavior !== "LASER_SNIPER_LOCK" &&
            dist < e.size / 2 + SIZE / 2 &&
            shield.current <= 0
          )
            damagePlayer(e.damage);
        }

        if (born.length && cur.enemies.length < MAX_ENEMIES_PER_ROOM + 4)
          cur.enemies.push(...born);

        /* shots */
        shots.current = shots.current.filter((s) => {
          /* Homing Hat: curva a rota para o inimigo mais proximo */
          if (s.homing) {
            let best: { x: number; y: number } | null = null;
            let bd = Infinity;
            if (s.hostile) {
              best = player.current;
              bd = Math.hypot(player.current.x - s.x, player.current.y - s.y);
            } else {
              for (const e of cur.enemies) {
                if (e.spawnT > 0) continue;
                const d = Math.hypot(e.x - s.x, e.y - s.y);
                if (d < bd) {
                  bd = d;
                  best = e;
                }
              }
            }
            if (best) {
              const sp = Math.hypot(s.vx, s.vy) || 1;
              const tx = (best.x - s.x) / (bd || 1);
              const ty = (best.y - s.y) / (bd || 1);
              const nvx = s.vx / sp + tx * s.homing * dt;
              const nvy = s.vy / sp + ty * s.homing * dt;
              const nl = Math.hypot(nvx, nvy) || 1;
              s.vx = (nvx / nl) * sp;
              s.vy = (nvy / nl) * sp;
            }
          }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.life -= dt;
          if (s.life <= 0) {
            if (s.explode)
              blasts.current.push({
                x: s.x,
                y: s.y,
                t: 0,
                hit: new Set(),
                hostile: s.hostile,
                dmg: s.dmg * 1.5,
                speed: s.boomR ?? 300,
                maxT: 0.4,
                color: s.color,
              });
            return false;
          }
          if (blocksShot(cur, s.x, s.y)) {
            /* Sub-Kick: ricochete nas paredes */
            if (s.bounce && s.bounce > 0) {
              s.bounce -= 1;
              const bx = blocksShot(cur, s.x + Math.sign(s.vx) * 6, s.y - s.vy * dt);
              if (bx) s.vx *= -1;
              else s.vy *= -1;
              s.x -= s.vx * dt;
              s.y -= s.vy * dt;
              if (!s.hostile) hitPillar(cur, s.x, s.y, s.dmg);
              s.hit = new Set<string>();
              return true;
            }
            if (!s.hostile) hitPillar(cur, s.x, s.y, s.dmg);
            if (s.explode)
              blasts.current.push({
                x: s.x,
                y: s.y,
                t: 0,
                hit: new Set(),
                hostile: s.hostile,
                dmg: s.dmg * 1.5,
                speed: s.boomR ?? 300,
                maxT: 0.4,
                color: s.color,
              });
            return false;
          }
          if (s.hostile) {
            if (shield.current > 0) return false;
            if (Math.hypot(s.x - player.current.x, s.y - player.current.y) < SIZE / 2 + s.r) {
              damagePlayer(s.dmg);
              return false;
            }
          } else {
            for (const e of cur.enemies) {
              if (e.spawnT > 0) continue;
              if (s.hit?.has(e.uid)) continue;
              if (Math.hypot(s.x - e.x, s.y - e.y) < e.size / 2 + s.r) {
                e.hp -= s.dmg;
                e.hitFlash = 0.15;
                if (s.knock) {
                  const sp = Math.hypot(s.vx, s.vy) || 1;
                  const kx = e.x + (s.vx / sp) * s.knock;
                  const ky = e.y + (s.vy / sp) * s.knock;
                  if (!enemyBlocked(cur, kx, e.y, true, e.size)) e.x = kx;
                  if (!enemyBlocked(cur, e.x, ky, true, e.size)) e.y = ky;
                  clampToRoom(e);
                }
                if (s.explode) {
                  blasts.current.push({
                    x: s.x,
                    y: s.y,
                    t: 0,
                    hit: new Set(),
                    hostile: s.hostile,
                    dmg: s.dmg * 1.5,
                    speed: s.boomR ?? 300,
                    maxT: 0.4,
                    color: s.color,
                  });
                  return false;
                }
                if (!s.pierce) return false;
                s.hit?.add(e.uid);
              }
            }
          }
          return true;
        });

        /* blasts */
        blasts.current = blasts.current.filter((b) => {
          b.t += dt;
          const speed = b.speed ?? 260;
          const maxT = b.maxT ?? 0.45;
          const rad = b.t * speed;
          if (b.hostile) {
            if (
              !b.hit.has("player") &&
              shield.current <= 0 &&
              Math.hypot(player.current.x - b.x, player.current.y - b.y) < rad
            ) {
              b.hit.add("player");
              damagePlayer(b.dmg ?? 1);
            }
          } else {
            for (const e of cur.enemies) {
              if (e.spawnT > 0 || b.hit.has(e.uid)) continue;
              if (Math.hypot(e.x - b.x, e.y - b.y) < rad) {
                b.hit.add(e.uid);
                e.hp -= b.dmg ?? 4;
                e.hitFlash = 0.15;
                if (b.stun) e.stun = Math.max(e.stun, b.stun);
              }
            }
          }
          return b.t < maxT;
        });

        /* pocas de som: dano continuo em area */
        pools.current = pools.current.filter((pl) => {
          pl.t += dt;
          pl.tick += dt;
          if (pl.tick >= 0.25) {
            pl.tick = 0;
            for (const e of cur.enemies) {
              if (e.spawnT > 0) continue;
              if (Math.hypot(e.x - pl.x, e.y - pl.y) < pl.r + e.size / 2) {
                e.hp -= pl.dmg;
                e.hitFlash = 0.1;
                if (vamp.current > 0) e.vamp = 1.2;
                /* 30% de chance de empurrar cada inimigo na area do SYNTH */
                if (pl.push && Math.random() < 0.3) {
                  const dx = e.x - pl.x;
                  const dy = e.y - pl.y;
                  const d = Math.hypot(dx, dy) || 1;
                  const kx = e.x + (dx / d) * pl.push;
                  const ky = e.y + (dy / d) * pl.push;
                  if (!enemyBlocked(cur, kx, e.y, true, e.size)) e.x = kx;
                  if (!enemyBlocked(cur, e.x, ky, true, e.size)) e.y = ky;
                  clampToRoom(e);
                }
              }
            }
          }
          return pl.t < pl.life;
        });

        /* feixes laser continuos */
        beams.current = beams.current.filter((bm) => {
          bm.t += dt;
          bm.tick += dt;
          if (bm.tick >= 0.12) {
            bm.tick = 0;
            const dirx = Math.cos(bm.a);
            const diry = Math.sin(bm.a);
            for (let d = 12; d < 1200; d += 12) {
              const bx = bm.x + dirx * d;
              const by = bm.y + diry * d;
              if (blocksShot(cur, bx, by)) {
                hitPillar(cur, bx, by, bm.dmg);
                break;
              }
              for (const e of cur.enemies) {
                if (e.spawnT > 0) continue;
                if (Math.hypot(e.x - bx, e.y - by) < e.size / 2 + 8) {
                  e.hp -= bm.dmg;
                  e.hitFlash = 0.1;
                  if (vamp.current > 0) e.vamp = 1.2;
                }
              }
            }
          }
          return bm.t < bm.life;
        });

        vamp.current = Math.max(0, vamp.current - dt);

        /* deaths + coins + room clear */
        const dying = cur.enemies.filter((e) => e.hp <= 0);
        if (dying.length) {
          for (const e of dying) {
            /* Vamp Bass: 10% de chance de restaurar 1 HP */
            if ((e.vamp > 0 || vamp.current > 0) && Math.random() < 0.1) {
              setHp((h) => Math.min(h + 1, maxHpRef.current));
            }
            const n = e.size > 40 ? 12 : 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; i++) {
              const spot = safeDropSpot(
                cur,
                e.x + (Math.random() - 0.5) * 30,
                e.y + (Math.random() - 0.5) * 30,
              );
              pickups.current.push({ x: spot.x, y: spot.y, kind: "coin", color: "#ffe23d" });
            }
          }
          setKills((v) => v + dying.length);
          cur.enemies = cur.enemies.filter((e) => e.hp > 0);
          if (cur.enemies.length === 0 && cur.state === "COMBAT") {
            /* 25% de chance de emboscada pentagonal ao limpar a sala */
            if (cur.type === "NORMAL" && !cur.ambushed && Math.random() < AMBUSH_CHANCE) {
              cur.ambushed = true;
              const ang = Math.random() * Math.PI * 2;
              const spot = safeDropSpot(
                cur,
                player.current.x + Math.cos(ang) * 200,
                player.current.y + Math.sin(ang) * 200,
              );
              const amb = makeEnemy(
                "pentagon_ambusher",
                spot.x,
                spot.y,
                floorRef.current.level,
              );
              amb.spawnT = 1;
              cur.enemies.push(amb);
              glitch.current = 0.6;
            } else clearRoom(cur);
          }
        }

        shield.current = Math.max(0, shield.current - dt);
        pulse.current = Math.max(0, pulse.current - dt * 3);
        invuln.current = Math.max(0, invuln.current - dt);
      }

      /* ---------------- draw ---------------- */
      ctx.save();
      if (deadRef.current) {
        ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      }
      ctx.fillStyle = "#0d0f18";
      ctx.fillRect(-20, -20, W + 40, H + 40);

      for (let y = 0; y < ROOM_H; y++) {
        for (let x = 0; x < ROOM_W; x++) {
          const id = cur.tiles[y]![x]!;
          const px = x * TILE;
          const py = y * TILE;
          ctx.fillStyle = TILE_PROPS[id]?.color ?? "#12141f";
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = "rgba(46,200,255,0.06)";
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);

          if (id === T.WALL) {
            ctx.save();
            ctx.strokeStyle = "rgba(46,200,255,0.5)";
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#2ec8ff";
            ctx.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);
            ctx.restore();
          } else if (id === T.ROCK) {
            ctx.save();
            ctx.fillStyle = "#b14dff";
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#b14dff";
            ctx.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
            ctx.restore();
          } else if (id === T.CHASM) {
            ctx.strokeStyle = "rgba(177,77,255,0.25)";
            ctx.strokeRect(px + 4.5, py + 4.5, TILE - 9, TILE - 9);
          } else if (id === T.SPIKE) {
            ctx.save();
            ctx.fillStyle = "#ff2e5b";
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#ff2e5b";
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.moveTo(px + 8 + i * 9, py + TILE - 9);
              ctx.lineTo(px + 12 + i * 9, py + 10);
              ctx.lineTo(px + 16 + i * 9, py + TILE - 9);
              ctx.fill();
            }
            ctx.restore();
          } else if (id === T.PILLAR) {
            ctx.save();
            ctx.fillStyle = "#4a5a8f";
            ctx.shadowBlur = 12;
            ctx.shadowColor = "#7aa2ff";
            ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
            const hpLeft = (cur.pillars[`${x},${y}`] ?? PILLAR_HP) / PILLAR_HP;
            ctx.fillStyle = "#0d0f18";
            ctx.fillRect(px + 6, py + TILE - 9, TILE - 12, 3);
            ctx.fillStyle = "#7aa2ff";
            ctx.fillRect(px + 6, py + TILE - 9, (TILE - 12) * hpLeft, 3);
            ctx.restore();
          } else if (id === T.BPM_UP || id === T.BPM_DOWN || id === T.AMPLIFIER) {
            const col = id === T.BPM_UP ? "#ff2e5b" : id === T.BPM_DOWN ? "#2ec8ff" : "#b14dff";
            ctx.save();
            ctx.globalAlpha = 0.35 + Math.sin(now / 260) * 0.15;
            ctx.strokeStyle = col;
            ctx.shadowBlur = 12;
            ctx.shadowColor = col;
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 4.5, py + 4.5, TILE - 9, TILE - 9);
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = col;
            ctx.font = "8px 'Press Start 2P', monospace";
            ctx.textAlign = "center";
            ctx.fillText(
              id === T.BPM_UP ? "+" : id === T.BPM_DOWN ? "-" : "x2",
              px + TILE / 2,
              py + TILE / 2 + 4,
            );
            ctx.restore();
          } else if (id === T.DOOR) {
            const locked = cur.doors.some((d) => d.locked);
            ctx.save();
            ctx.fillStyle = locked ? "#ff2e5b" : "#3dff9e";
            ctx.shadowBlur = 14;
            ctx.shadowColor = locked ? "#ff2e5b" : "#3dff9e";
            ctx.globalAlpha = locked ? 0.85 : 0.5;
            ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
            ctx.restore();
          } else if (id === T.PORTAL) {
            ctx.save();
            ctx.strokeStyle = "#3dff9e";
            ctx.shadowBlur = 20;
            ctx.shadowColor = "#3dff9e";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px + TILE / 2, py + TILE / 2, 14 + Math.sin(now / 200) * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      /* shop: NPC + pedestals */
      if (cur.type === "SHOP") {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#3dff9e";
        ctx.fillStyle = "#3dff9e";
        ctx.fillRect(W / 2 - 14, H / 2 - 110, 28, 34);
        ctx.restore();
        ctx.save();
        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#3dff9e";
        ctx.fillText("LOJA", W / 2, H / 2 - 122);
        for (const p of shopPeds) {
          const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
          ctx.save();
          ctx.globalAlpha = p.sold ? 0.2 : 1;
          ctx.shadowBlur = 16;
          ctx.shadowColor = def.color;
          ctx.strokeStyle = def.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x - 16, p.y - 16, 32, 32);
          ctx.fillStyle = def.color;
          ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
          ctx.restore();
          ctx.globalAlpha = p.sold ? 0.25 : 1;
          ctx.fillStyle = def.color;
          ctx.fillText(p.sold ? "VENDIDO" : def.label.toUpperCase(), p.x, p.y - 26);
          ctx.fillStyle = "#ffe23d";
          ctx.fillText(p.sold ? "" : `${itemCost(def, floorRef.current.level)} ♪`, p.x, p.y + 34);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      /* forja: altar ritmico */
      if (cur.type === "FORGE") {
        const ax = W / 2;
        const ay = H / 2 - 20;
        ctx.save();
        ctx.shadowBlur = 22;
        ctx.shadowColor = "#ffe23d";
        ctx.strokeStyle = "#ffe23d";
        ctx.lineWidth = 3;
        ctx.strokeRect(ax - 22, ay - 18, 44, 36);
        ctx.globalAlpha = 0.5 + Math.sin(now / 200) * 0.3;
        ctx.fillStyle = "#ffe23d";
        ctx.fillRect(ax - 10, ay - 8, 20, 16);
        ctx.globalAlpha = 1;
        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillText("FORJA", ax, ay - 28);
        ctx.restore();
      }

      /* pickups */
      for (const p of pickups.current) {
        ctx.save();
        ctx.shadowBlur = 16;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        const bob = Math.sin(now / 220) * 3;
        if (p.kind === "coin") {
          ctx.beginPath();
          ctx.arc(p.x, p.y + bob, 5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - 8, p.y - 8 + bob, 16, 16);
        }
        ctx.restore();
      }

      /* pocas de som */
      for (const pl of pools.current) {
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(now / 120) * 0.08;
        ctx.fillStyle = "#b14dff";
        ctx.shadowBlur = 24;
        ctx.shadowColor = "#b14dff";
        ctx.beginPath();
        ctx.arc(pl.x, pl.y, pl.r * (1 - pl.t / pl.life / 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* feixes laser (Beam Synth) */
      for (const bm of beams.current) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#3dff9e";
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#3dff9e";
        ctx.lineWidth = 6 + Math.sin(now / 40) * 2;
        ctx.beginPath();
        ctx.moveTo(bm.x, bm.y);
        ctx.lineTo(bm.x + Math.cos(bm.a) * 1200, bm.y + Math.sin(bm.a) * 1200);
        ctx.stroke();
        ctx.restore();
      }

      /* miras laser travadas (Laser-Sniper) */
      for (const e of cur.enemies) {
        if (!e.lock || e.spawnT > 0) continue;
        ctx.save();
        ctx.globalAlpha = 0.45 + Math.sin(now / 90) * 0.2;
        ctx.strokeStyle = "#ff2e5b";
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#ff2e5b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.lock.x, e.lock.y);
        ctx.stroke();
        ctx.restore();
      }

      /* enemies */
      for (const e of cur.enemies) {
        const shape = getDef(e.defId).shape ?? "square";
        const rot = e.ang ?? 0;
        ctx.save();
        if (e.spawnT > 0) {
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = e.color;
          ctx.shadowBlur = 16;
          ctx.shadowColor = e.color;
          ctx.lineWidth = 2;
          const s = (0.5 - e.spawnT) / 0.5;
          drawShape(ctx, shape, e.x, e.y, (e.size / 2) * s, rot, "stroke");
          ctx.restore();
          continue;
        }
        ctx.shadowBlur = 16;
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : e.color;
        ctx.globalAlpha = e.stun > 0 ? 0.55 : 1;
        drawShape(ctx, shape, e.x, e.y, e.size / 2, rot, "fill");
        if (e.behavior === "SIREN_SPEED_AURA") {
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 34 + Math.sin(now / 200) * 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (e.behavior === "INFECTED_SPEAKER_SPAWNER") {
          ctx.globalAlpha = 0.5 + Math.sin(now / 150) * 0.3;
          ctx.strokeStyle = "#3dff9e";
          ctx.lineWidth = 3;
          ctx.strokeRect(e.x - e.size / 2 - 5, e.y - e.size / 2 - 5, e.size + 10, e.size + 10);
        }
        if (e.behavior === "BOSS_BOUNCE_SPLIT" || e.behavior === "BOSS_TRI_SPIRAL") {
          ctx.globalAlpha = 0.35 + Math.sin(now / 130) * 0.15;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 3;
          drawShape(ctx, shape, e.x, e.y, e.size / 2 + 7, rot, "stroke");
        }
        if (e.behavior === "PENTAGON_AMBUSH") {
          ctx.globalAlpha = 0.4 + Math.sin(now / 110) * 0.2;
          ctx.strokeStyle = "#c8ff3d";
          ctx.lineWidth = 2;
          drawShape(ctx, "pentagon", e.x, e.y, e.size / 2 + 6, -rot, "stroke");
        }
        ctx.restore();
        ctx.fillStyle = "#00000088";
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 7, e.size, 3);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 7, (e.size * e.hp) / e.maxHp, 3);
      }

      /* shots */
      for (const s of shots.current) {
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = s.color;
        ctx.fillStyle = s.color;
        const rot = Math.atan2(s.vy, s.vx) + Math.PI / 2 + now / 240;
        /* rastro curto na direcao do movimento */
        const sp = Math.hypot(s.vx, s.vy) || 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.lineWidth = s.r;
        ctx.strokeStyle = s.color;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - (s.vx / sp) * s.r * 2.4, s.y - (s.vy / sp) * s.r * 2.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        drawShape(ctx, s.shape, s.x, s.y, s.r, rot, "fill");
        if (s.explode || s.fuse) {
          ctx.globalAlpha = 0.5 + Math.sin(now / 70) * 0.3;
          ctx.lineWidth = 2;
          ctx.strokeStyle = s.color;
          drawShape(ctx, s.shape, s.x, s.y, s.r + 4, -rot, "stroke");
        }
        ctx.restore();
      }


      /* blasts */
      for (const b of blasts.current) {
        ctx.save();
        const bc = b.color ?? "#b14dff";
        ctx.globalAlpha = Math.max(0, 1 - b.t / (b.maxT ?? 0.45));
        ctx.shadowBlur = 20;
        ctx.shadowColor = bc;
        ctx.strokeStyle = bc;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.t * (b.speed ?? 260), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* player */
      const px = Math.round(player.current.x - SIZE / 2);
      const py = Math.round(player.current.y - SIZE / 2);
      const parts = ["#2ec8ff", "#b14dff", "#ffe23d"];
      ctx.save();
      ctx.globalAlpha = invuln.current > 0 ? 0.55 : 1;
      parts.forEach((c, i) => {
        ctx.shadowBlur = 14 + pulse.current * 14;
        ctx.shadowColor = c;
        ctx.fillStyle = c;
        ctx.fillRect(px + 2, py + i * (SIZE / 3) + 1, SIZE - 4, SIZE / 3 - 2);
      });
      ctx.restore();

      /* aim reticle */
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        player.current.x - 3 + Math.cos(aimAngle.current) * 24,
        player.current.y - 3 + Math.sin(aimAngle.current) * 24,
        6,
        6,
      );
      ctx.restore();

      if (shield.current > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, shield.current * 2);
        ctx.shadowBlur = 18;
        ctx.shadowColor = "#2ec8ff";
        ctx.strokeStyle = "#2ec8ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.current.x, player.current.y, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* death glitch */
      if (deadRef.current) {
        for (let i = 0; i < 14; i++) {
          const gy = Math.random() * H;
          const gh = 4 + Math.random() * 14;
          ctx.globalAlpha = 0.25 + Math.random() * 0.4;
          ctx.fillStyle = Math.random() > 0.5 ? "#ff2e5b" : "#2ec8ff";
          ctx.fillRect((Math.random() - 0.5) * 40, gy, W, gh);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [buy, clearRoom, damagePlayer, enterRoom, fire, goToFloor, mounted]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouse.current = {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const cur = floor.rooms[roomId];
  const inCombat = roomState === "COMBAT";

  if (!mounted) {
    return (
      <div className="h-[520px] w-full max-w-5xl rounded-lg border border-neon-magenta/30 bg-panel" />
    );
  }

  const touch = touchMode === true;

  return (
    <div
      className={
        touch
          ? "fixed inset-0 z-10 flex flex-col bg-background"
          : "flex w-full max-w-5xl flex-col gap-3"
      }
    >
      {!touch && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-pixel text-lg text-neon-magenta drop-shadow-[0_0_12px_rgba(255,61,240,0.6)]">
              NEON DUNGEON
            </h1>
            <p className="mt-2 font-pixel text-[7px] leading-relaxed text-muted-foreground">
              WASD move · Mouse mira · TAB/Espaço editor · P pausa · Sala {cur?.type ?? "?"} ·{" "}
              {roomState}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="rounded-sm border border-neon-purple bg-neon-purple/10 px-3 py-2 font-pixel text-[9px] uppercase text-neon-purple"
            >
              {paused ? "Retomar" : "Pausar"}
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-sm border border-neon-purple bg-neon-purple/10 px-3 py-2 font-pixel text-[9px] uppercase text-neon-purple"
            >
              ⚙
            </button>
            <button
              type="button"
              onClick={() => setRunning((x) => !x)}
              className="rounded-sm border border-neon-cyan bg-neon-cyan/10 px-4 py-2 font-pixel text-[9px] uppercase text-neon-cyan shadow-neon-cyan hover:bg-neon-cyan/20"
            >
              {running ? "Parar" : "Tocar"}
            </button>
          </div>
        </div>
      )}

      <div
        className={`relative overflow-hidden ${
          touch ? "flex-1" : "rounded-lg border border-neon-magenta/40 shadow-neon-magenta"
        }`}
        style={{ filter: `brightness(${settings.brightness})` }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={onMouseMove}
          className={
            touch
              ? "block h-full w-full object-contain [image-rendering:pixelated]"
              : "block w-full [image-rendering:pixelated]"
          }
        />

        {touch ? (
          <>
            <TouchControls
              orientation={orientation}
              input={touchInput}
              enabled={!frozenRef.current}
            />
            <MobileHUD
              hp={hp}
              maxHp={maxHp}
              coins={coins}
              floor={floor}
              roomId={roomId}
              orientation={orientation}
              editing={hudEditing}
              layout={hudLayout}
              onMix={() => setEditorOpen(true)}
              onInventory={() => setEditorOpen(true)}
              onConfig={() => setSettingsOpen(true)}
            />
            {hudEditing && (
              <div className="absolute inset-x-0 bottom-3 z-40 flex justify-center">
                <button
                  type="button"
                  onClick={() => setHudEditing(false)}
                  className="rounded-sm border border-neon-magenta bg-background/80 px-4 py-2 font-pixel text-[9px] uppercase text-neon-magenta"
                >
                  Salvar layout
                </button>
              </div>
            )}
          </>
        ) : (
          <HUD hp={hp} maxHp={maxHp} coins={coins} floor={floor} roomId={roomId} />
        )}
        <Sequencer pattern={pattern} currentStep={currentStep} bpm={bpm} />

        {askDevice && touchMode === null && (
          <DeviceModal
            onPick={(t) => {
              setTouchMode(t);
              setAskDevice(false);
            }}
          />
        )}

        {settingsOpen && (
          <SettingsModal
            settings={settings}
            onChange={updateSettings}
            editing={hudEditing}
            onToggleEditing={(v) => {
              setHudEditing(v);
              if (v) setSettingsOpen(false);
            }}
            onResetLayout={hudLayout.reset}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {transition && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 font-pixel text-[10px] uppercase text-neon-cyan">
            {transition}
          </div>
        )}

        {paused && !dead && !editorOpen && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/85">
            <p className="font-pixel text-sm uppercase text-neon-purple">Pausado</p>
            <button
              type="button"
              onClick={() => setPaused(false)}
              className="rounded-sm border border-neon-cyan px-4 py-2 font-pixel text-[9px] uppercase text-neon-cyan"
            >
              Retomar
            </button>
          </div>
        )}

        {editorOpen && !dead && (
          <SequencerEditor
            pattern={pattern}
            inventory={inventory}
            rareInventory={rareInventory}
            varInventory={varInventory}
            bpm={bpm}
            currentStep={currentStep}
            onPlace={placeBlock}
            onRemove={removeBlock}
            onClose={() => setEditorOpen(false)}
          />
        )}

        {forgeOpen && !dead && (
          <ForgeModal
            level={floor.level}
            coins={coins}
            inventory={inventory}
            varInventory={varInventory}
            message={forgeMsg}
            onForge={forge}
            onClose={() => setForgeOpen(false)}
          />
        )}

        {dead && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background/90">
            <h2 className="font-pixel text-xl text-neon-red drop-shadow-[0_0_16px_rgba(255,46,91,0.8)]">
              GAME OVER
            </h2>
            <div className="flex flex-col items-center gap-1 font-pixel text-[9px] leading-relaxed text-muted-foreground">
              <span>Andar alcançado: B{floor.level}</span>
              <span>Inimigos derrotados: {kills}</span>
              <span>Notas de ouro: {coins}</span>
              <span>
                Música criada: {bpm} BPM · {countNotes(pattern)} notas
              </span>
            </div>
            <button
              type="button"
              onClick={restart}
              className="rounded-sm border border-neon-red bg-neon-red/10 px-5 py-2.5 font-pixel text-[10px] uppercase text-neon-red"
            >
              Reiniciar Run
            </button>
          </div>
        )}

        {inCombat && (
          <div className="pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2 font-pixel text-[8px] uppercase text-neon-red">
            Combate — portas trancadas
          </div>
        )}
      </div>
    </div>
  );
}
