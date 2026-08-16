import { useRef } from "react";
import { Minimap } from "../Minimap";
import type { Floor } from "../dungeon/generate";
import type { HUDElementId, Orientation } from "./types";
import { useHudLayout } from "@/hooks/useHudLayout";

type Props = {
  hp: number;
  maxHp: number;
  coins: number;
  floor: Floor;
  roomId: string;
  orientation: Orientation;
  editing: boolean;
  onMix: () => void;
  onInventory: () => void;
  onConfig: () => void;
  layout: ReturnType<typeof useHudLayout>;
};

export function MobileHUD({
  hp,
  maxHp,
  coins,
  floor,
  roomId,
  editing,
  onMix,
  onInventory,
  onConfig,
  layout,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <Draggable id="stats" editing={editing} layout={layout}>
        <div className="flex items-center gap-2 rounded-md border border-neon-magenta/40 bg-background/70 px-2.5 py-1.5 shadow-md backdrop-blur-sm">
          <div className="flex gap-1">
            {Array.from({ length: maxHp }).map((_, i) => (
              <div
                key={i}
                className="h-3.5 w-3.5 rounded-[2px]"
                style={{
                  background: i < hp ? "#ff2e5b" : "transparent",
                  border: "1px solid #ff2e5b66",
                  boxShadow: i < hp ? "0 0 8px #ff2e5b" : "none",
                }}
              />
            ))}
          </div>
          <div className="h-3 w-[1px] bg-muted-foreground/30" />
          <div className="font-pixel text-[8px] text-neon-yellow">♪ {coins}</div>
          <div className="font-pixel text-[8px] uppercase text-neon-cyan">B{floor.level}</div>
        </div>
      </Draggable>

      <Draggable id="minimap" editing={editing} layout={layout}>
        <div className="rounded-md border border-neon-cyan/60 bg-background/70 p-1 opacity-90 shadow-md backdrop-blur-sm">
          <Minimap floor={floor} currentId={roomId} />
        </div>
      </Draggable>

      <Draggable id="btnMix" editing={editing} layout={layout}>
        <ActionButton label="MIX" color="#2ec8ff" onClick={onMix} editing={editing} />
      </Draggable>
      <Draggable id="btnInventory" editing={editing} layout={layout}>
        <ActionButton label="INV" color="#ffe23d" onClick={onInventory} editing={editing} />
      </Draggable>
      <Draggable id="btnConfig" editing={editing} layout={layout}>
        <ActionButton label="⚙" color="#b14dff" onClick={onConfig} editing={editing} />
      </Draggable>
    </div>
  );
}

function ActionButton({
  label,
  color,
  onClick,
  editing,
}: {
  label: string;
  color: string;
  onClick: () => void;
  editing: boolean;
}) {
  return (
    <button
      type="button"
      onClick={editing ? undefined : onClick}
      className="rounded-full border-2 bg-background/80 px-3 py-1.5 font-pixel text-[9px] uppercase shadow-md backdrop-blur-sm transition-transform active:scale-95"
      style={{ borderColor: color, color, boxShadow: `0 0 12px ${color}66` }}
    >
      {label}
    </button>
  );
}

function Draggable({
  id,
  editing,
  layout,
  children,
}: {
  id: HUDElementId;
  editing: boolean;
  layout: ReturnType<typeof useHudLayout>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pos = layout.layout[id];

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const parent = ref.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const grabX = e.clientX - el.getBoundingClientRect().left;
    const grabY = e.clientY - el.getBoundingClientRect().top;
    const move = (ev: PointerEvent) => {
      layout.move(
        id,
        ((ev.clientX - grabX - rect.left) / rect.width) * 100,
        ((ev.clientY - grabY - rect.top) / rect.height) * 100,
      );
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className={`pointer-events-auto absolute touch-none select-none ${
        editing ? "cursor-move rounded-md outline-dashed outline-2 outline-neon-magenta/80" : ""
      }`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      {children}
    </div>
  );
}

