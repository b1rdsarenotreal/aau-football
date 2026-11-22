// The BCS standings (the owner's pick for ranking teams, Nov. 2026: "a
// computer and human element"), built the way the Bowl Championship Series
// did from 2004 to 2013:
// - two human polls, each worth a third: the AAU Poll (the weekly poll's
//   points over the most possible) and the Coaches Poll (a second panel,
//   `generateCoachesPoll` in js/polls.js);
// - the computer average, worth a third: six computer rankings, each giving
//   25 points for No. 1 down to 1 for No. 25; a team's best and worst are
//   dropped and the other four added, out of 100. Like the BCS computers,
//   none of them counts margin of victory, only who won, where and against
//   whom.
// The six computers:
//   Colley    the Colley Matrix (win-loss and schedule, solved exactly);
//   Bradley   a Bradley-Terry model of win chances, fit to every result;
//   RPI       the rating percentage index (25% win%, 50% opponents', 25%
//             opponents' opponents');
//   Elo       results replayed in order, each team starting even;
//   Keener    the eigenvector of who beat whom (wins over teams that win);
//   Billings  each game worth the opponent's rating plus or minus a win's
//             value, averaged again and again until it settles.
// `bcs(season)` comes back in the shape the shared code uses for its index
// (value in `rpi`, plus `rank` and `sosRank`).

import { isFinal, winnerOf, resultFor, rpi } from './standings.js?v=20261122131034';

export const COMPUTERS = [
  ['colley', 'Colley'], ['bradley', 'Bradley'], ['rpi', 'RPI'], ['elo', 'Elo'], ['keener', 'Keener'], ['billings', 'Billings'],
];

function results(season, filter) {
  const teams = Object.keys(season.teams);
  const games = season.games.filter(g => isFinal(g) && season.teams[g.home] && season.teams[g.away] && (!filter || filter(g)))
    .sort((a, b) => a.week - b.week || a.order - b.order || a.id - b.id);
  return { teams, games };
}

// Colley Matrix: (2 + n_i) r_i − Σ r_opp = 1 + (w − l) / 2.
function colley(teams, games) {
  const idx = Object.fromEntries(teams.map((t, i) => [t, i])), n = teams.length;
  const C = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n).fill(1);
  for (let i = 0; i < n; i++) C[i][i] = 2;
  for (const g of games) {
    const h = idx[g.home], a = idx[g.away], w = winnerOf(g);
    C[h][h]++; C[a][a]++; C[h][a]--; C[a][h]--;
    if (w === g.home) { b[h] += 0.5; b[a] -= 0.5; } else if (w === g.away) { b[a] += 0.5; b[h] -= 0.5; }
  }
  // Gauss-Seidel (the matrix is diagonally dominant).
  const r = new Float64Array(n).fill(0.5);
  for (let it = 0; it < 300; it++) {
    let d = 0;
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let j = 0; j < n; j++) if (j !== i && C[i][j]) s -= C[i][j] * r[j];
      const v = s / C[i][i]; d = Math.max(d, Math.abs(v - r[i])); r[i] = v;
    }
    if (d < 1e-9) break;
  }
  return Object.fromEntries(teams.map((t, i) => [t, r[i]]));
}

// Bradley-Terry: P(i beats j) = s_i / (s_i + s_j), fit by the MM algorithm,
// with every team given a tie against an average team (so unbeaten teams
// stay finite).
function bradley(teams, games) {
  const s = Object.fromEntries(teams.map(t => [t, 1])), wins = {}, opps = {};
  for (const t of teams) { wins[t] = 0.5; opps[t] = []; }
  for (const g of games) {
    const w = winnerOf(g);
    if (w) wins[w] += 1; else { wins[g.home] += 0.5; wins[g.away] += 0.5; }
    opps[g.home].push(g.away); opps[g.away].push(g.home);
  }
  for (let it = 0; it < 80; it++) {
    for (const t of teams) {
      let den = 1 / (s[t] + 1);
      for (const o of opps[t]) den += 1 / (s[t] + s[o]);
      s[t] = wins[t] / den;
    }
    const gm = Math.exp(teams.reduce((x, t) => x + Math.log(s[t]), 0) / teams.length);
    for (const t of teams) s[t] /= gm;
  }
  return s;
}

