import type { TrackId } from "@/lib/chiptune";
import { TRACKS, VARIANTS } from "./tracks";
import { FORGE_INPUT, FORGE_VARIANT_CHANCE, forgeFee } from "./dungeon/shop";

type Props = {
  level: number;
  coins: number;
  inventory: Record<TrackId, number>;
  varInventory: Record<TrackId, [number, number]>;
  message: string | null;
  onForge: (track: TrackId) => void;
  onClose: () => void;
};

export function ForgeModal({
  level,
  coins,
  inventory,
  varInventory,
  message,
  onForge,
  onClose,
}: Props) {
  const fee = forgeFee(level);
  const pct = Math.round(FORGE_VARIANT_CHANCE * 100);

  return (
    <div className="absolute inset-0 z-40 flex flex-col gap-3 overflow-auto bg-background/97 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-pixel text-xs uppercase text-neon-yellow drop-shadow-[0_0_12px_rgba(255,226,61,0.6)]">
          ⚒ Forja de Blocos
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-neon-cyan px-3 py-1.5 font-pixel text-[8px] uppercase text-neon-cyan hover:bg-neon-cyan/20"
        >
          Fechar
        </button>
      </div>

      <p className="font-pixel text-[7px] leading-relaxed text-muted-foreground">
        Junte {FORGE_INPUT} blocos normais iguais + taxa de {fee} ♪ (andar B{level}). Resultado:{" "}
        {100 - pct * 2}% bloco normal · {pct}% variação A · {pct}% variação B. Blocos já colocados
        no sequenciador têm variação fixa.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {TRACKS.map((track) => {
          const have = inventory[track.id] ?? 0;
          const vars = varInventory[track.id] ?? [0, 0];
          const can = have >= FORGE_INPUT && coins >= fee;
          return (
            <button
              key={track.id}
              type="button"
              disabled={!can}
              onClick={() => onForge(track.id)}
              className="flex flex-col items-start gap-1 rounded-md border p-3 text-left font-pixel text-[8px] uppercase disabled:opacity-35"
              style={{
                borderColor: track.color,
                color: track.color,
                boxShadow: can ? `0 0 14px ${track.color}55` : "none",
              }}
            >
              <span>{track.short}</span>
              <span className="text-muted-foreground">
                normais x{have} · A x{vars[0]} · B x{vars[1]}
              </span>
              <span className="text-neon-yellow">
                forjar · {FORGE_INPUT} blocos + {fee} ♪
              </span>
              <span className="text-muted-foreground">
                {VARIANTS[track.id][1]} / {VARIANTS[track.id][2]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="font-pixel text-[8px] text-neon-yellow">♪ {coins}</div>
      {message && <div className="font-pixel text-[8px] text-neon-cyan">{message}</div>}
    </div>
  );
}
