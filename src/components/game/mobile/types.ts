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

export interface HUDElementPosition {
  elementId: HUDElementId;
  x: number; // % da largura (0-100)
  y: number; // % da altura (0-100)
}

export interface MovementGestureLine {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  opacity: number;
  active: boolean;
}

/** Estado de input compartilhado entre a UI touch e o loop do jogo. */
export type TouchInput = {
  move: { x: number; y: number };
  aimActive: boolean;
  aim: { x: number; y: number };
};

export const createTouchInput = (): TouchInput => ({
  move: { x: 0, y: 0 },
  aimActive: false,
  aim: { x: 1, y: 0 },
});

export const GAME_SETTINGS_KEY = "neon_game_settings";
export const HUD_LAYOUT_KEY = "custom_hud_layout";

export type GameSettings = Pick<MobileControlConfig, "brightness" | "volume" | "gameSpeed">;

export const DEFAULT_SETTINGS: GameSettings = { brightness: 1, volume: 0.28, gameSpeed: 1 };

export const DEFAULT_LAYOUT: Record<
  Orientation,
  Record<HUDElementId, { x: number; y: number }>
> = {
  PORTRAIT: {
    minimap: { x: 68, y: 2 },
    stats: { x: 3, y: 2 },
    btnMix: { x: 4, y: 52 },
    btnInventory: { x: 24, y: 52 },
    btnConfig: { x: 80, y: 52 },
  },
  LANDSCAPE: {
    minimap: { x: 78, y: 3 },
    stats: { x: 3, y: 3 },
    btnMix: { x: 34, y: 84 },
    btnInventory: { x: 47, y: 84 },
    btnConfig: { x: 60, y: 84 },
  },
};
