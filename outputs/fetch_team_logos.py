"""Download MLB and NFL team logos from ESPN into video/public/logos/<league>/.

The dashboard hotlinks these (mlbma_assets.js teamLogoUrl), which is fine for a
web page but not for a render: a slow or failed CDN fetch mid-render produces a
frame with a missing logo and no error, the same failure mode as the lazy-loaded
headshots that shipped an empty circle from the still engine.

Leagues are kept in separate directories because sixteen abbreviations collide
between them (SF, SEA, WSH, ATL, CLE, CIN, DET, HOU, MIA, MIN, PHI, PIT, BAL,
ARI, KC, TB) - a flat directory would overwrite one league with the other.

Run once per league (and again only if a team rebrands):

    python -m outputs.fetch_team_logos
"""

import urllib.request
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
LOGO_ROOT = PIPELINE / "video" / "public" / "logos"

# ESPN slugs per league. Mirrors src/teams.ts, which must stay in step.
SLUGS = {
    "mlb": [
        "ari", "atl", "bal", "bos", "chc", "chw", "cin", "cle", "col", "det",
        "hou", "kc", "laa", "lad", "mia", "mil", "min", "nym", "nyy", "oak",
        "phi", "pit", "sd", "sf", "sea", "stl", "tb", "tex", "tor", "wsh",
    ],
    "nfl": [
        "ari", "atl", "bal", "buf", "car", "chi", "cin", "cle", "dal", "den",
        "det", "gb", "hou", "ind", "jax", "kc", "lv", "lac", "lar", "mia",
        "min", "ne", "no", "nyg", "nyj", "phi", "pit", "sf", "sea", "tb",
        "ten", "wsh",
    ],
}

URL = "https://a.espncdn.com/i/teamlogos/{league}/500/{slug}.png"


def fetch_league(league: str, slugs: list[str]) -> list[str]:
    dest_dir = LOGO_ROOT / league
    dest_dir.mkdir(parents=True, exist_ok=True)
    written, skipped, failed = 0, 0, []

    for slug in slugs:
        dest = dest_dir / f"{slug}.png"
        if dest.exists() and dest.stat().st_size > 0:
            skipped += 1
            continue
        try:
            req = urllib.request.Request(
                URL.format(league=league, slug=slug),
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            if not data:
                raise ValueError("empty response")
            dest.write_bytes(data)
            written += 1
        except Exception as exc:  # noqa: BLE001 - report every failure, keep going
            failed.append(f"{league}/{slug}: {exc}")

    print(f"{league}: {written} downloaded, {skipped} already present, "
          f"{len(failed)} failed -> {dest_dir.relative_to(PIPELINE)}")
    return failed


def main() -> None:
    failed: list[str] = []
    for league, slugs in SLUGS.items():
        failed += fetch_league(league, slugs)
    for line in failed:
        print(f"  FAILED {line}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
