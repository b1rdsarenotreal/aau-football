// Regular-season schedule for college football: 11 games over 13 weeks of
// Saturdays (two open dates each), from the Saturday before Labor Day to
// Thanksgiving weekend.
//
// - Conference play: `confMatches` (8) conference games, four at home and
//   four away; a conference with 8 teams or fewer plays everyone once (seven
//   or fewer games, the home split as even as the count allows). In a bigger
//   conference the opponents are drawn each year, favoring the ones a team
//   missed last year, so everyone meets over two seasons. Conference games
//   fill weeks 4 to 13 (`CONF_FROM`).
// - Non-conference games make up the rest to `maxMatches` (11): mostly the
//   first three weeks, some on later open dates, against nearby teams of a
//   similar level from other conferences, the stronger team hosting a much
//   weaker one (the guarantee game).
// When `prev` (last season) is given, conference opponents who met last year
// swap home and away.

import { isIndependent } from './standings.js?v=20261122140949';
import { cityPoint, miles } from './geo.js?v=20261122140949';
import { rng, shuffle, hashStr } from './util.js?v=20261122140949';
import { spreadConfHomes } from './homeaway.js?v=20261122140949';

export const DEFAULT_REG_WEEKS = 13;
export const DEFAULT_TOURNEY_WEEKS = 0; // kept for older code paths
export const PER_WEEK = 1; // one game a week
export const DEFAULT_CONF_MATCHES = 8; // conference games a team plays
export const DEFAULT_MAX_MATCHES = 11;  // regular-season games
export const MAX_CONF_WEEKS = 12;
export const CONF_FROM = 4; // conference play starts this week

// Conference games for an n-team conference: `max` (8), or everyone once in
// a smaller one (one fewer when n and max are both odd, so it can be drawn).
export const DOUBLE_ROUND_ROBIN_MAX = 0;
export const confTarget = (n, max = DEFAULT_CONF_MATCHES) => {
  if (n < 2) return 0;
  const g = Math.min(n - 1, max);
  return (n * g) % 2 ? g - 1 : g;
};

// Kept for older code paths that read these.
export const MIDWEEK = {}; export const MIDWEEK_FREQ = {};

export const DAY_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- the calendar ----------

// Seasons are academic years: the 2030 season is 2030–31, so football, a
// fall sport, is played in the fall of 2030. Week 1's Saturday is the
// Saturday before Labor Day (August 30 to September 5); weeks start on
// Monday.
export function seasonStart(year) {
  const sep1 = new Date(Date.UTC(year, 8, 1));
  const labor = 1 + ((8 - sep1.getUTCDay()) % 7); // first Monday in September
  return new Date(Date.UTC(year, 8, labor - 7));
}
// The calendar date of a week and day (a Date at UTC midnight).
export function dateOf(year, week, day) {
  const d = new Date(seasonStart(year));
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + Math.max(0, DAYS.indexOf(day)));
  return d;
}
// The week and day of a date (month and date in the fall of the season, or
// January and later of the next year).
export function weekDayOf(year, month, date) {
  const y = month < 6 ? year + 1 : year;
  const n = Math.round((Date.UTC(y, month, date) - seasonStart(year).getTime()) / 864e5);
  return { week: Math.floor(n / 7) + 1, day: DAYS[((n % 7) + 7) % 7] };
}
// The weeks conference play may use: all but the first two.
export function confWeeksFor(regWeeks) { return Math.max(1, Math.min(MAX_CONF_WEEKS, regWeeks - CONF_FROM + 1)); }
export function confWeeksMax(regWeeks) { return confWeeksFor(regWeeks); }
const rrRounds = n => (n < 2 ? 0 : n % 2 ? n : n - 1);

export function blankGame(season, fields) {
  return {
    id: season.nextId++, type: 'regular', week: 1, day: 'Sat', order: DAY_ORDER.Sat,
    home: null, away: null, neutral: false, confGame: false, series: null, label: '',
    final: false, homeLine: [], awayLine: [], homeR: null, homeH: null, homeE: null, awayR: null, awayH: null, awayE: null,
    pitching: null, source: null, ...fields,
  };
}

