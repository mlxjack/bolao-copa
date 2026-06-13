// Complementos de seguranca e usabilidade carregados depois do aplicativo principal.
function readPredictionDraft() {
  return Object.fromEntries([...document.querySelectorAll("#predictionList .match-row")].map((row) => [
    row.dataset.gameId,
    {
      homeScore: row.querySelector(".home-score").value,
      awayScore: row.querySelector(".away-score").value,
    },
  ]));
}

function renderAdminPlayers() {
  const container = document.querySelector("#adminPlayers");
  const data = state.adminData;
  if (!data || data.players.length === 0) {
    container.innerHTML = '<div class="empty">Nenhum participante cadastrado.</div>';
    return;
  }

  container.innerHTML = data.players.map((player) => {
    const predictions = data.games.map((game) => {
      const prediction = data.predictions.find((item) => item.playerId === player.id && item.gameId === game.id);
      return `
        <div class="player-prediction" data-game-id="${game.id}">
          <span class="player-prediction-game">${teamsLine(game)}<small>${gameMeta(game)}</small></span>
          <span class="player-prediction-score">
            <input class="player-home" type="number" min="0" max="99" inputmode="numeric" value="${prediction?.homeScore ?? ""}" aria-label="Palpite ${escapeHtml(game.homeTeam)}">
            <strong>x</strong>
            <input class="player-away" type="number" min="0" max="99" inputmode="numeric" value="${prediction?.awayScore ?? ""}" aria-label="Palpite ${escapeHtml(game.awayTeam)}">
          </span>
        </div>`;
    }).join("");

    return `
      <details class="player-row" data-player-id="${player.id}">
        <summary><strong>${escapeHtml(player.name)}</strong><span>${data.predictions.filter((item) => item.playerId === player.id).length} palpites</span></summary>
        <div class="player-editor">
          <label class="field"><span>Nome</span><input class="player-name" value="${escapeAttr(player.name)}"></label>
          <div class="player-predictions">${predictions}</div>
          <div class="score-inputs player-actions">
            <button class="secondary-button save-player" type="button">Salvar alterações</button>
            <button class="danger-button delete-player" type="button">Excluir participante</button>
          </div>
        </div>
      </details>`;
  }).join("");

  container.querySelectorAll(".save-player").forEach((button) => button.addEventListener("click", savePlayer));
  container.querySelectorAll(".delete-player").forEach((button) => button.addEventListener("click", deletePlayer));
}

async function savePlayer(event) {
  const row = event.target.closest(".player-row");
  const predictions = [...row.querySelectorAll(".player-prediction")].map((item) => ({
    gameId: item.dataset.gameId,
    homeScore: item.querySelector(".player-home").value,
    awayScore: item.querySelector(".player-away").value,
  }));
  try {
    await api(`/api/admin/players/${row.dataset.playerId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: row.querySelector(".player-name").value, predictions }),
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
