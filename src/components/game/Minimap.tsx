import { GRID, type Floor } from "./dungeon/generate";

export function Minimap({ floor, currentId }: { floor: Floor; currentId: string }) {
  const cells = Array.from({ length: GRID * GRID }, (_, i) => ({
    x: i % GRID,
    y: Math.floor(i / GRID),
  }));

  return (
    <div className="grid grid-cols-5 gap-[3px] rounded-md border border-neon-cyan/30 bg-background/70 p-1.5 backdrop-blur-sm">
      {cells.map(({ x, y }) => {
        const room = floor.rooms[`${x},${y}`];
        const active = room?.id === currentId;
        const visited = room && room.state !== "UNVISITED";

        if (!room || !visited) {
          return (
            <div
              key={`${x},${y}`}
              className="h-4 w-4 rounded-[2px] border border-transparent bg-transparent"
            />
          );
        }

        const icon = room.type === "SHOP" ? "$" : room.type === "FORGE" ? "🔨" : room.type === "BOSS" ? "☠" : "";
        return (
          <div
            key={`${x},${y}`}
            className={`flex h-4 w-4 items-center justify-center rounded-[2px] border text-[7px] leading-none ${
              active ? "animate-pulse" : ""
            }`}
            style={{
              borderColor: active ? "#2ec8ff" : "#ffffff33",
              background: active ? "#2ec8ff44" : "#8b93a822",
              color: active ? "#2ec8ff" : "#8b93a8",
              boxShadow: active ? "0 0 10px #2ec8ff" : "none",
            }}
          >
            {icon}
          </div>
        );
      })}
    </div>
  );
}

