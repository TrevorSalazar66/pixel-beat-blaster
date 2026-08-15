import { useEffect, useRef, useState } from "react";
import type { MovementGestureLine, Orientation, TouchInput } from "./types";

type Stick = { id: number; ox: number; oy: number; x: number; y: number };

type Props = {
  orientation: Orientation;
  input: React.MutableRefObject<TouchInput>;
  enabled: boolean;
};

const MAX_R = 52;

/**
 * Retrato: gesto de linha reta (metade superior) move; analógico flutuante (metade inferior) atira.
 * Paisagem: dual-stick — esquerdo move, direito atira.
 */
export function TouchControls({ orientation, input, enabled }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [moveStick, setMoveStick] = useState<Stick | null>(null);
  const [fireStick, setFireStick] = useState<Stick | null>(null);
  const [line, setLine] = useState<MovementGestureLine | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const portrait = orientation === "PORTRAIT";

  useEffect(() => {
    if (!enabled) {
      input.current.move = { x: 0, y: 0 };
      input.current.aimActive = false;
      setMoveStick(null);
      setFireStick(null);
      setLine(null);
    }
  }, [enabled, input, orientation]);

  if (!enabled) return null;

  const local = (e: React.PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  const onDown = (e: React.PointerEvent) => {
    const p = local(e);
    rootRef.current?.setPointerCapture(e.pointerId);
    if (portrait) {
      if (p.y < p.h * 0.5) {
        gesture.current = { id: e.pointerId, x: p.x, y: p.y };
        setLine({ startX: p.x, startY: p.y, endX: p.x, endY: p.y, opacity: 0.6, active: true });
      } else {
        setFireStick({ id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y });
      }
    } else {
      if (p.x < p.w * 0.5) setMoveStick({ id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y });
      else setFireStick({ id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (gesture.current?.id === e.pointerId) {
      setLine((l) => (l ? { ...l, endX: p.x, endY: p.y } : l));
      return;
    }
    if (moveStick?.id === e.pointerId) {
      const s = { ...moveStick, x: p.x, y: p.y };
      setMoveStick(s);
      input.current.move = vec(s);
      return;
    }
    if (fireStick?.id === e.pointerId) {
      const s = { ...fireStick, x: p.x, y: p.y };
      setFireStick(s);
      const v = vec(s);
      if (v.x || v.y) {
        input.current.aim = norm(v);
        input.current.aimActive = true;
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (gesture.current?.id === e.pointerId) {
      const g = gesture.current;
      const p = local(e);
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const len = Math.hypot(dx, dy);
      input.current.move = len > 14 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
      gesture.current = null;
      setLine((l) => (l ? { ...l, endX: p.x, endY: p.y, opacity: 0, active: false } : l));
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => setLine(null), 300);
      return;
    }
    if (moveStick?.id === e.pointerId) {
      setMoveStick(null);
      input.current.move = { x: 0, y: 0 };
      return;
    }
    if (fireStick?.id === e.pointerId) {
      setFireStick(null);
      input.current.aimActive = false;
    }
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-10 touch-none select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {line && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <line
            x1={line.startX}
            y1={line.startY}
            x2={line.endX}
            y2={line.endY}
            stroke="rgba(0, 229, 255, 0.6)"
            strokeWidth={5}
            strokeLinecap="round"
            style={{ opacity: line.opacity, transition: "opacity 300ms linear" }}
          />
        </svg>
      )}

      {moveStick && <StickView s={moveStick} color="0, 229, 255" />}
      {fireStick && <StickView s={fireStick} color="255, 0, 100" />}
    </div>
  );
}

function StickView({ s, color }: { s: Stick; color: string }) {
  const v = vec(s);
  return (
    <div className="pointer-events-none absolute" style={{ left: s.ox, top: s.oy }}>
      <div
        className="absolute rounded-full"
        style={{
          width: MAX_R * 2,
          height: MAX_R * 2,
          marginLeft: -MAX_R,
          marginTop: -MAX_R,
          background: `rgba(${color}, 0.12)`,
          border: `2px solid rgba(${color}, 0.4)`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 44,
          height: 44,
          marginLeft: -22,
          marginTop: -22,
          transform: `translate(${v.x * MAX_R}px, ${v.y * MAX_R}px)`,
          background: `rgba(${color}, 0.4)`,
          boxShadow: `0 0 18px rgba(${color}, 0.6)`,
        }}
      />
    </div>
  );
}

function vec(s: Stick) {
  const dx = s.x - s.ox;
  const dy = s.y - s.oy;
  const len = Math.hypot(dx, dy);
  if (len < 8) return { x: 0, y: 0 };
  const c = Math.min(1, len / MAX_R);
  return { x: (dx / len) * c, y: (dy / len) * c };
}

function norm(v: { x: number; y: number }) {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}
