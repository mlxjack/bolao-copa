const state = {
  games: [],
  standings: [],
  playersCount: 0,
  storage: null,
  admin: false,
  adminData: null,
  participantName: "",
  currentPlayer: null,
  autoLookupDone: false
};

const labels = {
  upcoming: "Nao iniciado",
  live: "Ao vivo",
  final: "Finalizado"
};

const teamCodes = {
  "México": "mx",
  "África do Sul": "za",
  "República da Coreia": "kr",
  "República Tcheca": "cz",
  "Canadá": "ca",
  "Bósnia e Herzegovina": "ba",
  "Estados Unidos": "us",
  "Paraguai": "py",
  "Catar": "qa",
  "Suíça": "ch",
  "Brasil": "br",
  "Marrocos": "ma",
  "Haiti": "ht",
  "Escócia": "gb-sct",
  "Austrália": "au",
  "Turquia": "tr",
  "Alemanha": "de",
  "Curaçau": "cw",
  "Costa do Marfim": "ci",
  "Equador": "ec",
  "Holanda": "nl",
  "Japão": "jp",
  "Suécia": "se",
  "Tunísia": "tn",
  "Espanha": "es",
  "Cabo Verde": "cv",
  "Arábia Saudita": "sa",
  "Uruguai": "uy",
  "Bélgica": "be",
  "Egito": "eg",
  "Irã": "ir",
  "Nova Zelândia": "nz",
  "Áustria": "at",
  "Jordânia": "jo",
  "França": "fr",
  "Senegal": "sn",
  "Iraque": "iq",
  "Noruega": "no",
  "Argentina": "ar",
  "Argélia": "dz",
  "Portugal": "pt",
  "República Democrática do Congo": "cd",
  "Inglaterra": "gb-eng",
  "Croácia": "hr",
  "Gana": "gh",
  "Panamá": "pa",
  "Uzbequistão": "uz",
  "Colômbia": "co"
};

const alertBox = document.querySelector("#alert");
const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll("[data-view-button]");

navButtons.forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewButton));
});

document.querySelector("#nameForm").addEventListener("submit", submitName);
document.querySelector("#entryForm").addEventListener("submit", submitEntry);
document.querySelectorAll(".switch-player").forEach((button) => button.addEventListener("click", resetParticipantFlow));
document.querySelector("#loginForm").addEventListener("submit", login);
document.querySelector("#logoutButton").addEventListener("click", logout);
document.querySelector("#gameForm").addEventListener("submit", createGame);
document.querySelector("#importButton").addEventListener("click", importGames);
document.querySelector("#refreshButton").addEventListener("click", refreshAll);
document.querySelector("#liveGameSelect").addEventListener("change", renderLiveGame);

init();
setInterval(refreshAll, 15000);

async function init() {
  await refreshAll();
  const savedName = localStorage.getItem("bolaoPlayerName");
  if (savedName) {
    document.querySelector("#playerName").value = savedName;
    await lookupParticipant(savedName, true);
  }
  state.autoLookupDone = true;
}

function showView(name) {
  views.forEach((view) => view.classList.toggle("active", view.id === name));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.viewButton === name));
  if (name === "admin") checkAdmin();
  if (name === "live") {
    selectPreferredLiveGame();
    renderLiveGame();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Nao foi possivel completar a acao.");
  return data;
}

async function refreshAll() {
  const data = await api("/api/state");
  state.games = data.games;
  state.standings = data.standings;
  state.playersCount = data.playersCount;
  state.storage = data.storage;
  renderHeroStats();
  renderStorageStatus();
  if (!document.querySelector("#entryForm").classList.contains("hidden")) {
    renderPredictionsForm(readPredictionDraft());
  }
  if (state.currentPlayer) {
    await lookupParticipant(state.currentPlayer.name, true);
  }
  renderStandings();
  renderLiveSelector();
  if (state.admin) await loadAdminData();
}

