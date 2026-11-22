// Persistence: the league lives in this browser's IndexedDB (falls back to
// localStorage). Export/import JSON for backups or moving devices.

// One dynasty (football has no women's/men's switch); the side helpers stay
// so the code reads like the other AAU apps.
const DB = 'aau-football', STORE = 'kv';
export function currentSide() { return 'men'; }
export function setSide() {}
const keyFor = () => 'aau-football-league';

function idb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function loadLeague(side = currentSide()) {
  const KEY = keyFor(side);
  try { return (await tx('readonly', s => s.get(KEY))) || null; }
  catch { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
}

export async function saveLeague(league) {
  const KEY = keyFor();
  league.savedAt = new Date().toISOString();
  try { await tx('readwrite', s => s.put(JSON.parse(JSON.stringify(league)), KEY)); }
  catch { localStorage.setItem(KEY, JSON.stringify(league)); }
}

export async function clearLeague(side = currentSide()) {
  const KEY = keyFor(side);
  try { await tx('readwrite', s => s.delete(KEY)); } catch { /* ignore */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function exportLeague(league) {
  const blob = new Blob([JSON.stringify(league, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(league.name || 'dynasty').replace(/\W+/g, '-')}-${league.currentYear}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// The season the owner's other AAU dynasties have reached in this browser
// (they share its storage: every app is on the same site), for a new
// dynasty's start year. Never creates another app's database. null if none.
const OTHER_APPS = [
  ['aau-volleyball', ['aau-volleyball-league', 'aau-volleyball-league-men']], ['aau-soccer', ['aau-soccer-league', 'aau-soccer-league-men']],
  ['aau-fhockey', ['aau-fhockey-league']], ['aau-hockey', ['aau-hockey-league', 'aau-hockey-league-men']],
  ['aau-basketball', ['aau-basketball-league', 'aau-basketball-league-men']], ['aau-lacrosse', ['aau-lacrosse-league', 'aau-lacrosse-league-men']],
  ['aau-diamond', ['aau-softball-league', 'aau-baseball-league']],
];
function openExisting(name) {
  return new Promise(resolve => {
    let req;
    try { req = indexedDB.open(name); } catch { return resolve(null); }
    let created = false;
    req.onupgradeneeded = () => { created = true; req.transaction.abort(); };
    req.onsuccess = () => { if (created) { req.result.close(); resolve(null); } else resolve(req.result); };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}
function getKey(db, key) {
  return new Promise(resolve => {
    try { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); } catch { resolve(null); }
  });
}
export async function otherAppsYear() {
  let best = null;
  if (!('indexedDB' in globalThis)) return best;
  let names = null;
  try { if (indexedDB.databases) names = new Set((await indexedDB.databases()).map(d => d.name)); } catch { names = null; }
  for (const [db, keys] of OTHER_APPS) {
    const h = !names || names.has(db) ? await openExisting(db) : null;
    for (const k of keys) {
      let L = h ? await getKey(h, k) : null;
      if (!L) try { L = JSON.parse(localStorage.getItem(k) || 'null'); } catch { L = null; }
      const y = Number(L?.currentYear);
      if (Number.isFinite(y) && y >= 2000 && (best == null || y > best)) best = y;
    }
    h?.close();
  }
  return best;
}
