import { useState } from "react";
import type { TrackId } from "@/lib/chiptune";
import { STEPS, TRACKS, VARIANTS, VARIANT_TAG, type Pattern, type Variant } from "./tracks";

type Sel = { track: TrackId; rare: boolean } | null;
type Mode = "place" | "variant" | "remove";

type Props = {
  pattern: Pattern;
  inventory: Record<TrackId, number>;
  rareInventory: Record<TrackId, number>;
  bpm: number;
  currentStep: number;
  onPlace: (
    trackIndex: number,
    step: number,
    block: { track: TrackId; rare: boolean; variant: Variant },
  ) => void;
  onRemove: (trackIndex: number, step: number) => void;
  onCycleVariant: (trackIndex: number, step: number) => void;
  onClose: () => void;
};

export function SequencerEditor({
  pattern,
  inventory,
  rareInventory,
  bpm,
  currentStep,
  onPlace,
  onRemove,
  onCycleVariant,
  onClose,
}: Props) {
  const [sel, setSel] = useState<Sel>(null);
  const [variant, setVariant] = useState<Variant>(0);
  const [mode, setMode] = useState<Mode>("place");

  const clickSlot = (t: number, s: number) => {
    const trackId = TRACKS[t]?.id;
    if (!trackId) return;
    const cell = pattern[t]?.[s] ?? null;
    if (mode === "variant") {
      if (cell) onCycleVariant(t, s);
      return;
    }
    if (mode === "remove") {
      if (cell) onRemove(t, s);
      return;
    }
    if (sel) {
      if (sel.track !== trackId) return;
      onPlace(t, s, { ...sel, variant });
      const left = sel.rare ? rareInventory[sel.track] ?? 0 : inventory[sel.track] ?? 0;
      if (left - 1 <= 0) setSel(null);
    } else if (cell) {
      onRemove(t, s);
    }
  };

  const selTrack = TRACKS.find((t) => t.id === sel?.track) ?? null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col gap-3 overflow-auto bg-background/97 p-4 backdrop-blur-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="truncate font-pixel text-xs uppercase text-neon-magenta drop-shadow-[0_0_12px_rgba(255,61,240,0.6)]">
          Channel Rack
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-pixel text-[9px] text-neon-yellow">{bpm} BPM</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-neon-cyan px-3 py-1.5 font-pixel text-[8px] uppercase text-neon-cyan hover:bg-neon-cyan/20"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["place", "variant", "remove"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-sm border px-3 py-1.5 font-pixel text-[7px] uppercase ${
              mode === m
                ? "border-neon-cyan bg-neon-cyan/15 text-neon-cyan"
                : "border-muted text-muted-foreground"
            }`}
          >
            {m === "place" ? "Colocar" : m === "variant" ? "Variação" : "Remover"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {TRACKS.map((track, t) => (
          <div key={track.id} className="flex items-center gap-2">
            <div
              className="w-24 shrink-0 font-pixel text-[8px] uppercase leading-tight"
              style={{ color: track.color }}
            >
              {track.short}
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-16 gap-1">
              {Array.from({ length: STEPS }).map((_, s) => {
                const cell = pattern[t]?.[s] ?? null;
                const isTarget = sel?.track === track.id;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-label={`${track.short} passo ${s + 1}`}
                    onClick={() => clickSlot(t, s)}
                    className="flex h-8 items-center justify-center rounded-xs border font-pixel text-[7px] transition-all"
                    style={{
                      borderColor:
                        currentStep === s ? "#ffffff" : isTarget ? track.color : `${track.color}55`,
                      background: cell ? (cell.rare ? "#ffffff" : track.color) : "transparent",
                      boxShadow: cell ? `0 0 12px ${track.color}` : "none",
                      opacity: cell ? 1 : isTarget ? 0.6 : 0.3,
                      color: "#0d0f18",
                    }}
                  >
                    {cell ? VARIANT_TAG[cell.variant] : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-neon-purple/40 bg-panel p-3">
        <div className="mb-2 font-pixel text-[8px] uppercase tracking-widest text-neon-purple">
          Variação a colocar
        </div>
        <div className="flex flex-wrap gap-2">
          {([0, 1, 2] as Variant[]).map((v) => {
            const label = selTrack ? VARIANTS[selTrack.id][v] : ["Base", "Variação A", "Variação B"][v];
            const color = selTrack?.color ?? "#b14dff";
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className="rounded-sm border px-3 py-1.5 font-pixel text-[7px] uppercase"
                style={{
                  borderColor: color,
                  color,
                  background: variant === v ? `${color}33` : "transparent",
                  boxShadow: variant === v ? `0 0 12px ${color}` : "none",
                }}
              >
                {v === 0 ? "Base" : v === 1 ? "A" : "B"} · {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-neon-purple/40 bg-panel p-3">
        <div className="mb-3 font-pixel text-[8px] uppercase tracking-widest text-neon-purple">
          Mochila de Blocos
        </div>
        <div className="flex flex-wrap gap-3">
          {TRACKS.flatMap((track) =>
            [false, true].map((rare) => {
              const count = rare ? rareInventory[track.id] ?? 0 : inventory[track.id] ?? 0;
              if (count <= 0) return null;
              const active = sel?.track === track.id && sel.rare === rare;
              return (
                <button
                  key={`${track.id}-${rare}`}
                  type="button"
                  onClick={() => {
                    setSel(active ? null : { track: track.id, rare });
                    setMode("place");
                  }}
                  className="flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-md border font-pixel text-[7px] uppercase"
                  style={{
                    borderColor: track.color,
                    background: active ? `${track.color}33` : "transparent",
                    color: track.color,
                    boxShadow: active ? `0 0 14px ${track.color}` : "none",
                  }}
                >
                  <span
                    className="h-4 w-4 rounded-[2px]"
                    style={{
                      background: rare ? "#ffffff" : track.color,
                      boxShadow: `0 0 10px ${track.color}`,
                    }}
                  />
                  {rare ? `${track.short}+` : track.short}
                  <span className="text-muted-foreground">x{count}</span>
                </button>
              );
            }),
          )}
          {TRACKS.every((t) => (inventory[t.id] ?? 0) <= 0 && (rareInventory[t.id] ?? 0) <= 0) && (
            <span className="font-pixel text-[8px] text-muted-foreground">
              Mochila vazia — derrote inimigos para coletar blocos.
            </span>
          )}
        </div>
      </div>

      <p className="font-pixel text-[7px] leading-relaxed text-muted-foreground">
        Escolha a variação, clique num bloco da mochila e depois num passo da trilha. No modo
        Variação, toque num passo ocupado para alternar Base / A / B. O loop continua tocando em
        background.
      </p>
    </div>
  );
}
