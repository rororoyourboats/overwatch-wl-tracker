import express from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "matches.json");

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]", "utf8");
}

function loadMatches() {
  ensureStore();
  const raw = fs.readFileSync(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMatches(matches) {
  fs.writeFileSync(dataFile, JSON.stringify(matches, null, 2), "utf8");
}

function summarize(matches) {
  let totalWins = 0;
  let totalLosses = 0;
  const byDay = new Map();

  for (const m of matches) {
    const day = m.date;
    if (!byDay.has(day)) byDay.set(day, { wins: 0, losses: 0 });
    const rec = byDay.get(day);

    if (m.result === "win") {
      totalWins += 1;
      rec.wins += 1;
    } else {
      totalLosses += 1;
      rec.losses += 1;
    }
  }

  const daily = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => {
      const games = v.wins + v.losses;
      const ratio = games === 0 ? 0 : v.wins / games;
      return { date, ...v, games, ratio };
    });

  const totalGames = totalWins + totalLosses;
  const totalRatio = totalGames === 0 ? 0 : totalWins / totalGames;

  return {
    totals: {
      wins: totalWins,
      losses: totalLosses,
      games: totalGames,
      ratio: totalRatio
    },
    daily
  };
}

app.get("/api/matches", (req, res) => {
  const matches = loadMatches();
  res.json(matches);
});

app.post("/api/matches", (req, res) => {
  const { date, result } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  }
  if (result !== "win" && result !== "loss") {
    return res.status(400).json({ error: "Result must be win or loss" });
  }

  const matches = loadMatches();
  matches.push({ id: randomUUID(), date, result, createdAt: new Date().toISOString() });
  saveMatches(matches);
  res.status(201).json({ ok: true });
});

app.delete("/api/matches/:id", (req, res) => {
  const id = req.params.id;
  const matches = loadMatches();
  const next = matches.filter((m) => m.id !== id);
  if (next.length === matches.length) {
    return res.status(404).json({ error: "Match not found" });
  }
  saveMatches(next);
  res.json({ ok: true });
});

app.get("/api/summary", (req, res) => {
  const matches = loadMatches();
  res.json(summarize(matches));
});

ensureStore();
app.listen(PORT, () => {
  console.log(`Overwatch tracker running on http://localhost:${PORT}`);
});
