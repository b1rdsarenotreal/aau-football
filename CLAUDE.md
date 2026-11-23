# AAU Football

A college football dynasty for every AAU school with varsity football, in
the owner's conferences (the AAU Dynasty alignment). One dynasty, no
women's/men's switch: the side machinery stays with one side, 'men', so the
code reads like the other AAU apps. A new dynasty starts in the season the
owner picks on the start screen (`pickStartYear` in `js/app.js`): by default
the latest season in his other AAU saves in this browser (`otherAppsYear` in
`js/store.js`, never creating another app's database), else 2030. It
started as a copy of AAU Lacrosse (from AAU Basketball, AAU Field Hockey,
AAU Soccer, AAU Volleyball and the owner's MCS Dynasty) and keeps that
engine, adapted to football (the owner's ask, Nov. 2026: "more FCS than
FBS").

**It is not synced with MCS Dynasty, SACAA Dynasty or any other AAU app.**
Changes here aren't ported to those repos, and theirs aren't ported here,
unless the owner asks.

## Football adaptations to keep in mind

- Game fields keep the MCS names: `homeLine`/`awayLine` are points per period
  (four quarters, then overtimes), `homeR`/`awayR` points, `homeH`/`awayH`
  total yards, `homeE`/`awayE` turnovers. `g.pk` is never set. A record's
  `rs`/`ra` are points for and against.
- **No ties:** college overtime (`js/sim.js`): a possession each from the
  25, two-point tries from the second overtime, alternating two-point plays
  from the third, period after period until one team leads.
- Ratings are stored as `off`, `pit`, `def` and shown as OFF, ST (special
  teams), DEF. OVR = 0.45/0.1/0.45 (`OVR_WEIGHTS`). The simulator plays
  about 12 possessions a team (`POSS`, `TALENT`, `HOME`).
- Every league has `league.sport = 'football'` (and `startYear`) so AAU
  Dynasty and AAU History know it.
- Teams (`js/data.js`, `PROGRAMS`): FBS ratings from ESPN's 2026 FPI
  efficiencies (rating = 46 + 0.55 × efficiency); FCS and Division III
  programs estimated on the same scale. Coaches are the real 2026 head
  coaches; Florida State, Baylor and Maryland (fired during 2026) start as
  open jobs. Schools with `joins` (2032) are in from then on, McGill and
  Toronto only through 2031-32 (`inAauIn`). AAU schools without football
  aren't in. `AAU_PROGRAMS.men` (venue and coach) comes from `PROGRAM_INFO`.
- Schedule (`js/schedule.js`): Saturdays; week 1's Saturday is the one
  before Labor Day (`seasonStart`); 13 weeks, 11 games (`maxMatches`), one a
  week. Conference play from week 4 (`CONF_FROM`): `confMatches` (8) games,
  four at home and four away (`balanceHomes`, and `spreadConfHomes` with
  `slack: 0`), or everyone once in a conference of 8 or fewer
  (`confTarget`). In a bigger conference the opponents are a regular graph
  drawn each year (`confPairs`), favoring pairs that missed each other last
  year. Non-conference games mostly weeks 1–3 (`nearCross`), a much
  stronger team hosting. Each team aims at a target level (`targetLevels`,
  the owner's rule, Nov. 2026): its own rating minus `TOUGH` (1.2) × how far
  its conference rivals' average is above the league's (at most 12 down or
  8 up), so a team in a tough conference schedules games it can win and one
  in a weak conference schedules up; an opponent above the target costs more
  than one below (`aimCost`). Top-third teams play each other out of
  conference at most `MARQUEE_MAX` (2) times a season, usually once (the
  owner's rule, Nov. 2026; rivalry games count; a second costs `MARQUEE`).
  Teams left short pair up on open weeks, then two short teams take over a
  non-conference game between two others; as the last resort (the owner's
  rule) a team still short hosts a generic FCS opponent from its region
  (`FCS_OPPONENTS`: FCS West, Southwest, Midwest, Southeast, Northeast;
  `fcsName`), one at most a season, so only with an odd team out
  (`fillerGame`, `g.filler`). It's scheduled like any game and becomes an
  automatic win (`fillerResult`) once its week is played (`playDueFillers`
  in `afterChange`: a result that week or later), never at build time. Filler opponents aren't teams: `teamInfo`
  gives them a plain badge, they're left out of the RPI, NPI and BCS, a
  filler isn't a "played" game (rebuilding the schedule still works), and
  `simResult` re-rolls one as another easy win. A one-team conference (UC Davis in the UCAA,
  Memphis in the Greater South) plays only non-conference games.
- Conference home and away (`js/homeaway.js`, the owner's rule, Nov. 2026):
  no team plays more than two conference weekends in a row away (`MAX_AWAY`)
  or three at home (`MAX_HOME`); a week without a conference game ends a
  run. `generateSchedule` draws the season (`drawSchedule`), then
  `spreadConfHomes` trades hosts and conference weeks, never letting a team
  drift off its home split (`slack: 0`). A once-a-year pair swaps hosts from
  last year unless the rule needs otherwise.
- **The BCS standings** (`js/bcs.js`, the owner's pick: "a computer and
  human element"; `settings.index` 'bcs', the default; NPI and RPI still
  work): (AAU Poll % + Coaches Poll % + computer %) / 3. Poll % is points
  over the most possible. The Coaches Poll is a second panel (`coachPanel`,
  `generatePoll(..., { coaches: true })`, `season.coachPolls`,
  `carryCoachPoll`), released with the AAU Poll. Six computers, none
  counting margin (Colley, Bradley-Terry, RPI, Elo, Keener, Billings): 25
  points for No. 1 to 1 for No. 25, best and worst dropped, out of 100.
  `computerRanks` is cached by the games. The polls' résumé uses the
  computers (`computerIndex`), never the BCS, so nothing loops. A ranked
  team on a bye drops at most `BYE_DROP` (2) spots, one on any ballot
  (`BYE_DROP_BALLOT`; `holdLosers` in `js/polls.js`, the owner's rule,
  Nov. 2026).
  `rating(season)` gives the BCS in the RPI's shape (value in `rpi`, plus
  `rank`, `sosRank`, `poll`, `coaches`, `comp`, `computers`); use it and
  `indexName(season)`. Rankings → BCS standings and Coaches Poll.
- Postseason (`js/postseason.js`, `cfg.weekly`): no conference tournaments
  (`defaultConfTourneySize` 0); each conference of `aqMin` (4) or more gives
  its regular-season champion the automatic bid; the committee proposes the
  rest in BCS order (no tiers) and the commissioner picks the at-large teams
  and the seeds on the Selection tab. Default 16 teams, four brackets of
  four (`regionals` 4, `perRegional` 4; Settings offers 8, 12, 16, 24, 32),
  one round a week from the week after the regular season, every game on campus at
  the higher national seed's stadium (`bySeed`) through the semifinals
  (`gameVenue` gives a non-neutral `mcws` game its home stadium), then
  the championship game on the Monday `finalGap` (3) weeks later at
  `mcwsVenue` (FirstBank Stadium, Nashville). Seeds 1 to `SEEDED` (16) show
  on screen and the rest of a bigger field is unseeded (`shownSeed`,
  `regionalSeed`; the owner's rule, Nov. 2026); the full order still sets
  the bracket and the hosts. The four brackets are Region 1 to 4
  (`regionName`; older saves renamed in `citySiteNames`). Week names come from
  `postWeeks(season).rounds` (First Round, Quarterfinals, Semifinals,
  Championship). Internal names stay `regionals`, `supers`, `mcws`; on
  screen it's the AAU Championship, never NCAA, Final Four or MCWS.
- Conference standings go by conference winning percentage (`confPct`,
  `confStandings`; the owner's rule, Nov. 2026), shown in a Pct column; a
  team with no conference games sits at .500. Co-champions share the best
  percentage.
- On-screen text says "game".
- The AAU look (as in the other apps): two-row top bar, scoreboard cards
  (`gameCard`), standings (`st-*`), the poll board (`pb-*`), team pages
  (`teamHero`, `ts2-*`), Postseason → Full bracket (`renderBoard`). Navy
  `--board`, gold `--optic`; Oswald, Saira Condensed, Inter.
- The Greater South, Horizon Valley, WAC, Rocky West and Colonial 10
  logos, conference logo links (`js/conf-links.js`) and realignment from
  AAU Dynasty (`js/realign.js`) work as in the other apps. The Rocky West,
  Horizon Valley and Colonial 10 schools are in the Add team pick
  (`AAU_SCHOOLS`, `crop: 4`; ESPN logos; stadiums in `CROP4` in
  `js/aau-schools.js` for the 22 with football), not in the starting league.

## Before every commit

- `python3 tools/stamp.py`
- `sh tools/check.sh`
- `node tests/logic.test.mjs`
- `python3 tests/ui_test.py` (Playwright; Chromium is preinstalled)
