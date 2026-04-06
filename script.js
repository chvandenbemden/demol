// script.js
// =========================
// De Mol — SPA (definitief aangepast)
// - Werkt met afleveringen (episode numbers + datum)
// - Autosave on change
// - Standaard admin wachtwoord: "christopheisdemol"
// - Scores pagina toegevoegd
// - Finale selector alleen op Overzicht; afvaller dropdown onderaan afleveringspagina
// - Alle audit/logging en verwijzingen daarvan verwijderd uit UI
// =========================

// --- configuratie ---
const START_EPISODE = 3; // we beginnen bij Aflevering 3
const START_DATE_ISO = '2026-04-12'; // Aflevering 3 datum (YYYY-MM-DD)
const DEFAULT_CANDIDATES = ["Abigail","Dries","Isabel","Wout","Maxim","Julie","Yana","Yannis"];
const DEFAULT_PLAYERS = ["Sam","Camellia","Tim","Joppe","Amber","Wout","Christophe","Tom"];
const DEFAULT_EPISODE_COUNT = 5; // tonen we enkel afleveringen 3 t/m 7 => count = 5

// --- localStorage keys ---
const KEY_CANDIDATES = 'mol_candidates';
const KEY_PLAYERS = 'mol_players';
const KEY_EPISODE_COUNT = 'mol_episode_count';
const KEY_PREDICTIONS = 'mol_predictions'; // array append-only
const KEY_ELIMINATIONS = 'mol_eliminations'; // array append-only (stores episode number)
const KEY_LOCKS = 'mol_locks'; // array of episode numbers
const KEY_FINAL = 'mol_final'; // {candidate, episode}
const KEY_ADMIN_HASH = 'mol_admin_hash'; // stored hashed password

// --- helpers ---
function nowISO(){ return new Date().toISOString(); }
function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }
function lsGet(key, fallback){ try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }catch(e){ return fallback; } }
function lsSet(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

// --- init defaults if missing ---
if(!localStorage.getItem(KEY_CANDIDATES)) lsSet(KEY_CANDIDATES, DEFAULT_CANDIDATES);
if(!localStorage.getItem(KEY_PLAYERS)) lsSet(KEY_PLAYERS, DEFAULT_PLAYERS);
if(!localStorage.getItem(KEY_EPISODE_COUNT)) lsSet(KEY_EPISODE_COUNT, DEFAULT_EPISODE_COUNT);
if(!localStorage.getItem(KEY_PREDICTIONS)) lsSet(KEY_PREDICTIONS, []);
if(!localStorage.getItem(KEY_ELIMINATIONS)) lsSet(KEY_ELIMINATIONS, []);
if(!localStorage.getItem(KEY_LOCKS)) lsSet(KEY_LOCKS, []);
if(!localStorage.getItem(KEY_FINAL)) lsSet(KEY_FINAL, null);

// --- date helpers for episodes ---
function episodeToDateISO(episode){
  const start = new Date(START_DATE_ISO + 'T00:00:00');
  const diff = (episode - START_EPISODE) * 7; // days
  const d = new Date(start.getTime() + diff * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0,10);
}
function formatEpisodeLabel(episode){
  const dateISO = episodeToDateISO(episode);
  const d = new Date(dateISO + 'T00:00:00');
  return `Aflevering ${episode} — ${d.toLocaleDateString('nl-BE', { day:'numeric', month:'short' })}`;
}

// --- prediction save (append-only) ---
function savePrediction(episode, player, first, second, third){
  const pred = { id: uuidv4(), episode, player, first: first||'', second: second||'', third: third||'', createdAt: nowISO() };
  const arr = lsGet(KEY_PREDICTIONS, []);
  arr.push(pred);
  lsSet(KEY_PREDICTIONS, arr);
}

// --- get latest prediction for episode+player ---
function getLatestPrediction(episode, player){
  const arr = lsGet(KEY_PREDICTIONS, []);
  for(let i=arr.length-1;i>=0;i--){
    if(arr[i].episode===episode && arr[i].player===player) return arr[i];
  }
  return null;
}

// --- eliminations (append-only) ---
function setElimination(episode, candidate){
  const arr = lsGet(KEY_ELIMINATIONS, []);
  arr.push({ id: uuidv4(), episode, candidate });
  lsSet(KEY_ELIMINATIONS, arr);
}

// --- get eliminations list ---
function getEliminations(){ return lsGet(KEY_ELIMINATIONS, []); }

// --- get active candidates for a given episode (not fallen before that episode) ---
function getActiveCandidatesForEpisode(episode){
  const all = lsGet(KEY_CANDIDATES, []);
  const eliminations = getEliminations();
  const fallenBefore = eliminations.filter(e => e.episode < episode).map(e => e.candidate);
  return all.filter(c => !fallenBefore.includes(c));
}

// --- locks ---
function lockEpisode(episode){ const arr = lsGet(KEY_LOCKS, []); if(!arr.includes(episode)){ arr.push(episode); lsSet(KEY_LOCKS, arr); } }
function isEpisodeLocked(episode){ return lsGet(KEY_LOCKS, []).includes(episode); }

// --- final Mol ---
function setFinalMol(candidate, episode){ const obj = { candidate, episode }; lsSet(KEY_FINAL, obj); return obj; }
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
  }
})();

// --- routing & render ---
window.addEventListener('hashchange', handleHash);
document.addEventListener('DOMContentLoaded', () => { renderEpisodeNav(); handleHash(); });

// render episode navigation links (only episodes 3..7)
function renderEpisodeNav(){
  const nav = document.getElementById('week-nav');
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

// main hash handler
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

// --- Overview page (players + candidates with elimination episode/date) + final selector at