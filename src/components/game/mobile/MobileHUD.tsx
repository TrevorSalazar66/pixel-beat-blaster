import { useRef } from "react";
import { Minimap } from "../Minimap";
import type { Floor } from "../dungeon/generate";
import { anchorStyle, type HUDElementId, type Orientation } from "./types";
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
      {editing && (
        <>
          <div className="absolute bottom-0 left-0 h-[36%] w-[30%] rounded-tr-2xl border-2 border-dashed border-neon-cyan/40 bg-neon-cyan/5" />
          <div className="absolute bottom-0 right-0 h-[36%] w-[30%] rounded-tl-2xl border-2 border-dashed border-neon-magenta/40 bg-neon-magenta/5" />
        </>
      )}
      <Draggable id="minimap" editing={editing} layout={layout}>
        <div className="flex items-center gap-1 rounded-md border border-neon-cyan/60 bg-background/40 p-1 opacity-85">
          <Minimap floor={floor} currentId={roomId} />
          <span className="shrink-0 font-pixel text-[8px] uppercase text-neon-cyan">
            B{floor.level}
          </span>
        </div>
      </Draggable>

      <Draggable id="stats" editing={editing} layout={layout}>
        <div className="flex items-center gap-2 rounded-md border border-neon-magenta/40 bg-background/50 px-2 py-1.5">
          <div className="flex shrink-0 gap-1">
            {Array.from({ length: maxHp }).map((_, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-[2px]"
                style={{
                  background: i < hp ? "#ff2e5b" : "transparent",
                  border: "1px solid #ff2e5b66",
                  boxShadow: i < hp ? "0 0 8px #ff2e5b" : "none",
                }}
              />
            ))}
          </div>
          <div className="shrink-0 font-pixel text-[8px] text-neon-yellow">♪ {coins}</div>
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
      className="rounded-full border-2 bg-background/60 px-3 py-2 font-pixel text-[9px] uppercase"
      style={{ borderColor: color, color, boxShadow: `0 0 14px ${color}66` }}
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
  const style = anchorStyle(pos);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const parent = ref.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const box = el.getBoundingClientRect();
    const grabX = e.clientX - box.left;
    const grabY = e.clientY - box.top;
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
      className={`pointer-events-auto absolute max-w-[46%] touch-none ${
        editing ? "cursor-move rounded-md outline-dashed outline-2 outline-neon-magenta/80" : ""
      }`}
      style={style}
    >
      {children}
    </div>
  );
}
