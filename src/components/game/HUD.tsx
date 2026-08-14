import { Minimap } from "./Minimap";
import type { Floor } from "./dungeon/generate";

type Props = {
  hp: number;
  maxHp: number;
  coins: number;
  floor: Floor;
  roomId: string;
};

export function HUD({ hp, maxHp, coins, floor, roomId }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-between p-3">
      <div className="flex flex-col gap-2">
        <div className="flex gap-1">
          {Array.from({ length: maxHp }).map((_, i) => (
            <div
              key={i}
              className="h-3.5 w-3.5 rounded-[2px]"
              style={{
                background: i < hp ? "#ff2e5b" : "transparent",
                border: "1px solid #ff2e5b66",
                boxShadow: i < hp ? "0 0 10px #ff2e5b" : "none",
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 font-pixel text-[9px] text-neon-yellow drop-shadow-[0_0_8px_rgba(255,226,61,0.7)]">
          <span>♪</span>
          <span>{coins}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="font-pixel text-[9px] uppercase text-neon-cyan drop-shadow-[0_0_8px_rgba(46,200,255,0.7)]">
          Andar B{floor.level}
        </div>
        <Minimap floor={floor} currentId={roomId} />
      </div>
    </div>
  );
}
