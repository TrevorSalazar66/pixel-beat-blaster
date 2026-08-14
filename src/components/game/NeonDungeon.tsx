import { useCallback, useEffect, useRef, useState } from "react";
import { getAudio, playTrack } from "@/lib/chiptune";
import { Sequencer } from "./Sequencer";
import { STEPS, TRACKS, createPattern, type Pattern } from "./tracks";

const W = 800;
const H = 450;
const WALL = 16;
const SIZE = 32;
const SPEED = 190; // px/s
const BPM = 120;

type Vec = { x: number; y: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number };
type Blast = { x: number; y: number; t: number };

export function NeonDungeon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pattern, setPattern] = useState<Pattern>(createPattern);
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(false);

  const patternRef = useRef(pattern);
  patternRef.current = pattern;

  const keys = useRef<Record<string, boolean>>({});
  const player = useRef<Vec>({ x: W / 2 - SIZE / 2, y: H / 2 - SIZE / 2 });
  const facing = useRef<Vec>({ x: 1, y: 0 });
  const shots = useRef<Shot[]>([]);
  const blasts = useRef<Blast[]>([]);
  const shield = useRef(0);
  const pulse = useRef(0);

  const toggle = useCallback((t: number, s: number) => {
    setPattern((p) => p.map((row, i) => (i === t ? row.map((v, j) => (j === s ? !v : v)) : row)));
  }, []);

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

  /* ---- actions fired by the sequencer ---- */
  const fire = useCallback((trackIndex: number) => {
    const track = TRACKS[trackIndex];
    if (!track) return;
    const cx = player.current.x + SIZE / 2;
    const cy = player.current.y + SIZE / 2;
    const f = facing.current;

    if (track.id === "kick") {
      shots.current.push({ x: cx, y: cy, vx: f.x * 420, vy: f.y * 420, life: 2, color: track.color, r: 7 });
      pulse.current = 1;
    } else if (track.id === "hat") {
      shots.current.push({ x: cx, y: cy, vx: f.x * 720, vy: f.y * 720, life: 1.2, color: track.color, r: 3.5 });
    } else if (track.id === "snare") {
      shield.current = 0.5;
    } else {
      blasts.current.push({ x: cx, y: cy, t: 0 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        shots.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * 300,
          vy: Math.sin(a) * 300,
          life: 0.9,
          color: track.color,
          r: 4,
        });
      }
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
          if (row[s]) {
            const track = TRACKS[t];
            if (track) playTrack(track.id, when);
          }
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

  /* ---- render + movement loop ---- */
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
      const k = keys.current;
      let dx = 0;
      let dy = 0;
      if (k["a"] || k["arrowleft"]) dx -= 1;
      if (k["d"] || k["arrowright"]) dx += 1;
      if (k["w"] || k["arrowup"]) dy -= 1;
      if (k["s"] || k["arrowdown"]) dy += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        facing.current = { x: dx, y: dy };
        player.current.x += dx * SPEED * dt;
        player.current.y += dy * SPEED * dt;
      }
      player.current.x = Math.min(Math.max(player.current.x, WALL), W - WALL - SIZE);
      player.current.y = Math.min(Math.max(player.current.y, WALL), H - WALL - SIZE);

      shots.current = shots.current.filter((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        return s.life > 0 && s.x > WALL && s.x < W - WALL && s.y > WALL && s.y < H - WALL;
      });
      blasts.current = blasts.current.filter((b) => (b.t += dt) < 0.45);
      shield.current = Math.max(0, shield.current - dt);
      pulse.current = Math.max(0, pulse.current - dt * 3);

      /* draw */
      ctx.fillStyle = "#0d0f18";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(46,200,255,0.10)";
      ctx.lineWidth = 1;
      for (let x = WALL; x <= W - WALL; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, WALL);
        ctx.lineTo(x, H - WALL);
        ctx.stroke();
      }
      for (let y = WALL; y <= H - WALL; y += 50) {
        ctx.beginPath();
        ctx.moveTo(WALL, y);
        ctx.lineTo(W - WALL, y);
        ctx.stroke();
      }

      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#2ec8ff";
      ctx.strokeStyle = "#2ec8ff";
      ctx.lineWidth = 3;
      ctx.strokeRect(WALL / 2, WALL / 2, W - WALL, H - WALL);
      ctx.shadowColor = "#ff3df0";
      ctx.strokeStyle = "#ff3df0";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(WALL / 2 + 6, WALL / 2 + 6, W - WALL - 12, H - WALL - 12);
      ctx.restore();

      for (const s of shots.current) {
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = s.color;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        ctx.restore();
      }

      for (const b of blasts.current) {
        const r = b.t * 260;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - b.t / 0.45);
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#b14dff";
        ctx.strokeStyle = "#b14dff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const px = Math.round(player.current.x);
      const py = Math.round(player.current.y);
      const parts = ["#2ec8ff", "#b14dff", "#ffe23d"];
      ctx.save();
      parts.forEach((c, i) => {
        ctx.shadowBlur = 14 + pulse.current * 14;
        ctx.shadowColor = c;
        ctx.fillStyle = c;
        ctx.fillRect(px + 2, py + i * (SIZE / 3) + 1, SIZE - 4, SIZE / 3 - 2);
      });
      ctx.restore();

      // facing indicator
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        px + SIZE / 2 - 3 + facing.current.x * 22,
        py + SIZE / 2 - 3 + facing.current.y * 22,
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
        ctx.arc(px + SIZE / 2, py + SIZE / 2, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-pixel text-lg text-neon-magenta drop-shadow-[0_0_12px_rgba(255,61,240,0.6)]">
            NEON DUNGEON
          </h1>
          <p className="mt-2 font-pixel text-[8px] leading-relaxed text-muted-foreground">
            WASD / Setas para mover · O ritmo dispara suas ações
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          className="rounded-sm border border-neon-cyan bg-neon-cyan/10 px-4 py-2 font-pixel text-[10px] uppercase text-neon-cyan shadow-neon-cyan transition-colors hover:bg-neon-cyan/20"
        >
          {running ? "Parar" : "Tocar"}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full rounded-lg border border-neon-magenta/40 shadow-neon-magenta [image-rendering:pixelated]"
      />

      <Sequencer pattern={pattern} currentStep={currentStep} onToggle={toggle} />
    </div>
  );
}
