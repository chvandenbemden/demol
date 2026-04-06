// ===============================================
// BASISDATA (wordt overschreven door instellingen)
// ===============================================
let candidates = Array.from({ length: 10 }, (_, i) => `Kandidaat ${i + 1}`);
let players = Array.from({ length: 7 }, (_, i) => `Speler ${i + 1}`);
let weeks = Array.from({ length: 7 }, (_, i) => i + 1);

// ===============================================
// STATE
// ===============================================
let eliminations = [];
let predictions = [];
let scores = {};
let weeklyTotals = {};

let settings = {
  candidates: [...candidates],
  players: [...players],
  weeks: weeks.length
};

// ===============================================
// INIT
// ===============================================
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initSettings();
  renderCandidates();
  initPredictions();
  recalculate();
});

// ===============================================
// NAVIGATIE
// ===============================================
function initNavigation() {
  const buttons = document.querySelectorAll("header nav button");
  const views = document.querySelectorAll(".view");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-view");
      views.forEach(v => v.classList.add("hidden"));
      document.getElementById(target).classList.remove("hidden");
    });
  });
}

// ===============================================
// INSTELLINGENPANEEL
// ===============================================
function initSettings() {
  renderSettingsLists();

  document.getElementById("add-candidate").onclick = () => {
    settings.candidates.push(`Kandidaat ${settings.candidates.length + 1}`);
    renderSettingsLists();
  };

  document.getElementById("add-player").onclick = () => {
    settings.players.push(`Speler ${settings.players.length + 1}`);
    renderSettingsLists();
  };

  document.getElementById("save-settings").onclick = () => {
    // apply settings
    candidates = [...settings.candidates];
    players = [...settings.players];

    const newWeeks = Number(document.getElementById("settings-weeks").value);
    weeks = Array.from({ length: newWeeks }, (_, i) => i + 1);

    // rebuild app
    eliminations = [];
    initPredictions();
    recalculate();
    renderCandidates();

    alert("Instellingen opgeslagen");
  };
}

function renderSettingsLists() {
  const candList = document.getElementById("settings-candidates");
  const playerList = document.getElementById("settings-players");

  candList.innerHTML = "";
  playerList.innerHTML = "";

  settings.candidates.forEach((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${c}</span>
      <button class="settings-remove" data-type="candidate" data-index="${i}">X</button>
    `;
    candList.appendChild(li);
  });

  settings.players.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${p}</span>
      <button class="settings-remove" data-type="player" data-index="${i}">X</button>
    `;
    playerList.appendChild(li);
  });

  document.querySelectorAll(".settings-remove").forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      const index = Number(btn.dataset.index);

      if (type === "candidate") settings.candidates.splice(index, 1);
      if (type === "player") settings.players.splice(index, 1);

      renderSettingsLists();
    };
  });
}

// ===============================================
// KANDIDATEN
// ===============================================
function renderCandidates() {
  const ul = document.getElementById("candidate-list");
  ul.innerHTML = "";
  candidates.forEach(name => {
    const li = document.createElement("li");
    const spanName = document.createElement("span");
    spanName.textContent = name;

    const spanStatus = document.createElement("span");
    spanStatus.textContent = "Actief";
    spanStatus.dataset.candidate = name;

    li.appendChild(spanName);
    li.appendChild(spanStatus);
    ul.appendChild(li);
  });
}

function getActiveCandidates() {
  return candidates.filter(c => !eliminations.includes(c));
}

// ===============================================
// VOORSPELLINGEN
// ===============================================
function initPredictions() {
  const container = document.getElementById("predictions-container");
  container.innerHTML = "";
  predictions = [];

  weeks.forEach(week => {
    players.forEach(player => {
      const card = document.createElement("div");
      card.className = "prediction-card";
      card.dataset.week = week;
      card.dataset.player = player;

      const header = document.createElement("header");
      const h3 = document.createElement("h3");
      h3.textContent = player;
      const spanWeek = document.createElement("span");
      spanWeek.textContent = `Week ${week}`;
      header.appendChild(h3);
      header.appendChild(spanWeek);

      const row1 = createSelectRow("1e verdachte", "first");
      const row2 = createSelectRow("2e verdachte", "second");
      const row3 = createSelectRow("3e verdachte", "third");
      const row4 = createSelectRow("Afvaller", "eliminated");

      const footer = document.createElement("div");
      footer.className = "prediction-footer";
      const pointsSpan = document.createElement("span");
      pointsSpan.className = "points";
      pointsSpan.textContent = "Punten: 0";
      footer.appendChild(pointsSpan);

      card.appendChild(header);
      card.appendChild(row1);
      card.appendChild(row2);
      card.appendChild(row3);
      card.appendChild(row4);
      card.appendChild(footer);

      container.appendChild(card);

      predictions.push({
        week,
        player,
        first: "",
        second: "",
        third: "",
        eliminated: "",
        points: 0,
        pointsSpan
      });
    });
  });

  refreshAllSelectOptions();

  container.addEventListener("change", (e) => {
    if (e.target.tagName !== "SELECT") return;
    const card = e.target.closest(".prediction-card");
    const week = Number(card.dataset.week);
    const player = card.dataset.player;
    const pred = predictions.find(p => p.week === week && p.player === player);
    const field = e.target.dataset.field;
    pred[field] = e.target.value;

    if (field === "eliminated") {
      updateEliminations();
      refreshAllSelectOptions();
    }

    recalculate();
  });

  document.getElementById("recalculate").addEventListener("click", recalculate);
}

