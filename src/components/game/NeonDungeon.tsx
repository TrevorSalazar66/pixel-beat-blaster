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
import { STEPS, TRACKS, countNotes, createPattern, type Pattern } from "./tracks";
import { ROOM_H, ROOM_W, TILE, TILE_PROPS, T } from "./dungeon/tiles";
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
};
type Blast = { x: number; y: number; t: number; hit: Set<string> };
type Pickup = { x: number; y: number; kind: "block" | "coin"; track?: TrackId; color: string };
type Pedestal = { x: number; y: number; item: ShopItemId; sold: boolean };

const emptyInv = (): Record<TrackId, number> => ({ kick: 0, snare: 0, hat: 0, synth: 0 });

export function NeonDungeon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pattern, setPattern] = useState<Pattern>(createPattern);
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(false);
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
  bpmRef.current = bpm;

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
  const shield = useRef(0);
  const pulse = useRef(0);
  const invuln = useRef(0);
  const spikeT = useRef(0);
  const glitch = useRef(0);

  const room = () => floorRef.current.rooms[roomIdRef.current]!;

  /* ---------- editor actions ---------- */
  const placeBlock = useCallback(
    (t: number, s: number, block: { track: TrackId; rare: boolean }) => {
      const prev = patternRef.current[t]?.[s] ?? null;
      const setInv = block.rare ? setRareInventory : setInventory;
      setInv((inv) => ({ ...inv, [block.track]: Math.max(0, (inv[block.track] ?? 0) - 1) }));
      if (prev) {
        const back = prev.rare ? setRareInventory : setInventory;
        const trackId = TRACKS[t]!.id;
        back((inv) => ({ ...inv, [trackId]: (inv[trackId] ?? 0) + 1 }));
      }
      setPattern((p) =>
        p.map((row, i) => (i === t ? row.map((c, j) => (j === s ? { rare: block.rare } : c)) : row)),
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

  /* ---- shop purchase ---- */
  const buy = useCallback((p: Pedestal) => {
    const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
    if (p.sold || coinsRef.current < def.cost) return;
    p.sold = true;
    setCoins((c) => c - def.cost);
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

  /* ---- sequencer actions ---- */
  const fire = useCallback((trackIndex: number, rare: boolean) => {
    const track = TRACKS[trackIndex];
    if (!track || frozenRef.current) return;
    const cx = player.current.x;
    const cy = player.current.y;
    const a = aimAngle.current;
    const f = { x: Math.cos(a), y: Math.sin(a) };

    if (track.id === "kick") {
      const spread = rare ? [-0.12, 0.12] : [0];
      for (const off of spread) {
        shots.current.push({
          x: cx, y: cy,
          vx: Math.cos(a + off) * 300, vy: Math.sin(a + off) * 300,
          life: 2, color: rare ? "#ffffff" : track.color, r: 8, dmg: 8,
          hostile: false, pierce: rare, hit: new Set(),
        });
      }
      pulse.current = 1;
    } else if (track.id === "hat") {
      const offs = rare ? [-0.35, -0.12, 0.12, 0.35] : [-0.25, 0, 0.25];
      for (const off of offs) {
        shots.current.push({
          x: cx, y: cy,
          vx: Math.cos(a + off) * 720, vy: Math.sin(a + off) * 720,
          life: 1.2, color: rare ? "#ffffff" : track.color, r: 3.5, dmg: rare ? 3 : 2,
          hostile: false, pierce: rare, hit: new Set(),
        });
      }
    } else if (track.id === "snare") {
      shield.current = rare ? 0.9 : 0.5;
      blasts.current.push({ x: cx, y: cy, t: 0, hit: new Set() });
      shots.current = shots.current.filter((s) => !s.hostile);
      const r = room();
      for (const e of r.enemies) {
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 150) {
          e.x += (dx / d) * 46;
          e.y += (dy / d) * 46;
        }
      }
    } else {
      blasts.current.push({ x: cx, y: cy, t: 0, hit: new Set() });
      if (rare) blasts.current.push({ x: cx + f.x * 70, y: cy + f.y * 70, t: 0, hit: new Set() });
    }
  }, []);

  /* ---- audio clock ---- */
  useEffect(() => {
    if (!running || paused || editorOpen || dead || settingsOpen || hudEditing || transition) return;
    const ac = getAudio();
    const stepDur = 60 / bpm / 4 / settings.gameSpeed;
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
          if (row[s] && track) playTrack(track.id, when);
        });
        timers.push(
          window.setTimeout(
            () => {
              setCurrentStep(s);
              patternRef.current.forEach((row, t) => {
                const cell = row[s];
                if (cell) fire(t, cell.rare);
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
  }, [
    running,
    fire,
    bpm,
    paused,
    editorOpen,
    dead,
    transition,
    settingsOpen,
    hudEditing,
    settings.gameSpeed,
  ]);

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
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
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

      /* shop pedestals */
      const shopPeds = pedestals.current[r.id] ?? [];
      if (!frozen) {
        for (const p of shopPeds) {
          if (p.sold) continue;
          const near = Math.hypot(p.x - player.current.x, p.y - player.current.y) < 34;
          if (near) {
            const def = SHOP_ITEMS.find((i) => i.id === p.item)!;
            if (coinsRef.current >= def.cost) buy(p);
          }
        }
      }

      /* enemies */
      const cur = room();
      if (!frozen) {
        for (const e of cur.enemies) {
          if (e.spawnT > 0) {
            e.spawnT -= dt;
            continue;
          }
          e.hitFlash = Math.max(0, e.hitFlash - dt);
          const flying = e.behavior === "FLY_IGNORES_CHASMS";
          const ex = player.current.x - e.x;
          const ey = player.current.y - e.y;
          const dist = Math.hypot(ex, ey) || 1;

          if (e.behavior === "RUSH_PLAYER" || flying || e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES") {
            const nx = e.x + (ex / dist) * e.speed * dt;
            const ny = e.y + (ey / dist) * e.speed * dt;
            if (!solidFor(cur, nx, e.y, flying)) e.x = nx;
            if (!solidFor(cur, e.x, ny, flying)) e.y = ny;
          }

          if (e.behavior === "SHOOT_AT_PLAYER_PERIODIC" || e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES") {
            e.cooldown -= dt;
            if (e.cooldown <= 0) {
              e.cooldown = e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES" ? 1.4 : 2;
              if (e.behavior === "BOSS_PATTERN_WAVES_AND_PROJECTILES") {
                for (let i = 0; i < 10; i++) {
                  const a = (i / 10) * Math.PI * 2;
                  shots.current.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 2.4, color: e.color, r: 5, dmg: e.damage, hostile: true, pierce: false });
                }
              } else {
                shots.current.push({ x: e.x, y: e.y, vx: (ex / dist) * 260, vy: (ey / dist) * 260, life: 2.4, color: e.color, r: 4.5, dmg: e.damage, hostile: true, pierce: false });
              }
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

          if (dist < e.size / 2 + SIZE / 2 && shield.current <= 0) damagePlayer(e.damage);
        }

        /* shots */
        shots.current = shots.current.filter((s) => {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.life -= dt;
          if (s.life <= 0) return false;
          if (blocksShot(cur, s.x, s.y)) return false;
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
          const rad = b.t * 260;
          for (const e of cur.enemies) {
            if (e.spawnT > 0 || b.hit.has(e.uid)) continue;
            if (Math.hypot(e.x - b.x, e.y - b.y) < rad) {
              b.hit.add(e.uid);
              e.hp -= 4;
              e.hitFlash = 0.15;
            }
          }
          return b.t < 0.45;
        });

        /* deaths + coins + room clear */
        const dying = cur.enemies.filter((e) => e.hp <= 0);
        if (dying.length) {
          for (const e of dying) {
            const n = e.size > 40 ? 12 : 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; i++) {
              pickups.current.push({
                x: e.x + (Math.random() - 0.5) * 30,
                y: e.y + (Math.random() - 0.5) * 30,
                kind: "coin",
                color: "#ffe23d",
              });
            }
          }
          setKills((v) => v + dying.length);
          cur.enemies = cur.enemies.filter((e) => e.hp > 0);
          if (cur.enemies.length === 0 && cur.state === "COMBAT") clearRoom(cur);
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
          ctx.fillText(p.sold ? "" : `${def.cost} ♪`, p.x, p.y + 34);
          ctx.globalAlpha = 1;
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
        ctx.shadowBlur = 16;
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : e.color;
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
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
        ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
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
