// =========================
// De Mol — minimale SPA (bijgewerkt)
// - Autosave on change toegevoegd
// - Standaard admin wachtwoord ingesteld: "christopheisdemol"
// =========================

// --- vaste data (gebruik deze namen zoals gevraagd) ---
const DEFAULT_CANDIDATES = ["Abigail","Dries","Isabel","Wout","Maxim","Julie","Yana","Yannis"];
const DEFAULT_PLAYERS = ["Sam","Camellia","Tim","Joppe","Amber","Wout","Christophe","Tom"];
const DEFAULT_WEEKS = 7;

// --- localStorage keys ---
const KEY_CANDIDATES = 'mol_candidates';
const KEY_PLAYERS = 'mol_players';
const KEY_WEEKS = 'mol_weeks';
const KEY_PREDICTIONS = 'mol_predictions'; // array append-only
const KEY_ELIMINATIONS = 'mol_eliminations'; // array append-only
const KEY_AUDIT = 'mol_audit'; // array append-only
const KEY_LOCKS = 'mol_locks'; // array of week numbers
const KEY_FINAL = 'mol_final'; // {candidate, timestamp, actor}
const KEY_ADMIN_HASH = 'mol_admin_hash'; // stored hashed password (optional)

// --- helpers ---
function nowISO(){ return new Date().toISOString(); }
function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }
function lsGet(key, fallback){ try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }catch(e){ return fallback; } }
function lsSet(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

// --- init defaults if missing ---
if(!localStorage.getItem(KEY_CANDIDATES)) lsSet(KEY_CANDIDATES, DEFAULT_CANDIDATES);
if(!localStorage.getItem(KEY_PLAYERS)) lsSet(KEY_PLAYERS, DEFAULT_PLAYERS);
if(!localStorage.getItem(KEY_WEEKS)) lsSet(KEY_WEEKS, DEFAULT_WEEKS);
if(!localStorage.getItem(KEY_PREDICTIONS)) lsSet(KEY_PREDICTIONS, []);
if(!localStorage.getItem(KEY_ELIMINATIONS)) lsSet(KEY_ELIMINATIONS, []);
if(!localStorage.getItem(KEY_AUDIT)) lsSet(KEY_AUDIT, []);
if(!localStorage.getItem(KEY_LOCKS)) lsSet(KEY_LOCKS, []);
if(!localStorage.getItem(KEY_FINAL)) lsSet(KEY_FINAL, null);

// --- audit append-only ---
function appendAudit(record){
  const arr = lsGet(KEY_AUDIT, []);
  arr.push(record);
  lsSet(KEY_AUDIT, arr);
}

// --- prediction save (append-only) ---
function savePrediction(week, player, first, second, third, actor='player'){
  const pred = { id: uuidv4(), week, player, first: first||'', second: second||'', third: third||'', createdAt: nowISO(), actor };
  const arr = lsGet(KEY_PREDICTIONS, []);
  arr.push(pred);
  lsSet(KEY_PREDICTIONS, arr);
  appendAudit({ id: uuidv4(), timestamp: pred.createdAt, actor, action:'prediction_create', week, field:'first_second_third', value: JSON.stringify({first,second,third}), source:'web' });
}

// --- get latest prediction for week+player ---
function getLatestPrediction(week, player){
  const arr = lsGet(KEY_PREDICTIONS, []);
  for(let i=arr.length-1;i>=0;i--){
    if(arr[i].week===week && arr[i].player===player) return arr[i];
  }
  return null;
}

// --- eliminations (append-only) ---
function setElimination(week, candidate, actor='host'){
  const arr = lsGet(KEY_ELIMINATIONS, []);
  arr.push({ id: uuidv4(), week, candidate, actor, timestamp: nowISO() });
  lsSet(KEY_ELIMINATIONS, arr);
  appendAudit({ id: uuidv4(), timestamp: nowISO(), actor, action:'elimination_set', week, field:'eliminated', value:candidate, source:'web' });
}

// --- get eliminations list ---
function getEliminations(){ return lsGet(KEY_ELIMINATIONS, []); }

// --- get active candidates for a given week (not fallen before that week) ---
function getActiveCandidatesForWeek(week){
  const all = lsGet(KEY_CANDIDATES, []);
  const eliminations = getEliminations();
  const fallenBefore = eliminations.filter(e => e.week < week).map(e => e.candidate);
  return all.filter(c => !fallenBefore.includes(c));
}

// --- locks ---
function lockWeek(week, actor='host'){ const arr = lsGet(KEY_LOCKS, []); if(!arr.includes(week)){ arr.push(week); lsSet(KEY_LOCKS, arr); appendAudit({ id: uuidv4(), timestamp: nowISO(), actor, action:'lock_week', week, field:'lock', value:'locked', source:'web' }); } }
function isWeekLocked(week){ return lsGet(KEY_LOCKS, []).includes(week); }

// --- final Mol ---
function setFinalMol(candidate, actor='host'){ const obj = { candidate, timestamp: nowISO(), actor }; lsSet(KEY_FINAL, obj); appendAudit({ id: uuidv4(), timestamp: nowISO(), actor, action:'finalMol_set', field:'finalMol', value:candidate, source:'web' }); return obj; }
function getFinalMol(){ return lsGet(KEY_FINAL, null); }

// --- admin password helpers (uses subtle crypto) ---
async function hashStringSHA256(str){
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return arr;
}
async function setAdminPassword(plain){
  const h = await hashStringSHA256(plain);
  lsSet(KEY_ADMIN_HASH, h);
  appendAudit({ id: uuidv4(), timestamp: nowISO(), actor:'host', action:'admin_password_set', field:'admin', value:'(hidden)', source:'web' });
}
async function checkAdminPassword(plain){
  const storedRaw = localStorage.getItem(KEY_ADMIN_HASH);
  if(!storedRaw) return false;
  const stored = JSON.parse(storedRaw);
  const h = await hashStringSHA256(plain);
  return h === stored;
}

// --- ensure default admin password exists (set once) ---
(async function ensureDefaultAdmin(){
  if(!localStorage.getItem(KEY_ADMIN_HASH)){
    await setAdminPassword('christopheisdemol');
    // do not alert; silent default set
  }
})();

// --- routing & render ---
window.addEventListener('hashchange', handleHash);
document.addEventListener('DOMContentLoaded', () => { renderWeekNav(); handleHash(); });

// render week navigation links
function renderWeekNav(){
  const nav = document.getElementById('week-nav');
  nav.innerHTML = '';
  const weeks = Number(lsGet(KEY_WEEKS, DEFAULT_WEEKS));
  for(let w=1; w<=weeks; w++){
    const a = document.createElement('a');
    a.href = `#week-${w}`;
    a.className = 'nav-week-btn';
    a.textContent = `W${w}`;
    nav.appendChild(a);
  }
}

// main hash handler
function handleHash(){
  const hash = location.hash || '#overview';
  const main = document.getElementById('main');
  if(hash.startsWith('#week-')){
    const week = Number(hash.split('-')[1]);
    renderWeekPage(week);
  } else if(hash === '#admin'){
    renderAdminPage();
  } else {
    renderOverview();
  }
}

// --- Overview page ---
function renderOverview(){
  const main = document.getElementById('main'); main.innerHTML = '';
  const card = el('div','card');
  const title = el('div','week-title'); title.innerHTML = `<h2>Overzicht</h2><div class="small">Klik op een week om voorspellingen in te vullen</div>`;
  card.appendChild(title);

  // show current eliminations
  const elim = getEliminations();
  const elimCard = el('div','card');
  elimCard.innerHTML = `<h3>Afvallers (historiek)</h3>`;
  if(elim.length===0) elimCard.innerHTML += `<div class="small">Nog geen afvallers ingesteld</div>`;
  else {
    const table = document.createElement('table'); table.className='table';
    table.innerHTML = `<thead><tr><th>Week</th><th>Kandidaat</th><th>Actor</th><th>Tijd</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    elim.slice().reverse().forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${e.week}</td><td>${e.candidate}</td><td>${e.actor}</td><td>${e.timestamp}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); elimCard.appendChild(table);
  }
  card.appendChild(elimCard);

  // final Mol if set
  const final = getFinalMol();
  const finalCard = el('div','card');
  finalCard.innerHTML = `<h3>Finale</h3>`;
  if(final) finalCard.innerHTML += `<div class="small">Finale Mol: <strong>${final.candidate}</strong> (gezet door ${final.actor} op ${final.timestamp})</div>`;
  else finalCard.innerHTML += `<div class="small">Finale nog niet ingesteld</div>`;
  card.appendChild(finalCard);

  // players & quick links
  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  const pcard = el('div','card');
  pcard.innerHTML = `<h3>Spelers</h3><div class="overview-grid"></div>`;
  const grid = pcard.querySelector('.overview-grid');
  players.forEach(p => {
    const d = el('div','player-card'); d.innerHTML = `<h3>${p}</h3><div class="small">Klik op een week om voorspellingen in te vullen</div>`;
    grid.appendChild(d);
  });
  card.appendChild(pcard);

  main.appendChild(card);
}

// --- Week page render ---
function renderWeekPage(week){
  const main = document.getElementById('main'); main.innerHTML = '';
  const weeksTotal = Number(lsGet(KEY_WEEKS, DEFAULT_WEEKS));
  if(week < 1 || week > weeksTotal){ main.innerHTML = `<div class="card"><h2>Week ${week}</h2><div class="small">Ongeldige week</div></div>`; return; }

  const titleCard = el('div','card');
  const final = getFinalMol();
  titleCard.innerHTML = `<div class="week-title"><h2>Week ${week}</h2><div class="small">Weken: ${weeksTotal} ${final?`| Finale Mol: ${final.candidate}`:''}</div></div>`;
  main.appendChild(titleCard);

  // admin controls: elimination + lock + finalMol (requires admin)
  const adminControls = el('div','card');
  adminControls.innerHTML = `<h3>Host / Admin controls</h3>`;
  const elimRow = el('div','elim-row');
  const selElim = document.createElement('select');
  selElim.innerHTML = `<option value="">-- kies afvaller voor week ${week} --</option>`;
  // per rules: allow candidates active at start of week (not fallen before week)
  getActiveCandidatesForWeek(week).forEach(c => { const o = document.createElement('option'); o.value=c; o.text=c; selElim.appendChild(o); });
  const btnSetElim = document.createElement('button'); btnSetElim.className='small-btn'; btnSetElim.textContent='Bevestig afvaller';
  btnSetElim.onclick = async () => {
    const pass = prompt('Admin wachtwoord:');
    if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    if(!selElim.value) return alert('Kies een kandidaat');
    setElimination(week, selElim.value, 'host');
    alert(`Afvaller voor week ${week} gezet: ${selElim.value}`);
    renderWeekPage(week);
  };
  elimRow.appendChild(selElim); elimRow.appendChild(btnSetElim);
  adminControls.appendChild(elimRow);

  // lock button
  const lockRow = el('div','elim-row');
  const lockBtn = document.createElement('button'); lockBtn.className='small-btn'; lockBtn.textContent = isWeekLocked(week)?'Week is gelockt':'Lock week';
  lockBtn.onclick = async () => {
    const pass = prompt('Admin wachtwoord:');
    if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    lockWeek(week,'host'); alert(`Week ${week} gelockt`); renderWeekPage(week);
  };
  lockRow.appendChild(lockBtn);
  adminControls.appendChild(lockRow);

  // finalMol set (only if last week or host chooses)
  const finalRow = el('div','elim-row');
  const selFinal = document.createElement('select');
  selFinal.innerHTML = `<option value="">-- kies finale Mol (definitief) --</option>`;
  lsGet(KEY_CANDIDATES, DEFAULT_CANDIDATES).forEach(c => { const o = document.createElement('option'); o.value=c; o.text=c; selFinal.appendChild(o); });
  const btnFinal = document.createElement('button'); btnFinal.className='small-btn'; btnFinal.textContent='Zet finale Mol';
  btnFinal.onclick = async () => {
    const pass = prompt('Admin wachtwoord:');
    if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    if(!selFinal.value) return alert('Kies een kandidaat');
    setFinalMol(selFinal.value,'host');
    alert(`Finale Mol gezet: ${selFinal.value}`);
    renderWeekPage(week);
  };
  finalRow.appendChild(selFinal); finalRow.appendChild(btnFinal);
  adminControls.appendChild(finalRow);

  // show elimination for this week if exists
  const elimThis = getEliminations().filter(e => e.week === week);
  if(elimThis.length>0){
    const list = el('div'); list.innerHTML = `<div class="small">Afvaller(s) voor week ${week} (historiek):</div>`;
    elimThis.forEach(e => { list.innerHTML += `<div class="small">- ${e.candidate} (door ${e.actor} op ${e.timestamp})</div>`; });
    adminControls.appendChild(list);
  }

  main.appendChild(adminControls);

  // players area
  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  const playersCard = el('div','card');
  playersCard.innerHTML = `<h3>Spelers — Week ${week}</h3><div class="small">Je kunt dezelfde kandidaat meerdere keren kiezen. Opslaan maakt een append-only record. Wijzigingen worden automatisch opgeslagen bij selectie (autosave).</div>`;
  players.forEach(player => {
    const tpl = document.getElementById('player-card-template');
    const node = tpl.content.cloneNode(true);
    const wrapper = node.querySelector('.player-card');
    wrapper.querySelector('.player-name').textContent = player;

    const sel1 = wrapper.querySelector('.sel-first');
    const sel2 = wrapper.querySelector('.sel-second');
    const sel3 = wrapper.querySelector('.sel-third');

    // fill options with active candidates for this week
    const active = getActiveCandidatesForWeek(week);
    [sel1,sel2,sel3].forEach(s => {
      s.innerHTML = `<option value="">-- kies --</option>`;
      active.forEach(c => { const o = document.createElement('option'); o.value=c; o.text=c; s.appendChild(o); });
    });

    // prefill latest
    const latest = getLatestPrediction(week, player);
    if(latest){
      sel1.value = latest.first || '';
      sel2.value = latest.second || '';
      sel3.value = latest.third || '';
      wrapper.querySelector('.player-info').textContent = `Laatst gewijzigd door ${latest.actor} op ${latest.createdAt}`;
    } else {
      wrapper.querySelector('.player-info').textContent = 'Nog geen voorspelling';
    }

    // buttons
    const saveBtn = wrapper.querySelector('.save-btn');
    const historyBtn = wrapper.querySelector('.history-btn');
    if(isWeekLocked(week)){ saveBtn.textContent='Locked'; saveBtn.disabled=true; }

    // --- AUTOSAVE: save on change immediately ---
    [sel1, sel2, sel3].forEach(s => {
      s.onchange = () => {
        if(isWeekLocked(week)) return;
        // save current selections
        savePrediction(week, player, sel1.value, sel2.value, sel3.value, player);
        // update info text with current timestamp
        wrapper.querySelector('.player-info').textContent = `Laatst gewijzigd door ${player} op ${nowISO()}`;
      };
    });

    // keep manual save as well (still appends another record)
    saveBtn.onclick = () => {
      if(isWeekLocked(week)) return;
      savePrediction(week, player, sel1.value, sel2.value, sel3.value, player);
      alert('Voorspelling opgeslagen (append-only)');
      renderWeekPage(week);
    };
    historyBtn.onclick = () => { showHistoryFor(week, player); };

    playersCard.appendChild(wrapper);
  });

  main.appendChild(playersCard);

  // navigation prev/next
  const navCard = el('div','card');
  const navRow = el('div','row');
  const prev = el('a'); prev.href = `#week-${Math.max(1,week-1)}`; prev.textContent='Vorige week';
  const next = el('a'); next.href = `#week-${Math.min(weeksTotal,week+1)}`; next.textContent='Volgende week';
  navRow.appendChild(prev); navRow.appendChild(next);
  navCard.appendChild(navRow);
  main.appendChild(navCard);
}

// --- history modal ---
function showHistoryFor(week, player){
  const preds = lsGet(KEY_PREDICTIONS, []).filter(p => p.week===week && p.player===player);
  const audit = lsGet(KEY_AUDIT, []).filter(a => a.week===week && (a.actor===player || a.actor==='host' || a.field==='first_second_third'));
  const modal = document.createElement('div'); modal.className='modal';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = `<h3>History — ${player} — Week ${week}</h3><div class="small">Voorspellingen (nieuwste bovenaan)</div>`;
  const list = document.createElement('div'); list.className='audit-list';
  if(preds.length===0) list.innerHTML = '<div class="small">Geen voorspellingen</div>';
  else preds.slice().reverse().forEach(p => { list.innerHTML += `<div class="small">[${p.createdAt}] ${p.actor} → 1:${p.first||'-'} 2:${p.second||'-'} 3:${p.third||'-'}</div>`; });
  card.appendChild(list);

  const auditTitle = document.createElement('h4'); auditTitle.textContent = 'Audit (relevante records)';
  card.appendChild(auditTitle);
  const auditList = document.createElement('div'); auditList.className='audit-list';
  if(audit.length===0) auditList.innerHTML = '<div class="small">Geen audit records</div>';
  else audit.slice().reverse().forEach(a => { auditList.innerHTML += `<div class="small">[${a.timestamp}] ${a.actor} ${a.action} ${a.field} → ${a.value}</div>`; });
  card.appendChild(auditList);

  const close = document.createElement('button'); close.className='small-btn'; close.textContent='Sluiten';
  close.onclick = () => document.body.removeChild(modal);
  card.appendChild(close);
  modal.appendChild(card);
  document.body.appendChild(modal);
}

// --- Admin page ---
function renderAdminPage(){
  const main = document.getElementById('main'); main.innerHTML = '';
  const card = el('div','card');
  card.innerHTML = `<h2>Admin</h2><div class="small">Beheer: wachtwoord instellen, audit export, locks en finale</div>`;
  // set password
  const passRow = el('div','admin-controls');
  const setPassBtn = document.createElement('button'); setPassBtn.className='admin-btn'; setPassBtn.textContent='Stel admin wachtwoord in';
  setPassBtn.onclick = async () => {
    const pass = prompt('Nieuw admin wachtwoord (leeg = annuleer):');
    if(!pass) return;
    await setAdminPassword(pass);
    alert('Admin wachtwoord ingesteld');
  };
  passRow.appendChild(setPassBtn);
  // export audit
  const exportBtn = document.createElement('button'); exportBtn.className='admin-btn'; exportBtn.textContent='Export audit (JSON)';
  exportBtn.onclick = async () => {
    const pass = prompt('Admin wachtwoord:'); if(!pass) return;
    if(!(await checkAdminPassword(pass))){ alert('Onjuist wachtwoord'); return; }
    const data = { candidates: lsGet(KEY_CANDIDATES,[]), players: lsGet(KEY_PLAYERS,[]), weeks: lsGet(KEY_WEEKS,7), predictions: lsGet(KEY_PREDICTIONS,[]), eliminations: lsGet(KEY_ELIMINATIONS,[]), audit: lsGet(KEY_AUDIT,[]), locks: lsGet(KEY_LOCKS,[]), final: lsGet(KEY_FINAL,null) };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'mol_export.json'; a.click(); URL.revokeObjectURL(url);
  };
  passRow.appendChild(exportBtn);

  // show audit preview
  const audit = lsGet(KEY_AUDIT, []);
  const auditCard = el('div','card'); auditCard.innerHTML = `<h3>Audit (laatste 50)</h3>`;
  const list = el('div'); list.className='audit-list';
  audit.slice(-50).reverse().forEach(a => { list.innerHTML += `<div class="small">[${a.timestamp}] ${a.actor} ${a.action} ${a.field} → ${a.value}</div>`; });
  auditCard.appendChild(list);

  card.appendChild(passRow);
  card.appendChild(auditCard);
  main.appendChild(card);

  // final score calculation preview (if final set)
  const final = getFinalMol();
  const scoreCard = el('div','card'); scoreCard.innerHTML = `<h3>Eindscore</h3>`;
  if(!final){ scoreCard.innerHTML += `<div class="small">Finale nog niet ingesteld — zet finalMol via weekpagina (admin)</div>`; }
  else {
    const scores = calculateFinalScores(final.candidate);
    let html = `<div class="small">Finale Mol: <strong>${final.candidate}</strong> (gezet door ${final.actor} op ${final.timestamp})</div>`;
    html += `<table class="table"><thead><tr><th>Speler</th><th>Score</th></tr></thead><tbody>`;
    scores.forEach(s => { html += `<tr><td>${s.player}</td><td>${s.score}</td></tr>`; });
    html += `</tbody></table>`;
    scoreCard.innerHTML += html;
  }
  main.appendChild(scoreCard);
}

// --- score calculation ---
function calculateFinalScores(finalMol){
  const preds = lsGet(KEY_PREDICTIONS, []);
  const players = lsGet(KEY_PLAYERS, DEFAULT_PLAYERS);
  const map = {};
  players.forEach(p => map[p]=0);
  preds.forEach(p => {
    if(p.first === finalMol) map[p.player] += 3;
    if(p.second === finalMol) map[p.player] += 2;
    if(p.third === finalMol) map[p.player] += 1;
  });
  const arr = Object.entries(map).map(([player,score])=>({player,score}));
  arr.sort((a,b)=>b.score-a.score);
  return arr;
}

// --- small DOM helper ---
function el(tag, cls){ const d = document.createElement(tag); if(cls) d.className = cls; return d; }

// --- expose some functions for console debugging (optional) ---
window._mol = {
  lsGet, lsSet, savePrediction, getLatestPrediction, setElimination, getEliminations, getActiveCandidatesForWeek, appendAudit, lockWeek, isWeekLocked, setFinalMol, getFinalMol, calculateFinalScores, renderWeekPage
};