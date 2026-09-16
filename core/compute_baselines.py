"""
Compute live league baselines for the dashboard color grading.

The dashboard grades every value on a red->green scale anchored to a league baseline
(mean/std in mlbma_assets.js CONTEXT_DEFAULTS, overwritten at runtime by this file's JSON).
A value's color is its z-score vs that baseline, read as a league percentile, so:

  * the MEAN must be the league average of that stat - the league's own rate where
    counting columns exist (hits over at-bats, innings-weighted for pitchers), not a
    mean of lines in which a two-inning cameo counts as much as a full season;
  * the STD must be the spread of the population actually being colored - a batter
    against batters, a club against clubs, a starter's split against every
    qualified starter's line in that same split.

Reference populations:
  * OFFENSE (team metrics): the 30 MLB teams. We measure each handedness split's 30-team
    spread and AVERAGE them. We do NOT pool vs-RHP + vs-LHP into one 60-row stack -- that
    injects the platoon mean-gap into the std and inflates it (e.g. HR std 17.7 pooled vs
    ~5 real, xwOBA 0.034 vs 0.022), washing every team toward amber.
  * PITCHING (rate stats): the population of qualified pitchers, because these contexts
    grade INDIVIDUAL arms (opposing SP, relievers) on the dashboard -- "30 team averages"
    is the wrong yardstick for one pitcher. PitchScore is the exception: it's a team metric,
    so it's anchored team-level.
  * GENERATED split families, one context per population x split x stat, each carrying
    its own direction (`hi`) because the registry does not list them by hand:
      sp_<vs_lhh|vs_rhh|home|away>_<whip|xfip|kpct|bbpct|ops|ops_plus>
          from data/public/starter_splits.json - the exact lines the matchup page shows
      bat_<vl|vr|season>_<avg|obp|slg|ops>   from data/league_batter_splits.csv
      tm_<h|a|vl|vr|sp|rp>_<avg|obp|slg|ops> from data/league_team_splits.csv

A run that cannot recompute a context (FanGraphs skipped in CI, a scraper down) carries
the previous value forward with the time it WAS computed in `as_of`, so a partial run
never deletes a context and never passes an old number off as today's.

    python -m core.compute_baselines
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import pandas as pd

from core.config import DATA_DIR

OUT = os.path.join(os.path.dirname(DATA_DIR), "dashboard", "league_baselines.json")
STARTER_SPLITS = os.path.join(DATA_DIR, "public", "starter_splits.json")

# context -> column. Offense comes from the team-level metrics_vs_{RHP,LHP}.csv outputs.
OFFENSE = {"osi": "OSI", "abq": "ABQ", "rcv": "RCV", "obr": "OBR", "projosi": "projOSI",
           "woba": "wOBA", "xwoba": "xwOBA", "slg": "SLG", "avg": "AVG", "obp": "OBP",
           "ops": "OPS", "iso": "ISO", "wrc": "wRC+", "hr": "HR",
           "barrel": "Barrel%", "hardhit": "HardHit%"}
# Pitching rate stats graded per-pitcher -> qualified-pitcher pool from sp_standard.
PITCH_SP = {"fip": "FIP", "xfip": "xFIP", "whip": "WHIP", "hr9": "HR/9", "bb9": "BB/9",
            "k9": "K/9", "era": "ERA", "kpct": "K%", "bbpct": "BB%"}
PITCH_SP_ALLOWED = {
    "sp_osi_allowed": "OSI_allowed",
    "sp_abq_allowed": "ABQ_allowed",
    "sp_oor_faced": "OOR_faced",
}

# Aggregate cells must grade against their OWN population, not individual starters --
# a team/bullpen aggregate clusters ~2.5-3x tighter than individual arms, so reusing the
# per-pitcher spread washes every aggregate toward amber. Three extra populations:
#   team_*  : 30 team pitching staffs (sp_standard, IP-weighted per team)
#   bp_*    : 30 team BULLPEN units (bullpen_unit.csv overall_*)
#   rp_*    : individual relievers (bullpen_individual.csv overall_*, qualified by apps)
# raw-rate contexts (ERA/FIP/WHIP/HR9). K%/BB% live as percentage points (matching the
# pctNorm'd values the bullpen views pass), so bp_/rp_ K%/BB% fix a scale bug too.
TEAM_STAFF = {"team_era": "ERA", "team_fip": "FIP", "team_whip": "WHIP", "team_hr9": "HR/9"}
BP_UNIT = {"bp_era": "overall_ERA", "bp_fip": "overall_FIP", "bp_whip": "overall_WHIP",
           "bp_hr9": "overall_HR9", "bp_kpct": "overall_K_pct", "bp_bbpct": "overall_BB_pct",
           # OSI allowed by a bullpen unit. It was graded on the 30-LINEUP OSI spread
           # (sd ~13.6) while bullpen units spread ~2.5, so every unit read average.
           "bp_osi_allowed": "overall_OSI_allowed"}
RP_IND = {"rp_era": "overall_ERA", "rp_fip": "overall_FIP", "rp_whip": "overall_WHIP",
          "rp_hr9": "overall_HR9", "rp_kpct": "overall_K_pct", "rp_bbpct": "overall_BB_pct",
          "rp_osi_allowed": "overall_OSI_allowed", "rp_abq_allowed": "overall_ABQ_allowed"}

# Starter split lines, as the public matchup page prints them.
# published key -> (context stat, higher is better)
SP_SPLIT_KEYS = ("vs_lhh", "vs_rhh", "home", "away")
SP_SPLIT_STATS = {"whip": ("whip", False), "xfip": ("xfip", False), "k_pct": ("kpct", True),
                  "bb_pct": ("bbpct", False), "ops": ("ops", False), "ops_plus": ("ops_plus", True)}
SP_SEASON_MIN_STARTS = 5
# starter_splits.json counts APPEARANCES when an arm has no starts, so a reliever
# arrives carrying seventy "starts" and a 0% quality-start rate. The page grades a
# probable starter against starters, so a line only joins the pool if its average
# outing is a start-shaped one.
SP_MIN_IP_PER_OUTING = 4.0

HIT_RATES = ("avg", "obp", "slg", "ops")
BATTER_SPLITS = ("vl", "vr", "season")
TEAM_SPLITS = ("h", "a", "vl", "vr", "sp", "rp")
MIN_POOL = 20


def _num(series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce"
    ).dropna()


def _ms(series) -> dict | None:
    """mean/std of a single distribution (population std)."""
    s = _num(series)
    if len(s) < 3:
        return None
    std = float(s.std(ddof=0))
    if std < 1e-9:
        return None
    return {"mean": round(float(s.mean()), 4), "std": round(std, 4), "n": int(len(s))}


def _anchor(mean, values, hi: bool | None = None, min_n: int = MIN_POOL) -> dict | None:
    """A baseline: the league average as the centre, the graded population's spread."""
    s = pd.to_numeric(pd.Series(list(values), dtype="object"), errors="coerce").dropna()
    if mean is None or pd.isna(mean) or len(s) < min_n:
        return None
    std = float(s.std(ddof=0))
    if not std > 1e-9:
        return None
    out = {"mean": round(float(mean), 4), "std": round(std, 4), "n": int(len(s))}
    if hi is not None:
        out["hi"] = bool(hi)
    return out