// The two days a conference plays each week. Set per conference (Standings →
// Commissioner); the default is `settings.confDays`, Wednesday and Saturday.
// In a week with one conference game it's on the second (weekend) day.
export const CONF_WEEKENDS = [
  ['tus', 'Tuesday and Saturday'],
  ['ws', 'Wednesday and Saturday'],
  ['wsu', 'Wednesday and Sunday'],
  ['ts', 'Thursday and Saturday'],
  ['tsu', 'Thursday and Sunday'],
  ['fs', 'Friday and Saturday'],
  ['fsu', 'Friday and Sunday'],
];
const WEEKEND_DAYS = { tus: ['Tue', 'Sat'], ws: ['Wed', 'Sat'], wsu: ['Wed', 'Sun'], ts: ['Thu', 'Sat'], tsu: ['Thu', 'Sun'], fs: ['Fri', 'Sat'], fsu: ['Fri', 'Sun'] };
export function seriesDays(fmt) {
  return (WEEKEND_DAYS[fmt] || WEEKEND_DAYS.ws).map(day => ({ day, order: DAY_ORDER[day] }));
}
export const confDaysOf = (season, conf) => season.settings?.confWeekend?.[conf] || season.settings?.confDays || 'ws';
// Re-lay a conference's unplayed conference games after its days change.
export function applyConfWeekend(season, conf) {
  const days = seriesDays(confDaysOf(season, conf));
  let n = 0;
  for (const g of season.games) {
    if (g.type !== 'regular' || !g.confGame || g.final || season.teams[g.home]?.conference !== conf || g.slot == null) continue;
    Object.assign(g, days[g.slot]);
    n++;
  }
  return n;
}

// Count each team's conference games in a set of rounds.
export function confSeriesCounts(rounds, list) {
  const n = Object.fromEntries(list.map(t => [t, 0]));
  for (const pairs of rounds) for (const [a, b] of pairs) if (a && b) { n[a]++; n[b]++; }
  return n;
}

// Pick games to drop so every team ends with the same number: team t must
// lose `need[t]` games, each shared with another team that has games to
// lose. Small conferences, so a backtracking search is quick.
function pickDrops(edges, need, r) {
  const left = { ...need }, chosen = [], used = new Set();
  let steps = 0;
  const solve = () => {
    if (++steps > 20000) return false;
    const todo = Object.keys(left).filter(t => left[t] > 0);
    if (!todo.length) return true;
    const opts = t => edges.filter((e, i) => !used.has(i) && (e.a === t ? left[e.b] > 0 : e.b === t && left[e.a] > 0));
    const t = todo.reduce((x, y) => (opts(y).length - left[y] < opts(x).length - left[x] ? y : x));
    for (const e of shuffle(opts(t), r)) {
      const i = edges.indexOf(e);
      used.add(i); left[e.a]--; left[e.b]--; chosen.push(i);
      if (solve()) return true;
      used.delete(i); left[e.a]++; left[e.b]++; chosen.pop();
    }
    return false;
  };
  return solve() ? chosen : null;
}

// Home/away for single meetings so every team hosts half its conference
// games. Pairs that meet twice already have one home each. The rest are
// walked as closed trails (an Euler orientation: every visit to a team is one
// arrival and one departure, so hosts and visits balance). A team with an
// odd number of single meetings gets a dummy partner, so it ends at most one
// off. `prefer(a, b)` > 0 means a should host (last season's swap); each
// trail runs whichever way satisfies more of those.
function balanceHomes(edges, r, prefer) {
  const adj = new Map(), deg = new Map();
  const all = edges.map(e => ({ ...e }));
  for (const e of all) for (const t of [e.a, e.b]) deg.set(t, (deg.get(t) || 0) + 1);
  const odd = [...deg].filter(([, d]) => d % 2).map(([t]) => t);
  for (let i = 0; i + 1 < odd.length; i += 2) all.push({ a: odd[i], b: '\u0000', dummy: true }, { a: odd[i + 1], b: '\u0000', dummy: true });
  all.forEach((e, i) => { for (const t of [e.a, e.b]) { if (!adj.has(t)) adj.set(t, []); adj.get(t).push(i); } });
  for (const l of adj.values()) l.splice(0, l.length, ...shuffle(l, r));
  const used = new Set();
  for (const start of shuffle([...adj.keys()], r)) {
    while ((adj.get(start) || []).some(i => !used.has(i))) {
      const trail = [];
      let at = start;
      for (;;) {
        const i = adj.get(at).find(j => !used.has(j));
        if (i == null) break;
        used.add(i);
        const e = all[i], to = e.a === at ? e.b : e.a;
        trail.push({ e, host: at, visit: to });
        at = to;
      }
      const score = trail.reduce((s2, x) => s2 + (x.e.dummy || !prefer ? 0 : Math.sign(prefer(x.host, x.visit))), 0);
      for (const x of trail) [x.e.home, x.e.away] = score < 0 ? [x.visit, x.host] : [x.host, x.visit];
    }
  }
  return all.filter(e => !e.dummy);
}

