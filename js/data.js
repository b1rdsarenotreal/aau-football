// Starting league: every AAU member with varsity football, in the owner's
// conferences (the AAU Dynasty alignment, js/aau-schools.js), for the season
// the dynasty starts in (picked when it's created; by default the latest
// season in the owner's other AAU saves in this browser, else 2030).
// Schools that join the AAU for 2032-33 (`joins`) are in from then on;
// McGill and Toronto (U Sports football) only before they leave after
// 2031-32. One dynasty: football has no women's/men's switch (the side
// machinery stays, with one side, 'men', so the code reads like the other
// AAU apps).
//
// Not every AAU school plays football: Boston University, Brandeis, Caltech,
// Emory, George Washington, NYU, Saint Louis, UT Dallas and the UC campuses
// but Davis don't, so UC Davis is the only football team in the UC Athletic
// Association and Memphis the only one in the Greater South (they play
// non-conference games only until the commissioner moves them).
//
// Ratings: OFF (offense), ST (special teams, stored as `pit`) and DEF
// (defense), 40–99, from ESPN's 2026 FPI efficiency ratings (offense,
// defense and special teams, 0–100, espn.com/college-football/fpi,
// Nov. 22, 2026): rating = 46 + 0.55 × efficiency. FCS programs (the Ivy
// League, Georgetown, Stony Brook, UC Davis, Northern Arizona) are put on the
// same scale from their 2026 seasons (Stats Perform FCS Top 25, week 13:
// Northern Arizona No. 12 at 9-3, Harvard No. 17 at 8-2, UC Davis No. 23 at
// 8-4; Princeton and Brown received votes), and Division III and U Sports
// programs below them. These are estimates; edit any team's ratings on its
// page.
//
// Head coaches are the real ones for the 2026 season (school athletics
// sites; CBS Sports' and ESPN's coaching-carousel trackers). Florida State
// (Mike Norvell), Baylor (Dave Aranda) and Maryland (Mike Locksley) fired
// their coaches during the 2026 season and start as open jobs, as do McGill
// and Toronto; name them on the Coaches page. Home fields are each school's
// football stadium.

import { DEFAULT_LOGOS } from './logo-import.js?v=20261122132649';
import { AAU_SCHOOLS } from './aau-schools.js?v=20261122132649';
import { CONF_LOGO_LINKS } from './conf-links.js?v=20261122132649';

export const START_YEAR = 2030;
// When the AAU's founding members McGill and Toronto leave (after 2031-32).
const LEAVE_AFTER = { McGill: 2031, Toronto: 2031 };

// Conference logos the owner picked from the web (linked, not copied; the
// drawn ones in img/conf/ stay for CAC, SWC, UCAA, GSC and as fallbacks).
export { CONF_LOGO_LINKS };
const L = f => CONF_LOGO_LINKS[f] || `img/conf/${f}.svg`;
export const CONFERENCES = {
  'Big Ten': { abbr: 'B1G', color: '#0088CE', altColor: '#0B2A4A', logo: L('bigten') },
  'Coastal Atlantic Conference': { abbr: 'CAC', color: '#3A4A5C', altColor: '#5CC6C2', logo: L('cac') },
  'Ivy League': { abbr: 'IVY', color: '#026937', altColor: '#C9B37E', logo: L('ivy') },
  'Metro Conference': { abbr: 'METRO', color: '#E03A3E', altColor: '#23262D', logo: L('metro') },
  'Pacific-10 Conference': { abbr: 'P10', color: '#092346', altColor: '#D6A84B', logo: L('pac10') },
  'Southwest Conference': { abbr: 'SWC', color: '#719AE8', altColor: '#F28C38', logo: L('swc') },
  'UC Athletic Association': { abbr: 'UCAA', color: '#0F6E7A', altColor: '#F2C14E', logo: L('ucaa') },
  'University Athletic Association': { abbr: 'UAA', color: '#003087', altColor: '#F2B33D', logo: L('uaa') },
  'Western Athletic Conference': { abbr: 'WAC', color: '#0B2D6B', altColor: '#B9975B', logo: L('wac') },
  'Greater South Conference': { abbr: 'GSC', color: '#14284B', altColor: '#A3262C', logo: L('gsc') },
};

