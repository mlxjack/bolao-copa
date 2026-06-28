function livePositionDetails(predictions) {
  const currentRanks = sharedRankMap(state.standings);
  const predictionMap = new Map(predictions.map((prediction) => [prediction.playerId, prediction.pointsNow]));
  const beforeLive = state.standings
    .map((player) => {
      const livePoints = predictionMap.get(player.id) || 0;
      return {
        ...player,
        points: player.points - livePoints,
        exact: player.exact - (livePoints === 5 ? 1 : 0),
        outcome: player.outcome - (livePoints === 3 ? 1 : 0),
      };
    })
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name, "pt-BR"));
  const previousRanks = sharedRankMap(beforeLive);

  return new Map(state.standings.map((player) => {
    const before = previousRanks.get(player.id);
    const current = currentRanks.get(player.id);
    return [player.id, {
      before,
      current,
      change: before - current,
      direction: current < before ? "up" : current > before ? "down" : "same",
    }];
  }));
}

function movementLabel(detail) {
  if (!detail) return "";
  if (detail.direction === "up") {
    return `<span class="live-movement up"><strong>${detail.before}º → ${detail.current}º</strong><small>Subindo para ${detail.current}º</small></span>`;
  }
  if (detail.direction === "down") {
    return `<span class="live-movement down"><strong>${detail.before}º → ${detail.current}º</strong><small>Caindo para ${detail.current}º</small></span>`;
  }
  return `<span class="live-movement same"><strong>${detail.current}º</strong><small>Permanece em ${detail.current}º</small></span>`;
}

async function renderLiveGame() {
  const select = document.querySelector("#liveGameSelect");
  const gameId = select.value || state.games[0]?.id;
  const scoreboard = document.querySelector("#liveScoreboard");
  const body = document.querySelector("#livePredictionsBody");

  if (!gameId) {
    scoreboard.innerHTML = '<div class="empty">Nenhum jogo cadastrado.</div>';
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
    <div class="score-team ${awayLeading ? "winning" : ""}">${teamLabel(game.awayTeam, "large")}</div>`;

  updateSelectedGameLabel();
  renderGamesDrawer();

  const summary = document.querySelector("#liveSummary");
  if (data.hidden) {
    summary.classList.add("upcoming");
    summary.classList.remove("movement-summary");
    summary.innerHTML = '<div><strong>Bloqueado</strong><span>O administrador ainda nao liberou os palpites de todos.</span></div>';
    body.innerHTML = '<tr><td colspan="4" class="empty">Os palpites dos participantes estao escondidos por enquanto.</td></tr>';
    return;
  }

  if (data.predictions.length === 0) {
    summary.innerHTML = "";
    body.innerHTML = '<tr><td colspan="4" class="empty">Ainda nao ha palpites para esse jogo.</td></tr>';
    return;
  }

  const predictions = [...data.predictions].sort((a, b) => b.pointsNow - a.pointsNow || a.playerName.localeCompare(b.playerName, "pt-BR"));
  const positions = game.status === "live" ? livePositionDetails(predictions) : new Map();
  const movingUp = [...positions.values()].filter((detail) => detail.direction === "up").length;
  const movingDown = [...positions.values()].filter((detail) => detail.direction === "down").length;

  summary.classList.toggle("upcoming", game.status === "upcoming");
  summary.classList.toggle("movement-summary", game.status !== "upcoming");
  summary.innerHTML = game.status === "upcoming"
    ? `<div><strong>${predictions.length}</strong><span>palpites já disponíveis para esta partida</span></div>`
    : `<div class="summary-up"><strong>↑ ${movingUp}</strong><span>subindo na tabela</span></div>
       <div class="summary-down"><strong>↓ ${movingDown}</strong><span>caindo na tabela</span></div>`;

  body.innerHTML = predictions.map((prediction) => {
    const detail = positions.get(prediction.playerId);
    return `
      <tr class="live-player-card">
        <td class="live-player-info" data-label="Participante" colspan="2">
          <span class="live-player-name"><strong>${escapeHtml(prediction.playerName)}</strong></span>
          ${game.status === "live" ? movementLabel(detail) : ""}
        </td>
        <td class="live-player-prediction" data-label="Palpite"><span class="prediction-score">${prediction.homeScore} x ${prediction.awayScore}</span></td>
        <td class="live-player-points" data-label="Pontos agora"><strong class="live-points ${prediction.pointsNow > 0 ? "scoring" : ""}">${prediction.pointsNow}</strong></td>
      </tr>`;
  }).join("");
}