def _weighted_mean(values, weights) -> float | None:
    total = 0.0
    acc = 0.0
    for value, weight in zip(values, weights):
        v = pd.to_numeric(value, errors="coerce")
        w = pd.to_numeric(weight, errors="coerce")
        if pd.isna(v) or pd.isna(w) or w <= 0:
            continue
        total += float(w)
        acc += float(v) * float(w)
    return acc / total if total > 0 else None


def _count(value) -> int:
    """A count that may arrive as None, '' or NaN - all of which mean zero here."""
    parsed = pd.to_numeric(value, errors="coerce")
    return 0 if pd.isna(parsed) else int(parsed)


def _adaptive_floor(sample, floor: float) -> float:
    """Qualification that scales with the season: a quarter of the 90th-percentile
    sample, never below `floor`. A fixed 100 PA empties a vs-LHP pool in April and
    admits cameos in September, and the spread moves with whichever it is."""
    s = pd.to_numeric(pd.Series(list(sample), dtype="object"), errors="coerce").dropna()
    s = s[s > 0]
    if s.empty:
        return float(floor)
    return max(float(floor), 0.25 * float(s.quantile(0.9)))


def _ms_within_split(rhp: pd.DataFrame, lhp: pd.DataFrame, col: str) -> dict | None:
    """Average the two single-split 30-team distributions instead of pooling them.

    Each split cell on the dashboard should be graded against the 30-team spread WITHIN
    that split; averaging the two split anchors gives one stable mean/std that matches
    that spread without the platoon mean-gap that pooling would bake into the std.
    """
    parts = []
    for df in (rhp, lhp):
        if df is not None and col in df.columns:
            m = _ms(df[col])
            if m:
                parts.append(m)
    if not parts:
        return None
    mean = sum(p["mean"] for p in parts) / len(parts)
    std = sum(p["std"] for p in parts) / len(parts)
    if std < 1e-9:
        return None
    return {"mean": round(mean, 4), "std": round(std, 4), "n": min(p["n"] for p in parts)}