// Every AAU football program: [school, OFF, ST, DEF (ESPN efficiency scale,
// see above), head coach, stadium]. Conference, abbreviation, mascot,
// colors and city come from AAU_SCHOOLS.
const PROGRAMS = [
  // Pacific-10
  ['Arizona', 69.9, 59.0, 67.9, 'Brent Brennan', 'Arizona Stadium'],
  ['Arizona State', 55.2, 46.6, 63.1, 'Kenny Dillingham', 'Mountain America Stadium'],
  ['California', 36.8, 54.1, 41.7, 'Tosh Lupoi', 'California Memorial Stadium'],
  ['Colorado', 47.6, 37.6, 63.3, 'Deion Sanders', 'Folsom Field'],
  ['Oregon', 64.6, 63.9, 84.1, 'Dan Lanning', 'Autzen Stadium'],
  ['Stanford', 42.8, 54.3, 39.2, 'Tavita Pritchard', 'Stanford Stadium'],
  ['UCLA', 60.0, 51.7, 84.3, 'Bob Chesney', 'Rose Bowl'],
  ['USC', 80.6, 58.2, 53.8, 'Lincoln Riley', 'Los Angeles Memorial Coliseum'],
  ['Utah', 80.2, 52.3, 78.3, 'Morgan Scalley', 'Rice-Eccles Stadium'],
  ['Washington', 54.7, 52.0, 62.0, 'Jedd Fisch', 'Husky Stadium'],
  // Southwest
  ['Arkansas', 47.5, 42.5, 67.6, 'Ryan Silverfield', 'Donald W. Reynolds Razorback Stadium'],
  ['Baylor', 55.6, 67.2, 73.8, '', 'McLane Stadium'],
  ['Houston', 79.6, 60.7, 50.8, 'Willie Fritz', 'TDECU Stadium'],
  ['Iowa State', 66.2, 53.0, 52.9, 'Jimmy Rogers', 'Jack Trice Stadium'],
  ['Kansas', 52.4, 52.3, 69.6, 'Lance Leipold', 'David Booth Kansas Memorial Stadium'],
  ['Missouri', 61.5, 49.2, 74.3, 'Eli Drinkwitz', 'Faurot Field'],
  ['Rice', 39.3, 35.9, 31.4, 'Scott Abell', 'Rice Stadium'],
  ['SMU', 68.6, 41.1, 58.1, 'Rhett Lashlee', 'Gerald J. Ford Stadium'],
  ['Texas', 63.3, 53.4, 90.6, 'Steve Sarkisian', 'Darrell K Royal-Texas Memorial Stadium'],
  ['Texas A&M', 42.5, 69.4, 75.6, 'Mike Elko', 'Kyle Field'],
  ['Texas Tech', 57.8, 60.4, 75.5, 'Joey McGuire', 'Jones AT&T Stadium'],
  ['Tulane', 25.3, 55.3, 43.9, 'Will Hall', 'Yulman Stadium'],
  ['UAB', 20.1, 58.0, 55.5, 'Alex Mortensen', 'Protective Stadium'],
  ['Vanderbilt', 39.8, 51.6, 58.8, 'Clark Lea', 'FirstBank Stadium'],
  // Metro
  ['Buffalo', 30.9, 57.7, 37.5, 'Pete Lembo', 'UB Stadium'],
  ['Georgetown', 6, 44, 8, 'Rob Sgarlata', 'Cooper Field'],
  ['McGill', -6, 36, -4, '', 'Percival Molson Memorial Stadium'],
  ['Pittsburgh', 46.2, 60.7, 71.4, 'Pat Narduzzi', 'Acrisure Stadium'],
  ['Rutgers', 49.0, 54.8, 30.1, 'Greg Schiano', 'SHI Stadium'],
  ['Stony Brook', 18, 45, 17, 'Billy Cosh', 'Kenneth P. LaValle Stadium'],
  ['Syracuse', 55.3, 50.9, 54.1, 'Fran Brown', 'JMA Wireless Dome'],
  ['Toronto', -8, 34, -6, '', 'Varsity Stadium'],
  ['UConn', 59.2, 61.3, 38.1, 'Jason Candle', 'Pratt & Whitney Stadium at Rentschler Field'],
  // University Athletic Association (Division III)
  ['Carnegie Mellon', 0, 38, 0, 'Ryan Larsen', 'Gesling Stadium'],
  ['Case Western', -2, 38, 0, 'Greg Debeljak', 'DiSanto Field'],
  ['Chicago', 2, 38, 2, 'Craig Knoche', 'Stagg Field'],
  ['Johns Hopkins', 3, 40, 2, 'Dan Wodicka', 'Homewood Field'],
  ['MIT', -8, 34, -6, 'Brian Bubna', 'Henry G. Steinbrenner Stadium'],
  ['Rochester', -5, 36, -5, 'Chad Martinovich', 'Fauver Stadium'],
  ['Tufts', -3, 36, -3, 'Jay Civetti', 'Ellis Oval'],
  ['WashU', 4, 40, 4, 'Aaron Keen', 'Francis Olympic Field'],
  // Ivy League (FCS)
  ['Brown', 22, 45, 20, 'James Perry', 'Brown Stadium'],
  ['Columbia', 12, 44, 14, 'Jon Poppe', 'Robert K. Kraft Field at Lawrence A. Wien Stadium'],
  ['Cornell', 14, 44, 14, 'Dan Swanstrom', 'Schoellkopf Field'],
  ['Dartmouth', 20, 46, 20, 'Sammy McCorkle', 'Memorial Field'],
  ['Harvard', 30, 48, 30, 'Andrew Aurich', 'Harvard Stadium'],
  ['Penn', 18, 45, 16, 'Rick Santos', 'Franklin Field'],
  ['Princeton', 22, 46, 22, 'Bob Surace', 'Princeton Stadium'],
  ['Yale', 28, 47, 28, 'Kevin Cahill', 'Yale Bowl'],
  // Western Athletic
  ['BYU', 75.1, 51.8, 74.9, 'Kalani Sitake', 'LaVell Edwards Stadium'],
  ['Nevada', 25.3, 55.6, 55.7, 'Jeff Choate', 'Mackay Stadium'],
  ['Northern Arizona', 34, 50, 30, 'Brian Wright', 'Walkup Skydome'],
  ['Oregon State', 72.7, 46.1, 49.6, 'JaMarcus Shepard', 'Reser Stadium'],
  ['San Diego State', 31.7, 69.0, 43.2, 'Sean Lewis', 'Snapdragon Stadium'],
  ['UNLV', 37.8, 48.3, 50.3, 'Dan Mullen', 'Allegiant Stadium'],
  ['Utah State', 28.0, 34.9, 62.4, 'Bronco Mendenhall', 'Maverik Stadium'],
  ['Washington State', 36.7, 50.5, 55.2, 'Kirby Moore', 'Gesa Field at Martin Stadium'],
  // UC Athletic Association
  ['UC Davis', 35, 50, 30, 'Tim Plough', 'UC Davis Health Stadium'],
  // Coastal Atlantic
  ['Duke', 67.5, 59.6, 74.0, 'Manny Diaz', 'Wallace Wade Stadium'],
  ['Florida', 68.7, 64.8, 64.3, 'Jon Sumrall', 'Ben Hill Griffin Stadium'],
  ['Florida State', 73.1, 51.4, 49.3, '', 'Doak Campbell Stadium'],
  ['Georgia', 91.5, 59.8, 84.6, 'Kirby Smart', 'Sanford Stadium'],
  ['Georgia Tech', 48.9, 53.5, 44.5, 'Brent Key', 'Bobby Dodd Stadium'],
  ['Maryland', 39.6, 38.5, 61.0, '', 'SECU Stadium'],
  ['Miami', 91.0, 58.0, 68.2, 'Mario Cristobal', 'Hard Rock Stadium'],
  ['North Carolina', 66.3, 55.2, 63.5, 'Bill Belichick', 'Kenan Stadium'],
  ['Notre Dame', 85.7, 55.6, 87.3, 'Marcus Freeman', 'Notre Dame Stadium'],
  ['South Florida', 40.4, 63.4, 48.5, 'Brian Hartline', 'Raymond James Stadium'],
  ['Virginia', 43.5, 51.1, 67.4, 'Tony Elliott', 'Scott Stadium'],
  // Big Ten
  ['Illinois', 73.8, 54.1, 48.6, 'Bret Bielema', 'Gies Memorial Stadium'],
  ['Indiana', 74.2, 38.6, 85.0, 'Curt Cignetti', 'Memorial Stadium'],
  ['Iowa', 60.6, 62.4, 84.1, 'Kirk Ferentz', 'Kinnick Stadium'],
  ['Michigan', 50.8, 29.5, 72.9, 'Kyle Whittingham', 'Michigan Stadium'],
  ['Michigan State', 43.2, 69.1, 57.6, 'Pat Fitzgerald', 'Spartan Stadium'],
  ['Minnesota', 34.6, 73.7, 64.2, 'P.J. Fleck', 'Huntington Bank Stadium'],
  ['Nebraska', 65.2, 43.5, 80.7, 'Matt Rhule', 'Memorial Stadium'],
  ['Northwestern', 76.9, 47.2, 65.7, 'David Braun', 'Ryan Field'],
  ['Ohio State', 78.5, 45.5, 80.6, 'Ryan Day', 'Ohio Stadium'],
  ['Penn State', 66.4, 48.4, 70.8, 'Matt Campbell', 'Beaver Stadium'],
  ['Purdue', 65.9, 63.7, 31.2, 'Barry Odom', 'Ross-Ade Stadium'],
  ['Wisconsin', 46.8, 58.1, 75.8, 'Luke Fickell', 'Camp Randall Stadium'],
  // Greater South
  ['Memphis', 72.7, 42.4, 42.3, 'Charles Huff', 'Simmons Bank Liberty Stadium'],
];
// Mascots that differ from AAU_SCHOOLS (which keeps the women's names).
const MASCOTS = { McGill: 'Redbirds' };