// A conference's rounds for the season, at most `maxRounds`: a round robin,
// then a second one with home and away swapped, taken until every team has
// its number of conference matches (confTarget). Fail-safe: every member plays
// the same number, with an even home/away split. When the last rounds give
// some teams an extra game, extra second meetings are dropped (those teams
// get a non-conference game or an open date instead); if no clean set of
// drops exists, the round robin is redrawn and tried again.
export function confRounds(list, maxRounds, r, max = DEFAULT_CONF_MATCHES, prefer = null) {
  if (list.length < 2) return [];
  const T = confTarget(list.length, max);
  for (let attempt = 0; attempt < 40; attempt++) {
    const first = roundRobin(list, r);
    const all = [...first, ...first.map(pairs => pairs.map(([a, b]) => [b, a]))];
    const rounds = [], cnt = Object.fromEntries(list.map(t => [t, 0]));
    for (const pairs of all) {
      if (rounds.length >= maxRounds || list.every(t => cnt[t] >= T)) break;
      rounds.push(pairs);
      for (const [a, b] of pairs) if (a && b) { cnt[a]++; cnt[b]++; }
    }
    let k = Math.min(T, ...Object.values(cnt));
    if ((list.length * k) % 2) k--;
    const edges = rounds.flatMap((pairs, ri) => pairs.filter(([a, b]) => a && b).map(([a, b]) => ({ a, b, ri, second: ri >= first.length })));
    const need = Object.fromEntries(list.map(t => [t, cnt[t] - k]));
    let gone = new Set();
    if (Object.values(need).some(x => x > 0)) {
      const seconds = edges.filter(e => e.second);
      let drops = pickDrops(seconds, need, r);
      if (drops) drops = drops.map(i => seconds[i]);
      else { drops = pickDrops(edges, need, r); if (drops) drops = drops.map(i => edges[i]); }
      if (!drops) continue;
      gone = new Set(drops);
    }
    const kept = edges.filter(e => !gone.has(e));
    // Pairs meeting twice keep their swapped home and away; balance the rest.
    const meets = {};
    for (const e of kept) meets[key(e.a, e.b)] = (meets[key(e.a, e.b)] || 0) + 1;
    const singles = kept.filter(e => meets[key(e.a, e.b)] === 1);
    for (const e of balanceHomes(singles, r, prefer)) { const o = singles.find(x => x.a === e.a && x.b === e.b && x.ri === e.ri); o.home = e.home; o.away = e.away; }
    const out = rounds.map(() => []);
    for (const e of kept) out[e.ri].push(e.home ? [e.home, e.away] : [e.a, e.b]);
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  }
  throw new Error(`Couldn't give every team in a ${list.length}-team conference the same number of conference games.`);
}

// Circle-method round robin. Returns rounds of [a, b] pairs (null = bye).
export function roundRobin(teams, r) {
  const list = shuffle(teams, r);
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      pairs.push(k % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
// Conference rivals; independents are nobody's rivals.
const rival = (teams, a, b) => teams[a].conference === teams[b].conference && !isIndependent(teams[a].conference);

// Pair teams across conferences, avoiding repeat opponents when possible.
function crossPairs(pool, teams, met, r) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const left = shuffle(pool, r), pairs = [];
    let ok = true;
    while (left.length > 1) {
      const a = left.shift();
      let j = left.findIndex(b => !rival(teams, a, b) && !met.has(key(a, b)));
      if (j < 0) j = left.findIndex(b => !rival(teams, a, b));
      if (j < 0) { ok = false; break; }
      pairs.push([a, left.splice(j, 1)[0]]);
    }
    if (ok) return { pairs, idle: left };
  }
  return { pairs: [], idle: [...pool] };
}

