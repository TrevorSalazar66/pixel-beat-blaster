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
  opposite,
  type Dir,
  type Floor,
  type Room,
} from "./dungeon/generate";
import { rollBlock } from "./dungeon/drops";
import { COMMON_ENEMY_IDS, getDef, scaledDamage, scaledHp } from "./dungeon/enemies";
import { SHOP_ITEMS, type ShopItemId } from "./dungeon/shop";

const W = ROOM_W * TILE;
const H = ROOM_H * TILE;
const SIZE = 28;
const SPEED = 190;
const START_HP = 3;

type Vec = { x: number; y: number };
type Shot = {
  x: number; y: number; vx: number; vy: number; life: number;
  color: string; r: number; dmg: number; hostile: boolean; pierce: boolean;
  hit?: Set<string>;
  /** empurra o inimigo atingido (px) */
  knock?: number;
  /** explode em area ao impactar */
  explode?: boolean;
  /** persegue o inimigo mais proximo */
  homing?: number;
};
type Blast = {
  x: number; y: number; t: number; hit: Set<string>;
  hostile?: boolean;
  dmg?: number;
  speed?: number;
  maxT?: number;
  color?: string;
  stun?: number;
};
/** Poca de som: dano continuo em area (Synth base). */
type Pool = { x: number; y: number; r: number; t: number; life: number; dmg: number; tick: number };
/** Feixe laser continuo (Beam Synth). */
type Beam = { x: number; y: number; a: number; t: number; life: number; dmg: number; tick: number };
type Pickup = { x: number; y: number; kind: "block" | "coin"; track?: TrackId; color: string };
type Pedestal = { x: number; y: number; item: ShopItemId; sold: boolean };

