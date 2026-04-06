/* script.js */
/* Volledige implementatie volgens laatste specificaties:
   - Afleveringen 3..7 (START_EPISODE = 3, count = 5)
   - Spelers- en kandidatenoverzicht met kandidaten-tabel (status: Afgevallen in Aflevering X — dd mmm / Nog actief)
   - Finale dropdown alleen op Overzicht (prominent)
   - Afvaller dropdown onderaan afleveringspagina
   - Dropdowns tonen alleen actieve kandidaten
   - Autosave, append-only opslag, history modal, locks, admin wachtwoord
*/

const START_EPISODE = 3;
const START_DATE_ISO = '2026-04-12'; // Aflevering 3 datum
const DEFAULT_CANDIDATES = ["Abigail","Dries","Isabel","Wout","Maxim","Julie","Yana","Yannis"];
const DEFAULT_PLAYERS = ["Sam","Camellia","Tim","Joppe","Amber","Wout","Christophe","Tom"];
const DEFAULT_EPISODE_COUNT = 5; // E3..E7 => 5 afleveringen

// localStorage keys
const KEY_CANDIDATES = 'mol_candidates';
const KEY_PLAYERS = 'mol_players';
const KEY_EPISODE_COUNT = 'mol_episode_count';
const KEY_PREDICTIONS = 'mol_predictions';
const KEY_ELIMINATIONS = 'mol_eliminations';
const KEY_LOCKS = 'mol_locks';
const KEY_FINAL = 'mol_final';
const KEY_ADMIN_HASH = 'mol_admin_hash';

