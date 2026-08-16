import { createFileRoute } from "@tanstack/react-router";
import { NeonDungeon } from "@/components/game/NeonDungeon";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neon Dungeon — Roguelike Rítmico Pixel Art" },
      {
        name: "description",
        content:
          "Masmorra cyberpunk 8-bit: mova-se pela sala neon e deixe o sequenciador de 16 passos disparar seus ataques no ritmo de 120 BPM.",
      },
      { property: "og:title", content: "Neon Dungeon — Roguelike Rítmico Pixel Art" },
      {
        property: "og:description",
        content:
          "Sala neon navegável, personagem em pixel art e step sequencer chiptune que dispara ações no ritmo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <NeonDungeon />
    </main>
  );
}
