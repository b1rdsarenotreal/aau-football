// Logic tests: run with `node tests/logic.test.mjs`
import assert from 'node:assert/strict';
import { newLeague, currentSeason, simGames, startNextSeason, beginOffseason, migrateLeague, weekName, rebuildSchedule } from '../js/league.js';
import { simulateGame, matchOdds, simulatedWinRate, ovr } from '../js/sim.js';
import { confTarget, dateOf, generateSchedule, isFiller, FCS_OPPONENTS, DEFAULT_RIVALRIES, MARQUEE_MAX } from '../js/schedule.js';
import { isFinal, rating, records, indexName, confStandings, confPct } from '../js/standings.js';
import { bcs, computerRanks, COMPUTERS } from '../js/bcs.js';
import { postWeeks, autoBids, aqConferences, fieldSize, ncaaConfig, shownSeed, SEEDED, setAtLarge, selectionBoard } from '../js/postseason.js';
import { homeAwayRuns, MAX_AWAY, MAX_HOME } from '../js/homeaway.js';
import { seedTeams, COACHES, PROGRAM_INFO } from '../js/data.js';
import { recordBook } from '../js/records.js';
import { BYE_DROP } from '../js/polls.js';

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

check('teams in tough conferences schedule down, weak conferences up', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L), gap = {};
  for (let y = 0; y < 4; y++) for (const x of generateSchedule(s, 300 + y, null)) {
    if (x.confGame || x.filler) continue;
    for (const [t, o] of [[x.home, x.away], [x.away, x.home]]) (gap[s.teams[t].conference] ||= []).push(ovr(s.teams[o]) - ovr(s.teams[t]));
  }
  const avg = c => gap[c].reduce((a, b) => a + b, 0) / gap[c].length;
  assert.ok(avg('Big Ten') < -4 && avg('Coastal Atlantic Conference') < -4, `${avg('Big Ten')} ${avg('Coastal Atlantic Conference')}`);
  assert.ok(avg('Western Athletic Conference') > 0, `${avg('Western Athletic Conference')}`);
});

check('rivalries every year: non-conference ones booked first, hosts swapping; conference ones kept', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  let prev = null, hosts = [];
  for (let y = 0; y < 4; y++) {
    const g = generateSchedule(s, 400 + y, prev);
    const meet = new Map(g.map(x => [[x.home, x.away].sort().join('|'), x]));
    for (const [a, b] of DEFAULT_RIVALRIES) assert.ok(meet.has([a, b].sort().join('|')), `${a}-${b} in year ${y}`);
    const cy = meet.get('Iowa|Iowa State');
    assert.ok(!cy.confGame && cy.rivalry); hosts.push(cy.home);
    prev = { games: g };
  }
  assert.deepEqual(hosts.slice(1), hosts.slice(0, 3).map(h => (h === 'Iowa' ? 'Iowa State' : 'Iowa')), 'the host swaps every year');
  s.settings.rivalries = [['Ohio State', 'Indiana']];
  const g = generateSchedule(s, 5, null);
  assert.ok(g.some(x => [x.home, x.away].sort().join('|') === 'Indiana|Ohio State'));
});

check('top-third teams play at most two others out of conference, usually one', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  const names = Object.keys(s.teams).sort((a, b) => ovr(s.teams[b]) - ovr(s.teams[a]));
  const top = new Set(names.slice(0, Math.ceil(names.length / 3)));
  const dist = [0, 0, 0];
  let prev = null;
  for (let y = 0; y < 4; y++) {
    const games = generateSchedule(s, 1100 + y, prev), n = {};
    for (const x of games) if (x.type === 'regular' && !x.confGame && !x.filler && top.has(x.home) && top.has(x.away)) for (const t of [x.home, x.away]) n[t] = (n[t] || 0) + 1;
    for (const t of top) { assert.ok((n[t] || 0) <= MARQUEE_MAX, `${t} ${n[t]}`); dist[n[t] || 0]++; }
    prev = { games };
  }
  assert.ok(dist[1] > dist[0] + dist[2], dist.join('/'));
});

