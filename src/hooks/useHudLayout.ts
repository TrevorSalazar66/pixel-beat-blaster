import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LAYOUT,
  HUD_LAYOUT_KEY,
  type AnchorZone,
  type HUDElementId,
  type HUDElementPosition,
  type Orientation,
} from "@/components/game/mobile/types";

type ElementLayout = { x: number; y: number; anchor?: AnchorZone; offsetX?: number; offsetY?: number };
type Layout = Record<HUDElementId, ElementLayout>;
type Stored = Partial<Record<Orientation, HUDElementPosition[]>>;

function determineAnchor(x: number, y: number): { anchor: AnchorZone; offsetX: number; offsetY: number } {
  let anchor: AnchorZone = "TOP_LEFT";
  let offsetX = x;
  let offsetY = y;

  if (y < 50) {
    if (x < 33) {
      anchor = "TOP_LEFT";
      offsetX = x;
      offsetY = y;
    } else if (x > 66) {
      anchor = "TOP_RIGHT";
      offsetX = 100 - x;
      offsetY = y;
    } else {
      anchor = "TOP_CENTER";
      offsetX = x - 50;
      offsetY = y;
    }
  } else {
    if (x < 33) {
      anchor = "BOTTOM_LEFT";
      offsetX = x;
      offsetY = 100 - y;
    } else if (x > 66) {
      anchor = "BOTTOM_RIGHT";
      offsetX = 100 - x;
      offsetY = 100 - y;
    } else {
      anchor = "BOTTOM_CENTER";
      offsetX = x - 50;
      offsetY = 100 - y;
    }
  }

  return { anchor, offsetX, offsetY };
}

function resolveCoordinates(item: HUDElementPosition): { x: number; y: number } {
  if (!item.anchor) return { x: item.x, y: item.y };
  const ox = item.offsetX ?? 0;
  const oy = item.offsetY ?? 0;

  switch (item.anchor) {
    case "TOP_LEFT":
      return { x: ox, y: oy };
    case "TOP_RIGHT":
      return { x: 100 - ox, y: oy };
    case "TOP_CENTER":
      return { x: 50 + ox, y: oy };
    case "BOTTOM_LEFT":
      return { x: ox, y: 100 - oy };
    case "BOTTOM_RIGHT":
      return { x: 100 - ox, y: 100 - oy };
    case "BOTTOM_CENTER":
      return { x: 50 + ox, y: 100 - oy };
  }
}

export function useHudLayout(orientation: Orientation) {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT[orientation]);

  useEffect(() => {
    let next = { ...DEFAULT_LAYOUT[orientation] };
    try {
      const raw = localStorage.getItem(HUD_LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored;
        for (const p of parsed[orientation] ?? []) {
          const coords = resolveCoordinates(p);
          next[p.elementId] = {
            x: clamp(coords.x),
            y: clamp(coords.y),
            anchor: p.anchor,
            offsetX: p.offsetX,
            offsetY: p.offsetY,
          };
        }
      }
    } catch {
      /* ignore */
    }
    setLayout(next);
  }, [orientation]);

  const move = useCallback(
    (id: HUDElementId, x: number, y: number) => {
      const cx = clamp(x);
      const cy = clamp(y);
      const { anchor, offsetX, offsetY } = determineAnchor(cx, cy);

      setLayout((prev) => {
        const next = {
          ...prev,
          [id]: { x: cx, y: cy, anchor, offsetX, offsetY },
        };
        try {
          const raw = localStorage.getItem(HUD_LAYOUT_KEY);
          const parsed: Stored = raw ? (JSON.parse(raw) as Stored) : {};
          parsed[orientation] = (Object.keys(next) as HUDElementId[]).map((elementId) => ({
            elementId,
            x: next[elementId].x,
            y: next[elementId].y,
            anchor: next[elementId].anchor,
            offsetX: next[elementId].offsetX,
            offsetY: next[elementId].offsetY,
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