const scale = x => Math.max(40, Math.min(99, Math.round(46 + 0.55 * x)));
export const PROGRAM_INFO = Object.fromEntries(PROGRAMS.map(([school, o, s, d, coach, stadium]) => [school, { off: scale(o), pit: scale(s), def: scale(d), coach, stadium }]));
export const COACHES = Object.fromEntries(PROGRAMS.filter(p => p[4]).map(p => [p[0], p[4]]));
export const MEN_COACHES = COACHES;

// Names the logo lists may know a school by.
export const LOGO_ALIASES = { 'Penn': 'Pennsylvania', 'Miami': 'Miami', 'UConn': 'Connecticut', 'WashU': 'Washington University' };

export function makeTeam({ school, conference, abbr, mascot = '', coach = '', coachId = null, color = '#555555', altColor = '#dddddd', off = 65, pit = 65, def = 65, stadium, city }) {
  const info = PROGRAM_INFO[school] || {};
  return {
    school, conference, abbr: abbr || school.replace(/[^A-Za-z ]/g, '').split(/\s+/).map(w => w[0]).join('').slice(0, 4).toUpperCase(),
    mascot, coach, coachId, color, altColor, off, pit, def, base: { off, pit, def }, logoOverride: null,
    stadium: stadium || info.stadium || '', city: city || AAU_SCHOOLS[school]?.city || '',
  };
}

