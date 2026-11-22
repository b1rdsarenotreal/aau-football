// Football game simulator. Plays the game possession by possession from the
// teams' ratings: OFF (offense, stored as `off`), ST (special teams: kicking,
// punting and returns, `pit`) and DEF (defense, `def`). College rules:
// - four 15-minute quarters, about 12 possessions a team;
// - a touchdown is 6 with the try after (a kick for 1 nearly always, a
//   two-point try now and then), a field goal 3, a safety 2;
// - a game tied after four quarters goes to college overtime: each team gets
//   a possession from the 25 in every period; from the second overtime a
//   touchdown must go for two, and from the third each team runs one
//   two-point play. Period after period until someone leads. No ties.
//
// The result keeps the field names the rest of the app uses for every game:
// homeLine / awayLine are points per period (four quarters, then any
// overtimes), R is points, H is total yards, E is turnovers and `innings` is
// the number of periods played. A simulation is only a suggestion — the
// commissioner reviews and saves it.

import { rng as makeRng } from './util.js?v=20261122140949';

export const OVR_WEIGHTS = { off: 0.45, pit: 0.1, def: 0.45 };
const ovrExact = t => t.off * OVR_WEIGHTS.off + t.pit * OVR_WEIGHTS.pit + t.def * OVR_WEIGHTS.def;
export function ovr(t) { return Math.round(ovrExact(t)); }

export const QUARTERS = 4;
export let OT = 0; // kept so the app shell reads like the other AAU apps
export const OT_PERIODS = 6; // the most overtimes a hand entry offers
export const REG_MINUTES = 60;
export function setOvertime() {}
export function setPeriods() {}

const POSS = 12;         // possessions per team in regulation
const TALENT = 18;       // rating points per unit of drive strength (lower = fewer upsets)
const HOME = 0.16;       // home field, in drive strength (about three points)

// How well `att` moves the ball against `opp`: 0 between equal teams.
function strength(att, opp, home, vol) {
  return ((att.off - opp.def) + (att.pit - opp.pit) * 0.25) / TALENT / vol + (home ? HOME / 2 : -HOME / 2);
}
const sig = x => 1 / (1 + Math.exp(-x));
const logit = p => Math.log(p / (1 - p));

// Chances for one possession at strength x: touchdown, field-goal try,
// turnover (the rest are punts and turnovers on downs). Between equal teams
// a drive is worth about 2.3 points.
function driveOdds(x) {
  const td = sig(logit(0.25) + 0.9 * x);
  const fg = Math.max(0.04, (1 - td) * sig(logit(0.17) + 0.25 * x));
  const to = Math.max(0.03, (1 - td - fg) * sig(logit(0.16) - 0.55 * x));
  return { td, fg, to };
}
const FG_MAKE = st => Math.min(0.95, Math.max(0.55, 0.77 + (st - 70) * 0.004));

// Every game is played to a finish.
export const isKnockout = () => true;

function possession(x, me, r, stats) {
  const o = driveOdds(x), u = r();
  const yards = (lo, hi) => Math.round(lo + r() * (hi - lo));
  if (u < o.td) {
    stats.H += yards(45, 85);
    // The try: usually a kick (about 97% good), a two-point try 1 time in 12.
    if (r() < 1 / 12) return 6 + (r() < 0.47 ? 2 : 0);
    return 6 + (r() < 0.97 ? 1 : 0);
  }
  if (u < o.td + o.fg) { stats.H += yards(30, 60); return r() < FG_MAKE(me.pit) ? 3 : 0; }
  if (u < o.td + o.fg + o.to) { stats.H += yards(0, 40); stats.E++; return 0; }
  stats.H += yards(0, 35);
  return r() < 0.006 ? -2 : 0; // a safety now and then (scored for the other team)
}

// One overtime period: each team gets a possession from the 25 (`n` is the
// overtime: 1 kicks the try, 2 goes for two after a touchdown, 3+ is one
// two-point play each).
function overtime(n, xh, xa, home, away, r, stats) {
  const one = (x, me, st) => {
    if (n >= 3) { st.H += Math.round(r() * 4); return r() < sig(logit(0.45) + 0.6 * x) ? 2 : 0; }
    st.H += Math.round(10 + r() * 15);
    const td = sig(logit(0.45) + 0.8 * x);
    if (r() < td) return 6 + (n === 1 ? (r() < 0.97 ? 1 : 0) : (r() < 0.47 ? 2 : 0));
    if (r() < 0.55) return r() < FG_MAKE(me.pit) + 0.08 ? 3 : 0;
    if (r() < 0.35) st.E++;
    return 0;
  };
  return { home: one(xh, home, stats.home), away: one(xa, away, stats.away) };
}

