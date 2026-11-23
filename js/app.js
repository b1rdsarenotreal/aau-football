// App shell: loading the dynasty, the top bar, and page routing.

import { loadLeague, saveLeague, currentSide, otherAppsYear } from './store.js?v=20261123152841';
import { START_YEAR } from './data.js?v=20261123152841';
import { loadLogoTable } from './logos.js?v=20261123152841';
import { newLeague, afterChange, migrateLeague } from './league.js?v=20261123152841';
import { ctx, app, cache, persist, esc, flushSave, seasonLabel } from './ui.js?v=20261123152841';
import { renderHome, renderSchedule, renderStandings, renderRankings, renderPostseason, resetSeasonUi } from './views-season.js?v=20261123152841';
import { renderRecords } from './views-records.js?v=20261123152841';
import { renderTeams, renderTeamPage, renderConferences, renderConferencePage, renderHistory, renderSettings, renderOffseason, renderCoaches, renderCoachPage } from './views-league.js?v=20261123152841';

const VIEWS = { home: 'Home', schedule: 'Schedule', standings: 'Standings', rankings: 'Rankings', postseason: 'Postseason', offseason: 'Offseason', teams: 'Teams', coaches: 'Coaches', conferences: 'Conferences', history: 'History', records: 'Records', settings: 'Settings' };
const SUBVIEWS = { team: 'teams', conference: 'conferences', coach: 'coaches' };
const RENDER = {
  home: renderHome, schedule: renderSchedule, standings: renderStandings, rankings: renderRankings, postseason: () => renderPostseason(routeArg()),
  offseason: renderOffseason, teams: renderTeams, coaches: renderCoaches, conferences: renderConferences, history: renderHistory, records: renderRecords, settings: renderSettings,
  team: () => renderTeamPage(routeArg()), coach: () => renderCoachPage(routeArg()), conference: () => renderConferencePage(routeArg()),
};

function currentView() { const v = location.hash.replace(/^#\/?/, '').split('/')[0]; return VIEWS[v] || SUBVIEWS[v] ? v : 'home'; }
function routeArg() { return decodeURIComponent(location.hash.replace(/^#\/?/, '').split('/').slice(1).join('/')); }

function renderChrome() {
  const L = ctx.league;
  document.getElementById('league-name').textContent = L.name.replace(/^AAU\s+/i, ''); // the AAU wordmark comes first
  document.body.dataset.side = 'men';
  document.title = L.name;
  const v = currentView();
  const offOpen = L.seasons[L.currentYear].phase === 'complete';
  document.getElementById('nav').innerHTML = Object.entries(VIEWS).filter(([k]) => k !== 'offseason' || offOpen || v === 'offseason').map(([k, label]) => `<a href="#/${k}" class="${k === v || SUBVIEWS[v] === k ? 'active' : ''}">${label}</a>`).join('');
  const years = Object.keys(L.seasons).map(Number).sort((a, b) => b - a);
  const picker = document.getElementById('season-picker');
  picker.innerHTML = `<select aria-label="Season">${years.map(y => `<option value="${y}" ${y === L.viewYear ? 'selected' : ''}>${seasonLabel(y)}${y === L.currentYear ? '' : ' (past)'}</option>`).join('')}</select>`;
  picker.querySelector('select').onchange = e => { L.viewYear = Number(e.target.value); resetSeasonUi(); persist(); render(); };
}

export function render() {
  if (!ctx.league) return; // still on the start screen
  cache.reset();
  renderChrome();
  try { RENDER[currentView()](); }
  catch (e) { console.error(e); app.innerHTML = `<div class="empty">Something went wrong drawing this page: ${esc(e.message)}</div>`; }
}

let lastView = null;
window.addEventListener('hashchange', () => { const v = currentView(); render(); if (v !== lastView) window.scrollTo(0, 0); lastView = v; });

// A new dynasty: pick the first season. The default is the season the other
// AAU dynasties in this browser have reached (so football lines up with them
// on the AAU Dynasty calendar), else 2030.
async function pickStartYear() {
  const found = await otherAppsYear();
  const def = found ?? START_YEAR;
  const years = [];
  for (let y = START_YEAR; y <= Math.max(def + 3, 2036); y++) years.push(y);
  return new Promise(resolve => {
    app.innerHTML = `<div class="card stack start-card" style="max-width:560px;margin:40px auto">
      <h1>Start AAU Football</h1>
      <p>Every AAU football program in the commissioner's conferences: 11 games, 8 in conference, the BCS standings and a 16-team national tournament.</p>
      <label class="field">First season <select id="start-year">${years.map(y => `<option value="${y}" ${y === def ? 'selected' : ''}>${seasonLabel(y)}${y === found ? ' (where your other AAU dynasties are)' : ''}</option>`).join('')}</select></label>
      <p class="small muted">${found != null ? `Your other AAU dynasties in this browser are in ${seasonLabel(found)}, so starting there lines football up with them on the AAU Dynasty calendar.` : 'No other AAU dynasty was found in this browser, so 2030 is the default.'} Schools join or leave the AAU in the seasons they really do (seven join for 2032-33).</p>
      <div><button class="btn primary" id="start-go">Start the dynasty</button></div>
    </div>`;
    document.getElementById('start-go').onclick = () => resolve(Number(document.getElementById('start-year').value));
  });
}

async function boot() {
  ctx.render = render;
  let league = await loadLeague(currentSide());
  if (!league || !league.seasons) {
    const year = await pickStartYear();
    league = newLeague({ year });
    await saveLeague(league);
  }
  league.side = 'men';
  migrateLeague(league);
  if (league.migrated) { delete league.migrated; await saveLeague(league); }
  if (!league.seasons[league.viewYear]) league.viewYear = league.currentYear;
  ctx.league = league;
  afterChange(league.seasons[league.currentYear]);
  render();
  // Logos load in the background; redraw once they're in.
  loadLogoTable().then(() => render());
}

boot().catch(e => {
  console.error(e);
  app.innerHTML = `<div class="empty">The dynasty couldn't load: ${esc(e.message)}. Your saved league hasn't been changed. Try reloading the page.</div>`;
});
