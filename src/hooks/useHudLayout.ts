import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LAYOUT,
  HUD_LAYOUT_KEY,
  type HUDElementId,
  type HUDElementPosition,
  type Orientation,
} from "@/components/game/mobile/types";

type Layout = Record<HUDElementId, { x: number; y: number }>;
type Stored = Partial<Record<Orientation, HUDElementPosition[]>>;

export function useHudLayout(orientation: Orientation) {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT[orientation]);

  useEffect(() => {
    let next = { ...DEFAULT_LAYOUT[orientation] };
    try {
      const raw = localStorage.getItem(HUD_LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored;
        for (const p of parsed[orientation] ?? []) next[p.elementId] = { x: p.x, y: p.y };
      }
    } catch {
      /* ignore */
    }
    setLayout(next);
  }, [orientation]);

  const move = useCallback(
    (id: HUDElementId, x: number, y: number) => {
      setLayout((prev) => {
        const next = { ...prev, [id]: { x: clamp(x), y: clamp(y) } };
        try {
          const raw = localStorage.getItem(HUD_LAYOUT_KEY);
          const parsed: Stored = raw ? (JSON.parse(raw) as Stored) : {};
          parsed[orientation] = (Object.keys(next) as HUDElementId[]).map((elementId) => ({
            elementId,
            x: next[elementId].x,
            y: next[elementId].y,
          }));
          localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(parsed));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [orientation],
  );

  const reset = useCallback(() => {
    setLayout({ ...DEFAULT_LAYOUT[orientation] });
    try {
      const raw = localStorage.getItem(HUD_LAYOUT_KEY);
      const parsed: Stored = raw ? (JSON.parse(raw) as Stored) : {};
      delete parsed[orientation];
      localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(parsed));
    } catch {
      /* ignore */
    }
  }, [orientation]);

  return { layout, move, reset };
}

const clamp = (v: number) => Math.max(0, Math.min(92, v));
