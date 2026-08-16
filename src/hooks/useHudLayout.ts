import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LAYOUT,
  HUD_LAYOUT_KEY,
  THUMB_ZONE,
  toAnchored,
  type AnchoredPos,
  type HUDElementId,
  type HUDElementPosition,
  type Orientation,
} from "@/components/game/mobile/types";

type Layout = Record<HUDElementId, AnchoredPos>;
type Stored = Partial<Record<Orientation, HUDElementPosition[]>>;

/**
 * Layout do HUD guardado por Ancoragem Relativa (canto + offset em %),
 * para que nada desapareça ao girar o aparelho.
 */
export function useHudLayout(orientation: Orientation) {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT[orientation]);

  useEffect(() => {
    const next: Layout = { ...DEFAULT_LAYOUT[orientation] };
    try {
      const raw = localStorage.getItem(HUD_LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored;
        for (const p of parsed[orientation] ?? []) {
          if (!p || !p.anchor) continue;
          next[p.elementId] = { anchor: p.anchor, dx: p.dx, dy: p.dy };
        }
      }
    } catch {
      /* ignore */
    }
    setLayout(next);
  }, [orientation]);

  /** Recebe a posição em % da tela e converte para ancoragem relativa. */
  const move = useCallback(
    (id: HUDElementId, xPct: number, yPct: number) => {
      const x = clamp(xPct, 0, 94);
      let y = clamp(yPct, 0, 92);
      // Zonas dos polegares ficam livres de UI
      if (y > THUMB_ZONE.y && (x < THUMB_ZONE.left || x > THUMB_ZONE.right)) y = THUMB_ZONE.y;
      const pos = toAnchored(x, y);
      setLayout((prev) => {
        const next: Layout = { ...prev, [id]: pos };
        try {
          const raw = localStorage.getItem(HUD_LAYOUT_KEY);
          const parsed: Stored = raw ? (JSON.parse(raw) as Stored) : {};
          parsed[orientation] = (Object.keys(next) as HUDElementId[]).map((elementId) => ({
            elementId,
            ...next[elementId],
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
