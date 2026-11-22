"""Browser test: python3 tests/ui_test.py [screenshot-dir]

Starts a new dynasty (the start-year picker), visits every page, enters a
score by hand (college overtime), plays a whole season through selection
(confirm, announce) and the championship game, opens the offseason, and
checks that nothing errors and the phone layout doesn't scroll sideways.
"""
import http.server, socketserver, threading, sys, functools, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
if OUT: OUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
U = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
errors = []

def shot(pg, name):
    if OUT: pg.screenshot(path=str(OUT / f"{name}.png"), full_page=True)

def visit(pg, h, name=None):
    pg.goto(U + h); pg.wait_for_timeout(250)
    t = pg.locator("#app").inner_text()
    assert "Something went wrong" not in t, f"{h}: {t[:300]}"
    if name: shot(pg, name)
    return t

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1360, "height": 900})
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "fonts.g" not in m.text and errors.append(f"console: {m.text}"))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(U); pg.wait_for_selector("#start-year")
    t = pg.locator("#app").inner_text()
    assert "start aau football" in t.lower() and "2030" in t
    pg.select_option("#start-year", "2033"); pg.click("#start-go"); pg.wait_for_selector(".kpis")
    assert "2033" in pg.locator("#season-picker").inner_text()
    for h in ["#/home", "#/schedule", "#/standings", "#/rankings", "#/postseason", "#/teams", "#/coaches", "#/conferences", "#/history", "#/records", "#/settings", "#/team/Ohio%20State", "#/conference/Big%20Ten"]:
        visit(pg, h, "a-" + h.strip("#/").replace("/", "-").replace("%20", "_"))
    t = visit(pg, "#/teams")
    assert "OFF" in t and "ST" in t and "ATT" not in t and "MID" not in t
    assert pg.locator("#league-name").inner_text() == "Football"
    t = visit(pg, "#/team/Ohio%20State")
    assert "Ryan Day" in t and "Ohio Stadium" in t
    visit(pg, "#/rankings")
    for tab in ["coaches", "rpi", "sos", "power", "bracket"]:
        pg.click(f'[data-tab="{tab}"]'); pg.wait_for_timeout(250)
        assert "Something went wrong" not in pg.locator("#app").inner_text(), tab
    pg.click('[data-tab="rpi"]'); pg.wait_for_timeout(250)
    assert "Colley" in pg.locator("#app").inner_text()

    # Enter a score by hand: points by quarter, totals worked out, a tie
    # needs overtime, yards estimated.
    visit(pg, "#/schedule")
    pg.locator(".game[data-game]").first.click(); pg.wait_for_timeout(200)
    for side, vals in (("away", ["7", "3", "0", "7"]), ("home", ["3", "7", "7", "0"])):
        for i, v in enumerate(vals): pg.fill(f'input[data-side="{side}"][data-inn="{i}"]', v)
    pg.dispatch_event('input[data-side="home"][data-inn="3"]', "input")
    assert pg.locator("#m-home-R").inner_text() == "17" and pg.locator("#m-away-R").inner_text() == "17"
    pg.click("#m-save"); pg.wait_for_timeout(150)
    assert "no ties" in pg.locator("#toast").inner_text()
    pg.click("#m-addinn"); pg.wait_for_timeout(100)
    pg.fill('input[data-side="away"][data-inn="4"]', "7"); pg.fill('input[data-side="home"][data-inn="4"]', "3")
    shot(pg, "b-editor")
    pg.click("#m-save"); pg.wait_for_timeout(200)
    assert "saved" in pg.locator("#toast").inner_text()
    pg.locator(".game.final[data-game]").first.click(); pg.wait_for_timeout(200)
    t = pg.locator("dialog").inner_text()
    assert "YDS" in t and "Q4" in t and "overtime" in t and "FINAL/OT" in t.upper() and "Sept." in t, t
    shot(pg, "b-box"); pg.keyboard.press("Escape")
    t = visit(pg, "#/standings")
    assert "GB" in t

    # Play the season; announce the field by hand.
    for _ in range(40):
        pg.goto(U + "#/home"); pg.wait_for_timeout(150)
        if pg.locator("#h-week").count():
            pg.click("#h-week"); pg.wait_for_timeout(500); continue
        pg.goto(U + "#/postseason"); pg.wait_for_timeout(200)
        if not pg.locator("#ps-all").count(): break
        if pg.locator('[data-pt="field"]').count(): pg.click('[data-pt="field"]'); pg.wait_for_timeout(200)
        if pg.locator("#f-confirm").count():
            shot(pg, "c-selection"); pg.click("#f-confirm"); pg.wait_for_timeout(300)
        if pg.locator("#f-lock").count():
            shot(pg, "c-seeding"); pg.click("#f-lock"); pg.wait_for_timeout(300)
        else:
            pg.click("#ps-all"); pg.wait_for_timeout(1500)
    t = visit(pg, "#/postseason")
    assert "National Champion" in t
    assert pg.locator('[data-pt="conf"]').count() == 0, "no conference tournaments"
    for tab in ["bracket", "regionals", "participants", "mcws"]:
        pg.click(f'[data-pt="{tab}"]'); pg.wait_for_timeout(250)
        assert "Something went wrong" not in pg.locator("#app").inner_text()
        shot(pg, f"d-{tab}")
    for h in ["#/home", "#/standings", "#/rankings", "#/team/Ohio%20State", "#/records", "#/history", "#/coaches", "#/offseason"]:
        visit(pg, h, "e-" + h.strip("#/").replace("/", "-").replace("%20", "_"))
    t = visit(pg, "#/records")
    assert "Most points in a game" in t and "shootout" not in t.lower() and "goal" not in t.lower()

    pg.set_viewport_size({"width": 390, "height": 800})
    for h in ["#/home", "#/schedule", "#/standings"]:
        visit(pg, h)
        assert not pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"), f"{h} scrolls sideways on a phone"
    shot(pg, "f-mobile")
    b.close()

srv.shutdown()
if errors:
    print("\n".join(errors)); sys.exit(1)
print("ui test passed")
