import type { CSSProperties } from "react";

export type Orientation = "PORTRAIT" | "LANDSCAPE";

export interface MobileControlConfig {
  isTouchDevice: boolean;
  orientation: Orientation;
  useGestureMovement: boolean; // true no Retrato, false na Paisagem
  brightness: number; // 0.5 a 1.5
  volume: number; // 0 a 1.0
  gameSpeed: number; // 0.8 a 1.2
}

export type HUDElementId = "minimap" | "stats" | "btnMix" | "btnInventory" | "btnConfig";

/** Cantos de ancoragem: guardamos o canto + offset em %, nunca pixels. */
export type Anchor =
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "MID_LEFT"
  | "MID_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_CENTER"
  | "BOTTOM_RIGHT";

export interface HUDElementPosition {
  elementId: HUDElementId;
  anchor: Anchor;
  /** offset horizontal em % da largura da tela */
  dx: number;
  /** offset vertical em % da altura da tela */
  dy: number;
}

export type AnchoredPos = { anchor: Anchor; dx: number; dy: number };

/** Zonas dos polegares: cantos inferiores reservados para os analogicos. */
export const THUMB_ZONE = { y: 64, left: 30, right: 70 };

export const GAME_SETTINGS_KEY = "neon_game_settings";
export const HUD_LAYOUT_KEY = "custom_hud_layout";

export type GameSettings = Pick<MobileControlConfig, "brightness" | "volume" | "gameSpeed">;

export const DEFAULT_SETTINGS: GameSettings = { brightness: 1, volume: 0.28, gameSpeed: 1 };

export const DEFAULT_LAYOUT: Record<Orientation, Record<HUDElementId, AnchoredPos>> = {
  PORTRAIT: {
    stats: { anchor: "TOP_LEFT", dx: 2, dy: 2 },
    minimap: { anchor: "TOP_RIGHT", dx: -2, dy: 2 },
    btnMix: { anchor: "TOP_CENTER", dx: -13, dy: 1 },
    btnInventory: { anchor: "TOP_CENTER", dx: 0, dy: 1 },
    btnConfig: { anchor: "TOP_CENTER", dx: 13, dy: 1 },
  },
  LANDSCAPE: {
    stats: { anchor: "TOP_LEFT", dx: 2, dy: 3 },
    minimap: { anchor: "TOP_RIGHT", dx: -2, dy: 3 },
    btnMix: { anchor: "TOP_CENTER", dx: -11, dy: 2 },
    btnInventory: { anchor: "TOP_CENTER", dx: 0, dy: 2 },
    btnConfig: { anchor: "TOP_CENTER", dx: 11, dy: 2 },
  },
};

/** Converte ancoragem + offset em estilo CSS relativo (sem pixels fixos). */
export function anchorStyle(pos: AnchoredPos): CSSProperties {
  const a = pos.anchor;
  const style: CSSProperties = { position: "absolute" };
  const tx: string[] = [];
  if (a.endsWith("LEFT")) style.left = `${pos.dx}%`;
  else if (a.endsWith("RIGHT")) style.right = `${-pos.dx}%`;
  else {
    style.left = `${50 + pos.dx}%`;
    tx.push("translateX(-50%)");
  }
  if (a.startsWith("TOP")) style.top = `${pos.dy}%`;
  else if (a.startsWith("BOTTOM")) style.bottom = `${-pos.dy}%`;
  else {
    style.top = `${50 + pos.dy}%`;
    tx.push("translateY(-50%)");
  }
  if (tx.length) style.transform = tx.join(" ");
  return style;
}

/** Descobre o canto mais proximo de uma posicao em % e devolve o offset relativo. */
export function toAnchored(xPct: number, yPct: number): AnchoredPos {
  const horiz = xPct < 33 ? "LEFT" : xPct > 67 ? "RIGHT" : "CENTER";
  const vert = yPct < 34 ? "TOP" : yPct > 66 ? "BOTTOM" : "MID";
  let anchor: Anchor;
  if (vert === "MID") anchor = (horiz === "RIGHT" ? "MID_RIGHT" : "MID_LEFT") as Anchor;
  else anchor = `${vert}_${horiz}` as Anchor;

  const dx =
    anchor.endsWith("LEFT")
      ? xPct
      : anchor.endsWith("RIGHT")
        ? xPct - 100
        : xPct - 50;
  const dy = anchor.startsWith("TOP") ? yPct : anchor.startsWith("BOTTOM") ? yPct - 100 : yPct - 50;
  return { anchor, dx, dy };
}
