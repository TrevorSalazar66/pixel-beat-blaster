import { useEffect, useRef, useState } from "react";
import type { Orientation, TouchInput } from "./types";

type Stick = { id: number; ox: number; oy: number; x: number; y: number };

type Props = {
  orientation: Orientation;
  input: React.MutableRefObject<TouchInput>;
  enabled: boolean;
};

const MAX_R = 52;

/**
 * Retrato: analógico invisível livre na metade superior (movimento 360°);
 * analógico de mira/tiro na metade inferior.
 * Paisagem: dual-stick — esquerdo move, direito mira e atira.
 */
export function TouchControls({ orientation, input, enabled }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [moveStick, setMoveStick] = useState<Stick | null>(null);
  const [fireStick, setFireStick] = useState<Stick | null>(null);

  const portrait = orientation === "PORTRAIT";

  useEffect(() => {
    if (!enabled) {
      input.current.move = { x: 0, y: 0 };
      input.current.aimActive = false;
      setMoveStick(null);
      setFireStick(null);
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
    const isMoveZone = portrait ? p.y < p.h * 0.5 : p.x < p.w * 0.5;
    if (isMoveZone) setMoveStick({ id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y });
    else setFireStick({ id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y });
  };

  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
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
          background: `rgba(${color}, 0.1)`,
          border: `2px solid rgba(${color}, 0.35)`,
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
