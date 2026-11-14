"""Fit what an NFL player on the injury report is worth to the spread, and
how often a player listed his way has played.

Owner 2026-11-13: "a player rating for every player across the platform that
shows up on injury reports as an indication of how important that player is
to the spread".

Value. Closing lines are set after inactives are known, so the market's own
reaction is the yardstick. Over the regular seasons in YEARS:

    closing home spread = HFA + r_home(season) - r_away(season)
                          + sum_g beta_g * (missing_home_g - missing_away_g)
                          + beta_q * (QB quality missing, home - away)

missing_team_g is the snap share (over the team's prior three games) of its
regulars in position group g - a regular averaged >= 40% of his unit's snaps -
who logged no snap in the game. QB quality is the missing starter's EPA per
play over his last 16 games (passing + rushing EPA over attempts, sacks and
carries), shrunk with SHRINK plays at the league rate and centred on it.
A player's value is then |beta_g| x his snap share, plus for a quarterback
|beta_q| x his quality x his share.

Checked held out (odd weeks fit, even weeks predicted, and the reverse):
the absence terms cut the closing-spread error against team strength alone;
both RMSEs are written beside the coefficients. Variants that measured
receivers and backs by touch share, or the quarterback over three games,
did no better and are not used.

Play rates. nflverse's final weekly reports joined to snap counts: played =
any offensive, defensive or special-teams snap; by game status, and by game
status with the week's last practice participation.

    python scripts/fit_nfl_injury_value.py      # writes outputs/nfl_injury_value.json
"""
from __future__ import annotations

import io
import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "nfl_injury_value.json"
YEARS = list(range(2019, 2026))
SHRINK = 150.0
REGULAR = 0.40
RELEASE = "https://github.com/nflverse/nflverse-data/releases/download/{tag}/{name}"
GAMES = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
GROUP = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "T": "OL", "G": "OL", "C": "OL",
         "OT": "OL", "OG": "OL", "DE": "EDGE", "OLB": "EDGE", "DT": "DL", "NT": "DL", "LB": "LB",
         "ILB": "LB", "MLB": "LB", "CB": "CB", "DB": "CB", "S": "S", "FS": "S", "SS": "S"}
GROUPS = ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "CB", "S"]
OFFENSE = {"QB", "RB", "WR", "TE", "OL"}
PRACTICE = {"Full Participation in Practice": "Full", "Limited Participation in Practice": "Limited",
            "Did Not Participate In Practice": "DNP"}


def read(tag: str, name: str, columns=None) -> pd.DataFrame:
    with urllib.request.urlopen(RELEASE.format(tag=tag, name=name), timeout=120) as r:
        return pd.read_parquet(io.BytesIO(r.read()), columns=columns)


def qb_history(stats: pd.DataFrame) -> tuple[dict, float]:
    qbs = stats[(stats.position == "QB") & (stats.plays >= 5)]
    league = float(qbs.epa.sum() / qbs.plays.sum())
    hist = {pid: g.sort_values(["season", "week"])[["season", "week", "plays", "epa"]].values
            for pid, g in qbs.groupby("player_id")}
    return hist, league


def qb_quality(hist: dict, league: float, gsis: str | None, season: int, week: int, n: int = 16) -> float:
    h = hist.get(gsis)
    if h is None:
        return 0.0
    prior = h[(h[:, 0] < season) | ((h[:, 0] == season) & (h[:, 1] < week))][-n:]
    return (prior[:, 3].sum() + SHRINK * league) / (prior[:, 2].sum() + SHRINK) - league


def prepare_stats(stats: pd.DataFrame) -> pd.DataFrame:
    stats = stats[stats.season_type == "REG"].copy()
    stats["plays"] = stats.attempts.fillna(0) + stats.sacks_suffered.fillna(0) + stats.carries.fillna(0)
    stats["epa"] = stats.passing_epa.fillna(0) + stats.rushing_epa.fillna(0)
    return stats


def snap_frame(snaps: pd.DataFrame) -> pd.DataFrame:
    snaps = snaps[snaps.game_type == "REG"].copy()
    snaps["group"] = snaps.position.map(GROUP)
    off = snaps.group.isin(OFFENSE)
    snaps["share"] = np.where(off, snaps.offense_pct, snaps.defense_pct).astype(float)
    snaps["share"] = snaps["share"].fillna(0)
    snaps["any"] = (snaps.offense_snaps.fillna(0) + snaps.defense_snaps.fillna(0) + snaps.st_snaps.fillna(0)) > 0
    return snaps


def missing_features(snaps: pd.DataFrame, gsis_of: dict, hist: dict, league: float, season: int) -> dict:
    out = {}
    for team, tg in snaps.groupby("team"):
        weeks = sorted(tg.week.unique())
        for i, w in enumerate(weeks):
            prior = weeks[max(0, i - 3):i]
            if not prior:
                continue
            avg = tg[tg.week.isin(prior)].groupby(["pfr_player_id", "group"]).share.sum() / len(prior)
            now = set(tg[(tg.week == w) & tg["any"]].pfr_player_id)
            row = {g: 0.0 for g in GROUPS}
            row["qbq"] = 0.0
            for (pid, g), share in avg[avg >= REGULAR].items():
                if pid in now or g not in row:
                    continue
                row[g] += share
                if g == "QB":
                    row["qbq"] += share * qb_quality(hist, league, gsis_of.get(pid), season, int(w))
            out[(team, int(w))] = row
    return out