const emptyInv = (): Record<TrackId, number> => ({ kick: 0, snare: 0, hat: 0, synth: 0 });

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
  coinsRef.current = coins;
  const deadRef = useRef(dead);
  deadRef.current = dead;
  const frozenRef = useRef(false);
  frozenRef.current =
    paused || editorOpen || dead || settingsOpen || hudEditing || transition !== null;

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

  const room = () => floorRef.current.rooms[roomIdRef.current]!;

  /* ---------- editor actions ---------- */
  const placeBlock = useCallback(
    (t: number, s: number, block: { track: TrackId; rare: boolean; variant: Variant }) => {
      const prev = patternRef.current[t]?.[s] ?? null;
      const setInv = block.rare ? setRareInventory : setInventory;
      setInv((inv) => ({ ...inv, [block.track]: Math.max(0, (inv[block.track] ?? 0) - 1) }));
      if (prev) {
        const back = prev.rare ? setRareInventory : setInventory;
        const trackId = TRACKS[t]!.id;
        back((inv) => ({ ...inv, [trackId]: (inv[trackId] ?? 0) + 1 }));
      }
      setPattern((p) =>
        p.map((row, i) =>
          i === t
            ? row.map((c, j) => (j === s ? { rare: block.rare, variant: block.variant } : c))
            : row,
        ),
      );
    },
    [],
  );

  const removeBlock = useCallback((t: number, s: number) => {
    const prev = patternRef.current[t]?.[s] ?? null;
    if (!prev) return;
    const trackId = TRACKS[t]!.id;
    const back = prev.rare ? setRareInventory : setInventory;
    back((inv) => ({ ...inv, [trackId]: (inv[trackId] ?? 0) + 1 }));
    setPattern((p) => p.map((row, i) => (i === t ? row.map((c, j) => (j === s ? null : c)) : row)));
  }, []);

  const cycleVariant = useCallback((t: number, s: number) => {
    setPattern((p) =>
      p.map((row, i) =>
        i === t
          ? row.map((c, j) =>
              j === s && c ? { ...c, variant: (((c.variant + 1) % 3) as Variant) } : c,
            )
          : row,
      ),
    );
  }, []);

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
      pickups.current.push({
        x: W / 2 + (i - (n - 1) / 2) * 46,
        y: H / 2,
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
    if (pedestals.current[r.id]) return;
    const lvl = floorRef.current.level;

    if (r.type === "SHOP") {
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
    } else if (r.type === "FORGE") {
      // Pedestais de forja para cada uma das 4 trilhas de som
      const forgeItems: ShopItemId[] = ["kick", "snare", "hat", "synth"] as unknown as ShopItemId[];
      pedestals.current[r.id] = forgeItems.map((item, i) => ({
        x: W / 2 + (i - 1.5) * 100,
        y: H / 2 + 30,
        item,
        sold: false,
      }));
    }
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
    pickups.current = [];
    pedestals.current = {};
    window.setTimeout(() => setTransition(null), 900);
  }, []);

  const restart = useCallback(() => {
    setInventory(emptyInv());
    setRareInventory(emptyInv());
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

  /* ---- shop purchase / forge craft ---- */
  const buy = useCallback((p: Pedestal) => {
    const lvl = floorRef.current.level;
    const r = room();

    if (r.type === "FORGE") {
      const trackId = p.item as unknown as TrackId;
      const count = inventory[trackId] ?? 0;
      const forgeFee = 10 * lvl;
      if (count < 2 || coinsRef.current < forgeFee) return;

      // Consome 2 blocos normais e a taxa de forja
      setCoins((c) => c - forgeFee);
      setInventory((inv) => ({ ...inv, [trackId]: Math.max(0, (inv[trackId] ?? 0) - 2) }));

      const roll = Math.random();
      if (roll < 0.15) {
        // 15% de chance de virar variante A ou B
        const targetVariant = Math.random() < 0.5 ? 1 : 2;
        // Equipa ou atualiza no primeiro slot disponível ou substitui
        setPattern((pat) => {
          const trackIdx = TRACKS.findIndex((t) => t.id === trackId);
          if (trackIdx === -1) return pat;
          let replaced = false;
          return pat.map((row, ti) => {
            if (ti !== trackIdx) return row;
            return row.map((cell) => {
              if (!replaced && cell) {
                replaced = true;
                return { ...cell, variant: targetVariant as Variant };
              }
              return cell;
            });
          });
        });
        playTrack(trackId, undefined, targetVariant);
      } else {
        // Devolve 1 bloco normal
        setInventory((inv) => ({ ...inv, [trackId]: (inv[trackId] ?? 0) + 1 }));
        playTrack(trackId);
      }
      p.sold = true;
      bump();
      return;
    }

    const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
    const totalCost = def.cost * lvl;
    if (p.sold || coinsRef.current < totalCost) return;
    p.sold = true;
    setCoins((c) => c - totalCost);
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
  }, [inventory]);


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
        // Sub-Kick: disparo duplo rápido de projéteis finos / agulha neon
        for (const off of [-0.08, 0.08])
          shoot({
            vx: Math.cos(a + off) * 440,
            vy: Math.sin(a + off) * 440,
            r: 4.5 * sMul,
            dmg: 5 * dMul,
            life: 1.6,
            color: rare ? "#ffffff" : "#ff7799",
            knock: Math.random() < 0.05 ? 12 : 0,
          });
      } else if (variant === 2) {
        // Explosive Kick: orbe pesado concentrado que explode em área
        shoot({
          vx: f.x * 290,
          vy: f.y * 290,
          r: 10 * sMul,
          dmg: 8 * dMul,
          color: rare ? "#ffffff" : "#ff1a40",
          explode: true,
          pierce: false,
          knock: 18,
        });
      } else {
        // Base: projetil pesado com 5% de chance de empurrar levemente para trás
        shoot({
          vx: f.x * 320,
          vy: f.y * 320,
          r: 7.5 * sMul,
          dmg: 12 * dMul,
          color: rare ? "#ffffff" : "#ff0055",
          knock: Math.random() < 0.05 ? 14 : 0, // 5% de chance de knockback suave
        });
      }
      pulse.current = 1;
      return;
    }

    if (track.id === "hat") {
      /* Velocidade e projecao rapida */
      if (variant === 1) {
        // Dash Hat: impulso curto na direcao do movimento
        const mv = lastMove.current;
        const len = Math.hypot(mv.x, mv.y);
        const dx = len > 0.05 ? mv.x / len : f.x;
        const dy = len > 0.05 ? mv.y / len : f.y;
        dash.current = { x: dx, y: dy, t: 0.16 };
        invuln.current = Math.max(invuln.current, 0.16);
      } else if (variant === 2) {
        // Homing Hat: 2 dardos teleguiados angulares
        for (const off of [-0.3, 0.3])
          shoot({
            vx: Math.cos(a + off) * 460,
            vy: Math.sin(a + off) * 460,
            r: 4 * sMul,
            dmg: 3.5 * dMul,
            color: rare ? "#ffffff" : "#ffe866",
            life: 2.2,
            homing: 7,
          });
      } else {
        // Base: leque triplo rapido
        for (const off of [-0.25, 0, 0.25])
          shoot({
            vx: Math.cos(a + off) * 720,
            vy: Math.sin(a + off) * 720,
            r: 3.5 * sMul,
            dmg: 2 * dMul,
            color: rare ? "#ffffff" : "#ffe23d",
            life: 1.2,
          });
      }
      return;
    }

    if (track.id === "snare") {
      /* Defensivo e controle de grupo */
      if (variant === 1) {
        // Shield Snare: 0.5s de invulnerabilidade total
        shield.current = Math.max(shield.current, 0.5);
        invuln.current = Math.max(invuln.current, 0.5);
        blasts.current.push({ x: cx, y: cy, t: 0, hit: new Set(), color: "#00eeff", dmg: 0 });
        return;
      }
      if (variant === 2) {
        // Stun Snare: paralisa em raio curto por 1.5s
        blasts.current.push({
          x: cx, y: cy, t: 0, hit: new Set(),
          color: "#8ad8ff", dmg: 1, speed: 160, maxT: 0.55, stun: 1.5,
        });
        for (const e of r.enemies) {
          if (Math.hypot(e.x - cx, e.y - cy) < 120) e.stun = Math.max(e.stun, 1.5);
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
        if (d < 160) {
          e.x += (dx / d) * 50;
          e.y += (dy / d) * 50;
        }
      }
      return;
    }

    /* synth / bass: area e modificadores */
    if (variant === 1) {
      // Beam Synth: feixe continuo durante o step
      beams.current.push({
        x: cx, y: cy, a, t: 0,
        life: Math.max(0.14, stepDur),
        dmg: 4 * dMul,
        tick: 0,
      });
      return;
    }
    if (variant === 2) {
      // Vamp Bass: janela de cura ao derrotar inimigos sob o som
      vamp.current = 2;
      pools.current.push({
        x: cx, y: cy, r: 72 * sMul, t: 0, life: 2, dmg: 1.5 * dMul, tick: 0,
      });
      return;
    }
    // Base: poça de som com 30% de chance de empurrar cada inimigo no alcance
    pools.current.push({
      x: cx + f.x * 40, y: cy + f.y * 40,
      r: 65 * sMul, t: 0, life: 2, dmg: 3 * dMul, tick: 0,
    });
  }, []);


  /* ---- passo do sequenciador: inimigos ritmicos ---- */
  const handleStep = useCallback(() => {
    const r = room();
    if (frozenRef.current) return;
    for (const e of r.enemies) {
      if (e.spawnT > 0 || e.stun > 0) continue;
      e.steps += 1;

      // Laser sniper ritmico: diminuida velocidade do disparo para permitir reacao
      if (e.behavior === "LASER_SNIPER_LOCK") {
        if (e.steps % 4 === 0) {
          const target = e.lock ?? { x: player.current.x, y: player.current.y };
          const dx = target.x - e.x;
          const dy = target.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          shots.current.push({
            x: e.x, y: e.y,
            vx: (dx / d) * 620, vy: (dy / d) * 620, // Reduzido de 900 para 620
            life: 1.8, color: "#ff2e5b", r: 4, dmg: e.damage,
            hostile: true, pierce: false,
          });
          e.lock = null;
        } else {
          e.lock = { x: player.current.x, y: player.current.y };
        }
      }

      // Spawner de som infectado: limite seguro de 8 inimigos
      if (e.behavior === "INFECTED_SPEAKER_SPAWNER" && e.steps % 4 === 0) {
        if (r.enemies.length < 8) {
          const id = COMMON_ENEMY_IDS[Math.floor(Math.random() * COMMON_ENEMY_IDS.length)]!;
          const def = getDef(id);
          const lvl = floorRef.current.level;
          const hp = scaledHp(def.hpBase, lvl);
          let sx = e.x;
          let sy = e.y;
          for (let attempt = 0; attempt < 8; attempt++) {
            const ang = (attempt / 8) * Math.PI * 2;
            const testX = Math.max(TILE * 1.5, Math.min(W - TILE * 1.5, e.x + Math.cos(ang) * 44));
            const testY = Math.max(TILE * 1.5, Math.min(H - TILE * 1.5, e.y + Math.sin(ang) * 44));
            if (!solidFor(r, testX, testY, def.behavior === "FLY_IGNORES_CHASMS")) {
              sx = testX;
              sy = testY;
              break;
            }
          }
          r.enemies.push({
            uid: `s${Math.random().toString(36).slice(2, 9)}`,
            defId: def.id,
            x: sx,
            y: sy,
            hp,
            maxHp: hp,
            damage: scaledDamage(def.damageBase, lvl),
            speed: def.speed * 26,
            behavior: def.behavior,
            color: def.color,
            size: def.id === "bass_dropper" ? 36 : 26,
            cooldown: def.fireRate ?? 2.0,
            spawnT: 0.5,
            hitFlash: 0,
            spikeT: 0,
            stun: 0,
            steps: 0,
            lock: null,
            vamp: 0,
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
          const cell = row[s];
          if (cell && track) playTrack(track.id, when, cell.variant);
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
        if (!solidFor(r, nx + Math.sign(dx) * half, player.current.y + half * 0.6) &&
            !solidFor(r, nx + Math.sign(dx) * half, player.current.y - half * 0.6))
          player.current.x = nx;
        if (!solidFor(r, player.current.x + half * 0.6, ny + Math.sign(dy) * half) &&
            !solidFor(r, player.current.x - half * 0.6, ny + Math.sign(dy) * half))
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

      /* shop / forge pedestals */
      const shopPeds = pedestals.current[r.id] ?? [];
      if (!frozen) {
        for (const p of shopPeds) {
          if (p.sold) continue;
          const near = Math.hypot(p.x - player.current.x, p.y - player.current.y) < 34;
          if (near) {
            if (r.type === "FORGE") {
              const count = inventory[p.item as unknown as TrackId] ?? 0;
              const forgeFee = 10 * floorRef.current.level;
              if (count >= 2 && coinsRef.current >= forgeFee) buy(p);
            } else {
              const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
              const totalCost = def.cost * floorRef.current.level;
              if (coinsRef.current >= totalCost) buy(p);
            }
          }
        }
      }

      /* enemies */
      const cur = room();
      if (!frozen) {
        /* Siren: aura de velocidade para os outros inimigos da sala */
        const sirens = cur.enemies.filter(
          (e) => e.behavior === "SIREN_SPEED_AURA" && e.spawnT <= 0 && e.stun <= 0,
        ).length;
        const auraMul = 1 + Math.min(0.6, sirens * 0.3);

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
          const flying = e.behavior === "FLY_IGNORES_CHASMS" || e.behavior === "VARIANT_FLOATER_HOMING";
          const ex = player.current.x - e.x;
          const ey = player.current.y - e.y;
          const dist = Math.hypot(ex, ey) || 1;

          /* BOSS 2: Redondo que ricocheteia cada vez mais rápido e se divide */
          if (e.behavior === "BOSS_BOUNCING_DIVIDER") {
            e.vx = e.vx ?? 160;
            e.vy = e.vy ?? 130;
            // Velocidade aumenta conforme perde vida
            const speedBoost = 1 + (1 - e.hp / e.maxHp) * 1.5;
            let nx = e.x + e.vx * speedBoost * dt;
            let ny = e.y + e.vy * speedBoost * dt;
            const rad = e.size / 2;

            if (nx - rad < TILE || nx + rad > W - TILE) {
              e.vx = -e.vx;
              nx = Math.max(TILE + rad, Math.min(W - TILE - rad, nx));
              blasts.current.push({ x: e.x, y: e.y, t: 0, hit: new Set(), color: "#ff0077", dmg: 1, speed: 180, maxT: 0.35, hostile: true });
            }
            if (ny - rad < TILE || ny + rad > H - TILE) {
              e.vy = -e.vy;
              ny = Math.max(TILE + rad, Math.min(H - TILE - rad, ny));
              blasts.current.push({ x: e.x, y: e.y, t: 0, hit: new Set(), color: "#ff0077", dmg: 1, speed: 180, maxT: 0.35, hostile: true });
            }
            e.x = nx;
            e.y = ny;

            // Divisão em 2 corpos a 50% HP e 4 corpos a 25% HP
            if ((e.splitStage ?? 1) === 1 && e.hp <= e.maxHp * 0.5) {
              e.splitStage = 2;
              e.size = 38;
              const clone = {
                ...e,
                uid: `boss_div_${Math.random()}`,
                x: e.x + 20,
                y: e.y + 20,
                vx: -e.vx * 1.1,
                vy: e.vy * 1.1,
                size: 38,
                splitStage: 2,
              };
              cur.enemies.push(clone);
            } else if ((e.splitStage ?? 1) === 2 && e.hp <= e.maxHp * 0.25) {
              e.splitStage = 3;
              e.size = 28;
              const clone = {
                ...e,
                uid: `boss_div_${Math.random()}`,
                x: e.x - 20,
                y: e.y + 20,
                vx: -e.vx * 1.2,
                vy: -e.vy * 1.2,
                size: 28,
                splitStage: 3,
              };
              cur.enemies.push(clone);
            }
          }

          /* BOSS 3: Triangular giratório que atira pelas três pontas em espiral */
          else if (e.behavior === "BOSS_TRIANGLE_SPIRAL") {
            e.angle = (e.angle ?? 0) + 2.4 * dt;
            // Movimento oscilatório lento em direção ao centro / jogador
            const nx = e.x + (ex / dist) * e.speed * dt;
            const ny = e.y + (ey / dist) * e.speed * dt;
            if (!solidFor(cur, nx, e.y, true)) e.x = nx;
            if (!solidFor(cur, e.x, ny, true)) e.y = ny;

            e.cooldown -= dt;
            if (e.cooldown <= 0) {
              e.cooldown = 0.22; // Disparo contínuo rápido pelas 3 pontas
              for (let i = 0; i < 3; i++) {
                const a = e.angle + (i * Math.PI * 2) / 3;
                shots.current.push({
                  x: e.x + Math.cos(a) * 26,
                  y: e.y + Math.sin(a) * 26,
                  vx: Math.cos(a) * 230,
                  vy: Math.sin(a) * 230,
                  life: 2.5,
                  color: "#00ffea",
                  r: 4.5,
                  dmg: e.damage,
                  hostile: true,
                  pierce: false,
                });
              }
            }
          }

          /* Pentágono Dimensional (PENTAGON_SPECIAL_ASSAULT): lasers sniper rápidos, bombas lentas AoE e triângulos teleguiados */
          else if (e.behavior === "PENTAGON_SPECIAL_ASSAULT") {
            const moveX = (ex / dist) * e.speed * dt;
            const moveY = (ey / dist) * e.speed * dt;
            if (!solidFor(cur, e.x + moveX, e.y, true)) e.x += moveX;
            if (!solidFor(cur, e.x, e.y + moveY, true)) e.y += moveY;

            e.cooldown -= dt;
            if (e.cooldown <= 0) {
              e.cooldown = 2.2;
              const attackRoll = Math.random();
              if (attackRoll < 0.35) {
                // 1. Lasers sniper rápidos
                shots.current.push({
                  x: e.x, y: e.y, vx: (ex / dist) * 700, vy: (ey / dist) * 700,
                  life: 1.5, color: "#ff00ea", r: 4, dmg: e.damage + 1, hostile: true, pierce: false,
                });
              } else if (attackRoll < 0.7) {
                // 2. Bomba que flutua lentamente e explode em área
                shots.current.push({
                  x: e.x, y: e.y, vx: (ex / dist) * 110, vy: (ey / dist) * 110,
                  life: 2.2, color: "#ff4400", r: 9, dmg: e.damage, hostile: true, explode: true,
                });
              } else {
                // 3. Triângulos lentos teleguiados
                for (const off of [-0.4, 0.4]) {
                  shots.current.push({
                    x: e.x, y: e.y, vx: Math.cos(Math.atan2(ey, ex) + off) * 180,
                    vy: Math.sin(Math.atan2(ey, ex) + off) * 180,
                    life: 3.0, color: "#00ffea", r: 5, dmg: e.damage, hostile: true, homing: 4,
                  });
                }
              }
            }
          }

          /* Movimento geral de perseguição */
          else if (
            e.behavior === "RUSH_PLAYER" ||
            e.behavior === "VARIANT_CHASER_BURST" ||
            flying ||
            e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES" ||
            e.behavior === "BASS_DROP_SHOCKWAVE" ||
            e.behavior === "SIREN_SPEED_AURA"
          ) {
            const isBurst = e.behavior === "VARIANT_CHASER_BURST" && dist < 140;
            const extraSpd = isBurst ? 1.6 : 1;
            const moveX = (ex / dist) * e.speed * spd * extraSpd * dt;
            const moveY = (ey / dist) * e.speed * spd * extraSpd * dt;
            const rad = e.size / 2;
            const minX = TILE + rad;
            const maxX = W - TILE - rad;
            const minY = TILE + rad;
            const maxY = H - TILE - rad;

            const nx = Math.max(minX, Math.min(maxX, e.x + moveX));
            const ny = Math.max(minY, Math.min(maxY, e.y + moveY));

            if (!solidFor(cur, nx + Math.sign(moveX) * rad, e.y, flying)) e.x = nx;
            if (!solidFor(cur, e.x, ny + Math.sign(moveY) * rad, flying)) e.y = ny;
          }

          /* Disparo das torres e inimigos atiradores */
          if (
            e.behavior === "SHOOT_AT_PLAYER_PERIODIC" ||
            e.behavior === "VARIANT_TURRET_SPREAD" ||
            e.behavior === "VARIANT_FLOATER_HOMING" ||
            e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES"
          ) {
            e.cooldown -= dt;
            if (e.cooldown <= 0) {
              const def = getDef(e.defId);
              e.cooldown = e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES" ? 1.6 : (def.fireRate ?? 2.2);

              if (e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES") {
                // Padrão complexo de ataques para o Maestro Subwoofer
                for (let i = 0; i < 12; i++) {
                  const a = (i / 12) * Math.PI * 2 + (Math.sin(now / 300) * 0.4);
                  shots.current.push({ x: e.x, y: e.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 2.6, color: e.color, r: 5, dmg: e.damage, hostile: true, pierce: false });
                }
                // Disparo de projétil pesado teleguiado
                shots.current.push({ x: e.x, y: e.y, vx: (ex / dist) * 190, vy: (ey / dist) * 190, life: 3.2, color: "#ff0055", r: 8, dmg: e.damage + 1, hostile: true, homing: 3 });
              } else if (e.behavior === "VARIANT_TURRET_SPREAD") {
                // Disparo cruzado em leque quádruplo
                for (let i = 0; i < 4; i++) {
                  const a = Math.atan2(ey, ex) + (i - 1.5) * 0.25;
                  shots.current.push({ x: e.x, y: e.y, vx: Math.cos(a) * 270, vy: Math.sin(a) * 270, life: 2.2, color: e.color, r: 4, dmg: e.damage, hostile: true, pierce: false });
                }
              } else if (e.behavior === "VARIANT_FLOATER_HOMING") {
                // Projétil teleguiado suave
                shots.current.push({ x: e.x, y: e.y, vx: (ex / dist) * 210, vy: (ey / dist) * 210, life: 2.8, color: e.color, r: 4.5, dmg: e.damage, hostile: true, homing: 4 });
              } else {
                shots.current.push({ x: e.x, y: e.y, vx: (ex / dist) * 260, vy: (ey / dist) * 260, life: 2.4, color: e.color, r: 4.5, dmg: e.damage, hostile: true, pierce: false });
              }
            }
          }

          /* Bass-Dropper: onda de choque circular ao se aproximar */
          if (e.behavior === "BASS_DROP_SHOCKWAVE") {
            e.cooldown -= dt;
            if (e.cooldown <= 0 && dist < 190) {
              e.cooldown = 2.6;
              blasts.current.push({
                x: e.x, y: e.y, t: 0, hit: new Set(),
                hostile: true, dmg: e.damage, speed: 260, maxT: 0.6, color: "#ff6a00",
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

        /* shots */
        shots.current = shots.current.filter((s) => {
          /* Homing Hat / Tiros teleguiados: curva a rota */
          if (s.homing) {
            if (s.hostile) {
              const dx = player.current.x - s.x;
              const dy = player.current.y - s.y;
              const d = Math.hypot(dx, dy) || 1;
              const sp = Math.hypot(s.vx, s.vy) || 1;
              const nvx = s.vx / sp + (dx / d) * s.homing * dt;
              const nvy = s.vy / sp + (dy / d) * s.homing * dt;
              const nl = Math.hypot(nvx, nvy) || 1;
              s.vx = (nvx / nl) * sp;
              s.vy = (nvy / nl) * sp;
            } else {
              let best: { x: number; y: number } | null = null;
              let bd = Infinity;
              for (const e of cur.enemies) {
                if (e.spawnT > 0) continue;
                const d = Math.hypot(e.x - s.x, e.y - s.y);
                if (d < bd) {
                  bd = d;
                  best = e;
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
          }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.life -= dt;
          if (s.life <= 0) return false;
          if (blocksShot(cur, s.x, s.y)) {
            if (!s.hostile) hitPillar(cur, s.x, s.y, s.dmg);
            if (s.explode)
              blasts.current.push({
                x: s.x, y: s.y, t: 0, hit: new Set(),
                dmg: s.dmg * 1.5, speed: 300, maxT: 0.4, color: s.color, hostile: s.hostile,
              });
            return false;
          }
          if (s.hostile) {
            if (shield.current > 0) return false;
            if (Math.hypot(s.x - player.current.x, s.y - player.current.y) < SIZE / 2 + s.r) {
              damagePlayer(s.dmg);
              if (s.explode) {
                blasts.current.push({
                  x: s.x, y: s.y, t: 0, hit: new Set(),
                  dmg: s.dmg, speed: 280, maxT: 0.4, color: s.color, hostile: true,
                });
              }
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
                  const rad = e.size / 2;
                  const kx = Math.max(TILE + rad, Math.min(W - TILE - rad, e.x + (s.vx / sp) * s.knock));
                  const ky = Math.max(TILE + rad, Math.min(H - TILE - rad, e.y + (s.vy / sp) * s.knock));
                  if (!solidFor(cur, kx, e.y, true)) e.x = kx;
                  if (!solidFor(cur, e.x, ky, true)) e.y = ky;
                }
                if (s.explode) {
                  blasts.current.push({
                    x: s.x, y: s.y, t: 0, hit: new Set(),
                    dmg: s.dmg * 1.5, speed: 300, maxT: 0.4, color: s.color,
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

        /* pocas de som: dano continuo em area + 30% chance de empurrar */
        pools.current = pools.current.filter((pl) => {
          pl.t += dt;
          pl.tick += dt;
          if (pl.tick >= 0.25) {
            pl.tick = 0;
            for (const e of cur.enemies) {
              if (e.spawnT > 0) continue;
              const dist = Math.hypot(e.x - pl.x, e.y - pl.y);
              if (dist < pl.r + e.size / 2) {
                e.hp -= pl.dmg;
                e.hitFlash = 0.1;
                if (vamp.current > 0) e.vamp = 1.2;
                // 30% de chance de empurrar cada inimigo na área de alcance do roxo (SYNTH)
                if (Math.random() < 0.30) {
                  const pushX = (e.x - pl.x) || (Math.random() - 0.5);
                  const pushY = (e.y - pl.y) || (Math.random() - 0.5);
                  const pushLen = Math.hypot(pushX, pushY) || 1;
                  const rad = e.size / 2;
                  const kx = Math.max(TILE + rad, Math.min(W - TILE - rad, e.x + (pushX / pushLen) * 32));
                  const ky = Math.max(TILE + rad, Math.min(H - TILE - rad, e.y + (pushY / pushLen) * 32));
                  if (!solidFor(cur, kx, e.y, true)) e.x = kx;
                  if (!solidFor(cur, e.x, ky, true)) e.y = ky;
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
              setHp((h) => Math.min(h + 1, maxHp));
            }
            const n = e.size > 40 ? 10 : 1 + Math.floor(Math.random() * 2);
            for (let i = 0; i < n; i++) {
              const rawX = e.x + (Math.random() - 0.5) * 26;
              const rawY = e.y + (Math.random() - 0.5) * 26;
              let dropX = Math.max(TILE * 1.5, Math.min(W - TILE * 1.5, rawX));
              let dropY = Math.max(TILE * 1.5, Math.min(H - TILE * 1.5, rawY));
              if (solidFor(cur, dropX, dropY, false)) {
                dropX = Math.max(TILE * 1.5, Math.min(W - TILE * 1.5, e.x));
                dropY = Math.max(TILE * 1.5, Math.min(H - TILE * 1.5, e.y));
              }
              pickups.current.push({
                x: dropX,
                y: dropY,
                kind: "coin",
                color: "#ffe23d",
              });
            }
          }
          setKills((v) => v + dying.length);
          cur.enemies = cur.enemies.filter((e) => e.hp > 0);
          if (cur.enemies.length === 0 && cur.state === "COMBAT") {
            // 25% de chance de surgir um Inimigo Pentagonal após a sala ser limpa
            if (cur.type === "NORMAL" && Math.random() < 0.25) {
              const pentagon = makeEnemy(
                "pentagon_overlord",
                W / 2,
                H / 2,
                floorRef.current.level,
              );
              pentagon.spawnT = 0.8;
              cur.enemies.push(pentagon);
              blasts.current.push({ x: W / 2, y: H / 2, t: 0, hit: new Set(), color: "#ff00ea", speed: 200, maxT: 0.5 });
            } else {
              clearRoom(cur);
            }
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

      /* shop / forge: NPC + pedestals */
      if (cur.type === "SHOP" || cur.type === "FORGE") {
        const isForge = cur.type === "FORGE";
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = isForge ? "#ffe23d" : "#3dff9e";
        ctx.fillStyle = isForge ? "#ffe23d" : "#3dff9e";
        ctx.fillRect(W / 2 - 14, H / 2 - 110, 28, 34);
        ctx.restore();
        ctx.save();
        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = isForge ? "#ffe23d" : "#3dff9e";
        ctx.fillText(isForge ? "FORJA" : "LOJA", W / 2, H / 2 - 122);
        for (const p of shopPeds) {
          if (isForge) {
            const tr = TRACKS.find((t) => t.id === (p.item as unknown as TrackId));
            const count = inventory[p.item as unknown as TrackId] ?? 0;
            const forgeFee = 10 * floorRef.current.level;
            const color = tr?.color ?? "#ffffff";
            ctx.save();
            ctx.globalAlpha = p.sold ? 0.2 : 1;
            ctx.shadowBlur = 16;
            ctx.shadowColor = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - 16, p.y - 16, 32, 32);
            ctx.fillStyle = color;
            ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
            ctx.restore();
            ctx.globalAlpha = p.sold ? 0.25 : 1;
            ctx.fillStyle = color;
            ctx.fillText(p.sold ? "FORJADO" : `${tr?.short} (2x)`, p.x, p.y - 26);
            ctx.fillStyle = "#ffe23d";
            ctx.fillText(p.sold ? "" : `${forgeFee} ♪`, p.x, p.y + 34);
            ctx.globalAlpha = 1;
          } else {
            const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
            const totalCost = def.cost * floorRef.current.level;
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
            ctx.fillText(p.sold ? "" : `${totalCost} ♪`, p.x, p.y + 34);
            ctx.globalAlpha = 1;
          }
        }
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

      /* enemies */
      for (const e of cur.enemies) {
        ctx.save();
        if (e.spawnT > 0) {
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = e.color;
          ctx.shadowBlur = 16;
          ctx.shadowColor = e.color;
          ctx.lineWidth = 2;
          const s = (0.5 - e.spawnT) / 0.5;
          ctx.strokeRect(e.x - (e.size / 2) * s, e.y - (e.size / 2) * s, e.size * s, e.size * s);
          ctx.restore();
          continue;
        }
        ctx.shadowBlur = 18;
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : e.color;

        // Renderização com formas geométricas características
        if (e.behavior === "BOSS_BOUNCING_DIVIDER") {
          // Boss Redondo
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.behavior === "BOSS_TRIANGLE_SPIRAL") {
          // Boss Triangular girando
          ctx.beginPath();
          const ang = e.angle ?? 0;
          for (let i = 0; i < 3; i++) {
            const a = ang + (i * Math.PI * 2) / 3;
            const px = e.x + Math.cos(a) * (e.size / 2 + 2);
            const py = e.y + Math.sin(a) * (e.size / 2 + 2);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        } else if (e.behavior === "PENTAGON_SPECIAL_ASSAULT") {
          // Pentágono Dimensional
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
            const px = e.x + Math.cos(a) * (e.size / 2);
            const py = e.y + Math.sin(a) * (e.size / 2);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
        }
        ctx.restore();

        ctx.fillStyle = "#00000088";
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 7, e.size, 3);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 7, (e.size * e.hp) / e.maxHp, 3);
      }

      /* shots com skins e variações visuais */
      for (const s of shots.current) {
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = s.color;
        ctx.fillStyle = s.color;
        if (s.explode) {
          // Projétil pesado explosivo
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (s.homing) {
          // Projétil teleguiado em losango
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(Math.atan2(s.vy, s.vx));
          ctx.beginPath();
          ctx.moveTo(s.r * 1.5, 0);
          ctx.lineTo(-s.r, s.r * 0.8);
          ctx.lineTo(-s.r * 0.5, 0);
          ctx.lineTo(-s.r, -s.r * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        ctx.restore();
      }


      /* blasts */
      for (const b of blasts.current) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - b.t / 0.45);
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#b14dff";
        ctx.strokeStyle = "#b14dff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.t * 260, 0, Math.PI * 2);
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
            bpm={bpm}
            currentStep={currentStep}
            onPlace={placeBlock}
            onRemove={removeBlock}
            onCycleVariant={cycleVariant}
            onClose={() => setEditorOpen(false)}
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={restart}
                className="rounded-sm border border-neon-red bg-neon-red/10 px-5 py-2.5 font-pixel text-[10px] uppercase text-neon-red shadow-neon-red hover:bg-neon-red/20"
              >
                Reiniciar Run
              </button>
            </div>
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