def _team_staff_ms(sp: pd.DataFrame, col: str) -> dict | None:
    """30-team distribution of an IP-weighted staff rate (mirrors calc_pitching_score)."""
    if col not in sp.columns or "IP" not in sp.columns or "Tm" not in sp.columns:
        return None
    d = sp.copy()
    d["_v"] = _num(d[col]).reindex(d.index)
    d["_ip"] = pd.to_numeric(d["IP"], errors="coerce")
    d = d.dropna(subset=["_v", "_ip"])
    d = d[d["_ip"] > 0]
    if d.empty:
        return None
    team = d.groupby("Tm").apply(
        lambda x: (x["_v"] * x["_ip"]).sum() / x["_ip"].sum(), include_groups=False
    )
    return _ms(team)


def _pct_points(series) -> pd.Series:
    """Force K%/BB% to percentage points (×100 if stored as a fraction).

    Dashboard chips grade these on the percent-point scale (league BB% ≈ 8–9,
    K% ≈ 22). A fraction-scale baseline (mean ≈ 0.09) against percent values
    paints every walk rate deep red — never emit that scale.
    """
    s = _num(series)
    if not len(s):
        return s
    med = float(s.dropna().median())
    if med <= 1.5:
        s = s * 100
    return s


def _read(name: str) -> pd.DataFrame | None:
    p = os.path.join(DATA_DIR, name)
    return pd.read_csv(p) if os.path.exists(p) else None


