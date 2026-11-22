// Logic tests: run with `node tests/logic.test.mjs`
import assert from 'node:assert/strict';
import { newLeague, currentSeason, simGames, startNextSeason, beginOffseason, migrateLeague, weekName, rebuildSchedule } from '../js/league.js';
import { simulateGame, matchOdds, simulatedWinRate, ovr } from '../js/sim.js';
import { confTarget, dateOf, generateSchedule } from '../js/schedule.js';
import { isFinal, rating, records, indexName } from '../js/standings.js';
import { bcs, computerRanks, COMPUTERS } from '../js/bcs.js';
import { postWeeks, autoBids, aqConferences, fieldSize, ncaaConfig, shownSeed, setAtLarge, selectionBoard } from '../js/postseason.js';
import { homeAwayRuns, MAX_AWAY, MAX_HOME } from '../js/homeaway.js';
import { seedTeams, COACHES, PROGRAM_INFO } from '../js/data.js';
import { recordBook } from '../js/records.js';

const t0 = Date.now();
let n = 0;
const check = (name, fn) => {
  try { fn(); } catch (e) { console.error(`✗ ${name}`); throw e; }
  n++;
};
const reg = s => s.games.filter(g => g.type === 'regular');
const count = (games, pick = () => true) => { const c = {}; for (const g of games) for (const t of [g.home, g.away]) if (pick(g, t)) c[t] = (c[t] || 0) + 1; return c; };

check('every AAU football program, by the season it starts', () => {
  const T33 = seedTeams(2033), T30 = seedTeams(2030);
  assert.equal(Object.keys(T33).length, 80);
  // The 2032 joiners are in from 2032; McGill and Toronto only before.
  assert.ok(T33['Georgia'] && !T30['Georgia'] && T30['McGill'] && !T33['Toronto']);
  for (const no of ['Boston University', 'Emory', 'NYU', 'Caltech', 'UC Irvine', 'Saint Louis', 'UT Dallas', 'Brandeis', 'George Washington']) assert.ok(!T33[no], no);
  const sizes = {};
  for (const t of Object.values(T33)) sizes[t.conference] = (sizes[t.conference] || 0) + 1;
  assert.equal(sizes['Big Ten'], 12); assert.equal(sizes['Southwest Conference'], 14); assert.equal(sizes['Ivy League'], 8);
  assert.equal(COACHES['Ohio State'], 'Ryan Day'); assert.equal(COACHES['Michigan'], 'Kyle Whittingham'); assert.equal(COACHES['Penn State'], 'Matt Campbell');
  assert.ok(!COACHES['Florida State'] && !COACHES['Baylor'] && !COACHES['Maryland'], 'fired in 2026: open jobs');
  assert.ok(ovr(T33['Georgia']) > ovr(T33['Rice']) && ovr(T33['Rice']) > ovr(T33['Harvard']) && ovr(T33['Harvard']) > ovr(T33['MIT']));
  for (const [s, p] of Object.entries(PROGRAM_INFO)) assert.ok(p.stadium, s);
});

check('the simulator: football scores, college overtime, no ties', () => {
  const A = { off: 80, pit: 70, def: 80 }, B = { off: 75, pit: 70, def: 75 };
  let pts = 0, ot = 0;
  for (let i = 0; i < 600; i++) {
    const g = simulateGame(A, B, {}, { seed: i + 1 });
    assert.notEqual(g.home.R, g.away.R);
    assert.equal(g.home.R, g.homeLine.reduce((x, y) => x + y, 0));
    assert.ok(g.homeLine.length >= 4 && g.homeLine.length === g.awayLine.length);
    if (g.homeLine.length > 4) {
      ot++;
      // Every overtime period but the last ends level.
      for (let k = 4; k < g.homeLine.length - 1; k++) assert.equal(g.homeLine.slice(0, k + 1).reduce((x, y) => x + y, 0), g.awayLine.slice(0, k + 1).reduce((x, y) => x + y, 0));
    }
    pts += g.home.R + g.away.R;
  }
  assert.ok(pts / 600 > 38 && pts / 600 < 62, `points a game ${pts / 600}`);
  assert.ok(ot > 0 && ot < 60, `${ot} overtimes`);
  const odds = matchOdds(A, B).win, sim = simulatedWinRate(A, B, {}, {}, 800);
  assert.ok(Math.abs(odds - sim) < 0.06, `${odds} vs ${sim}`);
});