// Pair teams across conferences for non-conference games: each team (in
// random order) takes the free opponent with the lowest cost, which is the
// distance between their homes, the gap in their ratings and some
// randomness, with a big penalty for a repeat opponent. `dist` is in miles.
// Level: a little pull toward teams of a similar rating (good matches for
// the index), and a big one against a Division I power playing a Division
// III school. Marquee games (two teams in the top third by rating) get
// harder to add the more of them either team already has, so a top team
// plays a few, not a whole non-conference schedule of them (the owner's
// rule, Nov. 2026).
const levelCost = (x, y) => { const g = Math.abs(x - y); return g * 15 + Math.max(0, g - 16) * 60; };
// A team in a tough conference schedules down (the owner's rule, Nov. 2026):
// with a conference schedule full of strong teams it needs non-conference
// games it can win, not a ratings boost; a team in a weak conference
// schedules up for the résumé its league can't give it. Its target opponent
// level is its own rating minus TOUGH × how far its conference rivals'
// average is above the league's (at most 12 down or 8 up). An opponent above
// that target costs more than one below it.
export const TOUGH = 1.2;
// Football teams play anybody out of conference (the owner's call, Nov. 2026):
// distance only breaks near-ties.
export const DIST_WEIGHT = 0.12;
const aimCost = (opp, target) => { const g = opp - target, a = Math.abs(g); return (g > 0 ? 45 : 12) * a + Math.max(0, a - 18) * 60; };
function targetLevels(teams, lvl) {
  const names = Object.keys(teams), avg = names.reduce((x, t) => x + lvl(t), 0) / (names.length || 1);
  const byConf = {};
  for (const t of names) if (!isIndependent(teams[t].conference)) (byConf[teams[t].conference] ||= []).push(t);
  const out = {};
  for (const t of names) {
    const rivals = (byConf[teams[t].conference] || []).filter(x => x !== t);
    const confAvg = rivals.length ? rivals.reduce((x, o) => x + lvl(o), 0) / rivals.length : avg;
    out[t] = lvl(t) - Math.max(-8, Math.min(12, TOUGH * (confAvg - avg)));
  }
  return out;
}
const targets = new WeakMap();
// Top-third teams (by rating) play each other out of conference at most
// `MARQUEE_MAX` (2) times a season and usually once (the owner's rule,
// Nov. 2026): a second such game costs `MARQUEE` per one either team has,
// a third is never drawn. Rivalry games count.
export const MARQUEE = 2500, MARQUEE_MAX = 2;
const marquee = new WeakMap();
function marqueeOf(met, teams, lvl) {
  if (!marquee.has(met)) {
    const names = Object.keys(teams), top = new Set([...names].sort((a, b) => lvl(b) - lvl(a)).slice(0, Math.ceil(names.length / 3)));
    marquee.set(met, { top, n: {} });
  }
  return marquee.get(met);
}
function nearCross(pool, teams, met, r, dist) {
  const lvl = t => lvlOf(teams[t]);
  const mq = marqueeOf(met, teams, lvl), big = (a, b) => mq.top.has(a) && mq.top.has(b);
  const full = (a, b) => big(a, b) && Math.max(mq.n[a] || 0, mq.n[b] || 0) >= MARQUEE_MAX;
  if (!targets.has(met)) targets.set(met, targetLevels(teams, lvl));
  const aim = targets.get(met);
  const left = shuffle(pool, r), pairs = [];
  while (left.length > 1) {
    const a = left.shift();
    let best = -1, bs = Infinity;
    left.forEach((b, j) => {
      if (rival(teams, a, b) || full(a, b)) return;
      // Teams near each one's target level (`aimCost`: a tough conference's
      // teams schedule down), but few marquee games each.
      const c = dist(a, b) * DIST_WEIGHT + r() * 500 + (aimCost(lvl(b), aim[a]) + aimCost(lvl(a), aim[b])) / 2 + (big(a, b) ? MARQUEE * ((mq.n[a] || 0) + (mq.n[b] || 0)) : 0) + (met.has(key(a, b)) ? 4000 : 0);
      if (c < bs) { bs = c; best = j; }
    });
    if (best >= 0) { const b = left.splice(best, 1)[0]; pairs.push([a, b]); if (big(a, b)) { mq.n[a] = (mq.n[a] || 0) + 1; mq.n[b] = (mq.n[b] || 0) + 1; } }
  }
  return pairs;
}

// Event sizes for n teams in `events` events, as even as possible.
export function eventSizes(n, events = Math.floor(n / 4)) {
  if (n < 3 || events < 1) return [];
  const base = Math.floor(n / events), extra = n % events;
  return Array.from({ length: events }, (_, i) => base + (i < extra ? 1 : 0));
}


// A team's level for scheduling: its OVR (football's weights).
const lvlOf = t => (t.off ?? 65) * 0.45 + (t.pit ?? 65) * 0.1 + (t.def ?? 65) * 0.45;
const lvl = lvlOf;