def _read_json(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def league_hitting_rates(frame: pd.DataFrame) -> dict:
    """The league's own line from counting columns - hits over at-bats across the
    league - not a mean of individual averages."""
    def total(col: str) -> float:
        return float(pd.to_numeric(frame[col], errors="coerce").fillna(0).sum())

    ab, h, bb, hbp, sf, tb = (total(c) for c in ("ab", "h", "bb", "hbp", "sf", "tb"))
    if ab <= 0:
        return {}
    obp = (h + bb + hbp) / (ab + bb + hbp + sf)
    slg = tb / ab
    return {"avg": h / ab, "obp": obp, "slg": slg, "ops": obp + slg}


def batter_split_baselines(frame: pd.DataFrame | None) -> dict:
    """bat_<split>_<stat>: league rate as centre, qualified batters' spread."""
    out: dict = {}
    if frame is None or frame.empty:
        return out
    for split in BATTER_SPLITS:
        rows = frame[frame["split"].astype(str) == split]
        if rows.empty:
            continue
        league = league_hitting_rates(rows)
        pa = pd.to_numeric(rows["pa"], errors="coerce").fillna(0)
        qualified = rows[pa >= _adaptive_floor(pa, 30)]
        for stat in HIT_RATES:
            anchor = _anchor(league.get(stat), qualified[stat], hi=True)
            if anchor:
                out[f"bat_{split}_{stat}"] = anchor
    return out


def team_split_baselines(frame: pd.DataFrame | None) -> dict:
    """tm_<split>_<stat>: the thirty clubs on that same split."""
    out: dict = {}
    if frame is None or frame.empty:
        return out
    for split in TEAM_SPLITS:
        rows = frame[frame["split"].astype(str) == split]
        if rows.empty:
            continue
        league = league_hitting_rates(rows)
        for stat in HIT_RATES:
            anchor = _anchor(league.get(stat), rows[stat], hi=True)
            if anchor:
                out[f"tm_{split}_{stat}"] = anchor
    return out


def _starts_games(starter: dict) -> bool:
    """Does this arm start? Read off the length of its average outing."""
    splits = starter.get("splits") or {}
    outings = [pd.to_numeric((splits.get(k) or {}).get("ip_per_start"), errors="coerce")
               for k in ("home", "away")]
    outings = [float(v) for v in outings if pd.notna(v)]
    return bool(outings) and max(outings) >= SP_MIN_IP_PER_OUTING


def starter_split_baselines(payload: dict | None) -> dict:
    """sp_<split>_<stat> plus the season-level sp_qs_pct / sp_pitch_score.

    Read from the published starter_splits.json, so the pool is exactly the lines
    the page grades. Innings per line = starts x innings per start.
    """
    out: dict = {}
    starters = (payload or {}).get("starters") or {}
    if not starters:
        return out

    for key in SP_SPLIT_KEYS:
        lines = []
        for starter in starters.values():
            split = (starter.get("splits") or {}).get(key)
            if not split or not _starts_games(starter):
                continue
            starts = pd.to_numeric(split.get("starts"), errors="coerce")
            per = pd.to_numeric(split.get("ip_per_start"), errors="coerce")
            innings = float(starts * per) if pd.notna(starts) and pd.notna(per) else 0.0
            lines.append((innings, split))
        if not lines:
            continue
        floor = _adaptive_floor([ip for ip, _ in lines], 10)
        qualified = [split for ip, split in lines if ip >= floor]
        for stat, (name, hi) in SP_SPLIT_STATS.items():
            # OPS+ is 100 x league OPS allowed / the line's OPS allowed, so 100 IS the
            # league average by construction; every other stat takes the innings-
            # weighted league rate across all lines.
            mean = 100.0 if stat == "ops_plus" else _weighted_mean(
                [split.get(stat) for _, split in lines], [ip for ip, _ in lines])
            anchor = _anchor(mean, [split.get(stat) for split in qualified], hi=hi)
            if anchor:
                out[f"sp_{key}_{name}"] = anchor

    # Season OPS allowed, for the "OPS Allowed" cells that compare a whole season
    # against a lineup. Home and road partition the season exactly once, so the
    # arm's season line is those two weighted by innings.
    season_ops, season_weights = [], []
    for starter in starters.values():
        splits = starter.get("splits") or {}
        if not _starts_games(starter):
            continue
        halves = []
        for key in ("home", "away"):
            split = splits.get(key) or {}
            starts = pd.to_numeric(split.get("starts"), errors="coerce")
            per = pd.to_numeric(split.get("ip_per_start"), errors="coerce")
            ops = pd.to_numeric(split.get("ops"), errors="coerce")
            if pd.notna(starts) and pd.notna(per) and pd.notna(ops):
                halves.append((float(starts * per), float(ops)))
        innings = sum(ip for ip, _ in halves)
        if innings > 0:
            season_ops.append(sum(ip * ops for ip, ops in halves) / innings)
            season_weights.append(innings)
    anchor = _anchor(_weighted_mean(season_ops, season_weights), season_ops, hi=False)
    if anchor:
        out["sp_ops_allowed"] = anchor

    # QS% and Pitch Score describe the whole season and are repeated on every split
    # row, so each arm is read once.
    season = []
    for starter in starters.values():
        splits = starter.get("splits") or {}
        row = next((splits[k] for k in SP_SPLIT_KEYS if splits.get(k)), None)
        if not row or not _starts_games(starter):
            continue
        games = sum(_count((splits.get(k) or {}).get("starts")) for k in ("home", "away"))
        season.append((games, row.get("qs_pct"), row.get("pitch_score")))
    qualified = [r for r in season if r[0] >= SP_SEASON_MIN_STARTS]
    # League QS% is quality starts over starts across the league: starts-weighted.
    qs = _anchor(_weighted_mean([r[1] for r in season], [r[0] for r in season]),
                 [r[1] for r in qualified], hi=True)
    if qs:
        out["sp_qs_pct"] = qs
    scores = pd.to_numeric(pd.Series([r[2] for r in qualified], dtype="object"), errors="coerce")
    ps = _anchor(scores.mean() if scores.notna().any() else None, scores, hi=True)
    if ps:
        out["sp_pitch_score"] = ps
    return out


def merge_with_previous(fresh: dict, previous: dict, now: str, previous_at: str | None) -> dict:
    """Recomputed contexts stamped now; the rest carried forward with their own as_of."""
    merged: dict = {}
    for key, value in (previous or {}).items():
        if key in fresh or not isinstance(value, dict):
            continue
        carried = dict(value)
        carried.setdefault("as_of", previous_at)
        merged[key] = carried
    for key, value in fresh.items():
        merged[key] = {**value, "as_of": now}
    return merged


def run():
    print("Computing league baselines for dashboard grading...")
    baselines: dict = {}

    rhp = _read("metrics_vs_RHP.csv")
    lhp = _read("metrics_vs_LHP.csv")
    if rhp is not None or lhp is not None:
        for ctx, col in OFFENSE.items():
            m = _ms_within_split(rhp, lhp, col)
            if m:
                baselines[ctx] = m

    # PitchScore is a TEAM metric -> team-level anchor.
    ps = _read("metrics_pitching_score.csv")
    if ps is not None and "PitchScore" in ps.columns:
        m = _ms(ps["PitchScore"])
        if m:
            baselines["pitching"] = m

    # Pitching rate stats grade individual arms: spread from the qualified-pitcher pool,
    # centre at the innings-weighted league rate across every starter line.
    sp_raw = _read("sp_standard.csv")
    if sp_raw is not None and "Tm" in sp_raw.columns:
        sp = sp_raw[~sp_raw["Tm"].astype(str).str.contains("Tms", na=False)].copy()
        innings = pd.to_numeric(sp["IP"], errors="coerce") if "IP" in sp.columns else None
        spq = sp[innings >= 20] if innings is not None else sp
        for ctx, col in PITCH_SP.items():
            if col not in sp.columns:
                continue
            # Ranking/profile views display K% and BB% in percentage points.
            # Grade against the same scale even when FanGraphs stores rates as
            # fractions (0.229 / 0.091) in sp_standard.csv.
            convert = _pct_points if ctx in ("kpct", "bbpct") else _num
            everyone = convert(sp[col])
            qualified = convert(spq[col])
            mean = (_weighted_mean(everyone.values, innings.reindex(everyone.index).values)
                    if innings is not None else float(qualified.mean()))
            m = _anchor(mean, qualified, min_n=3)
            if m:
                baselines[ctx] = m
        # team_* : whole-staff IP-weighted aggregate across the 30 teams (not the per-arm pool)
        for ctx, col in TEAM_STAFF.items():
            m = _team_staff_ms(sp, col)
            if m:
                baselines[ctx] = m

    # Starter allowed metrics grade against other qualified starters, not the
    # 30-team offensive distributions. Approximate 20+ IP from starts * avg IP.
    spp = _read("sp_profiles.csv")
    if spp is not None:
        if "starts" in spp.columns and "avg_IP" in spp.columns:
            estimated_ip = pd.to_numeric(spp["starts"], errors="coerce") * pd.to_numeric(
                spp["avg_IP"], errors="coerce"
            )
            spp = spp[estimated_ip >= 20]
        for ctx, col in PITCH_SP_ALLOWED.items():
            if col in spp.columns:
                m = _ms(spp[col])
                if m:
                    baselines[ctx] = m

    # bp_* : 30 team bullpen units (their own, much tighter distribution).
    bpu = _read("bullpen_unit.csv")
    if bpu is not None:
        for ctx, col in BP_UNIT.items():
            if col in bpu.columns:
                series = _pct_points(bpu[col]) if ctx.endswith(("kpct", "bbpct")) else _num(bpu[col])
                m = _ms(series)
                if m:
                    baselines[ctx] = m
        if "overall_OSI_allowed" in bpu.columns:
            m = _ms(100 - _num(bpu["overall_OSI_allowed"]))
            if m:
                baselines["bp_score"] = m

    # rp_* : individual relievers (wide like starters but different mean/scale).
    bpi = _read("bullpen_individual.csv")
    if bpi is not None:
        if "appearances" in bpi.columns:
            bpi = bpi[pd.to_numeric(bpi["appearances"], errors="coerce") >= 10]   # qualified arms
        for ctx, col in RP_IND.items():
            if col in bpi.columns:
                series = _pct_points(bpi[col]) if ctx.endswith(("kpct", "bbpct")) else _num(bpi[col])
                m = _ms(series)
                if m:
                    baselines[ctx] = m

    baselines.update(starter_split_baselines(_read_json(STARTER_SPLITS)))
    baselines.update(batter_split_baselines(_read("league_batter_splits.csv")))
    baselines.update(team_split_baselines(_read("league_team_splits.csv")))

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    previous = _read_json(OUT) or {}
    merged = merge_with_previous(baselines, previous.get("baselines") or {}, now,
                                 previous.get("generated_at"))
    carried = sorted(set(merged) - set(baselines))

    out = {"generated_at": now, "baselines": merged}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"  Wrote {len(baselines)} recomputed baselines -> {OUT}")
    if carried:
        print(f"  WARNING: carried forward {len(carried)} not recomputed this run: {', '.join(carried)}")
    for k, v in baselines.items():
        print(f"    {k:22} mean={v['mean']:<8} std={v['std']:<8} n={v.get('n')}")


if __name__ == "__main__":
    run()
