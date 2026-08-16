import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Rota de Health Check para o Koyeb
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "pixel-beat-blaster-backend", timestamp: new Date().toISOString() });
});

// Endpoint de cálculo de sinergia musical do sequenciador
app.post("/api/sequencer/analyze", (req, res) => {
  const { pattern, bpm } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: "Pattern data required" });
  }

  let totalNotes = 0;
  let kickCount = 0;
  let snareCount = 0;
  let hatCount = 0;
  let synthCount = 0;

  pattern.forEach((row: any[], trackIndex: number) => {
    row.forEach((cell: any) => {
      if (cell) {
        totalNotes++;
        if (trackIndex === 0) kickCount++;
        if (trackIndex === 1) snareCount++;
        if (trackIndex === 2) hatCount++;
        if (trackIndex === 3) synthCount++;
      }
    });
  });

  // Cálculo de bônus de sinergia rítmica
  const density = totalNotes / 16;
  const grooveBonus = (kickCount > 0 && snareCount > 0) ? 1.15 : 1.0;
  const speedRating = bpm >= 140 ? "HIGH_TEMPO" : bpm <= 100 ? "SLOW_TEMPO" : "BALANCED";

  res.json({
    totalNotes,
    density,
    grooveBonus,
    speedRating,
    distribution: { kick: kickCount, snare: snareCount, hat: hatCount, synth: synthCount },
  });
});

app.listen(port, () => {
  console.log(`Neon Dungeon Backend rodando na porta ${port}`);
});