// The season's schedule. Once it's drawn, conference hosts (and, where a
// week allows, the order of conference weeks) are set so no team plays more
// than two conference weekends in a row away, or three at home (the owner's
// rule, Nov. 2026; `js/homeaway.js`). Travel-partner conferences are already
// built that way.
export function generateSchedule(season, seed = hashStr(String(season.year)), prev = null) {
  const games = drawSchedule(season, seed, prev);
  const last = new Map();
  for (const g of prev?.games || []) if (g.type === 'regular' && g.confGame) { const k = key(g.home, g.away); last.set(k, last.has(k) && last.get(k) !== g.home ? 'both' : g.home); }
  const sorted = games.every((g, i) => !i || games[i - 1].week <= g.week);
  spreadConfHomes(games, season.teams, rng((seed ^ 0x5bd1e995) >>> 0), {
    skip: c => (season.partnerConfs || []).includes(c),
    lastHost: (a, b) => { const h = last.get(key(a, b)); return h && h !== 'both' ? h : null; },
    slack: 0, // four conference games at home, four away
  });
  if (sorted) games.sort((a, b) => a.week - b.week);
  return games;
}

function drawSchedule(season, seed, prev) {
  const r = rng(seed);
  const teams = season.teams;
  const names = Object.keys(teams);
  const st = season.settings || {};
  const homeCount = Object.fromEntries(names.map(n => [n, 0]));
  const met = new Set();
  const games = [];
  const REG = Math.max(8, st.regWeeks ?? DEFAULT_REG_WEEKS);
  season.regWeeks = REG;
  const cap = st.maxMatches ?? DEFAULT_MAX_MATCHES;
  const busy = Object.fromEntries(names.map(n => [n, new Set()]));
  const confGames = Object.fromEntries(names.map(n => [n, 0]));
  const add = (week, home, away, extra = {}) => {
    games.push(blankGame(season, { week, day: 'Sat', order: DAY_ORDER.Sat, home, away, ...extra }));
    homeCount[home]++;
    met.add(key(home, away));
    busy[home].add(week); busy[away].add(week);
  };
  const lastMet = new Set(), hosts = new Map();
  for (const g of prev?.games || []) if (g.type === 'regular' && g.confGame) { const k = key(g.home, g.away); lastMet.add(k); hosts.set(k, hosts.has(k) ? 'both' : g.home); }

  // ---- conference play ----
  const byConf = {};
  for (const n of names) if (!isIndependent(teams[n].conference)) (byConf[teams[n].conference] ||= []).push(n);
  const first = Math.min(CONF_FROM, REG), confWeeks = Array.from({ length: REG - first + 1 }, (_, i) => first + i);
  for (const [conf, list] of Object.entries(byConf).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length < 2) continue;
    const n = list.length, G = confTarget(n, st.confMatches ?? DEFAULT_CONF_MATCHES);
    if (!G) continue;
    const prefer = (a, b) => { const h = hosts.get(key(a, b)); return !h || h === 'both' ? 0 : h === a ? -1 : 1; };
    const edges = confPairs(list, G, r, lastMet, rivalriesOf(season)).map(([a, b]) => ({ a, b }));
    const oriented = balanceHomes(edges, r, prefer);
    // Weeks: every team plays at most once a week.
    const wk = weekPlan(oriented, list, confWeeks.length < G ? Array.from({ length: G }, (_, i) => REG - G + 1 + i) : confWeeks, r);
    oriented.forEach((e, i) => { add(wk[i], e.home, e.away, { confGame: true }); confGames[e.home]++; confGames[e.away]++; });
  }

  // ---- non-conference games: up to `maxMatches` in all, mostly in the
  // first weeks, against nearby teams of a similar level ----
  const pts = Object.fromEntries(names.map(n => [n, cityPoint(teams[n].city)]));
  const dist = (a, b) => (pts[a] && pts[b] ? miles(pts[a], pts[b]) : 900);
  const need = Object.fromEntries(names.map(t => [t, Math.max(0, cap - confGames[t])]));
  const orient = (a, b) => {
    // A much stronger team hosts (a guarantee game); otherwise whoever has
    // fewer home games.
    const gap = lvl(teams[a]) - lvl(teams[b]);
    if (gap > 12) return [a, b];
    if (gap < -12) return [b, a];
    if (homeCount[a] > homeCount[b]) return [b, a];
    if (homeCount[a] < homeCount[b]) return [a, b];
    return r() < 0.5 ? [a, b] : [b, a];
  };
  // Non-conference rivalries first, every year: the host swaps from last
  // year's meeting, on a week both have open (early in the season if they can).
  const mq = marqueeOf(met, teams, t => lvl(teams[t]));
  const bigN = (a, b) => (mq.top.has(a) && mq.top.has(b) ? Math.max(mq.n[a] || 0, mq.n[b] || 0) : -1);
  const lastHost = new Map();
  for (const g of prev?.games || []) if (g.type === 'regular' && !g.confGame && !g.filler) lastHost.set(key(g.home, g.away), g.home);
  for (const [a, b] of rivalriesOf(season)) {
    if (!teams[a] || !teams[b] || a === b || rival(teams, a, b) || need[a] <= 0 || need[b] <= 0 || met.has(key(a, b))) continue;
    const w = [2, 1, 3, ...Array.from({ length: REG }, (_, i) => i + 1)].find(x => x <= REG && !busy[a].has(x) && !busy[b].has(x));
    if (!w) continue;
    const last = lastHost.get(key(a, b));
    const [h, aw] = last === a ? [b, a] : last === b ? [a, b] : r() < 0.5 ? [a, b] : [b, a];
    add(w, h, aw, { rivalry: true });
    need[a]--; need[b]--;
    if (mq.top.has(a) && mq.top.has(b)) { mq.n[a] = (mq.n[a] || 0) + 1; mq.n[b] = (mq.n[b] || 0) + 1; }
  }
  for (let week = 1; week <= REG; week++) {
    const pool = names.filter(t => {
      if (need[t] <= 0 || busy[t].has(week)) return false;
      let open = 0;
      for (let w = week; w <= REG; w++) if (!busy[t].has(w)) open++;
      if (open <= need[t]) return true;
      return r() < (week <= 3 ? 0.92 : 0.18);
    });
    for (const [a, b] of nearCross(pool, teams, met, r, dist)) {
      const [h, aw] = orient(a, b);
      add(week, h, aw);
      need[a]--; need[b]--;
    }
  }
  // Teams still short: pair two of them on a week both have open.
  for (let pass = 0; pass < 3; pass++) {
    for (const a of shuffle(names, r)) {
      while (need[a] > 0) {
        let best = null, bc = Infinity;
        for (const b of names) {
          if (b === a || need[b] <= 0 || rival(teams, a, b) || bigN(a, b) >= MARQUEE_MAX) continue;
          const w = Array.from({ length: REG }, (_, i) => i + 1).find(x => !busy[a].has(x) && !busy[b].has(x));
          if (!w) continue;
          const aim = targets.get(met) || targetLevels(teams, t => lvl(teams[t]));
          const c = dist(a, b) * DIST_WEIGHT + (aimCost(lvl(teams[b]), aim[a]) + aimCost(lvl(teams[a]), aim[b])) / 2 + (met.has(key(a, b)) ? 4000 : 0) + (bigN(a, b) >= 0 ? MARQUEE * ((mq.n[a] || 0) + (mq.n[b] || 0)) : 0) + r() * 300;
          if (c < bc) { bc = c; best = [b, w]; }
        }
        if (!best) break;
        const [b, w] = best, [h, aw] = orient(a, b);
        add(w, h, aw);
        need[a]--; need[b]--;
        if (bigN(a, b) >= 0) { mq.n[a] = (mq.n[a] || 0) + 1; mq.n[b] = (mq.n[b] || 0) + 1; }
      }
    }
  }
  // Still short: two short teams take over a non-conference game between two
  // others (a plays c on its date, b plays d on a date they both have open),
  // so the FCS game below is rare.
  const bigPair = (a, b) => mq.top.has(a) && mq.top.has(b);
  const okPair = (a, b) => a !== b && !rival(teams, a, b) && !met.has(key(a, b)) && bigN(a, b) < MARQUEE_MAX;
  const drop = g => {
    games.splice(games.indexOf(g), 1);
    homeCount[g.home]--; met.delete(key(g.home, g.away)); busy[g.home].delete(g.week); busy[g.away].delete(g.week);
    if (bigPair(g.home, g.away)) { mq.n[g.home]--; mq.n[g.away]--; }
    need[g.home]++; need[g.away]++;
  };
  const undrop = g => {
    games.push(g);
    homeCount[g.home]++; met.add(key(g.home, g.away)); busy[g.home].add(g.week); busy[g.away].add(g.week);
    if (bigPair(g.home, g.away)) { mq.n[g.home]++; mq.n[g.away]++; }
    need[g.home]--; need[g.away]--;
  };
  const book = (w, a, b) => {
    const [h, aw] = orient(a, b); add(w, h, aw); need[a]--; need[b]--;
    if (bigPair(a, b)) { mq.n[a] = (mq.n[a] || 0) + 1; mq.n[b] = (mq.n[b] || 0) + 1; }
  };
  const weeks = Array.from({ length: REG }, (_, i) => i + 1);
  for (let guard = 0; guard < 200; guard++) {
    const short = shuffle(names.filter(t => need[t] > 0), r);
    let done = false;
    for (const a of short) {
      for (const b of short) {
        if (b === a && need[a] < 2) continue;
        for (const g of shuffle(games.filter(x => x.type === 'regular' && !x.confGame && !x.rivalry && !x.filler && !busy[a].has(x.week)), r)) {
          for (const [c, d] of [[g.home, g.away], [g.away, g.home]]) {
            if (c === b || d === a || !okPair(a, c) || !okPair(b, d)) continue;
            drop(g);
            const w2 = weeks.find(x => !busy[b].has(x) && !busy[d].has(x) && (x !== g.week || a !== b));
            if (w2) { book(g.week, a, c); book(w2, b, d); done = true; break; }
            undrop(g);
          }
          if (done) break;
        }
        if (done) break;
      }
      if (done) break;
    }
    if (!done) break;
  }
  // Last resort (the owner's rule, Nov. 2026): a team still short plays a
  // generic FCS opponent from its part of the country at home, as in the
  // NCAA Football video games, on an open date; at most one a season. It's
  // an automatic win once its week is played (`playDueFillers` in league.js).
  for (const a of names) {
    if (need[a] <= 0) continue;
    const w = [1, 2, 3, ...Array.from({ length: REG - 3 }, (_, i) => i + 4)].find(x => x <= REG && !busy[a].has(x));
    if (!w) continue;
    games.push(fillerGame(season, a, w, fcsName(pts[a])));
    busy[a].add(w); homeCount[a]++; need[a]--;
  }
  games.sort((a, b) => a.week - b.week || a.order - b.order);
  return games;
}

