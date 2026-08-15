import { useState } from "react";
import type { GameSettings } from "./types";

type Props = {
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  editing: boolean;
  onToggleEditing: (v: boolean) => void;
  onResetLayout: () => void;
  onClose: () => void;
};

export function SettingsModal({
  settings,
  onChange,
  editing,
  onToggleEditing,
  onResetLayout,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"game" | "ui">("game");

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/92 p-4">
      <div className="w-full max-w-sm rounded-lg border border-neon-purple/60 bg-panel p-4">
        <div className="mb-4 flex gap-2">
          {(["game", "ui"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-sm border px-2 py-2 font-pixel text-[8px] uppercase ${
                tab === t
                  ? "border-neon-cyan bg-neon-cyan/15 text-neon-cyan"
                  : "border-muted text-muted-foreground"
              }`}
            >
              {t === "game" ? "Ajustes" : "Editar UI"}
            </button>
          ))}
        </div>

        {tab === "game" ? (
          <div className="flex flex-col gap-4">
            <Slider
              label={`Volume ${Math.round(settings.volume * 100)}%`}
              min={0}
              max={1}
              step={0.01}
              value={settings.volume}
              onChange={(v) => onChange({ volume: v })}
            />
            <Slider
              label={`Brilho ${settings.brightness.toFixed(2)}x`}
              min={0.5}
              max={1.5}
              step={0.05}
              value={settings.brightness}
              onChange={(v) => onChange({ brightness: v })}
            />
            <div>
              <p className="mb-2 font-pixel text-[8px] uppercase text-muted-foreground">
                Velocidade do jogo
              </p>
              <div className="flex gap-2">
                {[0.8, 1, 1.2].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ gameSpeed: s })}
                    className={`flex-1 rounded-sm border px-2 py-2 font-pixel text-[8px] ${
                      settings.gameSpeed === s
                        ? "border-neon-yellow bg-neon-yellow/15 text-neon-yellow"
                        : "border-muted text-muted-foreground"
                    }`}
                  >
                    {s.toFixed(1)}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-pixel text-[8px] leading-relaxed text-muted-foreground">
              Ative o modo de edição e arraste minimapa, atributos e botões livremente. As posições
              ficam salvas neste dispositivo.
            </p>
            <button
              type="button"
              onClick={() => onToggleEditing(!editing)}
              className={`rounded-sm border px-3 py-2 font-pixel text-[9px] uppercase ${
                editing
                  ? "border-neon-red bg-neon-red/15 text-neon-red"
                  : "border-neon-magenta bg-neon-magenta/15 text-neon-magenta"
              }`}
            >
              {editing ? "Concluir edição" : "Editar layout UI"}
            </button>
            <button
              type="button"
              onClick={onResetLayout}
              className="rounded-sm border border-muted px-3 py-2 font-pixel text-[9px] uppercase text-muted-foreground"
            >
              Restaurar padrão
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-sm border border-neon-cyan px-3 py-2 font-pixel text-[9px] uppercase text-neon-cyan"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-pixel text-[8px] uppercase text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#2ec8ff]"
      />
    </label>
  );
}