function renderPredictionsForm(draft = {}) {
  const list = document.querySelector("#predictionList");
  if (state.games.length === 0) {
    list.innerHTML = `<div class="empty">O administrador ainda precisa cadastrar os jogos.</div>`;
    return;
  }
  list.innerHTML = state.games.map((game, index) => {
    const saved = draft[game.id] || {};
    return `
    <div class="match-row" data-game-id="${game.id}">
      <div>
        <div class="match-kicker"><span>Jogo ${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(game.stage || "")}</span></div>
        <div class="teams">${teamsLine(game)}</div>
        <div class="match-meta">${gameMeta(game)}</div>
      </div>
      <input class="home-score score-box" type="number" min="0" max="99" inputmode="numeric" value="${escapeAttr(saved.homeScore ?? "")}" aria-label="Gols ${escapeHtml(game.homeTeam)}" required>
      <strong>x</strong>
      <input class="away-score score-box" type="number" min="0" max="99" inputmode="numeric" value="${escapeAttr(saved.awayScore ?? "")}" aria-label="Gols ${escapeHtml(game.awayTeam)}" required>
    </div>
  `;
  }).join("");
}

function renderStandings() {
  const body = document.querySelector("#standingsBody");
  if (state.standings.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty">Nenhum participante entrou no bolao ainda.</td></tr>`;
    return;
  }
  body.innerHTML = state.standings.map((player, index) => `
    <tr class="${index === 0 ? "standings-leader" : ""}">
      <td data-label="Posicao"><span class="rank rank-${index + 1}">${index + 1}</span></td>
      <td data-label="Participante"><strong class="participant-name-cell">${escapeHtml(player.name)}</strong>${index === 0 ? '<span class="leader-label">Lider</span>' : ""}</td>
      <td data-label="Pontos"><strong class="points-total">${player.points}</strong></td>
      <td data-label="Placares exatos">${player.exact}</td>
      <td data-label="Resultados">${player.outcome}</td>
    </tr>
  `).join("");
}

function renderLiveSelector() {
  const select = document.querySelector("#liveGameSelect");
  const current = select.value;
  select.innerHTML = state.games.map((game) => `
    <option value="${game.id}">${flagCode(game.homeTeam)} ${escapeHtml(game.homeTeam)} x ${flagCode(game.awayTeam)} ${escapeHtml(game.awayTeam)} - ${labels[game.status] || ""}</option>
  `).join("");
  if (state.games.some((game) => game.id === current)) select.value = current;
}

function selectPreferredLiveGame() {
  const select = document.querySelector("#liveGameSelect");
  const liveGame = state.games.find((game) => game.status === "live");
  if (liveGame) select.value = liveGame.id;
}

async function renderLiveGame() {
  const select = document.querySelector("#liveGameSelect");
  const gameId = select.value || state.games[0]?.id;
  const scoreboard = document.querySelector("#liveScoreboard");
  const body = document.querySelector("#livePredictionsBody");

  if (!gameId) {
    scoreboard.innerHTML = `<div class="empty">Nenhum jogo cadastrado.</div>`;
    body.innerHTML = "";
    return;
  }

  const data = await api(`/api/games/${gameId}/predictions`);
  const game = data.game;
  const score = game.homeScore === null || game.awayScore === null ? "- x -" : `${game.homeScore} x ${game.awayScore}`;
  const homeLeading = Number(game.homeScore) > Number(game.awayScore);
  const awayLeading = Number(game.awayScore) > Number(game.homeScore);
  scoreboard.innerHTML = `
    <div class="score-team ${homeLeading ? "winning" : ""}">${teamLabel(game.homeTeam, "large")}</div>
    <div class="score-center">
      <span class="score-stage">${escapeHtml(game.group ? `Grupo ${game.group}` : game.stage || "")}</span>
      <div class="score-number">${score}</div>
      <span class="badge ${game.status}">${labels[game.status]}</span>
    </div>
    <div class="score-team ${awayLeading ? "winning" : ""}">${teamLabel(game.awayTeam, "large")}</div>
  `;

  const summary = document.querySelector("#liveSummary");
  if (data.hidden) {
    summary.innerHTML = "";
    body.innerHTML = `<tr><td colspan="3" class="empty">Os palpites aparecem quando o administrador marcar o jogo como ao vivo ou finalizado.</td></tr>`;
    return;
  }
  if (data.predictions.length === 0) {
    summary.innerHTML = "";
    body.innerHTML = `<tr><td colspan="3" class="empty">Ainda nao ha palpites para esse jogo.</td></tr>`;
    return;
  }
  const predictions = [...data.predictions].sort((a, b) =>
    b.pointsNow - a.pointsNow || a.playerName.localeCompare(b.playerName, "pt-BR")
  );
  const bestPoints = predictions[0]?.pointsNow || 0;
  const leaders = predictions.filter((prediction) => prediction.pointsNow === bestPoints);
  summary.innerHTML = `
    <div><strong>${leaders.length}</strong><span>${leaders.length === 1 ? "lider nesta partida" : "lideres nesta partida"}</span></div>
    <div><strong>${bestPoints}</strong><span>maior pontuacao agora</span></div>
    <div><strong>${predictions.filter((prediction) => prediction.pointsNow > 0).length}</strong><span>pontuando agora</span></div>
  `;
  body.innerHTML = predictions.map((prediction, index) => `
    <tr class="${prediction.pointsNow === bestPoints && bestPoints > 0 ? "live-leader" : ""}">
      <td data-label="Posicao"><span class="rank rank-${index + 1}">${index + 1}</span></td>
      <td data-label="Participante"><strong>${escapeHtml(prediction.playerName)}</strong>${prediction.pointsNow === bestPoints && bestPoints > 0 ? '<span class="leader-label">Na frente</span>' : ""}</td>
      <td data-label="Palpite"><span class="prediction-score">${prediction.homeScore} x ${prediction.awayScore}</span></td>
      <td data-label="Pontos agora"><strong class="live-points ${prediction.pointsNow > 0 ? "scoring" : ""}">${prediction.pointsNow}</strong></td>
    </tr>
  `).join("");
}