function elo(teams, games) {
  const r = Object.fromEntries(teams.map(t => [t, 1500]));
  for (let pass = 0; pass < 3; pass++) {
    // Replayed three times from the end of the first pass, so early games
    // count against teams' later strength too.
    for (const g of games) {
      const h = g.neutral ? 0 : 30, e = 1 / (1 + 10 ** ((r[g.away] - r[g.home] - h) / 400));
      const res = { W: 1, T: 0.5, L: 0 }[resultFor(g, g.home)];
      const k = 32 / (pass + 1);
      r[g.home] += k * (res - e); r[g.away] -= k * (res - e);
    }
  }
  return r;
}

// Keener: the leading eigenvector of a_ij = h((w_ij + 1) / (n_ij + 2)), with
// h(x) = 1/2 + sign(x − 1/2) √|2x − 1| / 2 (power iteration).
function keener(teams, games) {
  const idx = Object.fromEntries(teams.map((t, i) => [t, i])), n = teams.length;
  const W = {}, N = {};
  for (const g of games) {
    const w = winnerOf(g);
    for (const [t, o] of [[g.home, g.away], [g.away, g.home]]) {
      const k = `${t}|${o}`;
      N[k] = (N[k] || 0) + 1;
      W[k] = (W[k] || 0) + (w === t ? 1 : w ? 0 : 0.5);
    }
  }
  const hfun = x => 0.5 + Math.sign(x - 0.5) * Math.sqrt(Math.abs(2 * x - 1)) / 2;
  const rows = teams.map(() => []), played = {};
  for (const k of Object.keys(N)) { const t = k.slice(0, k.indexOf('|')); played[t] = (played[t] || 0) + N[k]; }
  for (const k of Object.keys(N)) {
    const i = k.indexOf('|'), t = k.slice(0, i), o = k.slice(i + 1);
    rows[idx[t]].push([idx[o], hfun((W[k] + 1) / (N[k] + 2)) / (played[t] || 1)]);
  }
  let v = new Float64Array(n).fill(1 / n);
  for (let it = 0; it < 100; it++) {
    const nv = new Float64Array(n).fill(1e-6);
    rows.forEach((row, i) => { for (const [j, a] of row) nv[i] += a * v[j]; });
    const s = nv.reduce((x, y) => x + y, 0);
    for (let i = 0; i < n; i++) nv[i] /= s;
    v = nv;
  }
  return Object.fromEntries(teams.map((t, i) => [t, v[i]]));
}

// Each game worth the opponent's rating + 100 for a win, − 100 for a loss
// (a road win 10 more, a home loss 10 more against), averaged with a prior
// of one game at 0, again and again until it settles.
function billings(teams, games) {
  let r = Object.fromEntries(teams.map(t => [t, 0]));
  const list = Object.fromEntries(teams.map(t => [t, []]));
  for (const g of games) {
    const w = winnerOf(g);
    for (const [t, o, home] of [[g.home, g.away, true], [g.away, g.home, false]]) {
      const v = w === t ? 100 + (home || g.neutral ? 0 : 10) : w ? -100 - (home && !g.neutral ? 10 : 0) : 0;
      list[t].push([o, v]);
    }
  }
  for (let it = 0; it < 100; it++) {
    const nr = {};
    for (const t of teams) nr[t] = list[t].reduce((s, [o, v]) => s + r[o] + v, 0) / (list[t].length + 1);
    r = nr;
  }
  return r;
}

