"""Generate the star-history SVG (light + dark) for the Macro README.

The series comes from `star-history-data.json`, which holds the real
cumulative star count on each day a star was added, derived from the
GitHub stargazers API (`starred_at`). Refresh it with `--fetch`, then
re-run this script to rebuild both SVGs.
"""
import json
import os
import sys
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "star-history-data.json")
REPO = "macro-inc/macro"


def fetch():
    """Pull every stargazer's starred_at and rewrite the data file."""
    days = {}
    for page in range(1, 101):
        req = urllib.request.Request(
            f"https://api.github.com/repos/{REPO}/stargazers?per_page=100&page={page}",
            headers={"Accept": "application/vnd.github.star+json",
                     "User-Agent": "macro-star-history"},
        )
        token = os.environ.get("GITHUB_TOKEN")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        batch = json.load(urllib.request.urlopen(req))
        if not batch:
            break
        for entry in batch:
            day = entry["starred_at"][:10]
            days[day] = days.get(day, 0) + 1

    total, daily = 0, []
    for day in sorted(days):
        total += days[day]
        daily.append([day, total])
    old = json.load(open(DATA))
    old.update(fetched_at=date.today().isoformat(), total=total, daily=daily)
    json.dump(old, open(DATA, "w"), indent=1)
    print(f"fetched {total} stars across {len(daily)} days -> {DATA}")


if "--fetch" in sys.argv:
    fetch()

_data = json.load(open(DATA))
SERIES = [(date.fromisoformat(d), v) for d, v in _data["daily"]]
# Anchor the x-axis at repo creation so the curve reads "from launch".
SERIES.insert(0, (date.fromisoformat(_data["created_at"]), 0))