// Rivalries played every year (the owner's ask, Nov. 2026; edited in
// Settings → Schedule format, `settings.rivalries`). Between conferences
// they're booked before any other non-conference game; inside a conference
// too big to play everyone, they're kept in the conference schedule.
export const DEFAULT_RIVALRIES = [
  // Non-conference in the owner's alignment.
  ['Iowa', 'Iowa State'], ['Oregon', 'Oregon State'], ['Washington', 'Washington State'], ['Utah', 'BYU'],
  ['Notre Dame', 'USC'], ['Notre Dame', 'Stanford'], ['Penn State', 'Pittsburgh'], ['Colorado', 'Nebraska'],
  // Conference rivalries kept every year.
  ['Texas', 'Texas A&M'], ['Missouri', 'Kansas'], ['Houston', 'Rice'], ['Baylor', 'Texas Tech'],
  ['Florida', 'Florida State'], ['Georgia', 'Georgia Tech'], ['Duke', 'North Carolina'], ['Florida State', 'Miami'], ['Maryland', 'Virginia'],
  ['Michigan', 'Ohio State'], ['Michigan', 'Michigan State'], ['Indiana', 'Purdue'], ['Minnesota', 'Wisconsin'], ['Iowa', 'Minnesota'], ['Illinois', 'Northwestern'],
  ['Arizona', 'Arizona State'], ['California', 'Stanford'], ['UCLA', 'USC'],
];
export const rivalriesOf = season => season.settings?.rivalries ?? DEFAULT_RIVALRIES;