def fit_values() -> dict:
    ids = read("players", "players.parquet", ["gsis_id", "pfr_id"]).dropna()
    gsis_of = dict(zip(ids.pfr_id, ids.gsis_id))
    stats = prepare_stats(pd.concat([read("stats_player", f"stats_player_week_{y}.parquet")
                                     for y in [YEARS[0] - 1] + YEARS]))
    hist, league = qb_history(stats)
    games = pd.read_csv(GAMES)
    games = games[(games.game_type == "REG") & games.spread_line.notna() & games.season.isin(YEARS)]
    rows = []
    for y in YEARS:
        feats = missing_features(snap_frame(read("snap_counts", f"snap_counts_{y}.parquet")), gsis_of, hist, league, y)
        for g in games[games.season == y].itertuples():
            fh, fa = feats.get((g.home_team, int(g.week))), feats.get((g.away_team, int(g.week)))
            if fh is None or fa is None:
                continue
            rows.append({"week": int(g.week), "home": f"{y}{g.home_team}", "away": f"{y}{g.away_team}",
                         "spread": g.spread_line, "neutral": int(str(g.location) == "Neutral"),
                         **{k: fh[k] - fa[k] for k in fh}})
    df = pd.DataFrame(rows)
    teams = sorted(set(df.home) | set(df.away))
    tix = {t: i for i, t in enumerate(teams)}
    cols = GROUPS + ["qbq"]

    def design(d, use):
        X = np.zeros((len(d), len(teams) + 1 + len(use)))
        for n, r in enumerate(d.itertuples(index=False)):
            X[n, tix[r.home]] += 1
            X[n, tix[r.away]] -= 1
            X[n, len(teams)] = 0 if r.neutral else 1
        if use:
            X[:, len(teams) + 1:] = d[use].values
        return X

    def solve(d, use):
        X = design(d, use)
        return np.linalg.solve(X.T @ X + 1e-3 * np.eye(X.shape[1]), X.T @ d.spread.values)

    def heldout(use):
        errs = []
        for k in (0, 1):
            tr, te = df[df.week % 2 == k], df[df.week % 2 != k]
            errs.append(np.sqrt(np.mean((design(te, use) @ solve(tr, use) - te.spread.values) ** 2)))
        return float(np.mean(errs))

    beta = solve(df, cols)
    rng = np.random.default_rng(11)
    boots = np.array([solve(df.iloc[rng.integers(0, len(df), len(df))], cols)[len(teams) + 1:]
                      for _ in range(200)])
    return {
        "points_per_share": {k: round(-float(b), 3) for k, b in zip(cols, beta[len(teams) + 1:])},
        "se": {k: round(float(s), 3) for k, s in zip(cols, boots.std(axis=0))},
        "home_field": round(float(beta[len(teams)]), 3),
        "league_qb_epa_per_play": round(league, 5), "qb_window_games": 16, "qb_shrink_plays": SHRINK,
        "regular_share": REGULAR, "prior_games": 3,
        "games": len(df), "seasons": YEARS,
        "heldout_rmse": {"teams_only": round(heldout([]), 4), "with_absences": round(heldout(cols), 4)},
    }


def fit_rates() -> dict:
    ids = read("players", "players.parquet", ["gsis_id", "pfr_id"]).dropna()
    pfr_of = dict(zip(ids.gsis_id, ids.pfr_id))
    rows = []
    for y in YEARS:
        inj = read("injuries", f"injuries_{y}.parquet")
        inj = inj[inj.game_type == "REG"]
        snaps = snap_frame(read("snap_counts", f"snap_counts_{y}.parquet"))
        played = {(r.pfr_player_id, int(r.week)) for r in snaps.itertuples() if r.any}
        teams_week = {(r.team, int(r.week)) for r in snaps.itertuples()}
        for r in inj.itertuples():
            pfr = pfr_of.get(r.gsis_id)
            if not pfr or (r.team, int(r.week)) not in teams_week:
                continue
            status = r.report_status if r.report_status in ("Out", "Doubtful", "Questionable") else "None"
            rows.append({"status": status, "practice": PRACTICE.get(str(r.practice_status or "").strip(), "Unknown"),
                         "played": (pfr, int(r.week)) in played})
    df = pd.DataFrame(rows)

    def table(keys):
        g = df.groupby(keys).played.agg(["mean", "count"])
        return {("|".join(k) if isinstance(k, tuple) else k): {"played": round(float(v["mean"]), 4), "n": int(v["count"])}
                for k, v in g.iterrows()}
    return {"by_status": table("status"), "by_status_practice": table(["status", "practice"]), "listings": len(df),
            "seasons": YEARS,
            "method": "nflverse final weekly injury reports (regular season) joined to snap counts: "
                      "played = any offensive, defensive or special-teams snap."}


def main() -> None:
    result = {"value": fit_values(), "play_rates": fit_rates(),
              "groups": GROUP, "method": __doc__.split("\n\n")[1].strip()}
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    v = result["value"]
    print(f"games {v['games']}  held-out RMSE {v['heldout_rmse']}")
    print("points per full-time regular:", v["points_per_share"])


if __name__ == "__main__":
    main()