// helpers
function nowISO(){ return new Date().toISOString(); }
function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }
function lsGet(key, fallback){ try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }catch(e){ return fallback; } }
function lsSet(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

// init defaults
if(!localStorage.getItem(KEY_CANDIDATES)) lsSet(KEY_CANDIDATES, DEFAULT_CANDIDATES);
if(!localStorage.getItem(KEY_PLAYERS)) lsSet(KEY_PLAYERS, DEFAULT_PLAYERS);
if(!localStorage.getItem(KEY_EPISODE_COUNT)) lsSet(KEY_EPISODE_COUNT, DEFAULT_EPISODE_COUNT);
if(!localStorage.getItem(KEY_PREDICTIONS)) lsSet(KEY_PREDICTIONS, []);
if(!localStorage.getItem(KEY_ELIMINATIONS)) lsSet(KEY_ELIMINATIONS, []);
if(!localStorage.getItem(KEY_LOCKS)) lsSet(KEY_LOCKS, []);
if(!localStorage.getItem(KEY_FINAL)) lsSet(KEY_FINAL, null);

// episode date helpers
function episodeToDateISO(episode){
  const start = new Date(START_DATE_ISO + 'T00:00:00');
  const diff = (episode - START_EPISODE) * 7;
  const d = new Date(start.getTime() + diff * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0,10);
}
function formatEpisodeLabel(episode){
  const dateISO = episodeToDateISO(episode);
  const d = new Date(dateISO + 'T00:00:00');
  return `Aflevering ${episode} — ${d.toLocaleDateString('nl-BE', { day:'numeric', month:'short' })}`;
}

// predictions (append-only)
function savePrediction(episode, player, first, second, third){
  const pred = { id: uuidv4(), episode, player, first: first||'', second: second||'', third: third||'', createdAt: nowISO() };
  const arr = lsGet(KEY_PREDICTIONS, []);
  arr.push(pred);
  lsSet(KEY_PREDICTIONS, arr);
}

// latest prediction per episode+player
function getLatestPrediction(episode, player){
  const arr = lsGet(KEY_PREDICTIONS, []);
  for(let i=arr.length-1;i>=0;i--){
    if(arr[i].episode===episode && arr[i].player===player) return arr[i];
  }
  return null;
}

// eliminations (append-only)
function setElimination(episode, candidate){
  const arr = lsGet(KEY_ELIMINATIONS, []);
  arr.push({ id: uuidv4(), episode, candidate });
  lsSet(KEY_ELIMINATIONS, arr);
}
function getEliminations(){ return lsGet(KEY_ELIMINATIONS, []); }

// active candidates for episode (not fallen before that episode)
function getActiveCandidatesForEpisode(episode){
  const all = lsGet(KEY_CANDIDATES, []);
  const eliminations = getEliminations();
  const fallenBefore = eliminations.filter(e => e.episode < episode).map(e => e.candidate);
  return all.filter(c => !fallenBefore.includes(c));
}

// locks
function lockEpisode(episode){ const arr = lsGet(KEY_LOCKS, []); if(!arr.includes(episode)){ arr.push(episode); lsSet(KEY_LOCKS, arr); } }
function isEpisodeLocked(episode){ return lsGet(KEY_LOCKS, []).includes(episode); }

// final Mol
function setFinalMol(candidate, episode){ const obj = { candidate, episode }; lsSet(KEY_FINAL, obj); return obj; }
function getFinalMol(){ return lsGet(KEY_FINAL, null); }

// admin password (SHA-256)
async function hashStringSHA256(str){
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return arr;
}
async function setAdminPassword(plain){
  const h = await hashStringSHA256(plain);
  lsSet(KEY_ADMIN_HASH, h);
}
async function checkAdminPassword(plain){
  const storedRaw = localStorage.getItem(KEY_ADMIN_HASH);
  if(!storedRaw) return false;
  const stored = JSON.parse(storedRaw);
  const h = await hashStringSHA256(plain);
  return h === stored;
}
(async function ensureDefaultAdmin(){
  if(!localStorage.getItem(KEY_ADMIN_HASH)){
    await setAdminPassword('christopheisdemol');
  }
})();

// routing & init
window.addEventListener('hashchange', handleHash);
document.addEventListener('DOMContentLoaded', () => { renderEpisodeNav(); handleHash(); });

// render episode nav (E3..E7)
function renderEpisodeNav(){
  const nav = document.getElementById('episode-nav');
  nav.innerHTML = '';
  const count = Number(lsGet(KEY_EPISODE_COUNT, DEFAULT_EPISODE_COUNT));
  for(let i=0;i<count;i++){
    const episode = START_EPISODE + i;
    const a = document.createElement('a');
    a.href = `#episode-${episode}`;
    a.className = 'nav-week-btn';
    a.textContent = `E${episode}`;
    nav.appendChild(a);
  }
}

// hash handler
function handleHash(){
  const hash = location.hash || '#overview';
  if(hash.startsWith('#episode-')){
    const episode = Number(hash.split('-')[1]);
    renderEpisodePage(episode);
  } else if(hash === '#admin'){
    renderAdminPage();
  } else if(hash === '#scores'){
    renderScoresPage();
  } else {
    renderOverview();
  }
}

// Overview page
function renderOverview(){
  const main = document.getElementById('main'); main.innerHTML = '';
  const titleCard = el('div','card');
  titleCard.innerHTML = `<div class="week-title"><h2>Overzicht</h2><div class="small">Spelers en kandidaten</div></div>`;
  main.appendChild(titleCard);

  // Players overview
  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  const playersCard = el('div','card');
  playersCard.innerHTML = `<h3>Spelers</h3>`;
  const pList = document.createElement('div');
  pList.className = 'overview-grid';
  players.forEach(p => {
    const d = el('div','player-card'); d.innerHTML = `<h3>${p}</h3>`;
    pList.appendChild(d);
  });
  playersCard.appendChild(pList);
  main.appendChild(playersCard);

  // Candidates overview + table with status
  const candidates = lsGet(KEY_CANDIDATES, DEFAULT_CANDIDATES);
  const elim = getEliminations();
  const candCard = el('div','card');
  candCard.innerHTML = `<h3>Kandidaten</h3>`;
  const table = document.createElement('table'); table.className='table';
  table.innerHTML = `<thead><tr><th>Kandidaat</th><th>Status</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  candidates.forEach(c => {
    // find earliest elimination for candidate
    const e = elim.find(x => x.candidate === c);
    const status = e ? `Afgevallen in Aflevering ${e.episode} — ${new Date(episodeToDateISO(e.episode)+'T00:00:00').toLocaleDateString('nl-BE',{day:'numeric',month:'short'})}` : 'Nog actief';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c}</td><td>${status}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  candCard.appendChild(table);
  main.appendChild(candCard);

  // Prominent final selector (only on overview)
  const finalWrapper = el('div','final-select-wrapper');
  const label = el('div','final-select-label'); label.textContent = 'Zet Finale Mol';
  finalWrapper.appendChild(label);

  const select = document.createElement('select'); select.className = 'final-select';
  select.innerHTML = `<option value="">-- kies finale Mol (alleen actieve kandidaten) --</option>`;
  const count = Number(lsGet(KEY_EPISODE_COUNT, DEFAULT_EPISODE_COUNT));
  const lastEpisode = START_EPISODE + count - 1;
  getActiveCandidatesForEpisode(lastEpisode).forEach(c => {
    const o = document.createElement('option'); o.value = c; o.text = c; select.appendChild(o);
  });
  finalWrapper.appendChild(select);

  const btn = document.createElement('button'); btn.className = 'final-btn'; btn.textContent = 'Bevestig finale';
  btn.onclick = async () => {
    const val = select.value;
    if(!val) return alert('Kies een kandidaat');
    const pass = prompt('Admin wachtwoord:');
    if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    setFinalMol(val, lastEpisode);
    alert(`Finale Mol gezet: ${val} (Aflevering ${lastEpisode})`);
    renderOverview();
  };
  finalWrapper.appendChild(btn);

  main.appendChild(finalWrapper);
  const note = el('div','final-note'); note.textContent = 'Deze keuze zet de finale Mol voor de finaleaflevering (E7). Alleen actieve kandidaten worden getoond.';
  main.appendChild(note);
}

// Episode page (players + bottom afvaller & lock)
function renderEpisodePage(episode){
  const main = document.getElementById('main'); main.innerHTML = '';
  const count = Number(lsGet(KEY_EPISODE_COUNT, DEFAULT_EPISODE_COUNT));
  const lastEpisode = START_EPISODE + count - 1;
  if(episode < START_EPISODE || episode > lastEpisode){ main.innerHTML = `<div class="card"><h2>Aflevering ${episode}</h2><div class="small">Ongeldige aflevering</div></div>`; return; }

  const titleCard = el('div','card');
  titleCard.innerHTML = `<div class="week-title"><h2>${formatEpisodeLabel(episode)}</h2><div class="small">Afleveringen: ${START_EPISODE} → ${lastEpisode}</div></div>`;
  main.appendChild(titleCard);

  // players area
  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  const playersCard = el('div','card');
  playersCard.innerHTML = `<h3>Spelers — ${formatEpisodeLabel(episode)}</h3><div class="small">Je kunt dezelfde kandidaat meerdere keren kiezen. Wijzigingen worden automatisch opgeslagen bij selectie (autosave).</div>`;
  players.forEach(player => {
    const tpl = document.getElementById('player-card-template');
    const node = tpl.content.cloneNode(true);
    const wrapper = node.querySelector('.player-card');
    wrapper.querySelector('.player-name').textContent = player;

    const sel1 = wrapper.querySelector('.sel-first');
    const sel2 = wrapper.querySelector('.sel-second');
    const sel3 = wrapper.querySelector('.sel-third');

    // fill options with active candidates for this episode
    const active = getActiveCandidatesForEpisode(episode);
    [sel1,sel2,sel3].forEach(s => {
      s.innerHTML = `<option value="">-- kies --</option>`;
      active.forEach(c => { const o = document.createElement('option'); o.value=c; o.text=c; s.appendChild(o); });
    });

    // prefill latest
    const latest = getLatestPrediction(episode, player);
    if(latest){
      sel1.value = latest.first || '';
      sel2.value = latest.second || '';
      sel3.value = latest.third || '';
      wrapper.querySelector('.player-info').textContent = `Laatst opgeslagen op ${latest.createdAt}`;
    } else {
      wrapper.querySelector('.player-info').textContent = 'Nog geen voorspelling';
    }

    // buttons
    const saveBtn = wrapper.querySelector('.save-btn');
    const historyBtn = wrapper.querySelector('.history-btn');
    if(isEpisodeLocked(episode)){ saveBtn.textContent='Locked'; saveBtn.disabled=true; }

    // AUTOSAVE
    [sel1, sel2, sel3].forEach(s => {
      s.onchange = () => {
        if(isEpisodeLocked(episode)) return;
        savePrediction(episode, player, sel1.value, sel2.value, sel3.value);
        wrapper.querySelector('.player-info').textContent = `Laatst opgeslagen op ${nowISO()}`;
      };
    });

    // manual save
    saveBtn.onclick = () => {
      if(isEpisodeLocked(episode)) return;
      savePrediction(episode, player, sel1.value, sel2.value, sel3.value);
      alert('Voorspelling opgeslagen');
      renderEpisodePage(episode);
    };
    historyBtn.onclick = () => { showHistoryFor(episode, player); };

    playersCard.appendChild(wrapper);
  });

  main.appendChild(playersCard);

  // navigation
  const navCard = el('div','card');
  const navRow = el('div','row');
  const prev = el('a'); prev.href = `#episode-${Math.max(START_EPISODE,episode-1)}`; prev.textContent='Vorige aflevering';
  const next = el('a'); next.href = `#episode-${Math.min(lastEpisode,episode+1)}`; next.textContent='Volgende aflevering';
  navRow.appendChild(prev); navRow.appendChild(next);
  navCard.appendChild(navRow);
  main.appendChild(navCard);

  // bottom: afvaller dropdown + lock
  const bottomCard = el('div','card bottom-elim-card');
  bottomCard.innerHTML = `<h3>Afvaller en lock — ${formatEpisodeLabel(episode)}</h3>`;
  const elimRow = el('div','elim-row');
  const selElim = document.createElement('select');
  selElim.innerHTML = `<option value="">-- kies afvaller voor ${formatEpisodeLabel(episode)} --</option>`;
  getActiveCandidatesForEpisode(episode).forEach(c => { const o = document.createElement('option'); o.value=c; o.text=c; selElim.appendChild(o); });
  const btnSetElim = document.createElement('button'); btnSetElim.className='small-btn'; btnSetElim.textContent='Bevestig afvaller';
  btnSetElim.onclick = async () => {
    const pass = prompt('Admin wachtwoord:');
    if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    if(!selElim.value) return alert('Kies een kandidaat');
    setElimination(episode, selElim.value);
    alert(`Afvaller voor ${formatEpisodeLabel(episode)} gezet: ${selElim.value}`);
    renderEpisodePage(episode);
  };
  elimRow.appendChild(selElim); elimRow.appendChild(btnSetElim);
  bottomCard.appendChild(elimRow);

  // lock
  const lockRow = el('div','elim-row');
  const lockBtn = document.createElement('button'); lockBtn.className='small-btn'; lockBtn.textContent = isEpisodeLocked(episode)?'Aflevering is gelockt':'Lock aflevering';
  lockBtn.onclick = async () => {
    const pass = prompt('Admin wachtwoord:');
    if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    lockEpisode(episode); alert(`Aflevering ${episode} gelockt`); renderEpisodePage(episode);
  };
  lockRow.appendChild(lockBtn);
  bottomCard.appendChild(lockRow);

  // show elimination for this episode if exists
  const elimThis = getEliminations().filter(e => e.episode === episode);
  if(elimThis.length>0){
    const list = el('div'); list.innerHTML = `<div class="small">Afvaller(s) voor ${formatEpisodeLabel(episode)}:</div>`;
    elimThis.forEach(e => { list.innerHTML += `<div class="small">- ${e.candidate}</div>`; });
    bottomCard.appendChild(list);
  }

  main.appendChild(bottomCard);
}

// history modal
function showHistoryFor(episode, player){
  const preds = lsGet(KEY_PREDICTIONS, []).filter(p => p.episode===episode && p.player===player);
  const modal = document.createElement('div'); modal.className='modal';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = `<h3>History — ${player} — ${formatEpisodeLabel(episode)}</h3><div class="small">Voorspellingen (nieuwste bovenaan)</div>`;
  const list = document.createElement('div'); list.className='history-list';
  if(preds.length===0) list.innerHTML = '<div class="small">Geen voorspellingen</div>';
  else preds.slice().reverse().forEach(p => { list.innerHTML += `<div class="small">[${p.createdAt}] → 1:${p.first||'-'} 2:${p.second||'-'} 3:${p.third||'-'}</div>`; });
  card.appendChild(list);

  const close = document.createElement('button'); close.className='small-btn'; close.textContent='Sluiten';
  close.onclick = () => document.body.removeChild(modal);
  card.appendChild(close);
  modal.appendChild(card);
  document.body.appendChild(modal);
}

// Admin page
function renderAdminPage(){
  const main = document.getElementById('main'); main.innerHTML = '';
  const card = el('div','card');
  card.innerHTML = `<h2>Admin</h2><div class="small">Beheer: wachtwoord instellen, locks en finale-overzicht</div>`;
  const passRow = el('div','admin-controls');
  const setPassBtn = document.createElement('button'); setPassBtn.className='admin-btn'; setPassBtn.textContent='Stel admin wachtwoord in';
  setPassBtn.onclick = async () => {
    const pass = prompt('Nieuw admin wachtwoord (leeg = annuleer):');
    if(!pass) return;
    await setAdminPassword(pass);
    alert('Admin wachtwoord ingesteld');
  };
  passRow.appendChild(setPassBtn);
  card.appendChild(passRow);
  main.appendChild(card);

  // final score preview
  const final = getFinalMol();
  const scoreCard = el('div','card'); scoreCard.innerHTML = `<h3>Eindscore</h3>`;
  if(!final){ scoreCard.innerHTML += `<div class="small">Finale nog niet ingesteld — zet finale via Overzicht (onderaan)</div>`; }
  else {
    const scores = calculateFinalScores(final.candidate);
    let html = `<div class="small">Finale Mol: <strong>${final.candidate}</strong> (Aflevering ${final.episode})</div>`;
    html += `<table class="table"><thead><tr><th>Speler</th><th>Score</th></tr></thead><tbody>`;
    scores.forEach(s => { html += `<tr><td>${s.player}</td><td>${s.score}</td></tr>`; });
    html += `</tbody></table>`;
    scoreCard.innerHTML += html;
  }
  main.appendChild(scoreCard);
}

// Scores page
function renderScoresPage(){
  const main = document.getElementById('main'); main.innerHTML = '';
  const final = getFinalMol();
  const card = el('div','card');
  card.innerHTML = `<h2>Scores</h2>`;
  if(!final){
    card.innerHTML += `<div class="small">Finale Mol nog niet ingesteld. Scores worden berekend zodra de finale is gezet.</div>`;
    main.appendChild(card);
    return;
  }

  const scores = calculateFinalScores(final.candidate);
  card.innerHTML += `<div class="small">Finale Mol: <strong>${final.candidate}</strong> (Aflevering ${final.episode})</div>`;

  // breakdown per episode
  const table = document.createElement('table'); table.className='table';
  const count = Number(lsGet(KEY_EPISODE_COUNT, DEFAULT_EPISODE_COUNT));
  const lastEpisode = START_EPISODE + count - 1;
  let thead = `<thead><tr><th>Speler</th>`;
  for(let e=START_EPISODE; e<=lastEpisode; e++) thead += `<th>E${e}</th>`;
  thead += `<th>Totaal</th></tr></thead>`;
  table.innerHTML = thead;
  const tbody = document.createElement('tbody');

  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  players.forEach(player => {
    let tr = document.createElement('tr');
    tr.innerHTML = `<td>${player}</td>`;
    let total = 0;
    for(let e=START_EPISODE; e<=lastEpisode; e++){
      const preds = lsGet(KEY_PREDICTIONS, []).filter(p => p.episode===e && p.player===player);
      const latest = preds.length ? preds[preds.length-1] : null;
      let pts = 0;
      if(latest){
        if(latest.first === final.candidate) pts += 3;
        if(latest.second === final.candidate) pts += 2;
        if(latest.third === final.candidate) pts += 1;
      }
      total += pts;
      tr.innerHTML += `<td>${pts > 0 ? pts : '-'}</td>`;
    }
    tr.innerHTML += `<td><strong>${total}</strong></td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  card.appendChild(table);

  // ranking
  const rankCard = el('div','card');
  rankCard.innerHTML = `<h3>Ranglijst</h3>`;
  let rankHtml = `<table class="table"><thead><tr><th>Pos</th><th>Speler</th><th>Score</th></tr></thead><tbody>`;
  scores.forEach((s, i) => { rankHtml += `<tr><td>${i+1}</td><td>${s.player}</td><td>${s.score}</td></tr>`; });
  rankHtml += `</tbody></table>`;
  rankCard.innerHTML += rankHtml;
  main.appendChild(card);
  main.appendChild(rankCard);
}

// score calculation
function calculateFinalScores(finalMol){
  const preds = lsGet(KEY_PREDICTIONS, []);
  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  const map = {};
  players.forEach(p => map[p]=0);
  const latestMap = {};
  preds.forEach(p => { latestMap[`${p.episode}::${p.player}`] = p; });
  Object.values(latestMap).forEach(p => {
    if(p.first === finalMol) map[p.player] += 3;
    if(p.second === finalMol) map[p.player] += 2;
    if(p.third === finalMol) map[p.player] += 1;
  });
  const arr = Object.entries(map).map(([player,score])=>({player,score}));
  arr.sort((a,b)=>b.score-a.score);
  return arr;
}

// DOM helper
function el(tag, cls){ const d = document.createElement(tag); if(cls) d.className = cls; return d; }

// expose for debugging
window._mol = {
  lsGet, lsSet, savePrediction, getLatestPrediction, setElimination, getEliminations, getActiveCandidatesForEpisode, lockEpisode, isEpisodeLocked, setFinalMol, getFinalMol, calculateFinalScores, renderEpisodePage
};
