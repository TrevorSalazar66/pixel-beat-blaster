import { useCallback, useEffect, useRef, useState } from "react";
import { getAudio, playTrack, type TrackId } from "@/lib/chiptune";
import { Sequencer } from "./Sequencer";
import { Minimap } from "./Minimap";
import { STEPS, TRACKS, createPattern, type Pattern } from "./tracks";
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
import type { Enemy } from "./dungeon/enemies";

const W = ROOM_W * TILE;
const H = ROOM_H * TILE;
const SIZE = 28;
const SPEED = 190;
const BPM = 120;
const MAX_HP = 6;

type Vec = { x: number; y: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number; dmg: number; hostile: boolean };
type Blast = { x: number; y: number; t: number; hit: Set<string> };
type Pickup = { x: number; y: number; track: TrackId; color: string };

const emptyInv = (): Record<TrackId, number> => ({ kick: 1, snare: 0, hat: 0, synth: 0 });

export function NeonDungeon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pattern, setPattern] = useState<Pattern>(createPattern);
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [inventory, setInventory] = useState<Record<TrackId, number>>(emptyInv);
  const [hp, setHp] = useState(MAX_HP);
  const [floor, setFloor] = useState<Floor>(() => generateFloor(1));
  const [roomId, setRoomId] = useState<string>(() => key(2, 2));
  const [roomState, setRoomState] = useState<Room["state"]>("CLEARED");
  const [dead, setDead] = useState(false);

  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const invRef = useRef(inventory);
  invRef.current = inventory;
  const floorRef = useRef(floor);
  floorRef.current = floor;
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const hpRef = useRef(hp);
  hpRef.current = hp;
  const deadRef = useRef(dead);
  deadRef.current = dead;

  const keys = useRef<Record<string, boolean>>({});
  const player = useRef<Vec>({ x: W / 2, y: H / 2 });
  const facing = useRef<Vec>({ x: 1, y: 0 });
  const shots = useRef<Shot[]>([]);
  const blasts = useRef<Blast[]>([]);
  const pickups = useRef<Pickup[]>([]);
  const shield = useRef(0);
  const pulse = useRef(0);
  const invuln = useRef(0);
  const spikeT = useRef(0);

  const room = () => floorRef.current.rooms[roomIdRef.current]!;

  const toggle = useCallback((t: number, s: number) => {
    setPattern((p) => p.map((row, i) => (i === t ? row.map((v, j) => (j === s ? !v : v)) : row)));
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
      if (n === 0) setDead(true);
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

  const enterRoom = useCallback((r: Room) => {
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
  }, [clearRoom]);

  const goToFloor = useCallback((level: number) => {
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
  }, []);

  const restart = useCallback(() => {
    setInventory(emptyInv());
    setHp(MAX_HP);
    setDead(false);
    deadRef.current = false;
    goToFloor(1);
  }, [goToFloor]);

  /* ---- input ---- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key.startsWith("Arrow") || [" ", "w", "a", "s", "d"].includes(e.key.toLowerCase()))
        e.preventDefault();
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

  /* ---- sequencer actions ---- */
  const fire = useCallback((trackIndex: number) => {
    const track = TRACKS[trackIndex];
    if (!track) return;
    if ((invRef.current[track.id] ?? 0) <= 0) return;
    const cx = player.current.x;
    const cy = player.current.y;
    const f = facing.current;

    if (track.id === "kick") {
      shots.current.push({ x: cx, y: cy, vx: f.x * 300, vy: f.y * 300, life: 2, color: track.color, r: 8, dmg: 8, hostile: false });
      pulse.current = 1;
    } else if (track.id === "hat") {
      const base = Math.atan2(f.y, f.x);
      for (const off of [-0.25, 0, 0.25]) {
        shots.current.push({
          x: cx, y: cy,
          vx: Math.cos(base + off) * 720,
          vy: Math.sin(base + off) * 720,
          life: 1.2, color: track.color, r: 3.5, dmg: 2, hostile: false,
        });
      }
    } else if (track.id === "snare") {
      shield.current = 0.5;
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
    }
  }, []);

  /* ---- audio clock ---- */
  useEffect(() => {
    if (!running) return;
    const ac = getAudio();
    const stepDur = 60 / BPM / 4;
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
          if (row[s] && track && (invRef.current[track.id] ?? 0) > 0) playTrack(track.id, when);
        });
        timers.push(
          window.setTimeout(
            () => {
              setCurrentStep(s);
              patternRef.current.forEach((row, t) => {
                if (row[s]) fire(t);
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
  }, [running, fire]);

  /* ---- simulation + render ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const r = room();
      const alive = !deadRef.current;

      /* movement */
      const k = keys.current;
      let dx = 0;
      let dy = 0;
      if (alive) {
        if (k["a"] || k["arrowleft"]) dx -= 1;
        if (k["d"] || k["arrowright"]) dx += 1;
        if (k["w"] || k["arrowup"]) dy -= 1;
        if (k["s"] || k["arrowdown"]) dy += 1;
      }
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        facing.current = { x: dx, y: dy };
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

      /* pickups */
      pickups.current = pickups.current.filter((p) => {
        if (Math.hypot(p.x - player.current.x, p.y - player.current.y) < 24) {
          setInventory((inv) => ({ ...inv, [p.track]: (inv[p.track] ?? 0) + 1 }));
          playTrack(p.track);
          return false;
        }
        return true;
      });

      /* enemies */
      const cur = room();
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
                shots.current.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 2.4, color: e.color, r: 5, dmg: e.damage, hostile: true });
              }
            } else {
              shots.current.push({ x: e.x, y: e.y, vx: (ex / dist) * 260, vy: (ey / dist) * 260, life: 2.4, color: e.color, r: 4.5, dmg: e.damage, hostile: true });
            }
          }
        }

        // spike damage on enemies
        if (tileAt(cur, e.x, e.y) === T.SPIKE && !flying) {
          e.spikeT += dt;
          if (e.spikeT >= 1.5) {
            e.spikeT = 0;
            e.hp -= 1;
            e.hitFlash = 0.15;
          }
        }

        // contact damage
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
            if (Math.hypot(s.x - e.x, s.y - e.y) < e.size / 2 + s.r) {
              e.hp -= s.dmg;
              e.hitFlash = 0.15;
              return false;
            }
          }
        }
        return true;
      });

      /* blasts (synth AoE / snare wave) */
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

      /* deaths + room clear */
      const before = cur.enemies.length;
      cur.enemies = cur.enemies.filter((e) => e.hp > 0);
      if (before !== cur.enemies.length && cur.enemies.length === 0 && cur.state === "COMBAT") {
        clearRoom(cur);
      }

      shield.current = Math.max(0, shield.current - dt);
      pulse.current = Math.max(0, pulse.current - dt * 3);
      invuln.current = Math.max(0, invuln.current - dt);

      /* ---------------- draw ---------------- */
      ctx.fillStyle = "#0d0f18";
      ctx.fillRect(0, 0, W, H);

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

      /* pickups */
      for (const p of pickups.current) {
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        const bob = Math.sin(now / 220) * 3;
        ctx.fillRect(p.x - 8, p.y - 8 + bob, 16, 16);
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
        // hp bar
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

      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(player.current.x - 3 + facing.current.x * 20, player.current.y - 3 + facing.current.y * 20, 6, 6);
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

      if (deadRef.current) {
        ctx.save();
        ctx.fillStyle = "rgba(5,6,11,0.8)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ff2e5b";
        ctx.font = "24px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", W / 2, H / 2);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clearRoom, damagePlayer, enterRoom, goToFloor]);

  const cur = floor.rooms[roomId];

  if (!mounted) {
    return (
      <div className="h-[520px] w-full max-w-5xl rounded-lg border border-neon-magenta/30 bg-panel" />
    );
  }


  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-pixel text-lg text-neon-magenta drop-shadow-[0_0_12px_rgba(255,61,240,0.6)]">
            NEON DUNGEON
          </h1>
          <p className="mt-2 font-pixel text-[8px] leading-relaxed text-muted-foreground">
            WASD / Setas · Andar {floor.level} · Sala {cur?.type ?? "?"} · {roomState}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {Array.from({ length: MAX_HP }).map((_, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-[2px]"
                style={{
                  background: i < hp ? "#ff2e5b" : "transparent",
                  border: "1px solid #ff2e5b66",
                  boxShadow: i < hp ? "0 0 8px #ff2e5b" : "none",
                }}
              />
            ))}
          </div>
          {dead && (
            <button
              type="button"
              onClick={restart}
              className="rounded-sm border border-neon-red bg-neon-red/10 px-4 py-2 font-pixel text-[10px] uppercase text-neon-red"
            >
              Reiniciar
            </button>
          )}
          <button
            type="button"
            onClick={() => setRunning((x) => !x)}
            className="rounded-sm border border-neon-cyan bg-neon-cyan/10 px-4 py-2 font-pixel text-[10px] uppercase text-neon-cyan shadow-neon-cyan transition-colors hover:bg-neon-cyan/20"
          >
            {running ? "Parar" : "Tocar"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full flex-1 rounded-lg border border-neon-magenta/40 shadow-neon-magenta [image-rendering:pixelated]"
        />
        <Minimap floor={floor} currentId={roomId} />
      </div>

      <Sequencer
        pattern={pattern}
        currentStep={currentStep}
        onToggle={toggle}
        inventory={inventory}
      />
    </div>
  );
}
