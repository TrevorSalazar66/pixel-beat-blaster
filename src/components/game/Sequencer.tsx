import { TRACKS, type Pattern } from "./tracks";

type Props = {
  pattern: Pattern;
  currentStep: number;
  onToggle: (track: number, step: number) => void;
};

export function Sequencer({ pattern, currentStep, onToggle }: Props) {
  return (
    <div className="w-full rounded-lg border border-neon-cyan/40 bg-panel p-3 shadow-neon-cyan">
      <div className="mb-2 flex items-center justify-between font-pixel text-[10px] uppercase tracking-widest text-neon-cyan">
        <span>Step Sequencer</span>
        <span className="text-muted-foreground">120 BPM · 16 steps</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {TRACKS.map((track, t) => (
          <div key={track.id} className="flex items-center gap-2">
            <div
              className="w-28 shrink-0 font-pixel text-[8px] uppercase leading-tight"
              style={{ color: track.color }}
            >
              {track.label}
            </div>
            <div className="grid flex-1 grid-cols-16 gap-1">
              {pattern[t].map((on, s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`${track.label} passo ${s + 1}`}
                  aria-pressed={on}
                  onClick={() => onToggle(t, s)}
                  className="h-6 rounded-xs border transition-all"
                  style={{
                    borderColor: currentStep === s ? track.color : `${track.color}55`,
                    background: on ? track.color : "transparent",
                    boxShadow: on
                      ? `0 0 10px ${track.color}, inset 0 0 6px #00000066`
                      : currentStep === s
                        ? `0 0 8px ${track.color}66`
                        : "none",
                    opacity: on ? 1 : currentStep === s ? 0.85 : 0.45,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