// The generic FCS opponents for a team's last-resort game, by region.
export const FCS_OPPONENTS = ['FCS West', 'FCS Southwest', 'FCS Midwest', 'FCS Southeast', 'FCS Northeast'];
export const isFiller = name => FCS_OPPONENTS.includes(name);
export function fcsName(pt) {
  if (!pt) return 'FCS Midwest';
  const [lat, lon] = Array.isArray(pt) ? pt : [pt.lat, pt.lon];
  if (lon < -104) return 'FCS West';
  if (lon < -94 && lat < 37.5) return 'FCS Southwest';
  if (lat < 36.8 && lon >= -94) return 'FCS Southeast';
  if (lon < -84) return 'FCS Midwest';
  return 'FCS Northeast';
}
// A last-resort game against a generic FCS team, at home: scheduled like any
// other game; `fillerResult` is its score, a win, when the week is played.
export function fillerGame(season, team, week, opp) {
  return blankGame(season, { week, day: 'Sat', order: DAY_ORDER.Sat, home: team, away: opp, filler: true });
}
// The made-up score of a game against a generic FCS team: an easy home win,
// a few points a quarter for the visitor.
export function fillerResult(r) {
  const homeLine = Array.from({ length: 4 }, () => [7, 14, 10, 14, 7, 21, 3, 17][Math.floor(r() * 8)]);
  const awayLine = Array.from({ length: 4 }, () => [0, 0, 0, 3, 7, 0, 0, 3][Math.floor(r() * 8)]);
  const R = l => l.reduce((x, y) => x + y, 0);
  return {
    homeLine, awayLine, innings: 4, runRule: false, pk: null,
    home: { R: R(homeLine), H: 380 + Math.round(r() * 180), E: Math.round(r() * 1.4) },
    away: { R: R(awayLine), H: 150 + Math.round(r() * 90), E: 1 + Math.round(r() * 2) },
  };
}