async function submitEntry(event) {
  event.preventDefault();
  const name = state.participantName || document.querySelector("#playerName").value;
  const predictions = [...document.querySelectorAll("#predictionList .match-row")].map((row) => ({
    gameId: row.dataset.gameId,
    homeScore: row.querySelector(".home-score").value,
    awayScore: row.querySelector(".away-score").value
  }));
  try {
    const data = await api("/api/players", {
      method: "POST",
      body: JSON.stringify({ name, predictions })
    });
    event.target.reset();
    localStorage.setItem("bolaoPlayerName", data.player.name);
    showAlert("Palpites enviados e travados com sucesso.", "success");
    await refreshAll();
    showPlayerDashboard(data.player);
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function submitName(event) {
  event.preventDefault();
  const name = document.querySelector("#playerName").value;
  await lookupParticipant(name, false);
}

async function lookupParticipant(name, silent) {
  try {
    const data = await api("/api/players/lookup", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    if (data.exists) {
      localStorage.setItem("bolaoPlayerName", data.player.name);
      showPlayerDashboard(data.player);
      if (!silent) showAlert("Cadastro encontrado. Seus palpites estao abaixo.", "success");
      return;
    }
    showNewEntry(data.name);
    if (!silent) showAlert("Nome novo. Preencha todos os jogos para entrar no bolao.", "success");
  } catch (error) {
    if (!silent) showAlert(error.message, "error");
  }
}

function showNewEntry(name) {
  state.participantName = name;
  state.currentPlayer = null;
  document.querySelector("#nameForm").classList.add("hidden");
  document.querySelector("#entryForm").classList.remove("hidden");
  document.querySelector("#playerDashboard").classList.add("hidden");
  document.querySelector("#entryTitle").textContent = `Palpites de ${name}`;
  renderPredictionsForm();
}

function showPlayerDashboard(player) {
  state.participantName = player.name;
  state.currentPlayer = player;
  document.querySelector("#nameForm").classList.add("hidden");
  document.querySelector("#entryForm").classList.add("hidden");
  document.querySelector("#playerDashboard").classList.remove("hidden");
  document.querySelector("#playerDashboardTitle").textContent = `Palpites de ${player.name}`;
  renderPlayerPredictions(player);
}

function renderPlayerPredictions(player) {
  const body = document.querySelector("#playerPredictionsBody");
  if (!player.predictions.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Nenhum palpite cadastrado.</td></tr>`;
    return;
  }
  body.innerHTML = player.predictions.map((entry) => {
    const game = entry.game;
    const result = game.homeScore === null || game.awayScore === null ? "Aguardando" : `${game.homeScore} x ${game.awayScore}`;
    const prediction = entry.homeScore === null || entry.awayScore === null ? "Nao preenchido" : `${entry.homeScore} x ${entry.awayScore}`;
    return `
      <tr class="${entry.pointsNow > 0 ? "prediction-scored" : ""}">
        <td data-label="Jogo">
          <strong>${teamsLine(game)}</strong>
          <div class="match-meta">${gameMeta(game)}</div>
        </td>
        <td data-label="Meu palpite"><span class="prediction-score">${prediction}</span></td>
        <td data-label="Resultado"><span class="result-score ${game.status}">${result}</span></td>
        <td data-label="Pontos"><strong class="live-points ${entry.pointsNow > 0 ? "scoring" : ""}">${entry.pointsNow}</strong></td>
      </tr>
    `;
  }).join("");
}

function resetParticipantFlow() {
  state.participantName = "";
  state.currentPlayer = null;
  localStorage.removeItem("bolaoPlayerName");
  document.querySelector("#entryForm").reset();
  document.querySelector("#nameForm").classList.remove("hidden");
  document.querySelector("#entryForm").classList.add("hidden");
  document.querySelector("#playerDashboard").classList.add("hidden");
  document.querySelector("#playerName").focus();
}

function readPredictionDraft() {
  return Object.fromEntries([...document.querySelectorAll("#predictionList .match-row")].map((row) => [
    row.dataset.gameId,
    {
      homeScore: row.querySelector(".home-score").value,
      awayScore: row.querySelector(".away-score").value
    }
  ]));
}

async function checkAdmin() {
  const data = await api("/api/admin/me");
  state.admin = data.authenticated;
  document.querySelector("#loginForm").classList.toggle("hidden", state.admin);
  document.querySelector("#adminPanel").classList.toggle("hidden", !state.admin);
  document.querySelector("#logoutButton").classList.toggle("hidden", !state.admin);
  if (state.admin) await loadAdminData();
}

async function login(event) {
  event.preventDefault();
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#adminUser").value,
        password: document.querySelector("#adminPassword").value
      })
    });
    showAlert("Administrador conectado.", "success");
    await checkAdmin();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function logout() {
  await api("/api/admin/logout", { method: "POST", body: "{}" });
  state.admin = false;
  await checkAdmin();
}

async function createGame(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = Object.fromEntries(form.entries());
  try {
    await api("/api/admin/games", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    event.target.stage.value = "Fase de grupos";
    showAlert("Jogo cadastrado.", "success");
    await refreshAll();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function importGames() {
  const csv = document.querySelector("#csvImport").value;
  try {
    const data = await api("/api/admin/games/import", { method: "POST", body: JSON.stringify({ csv }) });
    document.querySelector("#csvImport").value = "";
    showAlert(`${data.imported} jogos importados.`, "success");
    await refreshAll();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function loadAdminData() {
  state.adminData = await api("/api/admin/players");
  renderAdminGames();
  renderAdminPlayers();
}

function renderAdminGames() {
  const container = document.querySelector("#adminGames");
  if (state.games.length === 0) {
    container.innerHTML = `<div class="empty">Nenhum jogo cadastrado.</div>`;
    return;
  }
  container.innerHTML = state.games.map((game) => `
    <div class="admin-row" data-game-id="${game.id}">
      <div>
        <strong>${teamsLine(game)}</strong>
        <div class="match-meta">${gameMeta(game)}</div>
      </div>
      <input class="admin-home" type="number" min="0" max="99" value="${game.homeScore ?? ""}" aria-label="Placar mandante">
      <strong>x</strong>
      <input class="admin-away" type="number" min="0" max="99" value="${game.awayScore ?? ""}" aria-label="Placar visitante">
      <select class="admin-status" aria-label="Status">
        <option value="upcoming" ${game.status === "upcoming" ? "selected" : ""}>Nao iniciado</option>
        <option value="live" ${game.status === "live" ? "selected" : ""}>Ao vivo</option>
        <option value="final" ${game.status === "final" ? "selected" : ""}>Finalizado</option>
      </select>
      <div class="score-inputs">
        <button class="secondary-button save-game" type="button">Salvar</button>
        <button class="danger-button delete-game" type="button">Excluir</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".save-game").forEach((button) => button.addEventListener("click", saveGame));
  container.querySelectorAll(".delete-game").forEach((button) => button.addEventListener("click", deleteGame));
}

function renderAdminPlayers() {
  const container = document.querySelector("#adminPlayers");
  const data = state.adminData;
  if (!data || data.players.length === 0) {
    container.innerHTML = `<div class="empty">Nenhum participante cadastrado.</div>`;
    return;
  }
  container.innerHTML = data.players.map((player) => {
    const predictions = data.games.map((game) => {
      const prediction = data.predictions.find((item) => item.playerId === player.id && item.gameId === game.id);
      return `
        <div class="player-prediction" data-game-id="${game.id}">
          <span>${teamsLine(game)}</span>
          <input class="player-home" type="number" min="0" max="99" value="${prediction?.homeScore ?? ""}">
          <strong>x</strong>
          <input class="player-away" type="number" min="0" max="99" value="${prediction?.awayScore ?? ""}">
        </div>
      `;
    }).join("");
    return `
      <div class="player-row" data-player-id="${player.id}">
        <label class="field">
          <span>Nome</span>
          <input class="player-name" value="${escapeAttr(player.name)}">
        </label>
        <div class="player-predictions">${predictions}</div>
        <div class="score-inputs">
          <button class="secondary-button save-player" type="button">Salvar</button>
          <button class="danger-button delete-player" type="button">Excluir</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".save-player").forEach((button) => button.addEventListener("click", savePlayer));
  container.querySelectorAll(".delete-player").forEach((button) => button.addEventListener("click", deletePlayer));
}

async function saveGame(event) {
  const row = event.target.closest(".admin-row");
  try {
    await api(`/api/admin/games/${row.dataset.gameId}`, {
      method: "PATCH",
      body: JSON.stringify({
        homeScore: row.querySelector(".admin-home").value,
        awayScore: row.querySelector(".admin-away").value,
        status: row.querySelector(".admin-status").value
      })
    });
    showAlert("Jogo atualizado.", "success");
    await refreshAll();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function deleteGame(event) {
  if (!confirm("Excluir este jogo tambem remove os palpites dele. Continuar?")) return;
  const row = event.target.closest(".admin-row");
  await api(`/api/admin/games/${row.dataset.gameId}`, { method: "DELETE" });
  showAlert("Jogo excluido.", "success");
  await refreshAll();
}

async function savePlayer(event) {
  const row = event.target.closest(".player-row");
  const predictions = [...row.querySelectorAll(".player-prediction")].map((item) => ({
    gameId: item.dataset.gameId,
    homeScore: item.querySelector(".player-home").value,
    awayScore: item.querySelector(".player-away").value
  }));
  try {
    await api(`/api/admin/players/${row.dataset.playerId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: row.querySelector(".player-name").value,
        predictions
      })
    });
    showAlert("Participante atualizado.", "success");
    await refreshAll();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function deletePlayer(event) {
  if (!confirm("Excluir este participante e todos os palpites dele?")) return;
  const row = event.target.closest(".player-row");
  await api(`/api/admin/players/${row.dataset.playerId}`, { method: "DELETE" });
  showAlert("Participante excluido.", "success");
  await refreshAll();
}

function showAlert(message, type) {
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  setTimeout(() => alertBox.classList.add("hidden"), 4500);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `- ${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
}

function renderHeroStats() {
  document.querySelector("#gameCount").textContent = state.games.length;
  document.querySelector("#playerCount").textContent = state.playersCount;
}

function renderStorageStatus() {
  const status = document.querySelector("#storageStatus");
  if (!status || !state.storage) return;
  status.className = `storage-status wide ${state.storage.persistent ? "ok" : "warning"}`;
  status.innerHTML = `
    <strong>Dados: ${escapeHtml(state.storage.mode)}</strong>
    <span>${escapeHtml(state.storage.message)}</span>
  `;
}

function gameMeta(game) {
  return [
    game.stage,
    game.group ? `Grupo ${game.group}` : "",
    formatDate(game.startsAt).replace("- ", ""),
    game.venue
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" - ");
}

function flagCode(team) {
  return (teamCodes[team] || "--").toUpperCase();
}

function teamLabel(team, size = "") {
  const code = teamCodes[team];
  const image = code ? `<img class="flag-img" src="https://flagcdn.com/w80/${code}.png" alt="" onerror="this.remove()">` : "";
  return `<span class="team-label ${size}"><span class="flag" aria-hidden="true">${image}<span>${flagCode(team)}</span></span><span>${escapeHtml(team)}</span></span>`;
}

function teamsLine(game) {
  return `${teamLabel(game.homeTeam)} <span class="versus">x</span> ${teamLabel(game.awayTeam)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