W, H = 1100, 560
L, R, T, B = 76, 52, 112, 62           # plot padding
PX0, PX1 = L, W - R
PY0, PY1 = T, H - B
LATEST = SERIES[-1][1]
YMAX = -(-LATEST // 100) * 100 + 50    # round up to a clean gridline above the peak
ORANGE = "#f26a1b"

THEMES = {
    "light": dict(bg="#ffffff", card="#ffffff", border="#d1d9e0", grid="#e6eaef",
                  fg="#1f2328", muted="#59636e", btn="#f6f8fa", btn_border="#d1d9e0",
                  btn_fg="#1f2328", dot_ring="#ffffff", fill_op=(0.22, 0.0)),
    "dark":  dict(bg="#0d1117", card="#0d1117", border="#30363d", grid="#21262d",
                  fg="#e6edf3", muted="#9198a1", btn="#21262d", btn_border="#3d444d",
                  btn_fg="#e6edf3", dot_ring="#0d1117", fill_op=(0.30, 0.0)),
}

D0, D1 = SERIES[0][0], SERIES[-1][0]
SPAN = (D1 - D0).days


def sx(d):
    return PX0 + (d - D0).days / SPAN * (PX1 - PX0)


def sy(v):
    return PY1 - v / YMAX * (PY1 - PY0)


def line_path(pts):
    """Straight segments between daily points — the data is dense enough that
    smoothing would only invent counts the repo never had."""
    return f"M {pts[0][0]:.1f} {pts[0][1]:.1f} " + " ".join(
        f"L {x:.1f} {y:.1f}" for x, y in pts[1:]
    )


def star(cx, cy, r):
    """Five-pointed star path centred on (cx, cy)."""
    import math
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.4
        pts.append(f"{cx + rad * math.cos(ang):.2f},{cy + rad * math.sin(ang):.2f}")
    return "M " + " L ".join(pts) + " Z"


NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def month_ticks():
    """First of every month covered by the series, after the start date."""
    ticks, y, m = [], D0.year, D0.month
    while True:
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        d = date(y, m, 1)
        if d > D1:
            return ticks
        ticks.append((d, NAMES[m - 1]))


MONTHS = month_ticks()

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


def build(name, c):
    pts = [(sx(d), sy(v)) for d, v in SERIES]
    line = line_path(pts)
    area = f"{line} L {pts[-1][0]:.1f} {PY1} L {pts[0][0]:.1f} {PY1} Z"
    lx, ly = pts[-1]
    o = []
    a = o.append

    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
      f'viewBox="0 0 {W} {H}" role="img" aria-label="Macro GitHub star history: {LATEST} stars">')
    a('<defs>')
    a(f'<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
      f'<stop offset="0%" stop-color="{ORANGE}" stop-opacity="{c["fill_op"][0]}"/>'
      f'<stop offset="100%" stop-color="{ORANGE}" stop-opacity="{c["fill_op"][1]}"/>'
      f'</linearGradient>')
    a('</defs>')

    a(f'<rect width="{W}" height="{H}" rx="12" fill="{c["card"]}" stroke="{c["border"]}"/>')

    # title
    a(f'<text x="{L}" y="46" font-family="{FONT}" font-size="21" font-weight="600" '
      f'fill="{c["fg"]}">Star history</text>')
    a(f'<text x="{L}" y="70" font-family="{FONT}" font-size="13" '
      f'fill="{c["muted"]}">macro-inc/macro &#183; {LATEST} stars and counting</text>')

    # star button, top right
    bw, bh = 160, 36
    bx, by = PX1 - bw, 34
    a(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="8" '
      f'fill="{c["btn"]}" stroke="{c["btn_border"]}"/>')
    a(f'<path d="{star(bx + 23, by + bh / 2, 8)}" fill="{ORANGE}"/>')
    a(f'<text x="{bx + 39}" y="{by + 23}" font-family="{FONT}" font-size="14" '
      f'font-weight="600" fill="{c["btn_fg"]}">Star this repo</text>')

    # gridlines + y labels
    for v in range(0, YMAX + 1, 100):
        y = sy(v)
        a(f'<line x1="{PX0}" y1="{y:.1f}" x2="{PX1}" y2="{y:.1f}" stroke="{c["grid"]}" '
          f'stroke-width="1"/>')
        a(f'<text x="{PX0 - 14}" y="{y + 5:.1f}" text-anchor="end" font-family="{FONT}" '
          f'font-size="13" fill="{c["muted"]}">{v}</text>')

    # x labels
    for d, label in MONTHS:
        x = sx(d)
        a(f'<text x="{x:.1f}" y="{PY1 + 30}" text-anchor="middle" font-family="{FONT}" '
          f'font-size="13" fill="{c["muted"]}">{label}</text>')
    a(f'<text x="{PX0:.1f}" y="{PY1 + 52}" font-family="{FONT}" font-size="12" '
      f'fill="{c["muted"]}">2025</text>')
    a(f'<text x="{sx(date(2026, 1, 1)):.1f}" y="{PY1 + 52}" text-anchor="middle" '
      f'font-family="{FONT}" font-size="12" fill="{c["muted"]}">2026</text>')

    # series
    a(f'<path d="{area}" fill="url(#g)"/>')
    a(f'<path d="{line}" fill="none" stroke="{ORANGE}" stroke-width="3.5" '
      f'stroke-linecap="round" stroke-linejoin="round"/>')

    # last point
    a(f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="7" fill="{ORANGE}" stroke="{c["dot_ring"]}" '
      f'stroke-width="3"/>')
    a(f'<text x="{lx - 14:.1f}" y="{ly - 18:.1f}" text-anchor="end" font-family="{FONT}" '
      f'font-size="19" font-weight="700" fill="{c["fg"]}">{LATEST}</text>')

    a('</svg>')
    path = f".github/readme/star-history-{name}.svg"
    open(path, "w").write("\n".join(o))
    return path


for name, colors in THEMES.items():
    p = build(name, colors)
    import os
    print(p, f"{os.path.getsize(p)/1024:.1f} KB")
