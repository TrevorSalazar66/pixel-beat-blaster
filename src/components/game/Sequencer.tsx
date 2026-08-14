import { STEPS, TRACKS, type Pattern } from "./tracks";

type Props = {
  pattern: Pattern;
  currentStep: number;
  bpm: number;
};

/** Compact real-time quick-view of the 16-step loop with a sliding playhead. */
export function Sequencer({ pattern, currentStep, bpm }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 bg-gradient-to-t from-background/95 to-transparent px-3 pb-2 pt-6">
      <div className="font-pixel text-[7px] uppercase leading-relaxed text-neon-cyan">
        RACK
        <div className="text-muted-foreground">{bpm} BPM</div>
      </div>
      <div className="relative flex-1">
        <div className="flex flex-col gap-[3px]">
          {TRACKS.map((track, t) => (
            <div key={track.id} className="grid grid-cols-16 gap-[3px]">
              {Array.from({ length: STEPS }).map((_, s) => {
                const cell = pattern[t]?.[s] ?? null;
                const active = currentStep === s;
                return (
                  <div
                    key={s}
                    className="h-2 rounded-[1px] border"
                    style={{
                      borderColor: `${track.color}44`,
                      background: cell
                        ? cell.rare
                          ? "#ffffff"
                          : track.color
                        : active
                          ? `${track.color}33`
                          : "transparent",
                      boxShadow: cell && active ? `0 0 10px ${track.color}` : "none",
                      opacity: cell ? 1 : 0.6,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {currentStep >= 0 && (
          <div
            className="pointer-events-none absolute inset-y-0 w-[2px] bg-neon-cyan/80 shadow-neon-cyan transition-all duration-75"
            style={{ left: `calc(${(currentStep + 0.5) / STEPS} * 100%)` }}
          />
        )}
      </div>
    </div>
  );
}
