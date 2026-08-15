type Props = { onPick: (touch: boolean) => void };

export function DeviceModal({ onPick }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 p-6">
      <p className="text-center font-pixel text-[10px] uppercase leading-relaxed text-neon-cyan">
        Escolha o modo de controle
      </p>
      <button
        type="button"
        onClick={() => onPick(true)}
        className="w-full max-w-xs rounded-sm border border-neon-magenta bg-neon-magenta/10 px-4 py-3 font-pixel text-[9px] uppercase text-neon-magenta"
      >
        Mudar para modo touch
      </button>
      <button
        type="button"
        onClick={() => onPick(false)}
        className="w-full max-w-xs rounded-sm border border-neon-cyan bg-neon-cyan/10 px-4 py-3 font-pixel text-[9px] uppercase text-neon-cyan"
      >
        Manter teclado/mouse
      </button>
    </div>
  );
}
