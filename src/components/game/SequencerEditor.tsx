import { useState } from "react";
import type { TrackId } from "@/lib/chiptune";
import { STEPS, TRACKS, VARIANTS, VARIANT_TAG, type Pattern, type Variant } from "./tracks";

type Sel = { track: TrackId; rare: boolean; variant: Variant } | null;
type Mode = "place" | "remove";

type Props = {
  pattern: Pattern;
  inventory: Record<TrackId, number>;
  rareInventory: Record<TrackId, number>;
  varInventory: Record<TrackId, [number, number]>;
  bpm: number;
  currentStep: number;
  onPlace: (
    trackIndex: number,
    step: number,
    block: { track: TrackId; rare: boolean; variant: Variant },
  ) => void;
  onRemove: (trackIndex: number, step: number) => void;
  onClose: () => void;
};

export function SequencerEditor({
  pattern,
  inventory,
  rareInventory,
  varInventory,
  bpm,
  currentStep,
  onPlace,
  onRemove,
  onClose,
}: Props) {
  const [sel, setSel] = useState<Sel>(null);
  const [mode, setMode] = useState<Mode>("place");

  const clickSlot = (t: number, s: number) => {
    const trackId = TRACKS[t]?.id;
    if (!trackId) return;
    const cell = pattern[t]?.[s] ?? null;
    if (mode === "remove") {
      if (cell) onRemove(t, s);
      return;
    }
    if (sel) {
      if (sel.track !== trackId) return;
      onPlace(t, s, sel);
      const left = sel.rare
        ? (rareInventory[sel.track] ?? 0)
        : sel.variant === 0
          ? (inventory[sel.track] ?? 0)
          : ((varInventory[sel.track] ?? [0, 0])[sel.variant - 1] ?? 0);
      if (left - 1 <= 0) setSel(null);
    } else if (cell) {
      onRemove(t, s);
    }
  };

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
        {(["place", "remove"] as const).map((m) => (
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
            {m === "place" ? "Colocar" : "Remover"}
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
        <div className="mb-3 font-pixel text-[8px] uppercase tracking-widest text-neon-purple">
          Mochila de Blocos
        </div>
        <div className="flex flex-wrap gap-3">
          {TRACKS.flatMap((track) =>
            (
              [
                { rare: false, variant: 0 as Variant },
                { rare: true, variant: 0 as Variant },
                { rare: false, variant: 1 as Variant },
                { rare: false, variant: 2 as Variant },
              ] as const
            ).map(({ rare, variant }) => {
              const vars = varInventory[track.id] ?? [0, 0];
              const count = rare
                ? (rareInventory[track.id] ?? 0)
                : variant === 0
                  ? (inventory[track.id] ?? 0)
                  : (vars[variant - 1] ?? 0);
              if (count <= 0) return null;
              const active =
                sel?.track === track.id && sel.rare === rare && sel.variant === variant;
              return (
                <button
                  key={`${track.id}-${rare}-${variant}`}
                  type="button"
                  title={VARIANTS[track.id][variant]}
                  onClick={() => {
                    setSel(active ? null : { track: track.id, rare, variant });
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
                    className="flex h-4 w-4 items-center justify-center rounded-[2px] text-[6px] text-background"
                    style={{
                      background: rare ? "#ffffff" : track.color,
                      boxShadow: `0 0 10px ${track.color}`,
                    }}
                  >
                    {VARIANT_TAG[variant]}
                  </span>
                  {rare ? `${track.short}+` : `${track.short}${VARIANT_TAG[variant]}`}
                  <span className="text-muted-foreground">x{count}</span>
                </button>
              );
            }),
          )}
          {TRACKS.every(
            (t) =>
              (inventory[t.id] ?? 0) <= 0 &&
              (rareInventory[t.id] ?? 0) <= 0 &&
              ((varInventory[t.id] ?? [0, 0])[0] ?? 0) <= 0 &&
              ((varInventory[t.id] ?? [0, 0])[1] ?? 0) <= 0,
          ) && (
            <span className="font-pixel text-[8px] text-muted-foreground">
              Mochila vazia — derrote inimigos para coletar blocos.
            </span>
          )}
        </div>
      </div>

      <p className="font-pixel text-[7px] leading-relaxed text-muted-foreground">
        Clique num bloco da mochila e depois num passo da trilha. A variação do bloco é fixa: só a
        Forja (sala ⚒) transforma blocos normais iguais em variações A ou B. O loop continua tocando
        em background.
      </p>
    </div>
  );
}
