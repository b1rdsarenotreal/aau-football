# AAU Football

A commissioner-style college football dynasty. The NCAA has collapsed and
the **Association of American Universities** runs college athletics. Every
AAU football program plays in the owner's conferences: 11 games (8 in
conference, half at home), the **AAU Poll**, the **Coaches Poll** and the
**BCS standings**, regular-season conference champions with the automatic
bids, at-large teams picked by the commissioner, and a **16-team national
tournament** played FCS-style, one round a week at the higher seed's stadium,
to the **AAU Championship** game at a neutral site.

It's built on the MCS Dynasty engine (by way of AAU Lacrosse) and works the
same way, with football's rules, schedule and tournament.

Open `index.html` through any static web server (GitHub Pages works: Settings
→ Pages → Deploy from a branch → `main`, `/ (root)`). A new dynasty asks for
its first season, starting where the owner's other AAU dynasties in the same
browser are. **Settings → Download backup** keeps a copy. AAU Dynasty and AAU
History read these saves and backups (they carry `sport: 'football'`).

## The league

Eighty programs in 2032-33 and after (the 2032 joiners in, McGill and
Toronto out): FBS programs rated from ESPN's 2026 FPI efficiencies, FCS
programs (the Ivy League, Georgetown, Stony Brook, UC Davis, Northern
Arizona) and the UAA's Division III programs below them. Head coaches are
the real 2026 ones. See `js/data.js`.

## Tests

- `node tests/logic.test.mjs`
- `python3 tests/ui_test.py` (Playwright)