check('FCS games: only when a team is left short, one at most, won when its week is played', () => {
  // 80 teams fill every non-conference date with each other.
  const L0 = newLeague({ year: 2033 }), s0 = currentSeason(L0);
  let prev = null;
  for (let y = 0; y < 5; y++) { const g = generateSchedule(s0, 1300 + y, prev); assert.equal(g.filter(x => x.filler).length, 0, `year ${y}`); prev = { games: g }; }
  // An odd team out (79 teams): one team gets one FCS game.
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  delete s.teams.Rice; rebuildSchedule(s, null);
  const f = reg(s).filter(x => x.filler);
  assert.equal(f.length, 1);
  const [x] = f;
  assert.ok(isFiller(x.away) && FCS_OPPONENTS.includes(x.away) && s.teams[x.home] && !isFinal(x), 'scheduled, not decided yet');
  assert.ok(!reg(s).some(y => y !== x && y.week === x.week && (y.home === x.home || y.away === x.home)), 'on an open date');
  const all = count(reg(s));
  for (const t of Object.keys(s.teams)) assert.equal(all[t], 11, t);
  // Playing an earlier week leaves it open; playing its week wins it.
  simGames(s, g => g.type === 'regular' && g.week < x.week && !g.filler);
  assert.ok(!isFinal(x));
  const one = reg(s).find(g => g.week === x.week && !g.filler);
  simGames(s, g => g === one);
  assert.ok(isFinal(x) && x.homeR > x.awayR);
  simGames(s, () => true, { autoLock: true });
  assert.equal(s.phase, 'complete');
  // An older save's FCS game, already won in a week not played yet, waits again.
  const L2 = newLeague({ year: 2033 }), s2 = currentSeason(L2);
  delete s2.teams.Rice; rebuildSchedule(s2, null);
  const y = reg(s2).find(g => g.filler);
  Object.assign(y, { final: true, homeLine: [14, 7, 7, 7], awayLine: [0, 3, 0, 0], homeR: 35, awayR: 3, homeH: 400, awayH: 150, homeE: 0, awayE: 1, source: 'auto' });
  migrateLeague(L2);
  assert.ok(!isFinal(y));
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

check('a ranked team on a bye drops two spots at most, in both polls', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  simGames(s, g => g.type === 'regular');
  let byes = 0;
  for (const key of ['polls', 'coachPolls']) {
    const weeks = Object.keys(s[key]).filter(x => x !== 'final').map(Number).sort((a, b) => a - b);
    for (let i = 1; i < weeks.length; i++) {
      const w = weeks[i], pr = {}, cr = {};
      s[key][weeks[i - 1]].ranks.forEach((x, j) => { pr[x.team] = j + 1; });
      s[key][w].ranks.forEach((x, j) => { cr[x.team] = j + 1; });
      for (const t of Object.keys(pr)) {
        if (s.games.some(g => g.week === w && (g.home === t || g.away === t))) continue;
        byes++;
        assert.ok((cr[t] || s[key][w].ranks.length + 1) - pr[t] <= BYE_DROP, `${t} week ${w}: ${pr[t]} -> ${cr[t]}`);
      }
    }
  }
  assert.ok(byes > 20, `${byes} byes`);
});

check('conference standings go by conference winning percentage', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  simGames(s, g => g.type === 'regular' && g.week <= 7);
  const recs = records(s, g => g.type === 'regular');
  let uneven = 0;
  for (const c of new Set(Object.values(s.teams).map(t => t.conference))) {
    const st = confStandings(s, c, recs);
    for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].pct >= st[i].pct, `${c}: ${st[i - 1].team} ${st[i - 1].pct} above ${st[i].team} ${st[i].pct}`);
    if (new Set(st.map(x => x.cw + x.cl)).size > 1) uneven++;
  }
  assert.ok(uneven > 0, 'some teams have played fewer conference games mid-season');
  assert.equal(confPct({ cw: 3, cl: 1, ct: 0 }), 0.75);
  assert.equal(confPct({ cw: 0, cl: 0, ct: 0 }), 0.5);
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

check('a 24-team field: seeds 1 to 16 show, the rest unseeded; the full order still hosts', () => {
  const L = newLeague({ year: 2033 }), s = currentSeason(L);
  s.settings.ncaa = { ...(s.settings.ncaa || {}), regionals: 4, perRegional: 6 };
  simGames(s, g => g.type === 'regular');
  simGames(s, () => true, { autoLock: true });
  assert.equal(s.post.field.length, 24);
  for (const f of s.post.field) assert.equal(shownSeed(s, f.team), f.seed <= SEEDED ? f.seed : null, f.team);
  const seedOf = t => s.post.field.find(f => f.team === t).seed, W = postWeeks(s);
  for (const g of s.games.filter(g => g.type !== 'regular' && g.week !== W.final)) assert.ok(seedOf(g.home) < seedOf(g.away), g.label);
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
