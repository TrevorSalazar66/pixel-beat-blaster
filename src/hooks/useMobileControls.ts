import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  GAME_SETTINGS_KEY,
  type GameSettings,
  type Orientation,
} from "@/components/game/mobile/types";

export type DeviceDetection = "TOUCH" | "DESKTOP" | "AMBIGUOUS";

export function detectDevice(): DeviceDetection {
  if (typeof window === "undefined") return "DESKTOP";
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (mobileUA && touch) return "TOUCH";
  if (!touch && !coarse) return "DESKTOP";
  return "AMBIGUOUS";
}

export function useOrientation(): Orientation {
  const [o, setO] = useState<Orientation>("PORTRAIT");
  useEffect(() => {
    const read = () => setO(window.innerWidth >= window.innerHeight ? "LANDSCAPE" : "PORTRAIT");
    read();
    window.addEventListener("resize", read);
    const so = window.screen?.orientation;
    so?.addEventListener?.("change", read);
    return () => {
      window.removeEventListener("resize", read);
      so?.removeEventListener?.("change", read);
    };
  }, []);
  return o;
}

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GAME_SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as GameSettings) });
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((patch: Partial<GameSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