check('the schedule: 11 games, 8 in conference, half at home, Saturdays from Labor Day weekend', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L), g = reg(s);
  assert.equal(dateOf(2033, 1, 'Sat').toISOString().slice(0, 10), '2033-09-03', 'the Saturday before Labor Day');
  assert.ok(g.every(x => x.day === 'Sat'));
  const all = count(g), conf = count(g, x => x.confGame), home = count(g.filter(x => x.confGame), (x, t) => x.home === t);
  const sizes = {};
  for (const t of Object.values(s.teams)) sizes[t.conference] = (sizes[t.conference] || 0) + 1;
  for (const [t, team] of Object.entries(s.teams)) {
    const G = confTarget(sizes[team.conference]);
    assert.equal(conf[t] || 0, G, t);
    if (G === 8) assert.equal(home[t], 4, `${t}: four conference games at home`);
    else if (G) assert.ok(Math.abs(2 * (home[t] || 0) - G) <= 1, t);
    assert.ok(all[t] >= 10 && all[t] <= 11, `${t}: ${all[t]} games`);
  }
  assert.equal(confTarget(14), 8); assert.equal(confTarget(8), 7); assert.equal(confTarget(7), 6);
  // One game a week; non-conference games mostly in the first three weeks.
  const wk = {};
  for (const x of g) for (const t of [x.home, x.away]) { const k = `${t}|${x.week}`; assert.ok(!wk[k], k); wk[k] = 1; }
  const early = g.filter(x => !x.confGame && x.week <= 3).length, nonConf = g.filter(x => !x.confGame).length;
  assert.ok(early / nonConf > 0.6, `${early} of ${nonConf}`);
  assert.ok(g.filter(x => x.confGame).every(x => x.week >= 4));
});

check('bigger conferences draw opponents that missed each other last year', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  const pairs = gs => new Set(gs.filter(x => x.confGame && s.teams[x.home].conference === 'Southwest Conference').map(x => [x.home, x.away].sort().join('|')));
  const y1 = pairs(reg(s)), y2 = pairs(generateSchedule(s, 77, { games: reg(s) }));
  const list = Object.keys(s.teams).filter(t => s.teams[t].conference === 'Southwest Conference');
  let missedTwice = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const k = [list[i], list[j]].sort().join('|'); if (!y1.has(k) && !y2.has(k)) missedTwice++; }
  assert.ok(missedTwice <= 8, `${missedTwice} pairs missed both years`);
});

check('conference home and away: no more than two straight weekends away or three at home', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  let prev = null, over = 0, teams = 0;
  for (let y = 0; y < 3; y++) {
    const games = generateSchedule(s, 900 + y, prev);
    const runs = homeAwayRuns(games, s.teams);
    const bad = Object.entries(runs).filter(([, v]) => v.away > MAX_AWAY || v.home > MAX_HOME);
    over += bad.length; teams += Object.keys(runs).length;
    prev = { games };
  }
  assert.ok(over <= Math.ceil(teams * 0.02), `${over} of ${teams}`);
});