export function simulateGame(homeTeam, awayTeam, game = {}, { seed, volatility = 1 } = {}) {
  const r = makeRng(seed);
  const neutral = !!game.neutral;
  const xh = strength(homeTeam, awayTeam, !neutral, volatility);
  const xa = strength(awayTeam, homeTeam, false, volatility) + (neutral ? HOME / 2 : 0);
  const xhome = neutral ? xh - HOME / 2 : xh;
  const stats = { home: { H: 0, E: 0 }, away: { H: 0, E: 0 } };
  const homeLine = [0, 0, 0, 0], awayLine = [0, 0, 0, 0];
  // Possessions alternate; a few more or fewer in a game.
  const n = POSS + Math.round((r() - 0.5) * 4);
  for (let i = 0; i < n; i++) {
    const q = Math.min(3, Math.floor((i / n) * 4));
    const a = possession(xa, awayTeam, r, stats.away);
    if (a < 0) homeLine[q] += 2; else awayLine[q] += a;
    const h = possession(xhome, homeTeam, r, stats.home);
    if (h < 0) awayLine[q] += 2; else homeLine[q] += h;
  }
  const total = l => l.reduce((x, y) => x + y, 0);
  for (let ot = 1; total(homeLine) === total(awayLine); ot++) {
    const g = overtime(ot, xhome, xa, homeTeam, awayTeam, r, stats);
    if (ot >= 9 && g.home === g.away) g[r() < 0.5 ? 'home' : 'away'] += 2; // a guard: never ten overtimes
    homeLine.push(g.home); awayLine.push(g.away);
  }
  return {
    homeLine, awayLine,
    home: { R: total(homeLine), H: stats.home.H, E: stats.home.E },
    away: { R: total(awayLine), H: stats.away.H, E: stats.away.E },
    innings: homeLine.length, runRule: false, pk: null,
  };
}

// Total yards and turnovers for a score entered by hand, from the points and
// both teams' ratings: about 13 yards a point plus 200, more for the
// stronger team; a turnover or two, more for a team that scored little.
export function estimateHitsErrors(homeTeam, awayTeam, game, homeLine, awayLine, { seed } = {}) {
  const r = makeRng(seed ?? 1);
  const pts = l => l.reduce((a, b) => a + (Number(b) || 0), 0);
  const one = (p, me, opp) => {
    const lean = (me.off - opp.def) * 2;
    const H = Math.max(40, Math.round(190 + p * 7.5 + lean + (r() - 0.5) * 80));
    const E = Math.max(0, Math.round(1.6 - p / 25 + (r() - 0.5) * 2.4));
    return { H, E };
  };
  return { home: one(pts(homeLine), homeTeam, awayTeam), away: one(pts(awayLine), awayTeam, homeTeam) };
}

// Points a team expects in regulation against this opponent.
function expected(x) {
  const o = driveOdds(x);
  return POSS * (o.td * 6.97 + o.fg * 3 * 0.77);
}
// Home team's chance to win: the expected margin with a spread of about 15
// points (a close fit to the simulator).
export function matchOdds(homeTeam, awayTeam, game = {}, { volatility = 1 } = {}) {
  const neutral = !!game.neutral;
  const xh = strength(homeTeam, awayTeam, !neutral, volatility) - (neutral ? HOME / 2 : 0);
  const xa = strength(awayTeam, homeTeam, false, volatility) + (neutral ? HOME / 2 : 0);
  const margin = expected(xh) - expected(xa);
  const win = 1 / (1 + Math.exp(-1.7 * margin / 15));
  return { win, tie: 0, loss: 1 - win, margin };
}

export function winProbability(homeTeam, awayTeam, game = {}, opts = {}) {
  return matchOdds(homeTeam, awayTeam, game, opts).win;
}

// Slower check of the formula above by simulating the matchup.
export function simulatedWinRate(homeTeam, awayTeam, game = {}, opts = {}, n = 2000) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const res = simulateGame(homeTeam, awayTeam, game, { ...opts, seed: i * 7919 + 1 });
    if (res.home.R > res.away.R) wins++;
  }
  return wins / n;
}