// Each computer's ranking (1 = best) of the teams that have played.
const CACHE = new WeakMap();
export function computerRanks(season, filter = null) {
  const { teams, games } = results(season, filter);
  // The same games give the same rankings: keep the last few.
  const sig = games.map(g => `${g.id}:${g.home}:${g.homeR}-${g.awayR}`).join(',') + '|' + teams.join(',');
  const memo = CACHE.get(season) || [];
  const hit = memo.find(m => m.sig === sig);
  if (hit) return hit.out;
  const out = computeRanks(season, filter, teams, games);
  memo.unshift({ sig, out }); memo.length = Math.min(memo.length, 6);
  CACHE.set(season, memo);
  return out;
}
function computeRanks(season, filter, teams, games) {
  const played = teams.filter(t => games.some(g => g.home === t || g.away === t));
  const R = rpi(season, filter);
  const vals = {
    colley: colley(teams, games), bradley: bradley(teams, games), rpi: Object.fromEntries(teams.map(t => [t, R[t]?.rpi ?? 0])),
    elo: elo(teams, games), keener: keener(teams, games), billings: billings(teams, games),
  };
  const out = {};
  for (const [k] of COMPUTERS) {
    const order = [...played].sort((a, b) => vals[k][b] - vals[k][a] || a.localeCompare(b));
    out[k] = Object.fromEntries(order.map((t, i) => [t, i + 1]));
  }
  return { ranks: out, played, R };
}

// The computer average: 25 points for No. 1 to 1 for No. 25 in each, best
// and worst dropped, out of 100.
export function computerAverage(season, filter = null) {
  const { ranks, played, R } = computerRanks(season, filter);
  const out = {};
  for (const t of Object.keys(season.teams)) {
    const pts = COMPUTERS.map(([k]) => { const rk = ranks[k][t]; return rk && rk <= 25 ? 26 - rk : 0; }).sort((a, b) => a - b);
    out[t] = { pct: played.includes(t) ? pts.slice(1, -1).reduce((x, y) => x + y, 0) / 100 : 0, ranks: Object.fromEntries(COMPUTERS.map(([k]) => [k, ranks[k][t] ?? null])) };
  }
  return { comp: out, R };
}

// The computers alone, in the index's shape (the polls use this, so they
// never lean on themselves). Ties in points go to the computers' average
// rank.
export function computerIndex(season, filter = null) {
  const { comp, R } = computerAverage(season, filter);
  const avgRank = t => { const v = Object.values(comp[t].ranks).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 999; };
  const out = {};
  for (const t of Object.keys(season.teams)) out[t] = { rpi: comp[t].pct - avgRank(t) / 1e4, comp: comp[t].pct, sos: R[t]?.sos ?? 0, sosRank: R[t]?.sosRank, games: R[t]?.games ?? 0 };
  rankIt(out);
  return out;
}

function rankIt(out) {
  const teams = Object.keys(out).filter(t => out[t].games);
  teams.sort((a, b) => out[b].rpi - out[a].rpi || a.localeCompare(b)).forEach((t, i) => { out[t].rank = i + 1; });
}

// A poll's share for each team: its points over the most possible.
export function pollShare(poll) {
  const out = {};
  if (!poll?.ranks?.length) return out;
  const max = (poll.voters || 1) * (poll.size || poll.ranks.length);
  for (const x of poll.ranks) out[x.team] = (x.pts || 0) / max;
  for (const x of poll.others || []) out[x.team] = (x.pts || 0) / max;
  return out;
}
export const latestOf = (polls = {}) => {
  if (polls.final) return polls.final;
  const weeks = Object.keys(polls).filter(k => k !== 'final').map(Number);
  return weeks.length ? polls[Math.max(...weeks)] : null;
};

// The BCS standings: (AAU Poll % + Coaches Poll % + computer %) / 3.
export function bcs(season, filter = null) {
  const { comp, R } = computerAverage(season, filter);
  const ap = pollShare(latestOf(season.polls)), co = pollShare(latestOf(season.coachPolls));
  const out = {};
  for (const t of Object.keys(season.teams)) {
    const parts = { poll: ap[t] || 0, coaches: co[t] || 0, comp: comp[t].pct };
    out[t] = { rpi: (parts.poll + parts.coaches + parts.comp) / 3, bcs: (parts.poll + parts.coaches + parts.comp) / 3, ...parts, computers: comp[t].ranks, sos: R[t]?.sos ?? 0, sosRank: R[t]?.sosRank, games: R[t]?.games ?? 0, wp: R[t]?.wp ?? 0 };
  }
  // Teams with no points are ordered by the computers' average rank.
  const avgRank = t => { const v = Object.values(out[t].computers).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 999; };
  for (const t of Object.keys(out)) out[t].rpi -= avgRank(t) / 1e5;
  rankIt(out);
  return out;
}