function createSelectRow(labelText, field) {
  const row = document.createElement("div");
  row.className = "prediction-row";

  const label = document.createElement("label");
  label.textContent = labelText;

  const select = document.createElement("select");
  select.dataset.field = field;

  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "-- kies --";
  select.appendChild(optEmpty);

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function refreshAllSelectOptions() {
  const active = getActiveCandidates();
  const selects = document.querySelectorAll("#predictions-container select");
  selects.forEach(sel => {
    const current = sel.value;
    sel.innerHTML = "";
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "-- kies --";
    sel.appendChild(optEmpty);

    active.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });

    if (current && active.includes(current)) {
      sel.value = current;
    }
  });

  document.querySelectorAll("#candidate-list span[data-candidate]").forEach(span => {
    const name = span.dataset.candidate;
    if (eliminations.includes(name)) {
      span.textContent = "Afgevallen";
      span.style.color = "#ff4b4b";
    } else {
      span.textContent = "Actief";
      span.style.color = "#00ff66";
    }
  });
}

function updateEliminations() {
  const set = new Set();
  predictions.forEach(p => {
    if (p.eliminated) set.add(p.eliminated);
  });
  eliminations = Array.from(set);
}

// ===============================================
// SCOREBEREKENING
// ===============================================
function recalculate() {
  scores = {};
  weeklyTotals = {};

  players.forEach(p => (scores[p] = 0));

  weeks.forEach(week => {
    weeklyTotals[week] = {};
    players.forEach(p => (weeklyTotals[week][p] = 0));
  });

  predictions.forEach(p => {
    let pts = 0;
    if (p.first) pts += 3;
    if (p.second) pts += 2;
    if (p.third) pts += 1;
    p.points = pts;
    p.pointsSpan.textContent = `Punten: ${pts}`;
    scores[p.player] += pts;
  });

  weeks.forEach(week => {
    players.forEach(player => {
      const upToWeek = predictions
        .filter(p => p.player === player && p.week <= week)
        .reduce((sum, p) => sum + p.points, 0);
      weeklyTotals[week][player] = upToWeek;
    });
  });

  renderScores();
  renderChart();
}

// ===============================================
// SCORES & RANKING
// ===============================================
function renderScores() {
  const tbody = document.getElementById("scores-body");
  tbody.innerHTML = "";

  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);

  const maxScore = entries.length ? entries[0][1] : 0;
  const minScore = entries.length ? entries[entries.length - 1][1] : 0;

  entries.forEach(([player, total], index) => {
    const tr = document.createElement("tr");

    const tdPlayer = document.createElement("td");
    tdPlayer.textContent = player;

    const tdTotal = document.createElement("td");
    tdTotal.textContent = total;

    const tdRank = document.createElement("td");
    tdRank.textContent = index + 1;

    const tdStatus = document.createElement("td");
    if (total === maxScore && maxScore !== minScore) {
      tdStatus.textContent = "WINNAAR";
      tdStatus.className = "badge-winner";
    } else if (total === minScore && maxScore !== minScore) {
      tdStatus.textContent = "Laatste";
      tdStatus.className = "badge-lowest";
    } else {
      tdStatus.textContent = "";
    }

    tr.appendChild(tdPlayer);
    tr.appendChild(tdTotal);
    tr.appendChild(tdRank);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);
  });
}

// ===============================================
// GRAFIEK
// ===============================================
function renderChart() {
  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  const margin = 50;
  const chartW = w - margin * 2;
  const chartH = h - margin * 2;

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, margin, chartW, chartH);

  let maxVal = 0;
  weeks.forEach(week => {
    players.forEach(player => {
      maxVal = Math.max(maxVal, weeklyTotals[week]?.[player] || 0);
    });
  });
  if (maxVal === 0) maxVal = 1;

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  const gridLines = 5;
  ctx.font = "10px Segoe UI";
  ctx.fillStyle = "#888";
  for (let i = 0; i <= gridLines; i++) {
    const y = margin + (chartH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(margin + chartW, y);
    ctx.stroke();

    const val = Math.round(maxVal * (1 - i / gridLines));
    ctx.fillText(val, 10, y + 3);
  }

  ctx.fillStyle = "#aaa";
  weeks.forEach((week, idx) => {
    const x = margin + (chartW * idx) / (weeks.length - 1 || 1);
    ctx.fillText(`W${week}`, x - 8, h - margin + 15);
  });

  const colors = [
    "#00ff66",
    "#00b3ff",
    "#ffcc00",
    "#ff4b4b",
    "#ff00ff",
    "#00ffaa",
    "#ffaa00"
  ];

  players.forEach((player, pIndex) => {
    ctx.beginPath();
    weeks.forEach((week, idx) => {
      const val = weeklyTotals[week]?.[player] || 0;
      const x = margin + (chartW * idx) / (weeks.length - 1 || 1);
      const y = margin + chartH - (val / maxVal) * chartH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = colors[pIndex % colors.length];
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = "#00ff66";
  ctx.font = "14px Segoe UI";
  ctx.fillText("Evolutie van de Mollenjagers", margin, margin - 15);
}