check('the BCS standings: two polls and six computers, a third each', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  assert.equal(indexName(s), 'BCS');
  simGames(s, g => g.type === 'regular' && g.week <= 8);
  const r = rating(s), top = Object.keys(r).sort((a, b) => r[a].rank - r[b].rank)[0];
  assert.ok(Object.keys(s.coachPolls).length >= 8, 'a Coaches Poll every week');
  for (const t of Object.keys(s.teams)) assert.ok(Math.abs(r[t].bcs - (r[t].poll + r[t].coaches + r[t].comp) / 3) < 1e-9);
  assert.ok(r[top].bcs > 0.7 && r[top].poll > 0.5 && r[top].comp > 0.5);
  const { ranks } = computerRanks(s);
  assert.equal(Object.keys(ranks).length, COMPUTERS.length);
  // An unbeaten team with a good schedule is near the top of every computer.
  const recs = records(s);
  const unbeaten = Object.keys(s.teams).filter(t => recs[t].l === 0 && recs[t].w >= 7 && r[t].rank <= 5);
  for (const t of unbeaten) for (const [k] of COMPUTERS) assert.ok(ranks[k][t] <= 20, `${t} ${k} ${ranks[k][t]}`);
});

check('a season: regular-season champions take the bids, 16-team field, a round a week, neutral championship', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  simGames(s, g => g.type === 'regular');
  assert.equal(s.phase, 'selection');
  const autos = autoBids(s);
  assert.equal(Object.keys(autos).length, aqConferences(s).length);
  assert.ok(!aqConferences(s).includes('UC Athletic Association'), 'a one-team conference gets no bid');
  const recs = records(s, g => g.type === 'regular');
  for (const [c, t] of Object.entries(autos)) {
    const best = Math.max(...Object.keys(s.teams).filter(x => s.teams[x].conference === c).map(x => recs[x].cw));
    assert.equal(recs[t].cw, best, `${c}: ${t}`);
  }
  // The commissioner picks the at-large teams.
  const B = selectionBoard(s), out = B.board.find(t => !B.chosen.includes(t)), drop = B.chosen[B.chosen.length - 1];
  setAtLarge(s, drop, false); setAtLarge(s, out, true);
  assert.ok(s.post.field.some(f => f.team === out) && !s.post.field.some(f => f.team === drop));
  simGames(s, () => true, { autoLock: true });
  assert.equal(s.phase, 'complete');
  assert.equal(fieldSize(ncaaConfig(s)), 16);
  const W = postWeeks(s), R = s.regWeeks;
  const post = s.games.filter(g => g.type !== 'regular');
  assert.equal(post.length, 15);
  const byWeek = count(post.map(g => ({ ...g, home: g.week, away: `x${g.id}` })), (g, t) => typeof t === 'number');
  assert.deepEqual(byWeek, { [R + 1]: 8, [R + 2]: 4, [W.mcws]: 2, [W.final]: 1 });
  for (const g of post) {
    if (g.week === W.final) { assert.ok(g.neutral && g.day === 'Mon'); continue; }
    assert.ok(!g.neutral && shownSeed(s, g.home) < shownSeed(s, g.away), `${g.label}: the higher seed hosts`);
  }
  assert.equal(weekName(R + 1, s), 'First Round'); assert.equal(weekName(W.mcws, s), 'Semifinals'); assert.equal(weekName(W.final, s), 'Championship');
  assert.ok(s.polls.final && s.coachPolls.final);
  assert.equal(s.polls.final.ranks[0].team, s.post.champion);
  // Into the next season.
  beginOffseason(L); const s2 = startNextSeason(L);
  assert.equal(s2.year, 2034);
  assert.ok(s2.coachPolls[0] && s2.carryCoachPoll);
  assert.ok(recordBook(L).games.length > 400);
});

check('saved leagues load', () => {
  const L = JSON.parse(JSON.stringify(newLeague({ year: 2031 })));
  migrateLeague(L);
  assert.equal(L.sport, 'football');
  assert.equal(L.startYear, 2031);
  const s = currentSeason(L);
  rebuildSchedule(s, null);
  assert.ok(reg(s).length > 400);
});

console.log(`${n} checks passed in ${Date.now() - t0} ms`);
