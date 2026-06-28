function renderPlayerPredictions(player) {
  const body = document.querySelector("#playerPredictionsBody");
  const tableWrap = body.closest(".table-wrap");
  tableWrap.querySelector(".missing-predictions-panel")?.remove();

  if (!player.predictions.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Nenhum palpite cadastrado.</td></tr>';
    return;
  }

  const missing = player.predictions.filter((entry) => entry.homeScore === null || entry.awayScore === null);
  const filled = player.predictions.filter((entry) => entry.homeScore !== null && entry.awayScore !== null);

  if (missing.length) {
    tableWrap.insertAdjacentHTML("beforebegin", renderMissingPredictionsPanel(player, missing));
    document.querySelector("#missingPredictionsForm")?.addEventListener("submit", submitMissingPredictions);
  }

  if (!filled.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Preencha os novos jogos acima para travar seus palpites.</td></tr>';
    return;
  }

  body.innerHTML = filled.map((entry) => {
    const game = entry.game;
    const result = game.homeScore === null || game.awayScore === null ? "Aguardando" : `${game.homeScore} x ${game.awayScore}`;
    const prediction = `${entry.homeScore} x ${entry.awayScore}`;
    return `
      <tr class="${entry.pointsNow > 0 ? "prediction-scored" : ""}">
        <td data-label="Jogo">
          <strong class="player-game-teams">${teamsLine(game)}</strong>
          <div class="match-meta">${gameMeta(game)}</div>
        </td>
        <td data-label="Meu palpite"><span class="prediction-score">${prediction}</span></td>
        <td data-label="Resultado"><span class="result-score ${game.status}">${result}</span></td>
        <td data-label="Pontos"><strong class="live-points ${entry.pointsNow > 0 ? "scoring" : ""}">${entry.pointsNow}</strong></td>
      </tr>`;
  }).join("");
}

function renderMissingPredictionsPanel(player, missing) {
  const rows = missing.map((entry, index) => {
    const game = entry.game;
    return `
      <div class="missing-prediction-row" data-game-id="${game.id}">
        <div>
          <div class="match-kicker"><span>Novo jogo ${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(game.stage || "")}</span></div>
          <div class="teams">${teamsLine(game)}</div>
          <div class="match-meta">${gameMeta(game)}</div>
        </div>
        <input class="missing-home score-box" type="number" min="0" max="99" inputmode="numeric" aria-label="Gols ${escapeHtml(game.homeTeam)}" required>
        <strong>x</strong>
        <input class="missing-away score-box" type="number" min="0" max="99" inputmode="numeric" aria-label="Gols ${escapeHtml(game.awayTeam)}" required>
      </div>`;
  }).join("");

  return `
    <form id="missingPredictionsForm" class="missing-predictions-panel" data-player-id="${player.id}">
      <div class="missing-predictions-title">
        <div>
          <p class="eyebrow">Novos jogos</p>
          <h3>Complete seus palpites do mata-mata</h3>
        </div>
        <span>${missing.length} jogos pendentes</span>
      </div>
      <p class="hint">Depois de salvar, estes palpites tambem ficam travados. Palpites antigos nao podem ser alterados aqui.</p>
      <div class="missing-predictions-list">${rows}</div>
      <button class="primary-button" type="submit">Salvar novos palpites</button>
    </form>`;
}

async function submitMissingPredictions(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const predictions = [...form.querySelectorAll(".missing-prediction-row")].map((row) => ({
    gameId: row.dataset.gameId,
    homeScore: row.querySelector(".missing-home").value,
    awayScore: row.querySelector(".missing-away").value,
  }));

  try {
    const data = await api(`/api/players/${form.dataset.playerId}/missing-predictions`, {
      method: "POST",
      body: JSON.stringify({ predictions }),
    });
    state.currentPlayer = data.player;
    localStorage.setItem("bolaoPlayerName", data.player.name);
    showAlert("Novos palpites salvos e travados com sucesso.", "success");
    await refreshAll();
    showPlayerDashboard(data.player);
  } catch (error) {
    showAlert(error.message, "error");
  }
}

if (!document.querySelector('link[href="/live-cards.css"]')) {
  const liveStyles = document.createElement("link");
  liveStyles.rel = "stylesheet";
  liveStyles.href = "/live-cards.css";
  document.head.append(liveStyles);
}

if (!document.querySelector('script[src="/live-cards.js"]')) {
  const liveScript = document.createElement("script");
  liveScript.src = "/live-cards.js";
  liveScript.onload = () => {
    if (document.querySelector("#live").classList.contains("active")) renderLiveGame();
  };
  document.body.append(liveScript);
}
