import { GRID, type Floor } from "./dungeon/generate";

const TYPE_COLOR: Record<string, string> = {
  SPAWN: "#2ec8ff",
  NORMAL: "#4b5b86",
  SHOP: "#ffe23d",
  REWARD: "#3dff9e",
  BOSS: "#b14dff",
};

export function Minimap({ floor, currentId }: { floor: Floor; currentId: string }) {
  const cells = Array.from({ length: GRID * GRID }, (_, i) => ({
    x: i % GRID,
    y: Math.floor(i / GRID),
  }));

  return (
    <div className="rounded-lg border border-neon-purple/40 bg-panel p-3">
      <div className="mb-2 font-pixel text-[8px] uppercase tracking-widest text-neon-purple">
        Andar {floor.level}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {cells.map(({ x, y }) => {
          const room = floor.rooms[`${x},${y}`];
          const active = room?.id === currentId;
          const color = room ? TYPE_COLOR[room.type] ?? "#4b5b86" : "transparent";
          return (
            <div
              key={`${x},${y}`}
              className="h-5 w-5 rounded-[2px] border"
              style={{
                borderColor: room ? `${color}88` : "#ffffff10",
                background: room
                  ? room.state === "CLEARED"
                    ? `${color}55`
                    : `${color}18`
                  : "transparent",
                boxShadow: active ? `0 0 10px ${color}` : "none",
                outline: active ? `1px solid ${color}` : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
