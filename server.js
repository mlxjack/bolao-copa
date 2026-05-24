const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "db.json");
const SEED_GAMES_FILE = path.join(__dirname, "data", "seed-games.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const sessions = new Map();

const defaultDb = {
  games: [],
  players: [],
  predictions: []
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

async function ensureDb() {
  if (USE_SUPABASE) {
    await readSupabaseDb();
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await writeDb(await initialDb());
  }
}

function normalizeDb(db) {
  return {
    games: Array.isArray(db.games) ? db.games : [],
    players: Array.isArray(db.players) ? db.players : [],
    predictions: Array.isArray(db.predictions) ? db.predictions : []
  };
}

async function initialDb() {
  try {
    const raw = await fs.readFile(SEED_GAMES_FILE, "utf8");
    const games = JSON.parse(raw);
    return {
      ...defaultDb,
      games: Array.isArray(games) ? games : []
    };
  } catch {
    return defaultDb;
  }
}

async function readDb() {
  if (USE_SUPABASE) {
    return readSupabaseDb();
  }
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return normalizeDb(JSON.parse(raw));
}

async function writeDb(db) {
  if (USE_SUPABASE) {
    await writeSupabaseDb(db);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabaseFetch(pathname, options = {}) {
  const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1${pathname}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {})
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro no Supabase: ${response.status} ${text}`);
  }
  return response;
}

async function readSupabaseDb() {
  const response = await supabaseFetch("/app_state?id=eq.main&select=data");
  const rows = await response.json();
  if (rows[0] && rows[0].data) {
    return normalizeDb(rows[0].data);
  }
  const db = await initialDb();
  await writeSupabaseDb(db);
  return db;
}

async function writeSupabaseDb(db) {
  await supabaseFetch("/app_state?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: "main",
      data: normalizeDb(db)
    })
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function isAdmin(req) {
  const token = parseCookies(req).bolao_admin;
  return Boolean(token && sessions.has(token));
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    sendError(res, 401, "Login de administrador necessario.");
    return false;
  }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Corpo muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON invalido."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return null;
  return number;
}

function matchOutcome(home, away) {
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

function scorePrediction(prediction, game) {
  if (!game || game.homeScore === null || game.homeScore === undefined || game.awayScore === null || game.awayScore === undefined) {
    return 0;
  }
  if (prediction.homeScore === game.homeScore && prediction.awayScore === game.awayScore) {
    return 5;
  }
  return matchOutcome(prediction.homeScore, prediction.awayScore) === matchOutcome(game.homeScore, game.awayScore) ? 3 : 0;
}

function buildStandings(db) {
  const gameMap = new Map(db.games.map((game) => [game.id, game]));
  return db.players
    .map((player) => {
      const playerPredictions = db.predictions.filter((prediction) => prediction.playerId === player.id);
      let points = 0;
      let exact = 0;
      let outcome = 0;

      for (const prediction of playerPredictions) {
        const game = gameMap.get(prediction.gameId);
        const partial = scorePrediction(prediction, game);
        points += partial;
        if (partial === 5) exact += 1;
        if (partial === 3) outcome += 1;
      }

      return {
        id: player.id,
        name: player.name,
        points,
        exact,
        outcome,
        predictionsCount: playerPredictions.length,
        createdAt: player.createdAt
      };
    })
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name, "pt-BR"));
}

function publicGame(game) {
  return {
    id: game.id,
    stage: game.stage,
    group: game.group,
    venue: game.venue,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    startsAt: game.startsAt,
    status: game.status,
    homeScore: game.homeScore,
    awayScore: game.awayScore
  };
}

function publicState(db) {
  return {
    games: db.games.map(publicGame).sort(sortGames),
    standings: buildStandings(db),
    playersCount: db.players.length,
    storage: storageInfo(),
    scoring: {
      exact: 5,
      outcome: 3
    }
  };
}

function storageInfo() {
  if (USE_SUPABASE) {
    return {
      mode: "Supabase",
      persistent: true,
      message: "Os dados estao sendo salvos no Supabase."
    };
  }
  return {
    mode: "Arquivo local",
    persistent: Boolean(process.env.DATA_DIR || process.env.DB_FILE),
    message: "Os dados estao sendo salvos em arquivo local. Em hospedagem gratuita, eles podem sumir quando o app reiniciar."
  };
}

function publicPlayerEntry(db, player) {
  const predictionMap = new Map(
    db.predictions
      .filter((prediction) => prediction.playerId === player.id)
      .map((prediction) => [prediction.gameId, prediction])
  );

  return {
    id: player.id,
    name: player.name,
    createdAt: player.createdAt,
    locked: player.locked,
    predictions: db.games.map(publicGame).sort(sortGames).map((game) => {
      const prediction = predictionMap.get(game.id);
      return {
        game,
        homeScore: prediction ? prediction.homeScore : null,
        awayScore: prediction ? prediction.awayScore : null,
        pointsNow: prediction ? scorePrediction(prediction, game) : 0
      };
    })
  };
}

function sortGames(a, b) {
  const left = a.startsAt || "";
  const right = b.startsAt || "";
  return left.localeCompare(right) || a.homeTeam.localeCompare(b.homeTeam, "pt-BR");
}

function validateGamePayload(payload, partial = false) {
  const game = {};
  const textFields = ["stage", "group", "venue", "homeTeam", "awayTeam", "startsAt", "status"];

  for (const field of textFields) {
    if (payload[field] !== undefined) game[field] = String(payload[field] || "").trim();
  }

  if (!partial || payload.homeTeam !== undefined) {
    if (!game.homeTeam) throw new Error("Informe o time mandante.");
  }
  if (!partial || payload.awayTeam !== undefined) {
    if (!game.awayTeam) throw new Error("Informe o time visitante.");
  }

  if (game.status && !["upcoming", "live", "final"].includes(game.status)) {
    throw new Error("Status do jogo invalido.");
  }

  if (payload.homeScore !== undefined) game.homeScore = payload.homeScore === "" || payload.homeScore === null ? null : normalizeScore(payload.homeScore);
  if (payload.awayScore !== undefined) game.awayScore = payload.awayScore === "" || payload.awayScore === null ? null : normalizeScore(payload.awayScore);
  if (game.homeScore === null && payload.homeScore !== "" && payload.homeScore !== null && payload.homeScore !== undefined) throw new Error("Placar do mandante invalido.");
  if (game.awayScore === null && payload.awayScore !== "" && payload.awayScore !== null && payload.awayScore !== undefined) throw new Error("Placar do visitante invalido.");

  return game;
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/api/state") {
    const db = await readDb();
    sendJson(res, 200, publicState(db));
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/games/") && url.pathname.endsWith("/predictions")) {
    const gameId = url.pathname.split("/")[3];
    const db = await readDb();
    const game = db.games.find((item) => item.id === gameId);
    if (!game) {
      sendError(res, 404, "Jogo nao encontrado.");
      return;
    }
    if (!["live", "final"].includes(game.status)) {
      sendJson(res, 200, { game: publicGame(game), predictions: [], hidden: true });
      return;
    }

    const predictions = db.predictions
      .filter((prediction) => prediction.gameId === gameId)
      .map((prediction) => {
        const player = db.players.find((item) => item.id === prediction.playerId);
        return {
          playerId: prediction.playerId,
          playerName: player ? player.name : "Participante removido",
          homeScore: prediction.homeScore,
          awayScore: prediction.awayScore,
          pointsNow: scorePrediction(prediction, game)
        };
      })
      .sort((a, b) => b.pointsNow - a.pointsNow || a.playerName.localeCompare(b.playerName, "pt-BR"));

    sendJson(res, 200, { game: publicGame(game), predictions, hidden: false });
    return;
  }

  if (method === "POST" && url.pathname === "/api/players/lookup") {
    const payload = await readBody(req);
    const db = await readDb();
    const name = normalizeName(payload.name);
    if (name.length < 2) {
      sendError(res, 400, "Digite seu nome para entrar no bolao.");
      return;
    }
    const player = db.players.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!player) {
      sendJson(res, 200, { exists: false, name, games: db.games.map(publicGame).sort(sortGames) });
      return;
    }
    sendJson(res, 200, { exists: true, player: publicPlayerEntry(db, player) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/players") {
    const payload = await readBody(req);
    const db = await readDb();
    const name = normalizeName(payload.name);
    if (name.length < 2) {
      sendError(res, 400, "Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    if (db.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      sendError(res, 409, "Ja existe um participante com esse nome.");
      return;
    }
    if (db.games.length === 0) {
      sendError(res, 400, "O administrador precisa cadastrar os jogos antes dos palpites.");
      return;
    }

    const incoming = Array.isArray(payload.predictions) ? payload.predictions : [];
    const predictionsByGame = new Map(incoming.map((prediction) => [prediction.gameId, prediction]));
    const playerId = crypto.randomUUID();
    const predictions = [];

    for (const game of db.games) {
      const prediction = predictionsByGame.get(game.id);
      const homeScore = prediction ? normalizeScore(prediction.homeScore) : null;
      const awayScore = prediction ? normalizeScore(prediction.awayScore) : null;
      if (homeScore === null || awayScore === null) {
        sendError(res, 400, `Preencha o palpite de ${game.homeTeam} x ${game.awayTeam}.`);
        return;
      }
      predictions.push({
        id: crypto.randomUUID(),
        playerId,
        gameId: game.id,
        homeScore,
        awayScore,
        createdAt: new Date().toISOString(),
        updatedByAdminAt: null
      });
    }

    db.players.push({
      id: playerId,
      name,
      createdAt: new Date().toISOString(),
      locked: true
    });
    db.predictions.push(...predictions);
    await writeDb(db);
    sendJson(res, 201, { ok: true, player: publicPlayerEntry(db, db.players.find((player) => player.id === playerId)), standings: buildStandings(db) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/admin/login") {
    const payload = await readBody(req);
    if (payload.username !== ADMIN_USER || payload.password !== ADMIN_PASSWORD) {
      sendError(res, 401, "Usuario ou senha invalidos.");
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now());
    res.setHeader("Set-Cookie", `bolao_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
    sendJson(res, 200, { ok: true, user: ADMIN_USER });
    return;
  }

  if (method === "POST" && url.pathname === "/api/admin/logout") {
    const token = parseCookies(req).bolao_admin;
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", "bolao_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/admin/me") {
    sendJson(res, 200, { authenticated: isAdmin(req), user: isAdmin(req) ? ADMIN_USER : null });
    return;
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (!requireAdmin(req, res)) return;

    if (method === "GET" && url.pathname === "/api/admin/export") {
      const db = await readDb();
      sendJson(res, 200, db);
      return;
    }

    if (method === "GET" && url.pathname === "/api/admin/players") {
      const db = await readDb();
      sendJson(res, 200, {
        players: db.players,
        predictions: db.predictions,
        games: db.games.map(publicGame).sort(sortGames)
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/games") {
      const payload = await readBody(req);
      try {
        const game = validateGamePayload(payload);
        const db = await readDb();
        db.games.push({
          id: crypto.randomUUID(),
          stage: game.stage || "Fase de grupos",
          group: game.group || "",
          venue: game.venue || "",
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          startsAt: game.startsAt || "",
          status: game.status || "upcoming",
          homeScore: game.homeScore ?? null,
          awayScore: game.awayScore ?? null,
          createdAt: new Date().toISOString()
        });
        await writeDb(db);
        sendJson(res, 201, publicState(db));
      } catch (error) {
        sendError(res, 400, error.message);
      }
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/games/import") {
      const payload = await readBody(req);
      const rows = String(payload.csv || "")
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean);
      if (rows.length === 0) {
        sendError(res, 400, "Cole pelo menos uma linha de jogos.");
        return;
      }
      const db = await readDb();
      let imported = 0;
      for (const row of rows) {
        const separator = row.includes(";") ? ";" : ",";
        const [stage, group, startsAt, homeTeam, awayTeam, venue] = row.split(separator).map((part) => String(part || "").trim());
        if (!homeTeam || !awayTeam) continue;
        db.games.push({
          id: crypto.randomUUID(),
          stage: stage || "Fase de grupos",
          group: group || "",
          venue: venue || "",
          startsAt: startsAt || "",
          homeTeam,
          awayTeam,
          status: "upcoming",
          homeScore: null,
          awayScore: null,
          createdAt: new Date().toISOString()
        });
        imported += 1;
      }
      await writeDb(db);
      sendJson(res, 201, { imported, state: publicState(db) });
      return;
    }

    const gameMatch = url.pathname.match(/^\/api\/admin\/games\/([^/]+)$/);
    if (gameMatch && method === "PATCH") {
      const payload = await readBody(req);
      try {
        const updates = validateGamePayload(payload, true);
        const db = await readDb();
        const game = db.games.find((item) => item.id === gameMatch[1]);
        if (!game) {
          sendError(res, 404, "Jogo nao encontrado.");
          return;
        }
        Object.assign(game, updates, { updatedAt: new Date().toISOString() });
        await writeDb(db);
        sendJson(res, 200, publicState(db));
      } catch (error) {
        sendError(res, 400, error.message);
      }
      return;
    }

    if (gameMatch && method === "DELETE") {
      const db = await readDb();
      db.games = db.games.filter((game) => game.id !== gameMatch[1]);
      db.predictions = db.predictions.filter((prediction) => prediction.gameId !== gameMatch[1]);
      await writeDb(db);
      sendJson(res, 200, publicState(db));
      return;
    }

    const playerMatch = url.pathname.match(/^\/api\/admin\/players\/([^/]+)$/);
    if (playerMatch && method === "PATCH") {
      const payload = await readBody(req);
      const db = await readDb();
      const player = db.players.find((item) => item.id === playerMatch[1]);
      if (!player) {
        sendError(res, 404, "Participante nao encontrado.");
        return;
      }
      const name = normalizeName(payload.name);
      if (name.length >= 2) player.name = name;

      if (Array.isArray(payload.predictions)) {
        for (const item of payload.predictions) {
          const prediction = db.predictions.find((entry) => entry.playerId === player.id && entry.gameId === item.gameId);
          const homeScore = normalizeScore(item.homeScore);
          const awayScore = normalizeScore(item.awayScore);
          if (!prediction || homeScore === null || awayScore === null) continue;
          prediction.homeScore = homeScore;
          prediction.awayScore = awayScore;
          prediction.updatedByAdminAt = new Date().toISOString();
        }
      }
      await writeDb(db);
      sendJson(res, 200, { ok: true, state: publicState(db) });
      return;
    }

    if (playerMatch && method === "DELETE") {
      const db = await readDb();
      db.players = db.players.filter((player) => player.id !== playerMatch[1]);
      db.predictions = db.predictions.filter((prediction) => prediction.playerId !== playerMatch[1]);
      await writeDb(db);
      sendJson(res, 200, publicState(db));
      return;
    }
  }

  sendError(res, 404, "Rota nao encontrada.");
}

async function serveStatic(req, res, url) {
  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === "/") relativePath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Acesso negado");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Arquivo nao encontrado");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendError(res, 500, error.message || "Erro interno.");
  }
});

ensureDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Bolao da Copa rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
