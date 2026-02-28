import express from "express";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const useDb = Boolean(DATABASE_URL);

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "matches.json");

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

let pool = null;
if (useDb) {
  pool = new Pool({
    connectionString: DATABASE_URL
  });
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function ensureFileStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]", "utf8");
}

function loadMatchesFromFile() {
  ensureFileStore();
  const raw = fs.readFileSync(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMatchesToFile(matches) {
  fs.writeFileSync(dataFile, JSON.stringify(matches, null, 2), "utf8");
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id UUID PRIMARY KEY,
      match_date DATE NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('win', 'loss')),
      created_at TIMESTAMPTZ NOT NULL
    )
  `);
}

function toApiMatch(row) {
  return {
    id: row.id,
    date: row.date,
    result: row.result,
    createdAt: row.createdAt
  };
}

async function getMatches() {
  if (!pool) return loadMatchesFromFile();
  const result = await pool.query(
    `SELECT id, to_char(match_date, 'YYYY-MM-DD') AS date, result, created_at AS "createdAt"
     FROM matches
     ORDER BY created_at ASC`
  );
  return result.rows.map(toApiMatch);
}

async function addMatch(match) {
  if (!pool) {
    const matches = loadMatchesFromFile();
    matches.push(match);
    saveMatchesToFile(matches);
    return;
  }
  await pool.query(
    `INSERT INTO matches (id, match_date, result, created_at) VALUES ($1, $2, $3, $4)`,
    [match.id, match.date, match.result, match.createdAt]
  );
}

async function deleteMatchById(id) {
  if (!pool) {
    const matches = loadMatchesFromFile();
    const next = matches.filter((m) => m.id !== id);
    if (next.length === matches.length) return false;
    saveMatchesToFile(next);
    return true;
  }

  const result = await pool.query(`DELETE FROM matches WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

async function replaceMatches(matches) {
  if (!pool) {
    saveMatchesToFile(matches);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM matches");
    for (const m of matches) {
      await client.query(
        `INSERT INTO matches (id, match_date, result, created_at) VALUES ($1, $2, $3, $4)`,
        [m.id, m.date, m.result, m.createdAt]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function isValidMatch(m) {
  return (
    m &&
    typeof m === "object" &&
    typeof m.id === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(m.date) &&
    (m.result === "win" || m.result === "loss") &&
    typeof m.createdAt === "string"
  );
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

app.get("/api/matches", asyncHandler(async (req, res) => {
  const matches = await getMatches();
  res.json(matches);
}));

app.get("/api/backup", asyncHandler(async (req, res) => {
  const matches = await getMatches();
  res.json({ exportedAt: new Date().toISOString(), matches });
}));

app.post("/api/matches", asyncHandler(async (req, res) => {
  const { date, result } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  }
  if (result !== "win" && result !== "loss") {
    return res.status(400).json({ error: "Result must be win or loss" });
  }

  const match = { id: randomUUID(), date, result, createdAt: new Date().toISOString() };
  await addMatch(match);
  res.status(201).json({ ok: true });
}));

app.post("/api/matches/replace", asyncHandler(async (req, res) => {
  const { matches } = req.body;
  if (!Array.isArray(matches)) {
    return res.status(400).json({ error: "matches must be an array" });
  }
  if (!matches.every(isValidMatch)) {
    return res.status(400).json({ error: "Invalid match object(s) in payload" });
  }

  await replaceMatches(matches);
  res.json({ ok: true, count: matches.length });
}));

app.delete("/api/matches/:id", asyncHandler(async (req, res) => {
  const removed = await deleteMatchById(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: "Match not found" });
  }
  res.json({ ok: true });
}));

app.get("/api/summary", asyncHandler(async (req, res) => {
  const matches = await getMatches();
  res.json(summarize(matches));
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  if (pool) {
    await initDb();
  } else {
    ensureFileStore();
  }
  app.listen(PORT, () => {
    const storage = pool ? "PostgreSQL" : "file";
    console.log(`Overwatch tracker running on http://localhost:${PORT} (${storage} storage)`);
  });
}

start().catch((err) => {
  console.error("Failed to start app:", err);
  process.exit(1);
});