// A conference's pairings for the season: everyone once when `g` is n − 1,
// otherwise a g-regular set of pairs (a circulant on a shuffled order: each
// team plays the g nearest in that order), the draw that leaves out the
// fewest pairs who also missed each other last year.
export function confPairs(list, g, r, lastMet = new Set(), keep = []) {
  const n = list.length;
  if (g >= n - 1) { const out = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([list[i], list[j]]); return out; }
  // Rivals to keep sit side by side in the order (chains of rivals, a team
  // with two rivals between them), so the nearest-neighbor pairs include them.
  const set = new Set(list), want = keep.filter(([a, b]) => set.has(a) && set.has(b) && a !== b);
  const adj = new Map();
  for (const [a, b] of want) { (adj.has(a) ? adj : adj.set(a, [])).get(a).push(b); (adj.has(b) ? adj : adj.set(b, [])).get(b).push(a); }
  const chainsFor = () => {
    const seen = new Set(), chains = [];
    for (const t of shuffle(list, r)) {
      if (seen.has(t) || (adj.get(t) || []).length === 2) continue; // start at a chain's end
      const ch = [t]; seen.add(t);
      for (let cur = t; ;) { const nx = (adj.get(cur) || []).find(x => !seen.has(x)); if (!nx) break; ch.push(nx); seen.add(nx); cur = nx; }
      chains.push(r() < 0.5 ? ch : ch.reverse());
    }
    for (const t of list) if (!seen.has(t)) chains.push([t]); // a cycle: left as singles
    return shuffle(chains, r).flat();
  };
  let best = null, bc = Infinity;
  for (let tries = 0; tries < 300; tries++) {
    const o = want.length ? chainsFor() : shuffle(list, r), pairs = [];
    for (let k = 1; k <= Math.floor(g / 2); k++) for (let i = 0; i < n; i++) pairs.push([o[i], o[(i + k) % n]]);
    if (g % 2) for (let i = 0; i < n / 2; i++) pairs.push([o[i], o[i + n / 2]]);
    const inSet = new Set(pairs.map(([a, b]) => key(a, b)));
    let missedTwice = 0;
    if (lastMet.size) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const k = key(list[i], list[j]); if (!inSet.has(k) && !lastMet.has(k)) missedTwice++; }
    const missing = want.filter(([a, b]) => !inSet.has(key(a, b))).length;
    const c = missing * 1000 + missedTwice * 10 + r();
    if (c < bc) { bc = c; best = pairs; }
  }
  return best;
}

// Weeks for a conference's games: no team twice in a week. Random greedy
// with restarts (each game takes a random week both teams have open, the
// most constrained games first).
function weekPlan(edges, list, weeks, r) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const used = Object.fromEntries(list.map(t => [t, new Set()]));
    const out = new Array(edges.length);
    const order = shuffle(edges.map((_, i) => i), r);
    let ok = true;
    for (const i of order) {
      const { home, away } = edges[i];
      const open = weeks.filter(w => !used[home].has(w) && !used[away].has(w));
      if (!open.length) { ok = false; break; }
      const w = open[Math.floor(r() * open.length)];
      out[i] = w; used[home].add(w); used[away].add(w);
    }
    if (ok) return out;
  }
  // Fallback: a round-robin layout (always fits when there are n − 1 weeks).
  return edges.map((_, i) => weeks[i % weeks.length]);
}