// Gives a team its home field if it has none yet.
export function fillSite(t) {
  t.stadium ??= PROGRAM_INFO[t.school]?.stadium || '';
  t.city ??= AAU_SCHOOLS[t.school]?.city || '';
}

// Football is one dynasty; the side machinery is kept with one side.
export const SIDES = { men: { label: 'Football', name: 'AAU Football' } };
export const sideOf = () => 'men';

// The programs in the AAU in a given season.
export const inAauIn = (school, year) => {
  const s = AAU_SCHOOLS[school];
  if (!s) return false;
  if (s.joins && year < s.joins) return false;
  if (LEAVE_AFTER[school] != null && year > LEAVE_AFTER[school]) return false;
  return true;
};
export function seedTeams(year = START_YEAR) {
  const teams = {};
  for (const [school, info] of Object.entries(PROGRAM_INFO)) {
    if (!inAauIn(school, year)) continue;
    const s = AAU_SCHOOLS[school];
    teams[school] = makeTeam({ school, conference: s.conference, abbr: s.abbr, mascot: MASCOTS[school] || s.mascot, coach: info.coach, color: s.color, altColor: s.altColor, off: info.off, pit: info.pit, def: info.def, city: s.city });
    // The AAU Dynasty's logos win over the automatic logo lists.
    teams[school].logoOverride = DEFAULT_LOGOS[school] || null;
  }
  return teams;
}
// Conferences the league starts with: only those with football teams.
export function conferencesFor(_side, year = START_YEAR) {
  const used = new Set(Object.values(seedTeams(year)).map(t => t.conference));
  return Object.fromEntries(Object.entries(CONFERENCES).filter(([c]) => used.has(c)));
}
