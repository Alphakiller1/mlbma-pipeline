"""One-off backfill: populate batter_hand_faced in reliever_gamelog.csv.

The reliever gamelog was scraped while appearance_context read the batter hand
from the wrong feed path (matchup.batter.batSide instead of matchup.batSide),
so every row's batter_hand_faced was blank and all bullpen handedness splits
(vs_lhh / vs_rhh) came out empty. This refetches each game feed once and fills
the predominant hand faced per (game_pk, pitcher) so handedness splits populate
without a full re-scrape. The scraper itself is fixed for future runs.
"""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import DATA_DIR
from scrapers.scrape_reliever_gamelog import fetch_game_feed


def predominant_hands_for_game(game_pk):
    """Return {pitcher_id: 'LHH'|'RHH'|''} of predominant batter hand faced."""
    try:
        feed = fetch_game_feed(int(game_pk))
    except Exception as e:
        print(f"  feed {game_pk} failed: {e}")
        return {}
    plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
    counts = {}
    for play in plays:
        m = play.get("matchup", {})
        pid = m.get("pitcher", {}).get("id")
        if pid is None:
            continue
        bat = m.get("batSide", {}).get("code")
        c = counts.setdefault(pid, [0, 0])  # [lhb, rhb]
        if bat == "L":
            c[0] += 1
        elif bat == "R":
            c[1] += 1
    out = {}
    for pid, (lhb, rhb) in counts.items():
        out[pid] = "LHH" if lhb > rhb else "RHH" if rhb > lhb else ""
    return out


def main():
    path = os.path.join(DATA_DIR, "reliever_gamelog.csv")
    df = pd.read_csv(path)
    games = sorted(g for g in df["game_pk"].dropna().unique())
    print(f"Backfilling batter_hand_faced for {len(games)} unique games...")

    hand_by_key = {}
    for i, gpk in enumerate(games, 1):
        for pid, hand in predominant_hands_for_game(gpk).items():
            hand_by_key[(int(gpk), int(pid))] = hand
        if i % 100 == 0:
            print(f"  {i}/{len(games)} games...")

    def lookup(row):
        try:
            return hand_by_key.get((int(row["game_pk"]), int(row["pitcher_id"])), "")
        except (ValueError, TypeError):
            return ""

    df["batter_hand_faced"] = df.apply(lookup, axis=1)
    filled = (df["batter_hand_faced"].astype(str).str.len() > 0).sum()
    df.to_csv(path, index=False)
    print(f"Done. Filled {filled}/{len(df)} rows.")
    print(df["batter_hand_faced"].replace("", "(tie/none)").value_counts().to_string())


if __name__ == "__main__":
    main()
