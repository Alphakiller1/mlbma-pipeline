"""
Cross-metric betting signals and convergence scoring for daily matchups.

Each signal returns:
  signal_name, fired, direction, magnitude, bet_angle, verdict_text
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import pandas as pd

from core.config import (
    CONVERGENCE_DEFAULT_WEIGHT,
    CONVERGENCE_PLAY_MIN_WEIGHT,
    CONVERGENCE_PP_GAP_WEIGHT,
    DATA_DIR,
    SIGNAL_1_LINEUP_OBR_MIN,
    SIGNAL_1_PITCHER_K_PCT_MAX,
    SIGNAL_2_LINEUP_ABQ_CHESS_MIN,
    SIGNAL_2_LINEUP_ABQ_WALK_GAME_MIN,
    SIGNAL_2_PITCHER_BB_PCT_HIGH,
    SIGNAL_2_PITCHER_BB_PCT_LOW,
    SIGNAL_3_LINEUP_RCV_MIN,
    SIGNAL_3_PITCHER_HR9_MIN,
    SIGNAL_4_OSI_PITCH_GAP_MIN,
    SIGNAL_5_OSI_PALS_GAP_MAX,
    SIGNAL_5_PP_GAP_MIN,
    SIGNAL_6_BB_PITCHER_HIGH_MIN,
    SIGNAL_6_BB_PITCHER_LOW_MAX,
    SIGNAL_6_OBR_HIGH_MIN,
    SIGNAL_6_OBR_LOW_MAX,
    SIGNAL_7_ABQ_PLATOON_GAP_MIN,
    SIGNAL_8_OBR_HIGH,
    SIGNAL_8_OBR_LOW,
    SIGNAL_8_RCV_HIGH,
    SIGNAL_8_RCV_LOW,
    SIGNAL_9_OOR_DELTA_MIN,
)
from core.metrics_utils import load


def _signal_result(
    name: str,
    fired: bool,
    direction: str,
    magnitude: float,
    bet_angle: str,
    verdict: str,
) -> dict[str, Any]:
    return {
        "signal_name": name,
        "fired": fired,
        "direction": direction,
        "magnitude": round(float(magnitude), 2) if magnitude is not None else 0.0,
        "bet_angle": bet_angle,
        "verdict_text": verdict,
    }


def pct_value(raw) -> float | None:
    """Normalize K%/BB% to percentage points (e.g. 22.5 or 0.225 → 22.5)."""
    if raw is None or raw == "" or raw == "—":
        return None
    if isinstance(raw, str):
        raw = raw.replace("%", "").strip()
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v <= 1.5:
        v *= 100
    return v


def num_value(raw) -> float | None:
    if raw is None or raw == "" or raw == "—":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def metric_tier(value: float | None, high: float, low: float) -> str:
    if value is None:
        return "Mid"
    if value >= high:
        return "High"
    if value <= low:
        return "Low"
    return "Mid"


def rcv_archetype(rcv: float | None, obr: float | None) -> str:
    return f"{metric_tier(rcv, SIGNAL_8_RCV_HIGH, SIGNAL_8_RCV_LOW)}/{metric_tier(obr, SIGNAL_8_OBR_HIGH, SIGNAL_8_OBR_LOW)}"


@dataclass
class PitcherMetrics:
    name: str
    hand: str
    k_pct: float | None
    bb_pct: float | None
    hr9: float | None
    fip: float | None


@dataclass
class TeamMetrics:
    team: str
    abq: float | None
    rcv: float | None
    obr: float | None
    osi: float | None
    proj_osi: float | None
    pp_gap: float | None
    abq_vs_rhp: float | None
    abq_vs_lhp: float | None
    pals: float | None
    pitch_score: float | None
    oor: float | None
    hvp: float | None


@dataclass
class MatchupContext:
    game_id: str | None
    away: str
    home: str
    away_lineup: TeamMetrics
    home_lineup: TeamMetrics
    away_team: TeamMetrics
    home_team: TeamMetrics
    away_pitcher: PitcherMetrics
    home_pitcher: PitcherMetrics


def _team_row(df: pd.DataFrame, team: str) -> dict | None:
    if df is None or df.empty:
        return None
    match = df[df["Tm"] == team]
    if match.empty:
        return None
    return match.iloc[0].to_dict()


def build_team_metrics(
    team: str,
    split_df: pd.DataFrame,
    rhp_df: pd.DataFrame,
    lhp_df: pd.DataFrame,
    pals_df: pd.DataFrame,
    pitch_df: pd.DataFrame,
    oor_df: pd.DataFrame,
) -> TeamMetrics:
    row = _team_row(split_df, team)
    rhp = _team_row(rhp_df, team)
    lhp = _team_row(lhp_df, team)
    pals = _team_row(pals_df, team)
    pitch = _team_row(pitch_df, team)
    oor = _team_row(oor_df, team)

    abq = num_value(row.get("ABQ")) if row else None
    rcv = num_value(row.get("RCV")) if row else None
    obr = num_value(row.get("OBR")) if row else None
    osi = num_value(row.get("OSI")) if row else None
    proj = num_value(row.get("projOSI")) if row else None
    pp_gap = (abq - rcv) if abq is not None and rcv is not None else None

    abq_rhp = num_value(rhp.get("ABQ")) if rhp else None
    abq_lhp = num_value(lhp.get("ABQ")) if lhp else None

    return TeamMetrics(
        team=team,
        abq=abq,
        rcv=rcv,
        obr=obr,
        osi=osi,
        proj_osi=proj if proj is not None else osi,
        pp_gap=pp_gap,
        abq_vs_rhp=abq_rhp,
        abq_vs_lhp=abq_lhp,
        pals=num_value(pals.get("PALS")) if pals else None,
        pitch_score=num_value(pitch.get("PitchScore")) if pitch else None,
        oor=num_value(oor.get("OOR")) if oor else None,
        hvp=num_value(oor.get("HvP")) if oor else None,
    )


def team_metrics_for_hand(team: str, hand: str, rhp_df: pd.DataFrame, lhp_df: pd.DataFrame) -> TeamMetrics:
    """Lineup metrics vs opposing starter handedness."""
    df = rhp_df if hand == "R" else lhp_df
    row = _team_row(df, team)
    if not row:
        return TeamMetrics(team, None, None, None, None, None, None, None, None, None, None, None, None)
    abq = num_value(row.get("ABQ"))
    rcv = num_value(row.get("RCV"))
    obr = num_value(row.get("OBR"))
    osi = num_value(row.get("OSI"))
    proj = num_value(row.get("projOSI"))
    pp_gap = (abq - rcv) if abq is not None and rcv is not None else None
    return TeamMetrics(
        team=team,
        abq=abq,
        rcv=rcv,
        obr=obr,
        osi=osi,
        proj_osi=proj if proj is not None else osi,
        pp_gap=pp_gap,
        abq_vs_rhp=abq,
        abq_vs_lhp=abq,
        pals=None,
        pitch_score=None,
        oor=None,
        hvp=None,
    )


# ── Signal evaluators (lineup offense vs opposing pitcher) ───────────────────


def signal_1_k_vs_obr(offense: TeamMetrics, pitcher: PitcherMetrics) -> dict:
    k = pitcher.k_pct
    obr = offense.obr
    fired = (
        k is not None
        and obr is not None
        and k < SIGNAL_1_PITCHER_K_PCT_MAX
        and obr > SIGNAL_1_LINEUP_OBR_MIN
    )
    mag = (obr - SIGNAL_1_LINEUP_OBR_MIN) if fired and obr else 0.0
    return _signal_result(
        "K% vs OBR",
        fired,
        "lineup",
        mag,
        "Over offense / team total",
        (
            f"Soft K% arm ({k:.1f}%) vs elite floor (OBR {obr:.1f}) — contact & baserunners likely."
            if fired
            else "No K%/OBR mismatch."
        ),
    )


def signal_2_bb_vs_abq(offense: TeamMetrics, pitcher: PitcherMetrics) -> dict:
    bb = pitcher.bb_pct
    abq = offense.abq
    walk_game = (
        bb is not None
        and abq is not None
        and bb > SIGNAL_2_PITCHER_BB_PCT_HIGH
        and abq > SIGNAL_2_LINEUP_ABQ_WALK_GAME_MIN
    )
    chess = (
        bb is not None
        and abq is not None
        and bb < SIGNAL_2_PITCHER_BB_PCT_LOW
        and abq > SIGNAL_2_LINEUP_ABQ_CHESS_MIN
    )
    fired = walk_game or chess
    if walk_game:
        direction, angle, verdict = (
            "high",
            "Over / walks",
            f"Walk game: SP BB% {bb:.1f}% with lineup ABQ {abq:.1f} — patience tax on pitcher.",
        )
        mag = abq - SIGNAL_2_LINEUP_ABQ_WALK_GAME_MIN
    elif chess:
        direction, angle, verdict = (
            "low",
            "Under walks / pitcher outs",
            f"Chess match: SP BB% {bb:.1f}% vs elite ABQ {abq:.1f} — strike-thrower edge.",
        )
        mag = abq - SIGNAL_2_LINEUP_ABQ_CHESS_MIN
    else:
        direction, angle, verdict, mag = "neutral", "—", "BB%/ABQ neutral.", 0.0
    return _signal_result("BB% vs ABQ", fired, direction, mag, angle, verdict)


def signal_3_hr9_vs_rcv(offense: TeamMetrics, pitcher: PitcherMetrics) -> dict:
    hr9 = pitcher.hr9
    rcv = offense.rcv
    fired = (
        hr9 is not None
        and rcv is not None
        and hr9 > SIGNAL_3_PITCHER_HR9_MIN
        and rcv > SIGNAL_3_LINEUP_RCV_MIN
    )
    mag = (rcv - SIGNAL_3_LINEUP_RCV_MIN) if fired and rcv else 0.0
    return _signal_result(
        "HR/9 vs RCV",
        fired,
        "lineup",
        mag,
        "Over HR / power",
        (
            f"Barrel lane open: HR/9 {hr9:.2f} vs RCV {rcv:.1f} — damage upside vs flyball risk arm."
            if fired
            else "HR/9 vs RCV not aligned."
        ),
    )


def signal_4_osi_vs_pitching(offense: TeamMetrics, opponent_pitch_score: float | None) -> dict:
    osi = offense.osi
    if osi is None or opponent_pitch_score is None:
        return _signal_result(
            "OSI vs Pitching Score",
            False,
            "neutral",
            0.0,
            "—",
            "Missing OSI or opponent Pitching Score.",
        )
    gap = osi - opponent_pitch_score
    fired = abs(gap) > SIGNAL_4_OSI_PITCH_GAP_MIN
    direction = "lineup" if gap > 0 else "pitching"
    return _signal_result(
        "OSI vs Pitching Score",
        fired,
        direction,
        abs(gap),
        "Fade weak pitching / back strong offense" if gap > 0 else "Back pitching / fade offense",
        (
            f"OSI {osi:.1f} vs opp Pitch {opponent_pitch_score:.1f} (gap {gap:+.1f}) — "
            f"{'offensive edge' if gap > 0 else 'pitching edge'}."
            if fired
            else f"OSI–Pitch gap {gap:+.1f} within noise."
        ),
    )


def signal_5_pals_projosi(offense: TeamMetrics) -> dict:
    osi = offense.osi
    pals = offense.pals
    pp = offense.pp_gap
    if osi is None or pals is None or pp is None:
        return _signal_result(
            "PALS + projOSI",
            False,
            "neutral",
            0.0,
            "—",
            "Missing OSI, PALS, or PP-Gap.",
        )
    osi_pals_gap = abs(osi - pals)
    fired = osi_pals_gap < SIGNAL_5_OSI_PALS_GAP_MAX and pp > SIGNAL_5_PP_GAP_MIN
    return _signal_result(
        "PALS + projOSI",
        fired,
        "lineup",
        pp,
        "Buy-low offense / process catching up",
        (
            f"OSI≈PALS (Δ{osi_pals_gap:.1f}) with PP-Gap +{pp:.1f} — stable profile, process ahead of box score."
            if fired
            else "PALS/projOSI/PP-Gap not converging."
        ),
    )


def signal_pp_gap(offense: TeamMetrics) -> dict:
    """Standalone PP-Gap for convergence weighting (counts as 2 when fired)."""
    pp = offense.pp_gap
    fired = pp is not None and pp > SIGNAL_5_PP_GAP_MIN
    return _signal_result(
        "PP-Gap",
        fired,
        "process",
        pp or 0.0,
        "Process > production",
        (
            f"PP-Gap +{pp:.1f} (ABQ ahead of RCV) — buy-low process signal."
            if fired
            else "PP-Gap not elevated."
        ),
    )


def signal_6_obr_bb(offense: TeamMetrics, pitcher: PitcherMetrics) -> dict:
    obr = offense.obr
    bb = pitcher.bb_pct
    high_run = (
        obr is not None
        and bb is not None
        and obr > SIGNAL_6_OBR_HIGH_MIN
        and bb > SIGNAL_6_BB_PITCHER_HIGH_MIN
    )
    low_run = (
        obr is not None
        and bb is not None
        and obr < SIGNAL_6_OBR_LOW_MAX
        and bb < SIGNAL_6_BB_PITCHER_LOW_MAX
    )
    fired = high_run or low_run
    if high_run:
        direction, angle, verdict = (
            "high",
            "Over / baserunners",
            f"Run environment: OBR {obr:.1f} + SP BB% {bb:.1f}% — table-setters & traffic.",
        )
        mag = obr - SIGNAL_6_OBR_HIGH_MIN
    elif low_run:
        direction, angle, verdict = (
            "low",
            "Under / pitcher control",
            f"Stall risk: OBR {obr:.1f} + SP BB% {bb:.1f}% — limited free passes.",
        )
        mag = SIGNAL_6_OBR_LOW_MAX - obr
    else:
        direction, angle, verdict, mag = "neutral", "—", "OBR/BB% neutral.", 0.0
    return _signal_result("OBR + BB%", fired, direction, mag, angle, verdict)


def signal_7_abq_platoon(offense: TeamMetrics, pitcher: PitcherMetrics) -> dict:
    rhp = offense.abq_vs_rhp
    lhp = offense.abq_vs_lhp
    hand = (pitcher.hand or "").upper()
    if rhp is None or lhp is None:
        return _signal_result(
            "ABQ split gap + handedness",
            False,
            "neutral",
            0.0,
            "—",
            "Missing ABQ platoon splits.",
        )
    gap = abs(rhp - lhp)
    dominant_r = rhp > lhp
    dominant_l = lhp > rhp
    hand_match = (hand == "R" and dominant_r) or (hand == "L" and dominant_l)
    fired = gap > SIGNAL_7_ABQ_PLATOON_GAP_MIN and hand_match
    dom = "RHP" if dominant_r else "LHP"
    return _signal_result(
        "ABQ split gap + handedness",
        fired,
        "lineup",
        gap,
        f"Target {dom} hitters vs {hand}HP",
        (
            f"Platoon edge: ABQ gap {gap:.1f} ({dom} side) vs {hand}HP — handedness aligned."
            if fired
            else f"ABQ gap {gap:.1f} or handedness mismatch vs {hand}HP."
        ),
    )


def signal_8_rcv_archetype(offense: TeamMetrics) -> dict:
    arch = rcv_archetype(offense.rcv, offense.obr)
    fired = arch != "Mid/Mid"
    return _signal_result(
        "RCV archetype",
        fired,
        "profile",
        1.0 if fired else 0.0,
        "Specialized offensive profile",
        (
            f"Non-neutral archetype {arch} — RCV/OBR shape is not balanced Mid/Mid."
            if fired
            else f"Balanced Mid/Mid archetype ({arch})."
        ),
    )


def signal_9_schedule_context(opponent: TeamMetrics) -> dict:
    """
    Opponent offensive context today: OOR composite vs season HvP baseline.
    Large delta implies schedule/context skew for the pitcher facing this offense.
    """
    today_oor = opponent.oor
    season_hvp = opponent.hvp
    if today_oor is None or season_hvp is None:
        return _signal_result(
            "Schedule context",
            False,
            "neutral",
            0.0,
            "—",
            "Missing opponent OOR or HvP.",
        )
    delta = today_oor - season_hvp
    fired = abs(delta) > SIGNAL_9_OOR_DELTA_MIN
    direction = "hot" if delta > 0 else "cold"
    return _signal_result(
        "Schedule context",
        fired,
        direction,
        abs(delta),
        "Adjust expectations vs season norm",
        (
            f"Opponent OOR {today_oor:.1f} vs HvP baseline {season_hvp:.1f} (Δ{delta:+.1f}) — "
            f"{'hotter than season profile' if delta > 0 else 'cooler than season profile'}."
            if fired
            else "Opponent offensive context in line with season baseline."
        ),
    )


def evaluate_matchup_side(
    offense: TeamMetrics,
    offense_platoon: TeamMetrics,
    pitcher: PitcherMetrics,
    opponent_team: TeamMetrics,
    opponent_pitch_score: float | None,
) -> list[dict]:
    """All signals for one lineup vs one opposing pitcher."""
    return [
        signal_1_k_vs_obr(offense, pitcher),
        signal_2_bb_vs_abq(offense, pitcher),
        signal_3_hr9_vs_rcv(offense, pitcher),
        signal_4_osi_vs_pitching(offense, opponent_pitch_score),
        signal_5_pals_projosi(offense_platoon),
        signal_pp_gap(offense_platoon),
        signal_6_obr_bb(offense, pitcher),
        signal_7_abq_platoon(offense_platoon, pitcher),
        signal_8_rcv_archetype(offense_platoon),
        signal_9_schedule_context(opponent_team),
    ]


def evaluate_matchup(ctx: MatchupContext, side: str = "away") -> list[dict]:
    """
    Evaluate signals for away or home lineup vs opposing SP.
    side: 'away' | 'home'
    """
    if side == "away":
        return evaluate_matchup_side(
            ctx.away_lineup,
            ctx.away_team,
            ctx.home_pitcher,
            ctx.home_team,
            ctx.home_team.pitch_score,
        )
    return evaluate_matchup_side(
        ctx.home_lineup,
        ctx.home_team,
        ctx.away_pitcher,
        ctx.away_team,
        ctx.away_team.pitch_score,
    )


def evaluate_game(ctx: MatchupContext) -> list[dict]:
    """All signals for both lineups (18 total) with game metadata."""
    rows = []
    for side in ("away", "home"):
        for sig in evaluate_matchup(ctx, side):
            rows.append({
                "game_id": ctx.game_id,
                "away": ctx.away,
                "home": ctx.home,
                "side": side,
                **sig,
            })
    return rows


def signal_weight(signal_name: str) -> int:
    if signal_name == "PP-Gap":
        return CONVERGENCE_PP_GAP_WEIGHT
    return CONVERGENCE_DEFAULT_WEIGHT


def compute_convergence(signals: list[dict]) -> dict:
    """
    Weight fired signals (PP-Gap = 2, others = 1).
    Returns convergence_count, convergence_direction, is_convergence_play.
    """
    fired = [s for s in signals if s.get("fired")]
    weighted = sum(signal_weight(s.get("signal_name", "")) for s in fired)

    direction_scores: dict[str, float] = {}
    for s in fired:
        d = s.get("direction") or "neutral"
        w = signal_weight(s.get("signal_name", ""))
        direction_scores[d] = direction_scores.get(d, 0.0) + w

    if direction_scores:
        convergence_direction = max(direction_scores, key=direction_scores.get)
    else:
        convergence_direction = "none"

    return {
        "convergence_count": weighted,
        "convergence_direction": convergence_direction,
        "is_convergence_play": weighted >= CONVERGENCE_PLAY_MIN_WEIGHT,
        "signals_fired": len(fired),
    }


def load_matchup_contexts() -> list[MatchupContext]:
    """Build contexts from pipeline CSV outputs."""
    matchups_path = os.path.join(DATA_DIR, "today_matchups.csv")
    if not os.path.exists(matchups_path):
        print("  WARNING: today_matchups.csv not found")
        return []

    matchups = pd.read_csv(matchups_path)
    rhp = load("metrics_vs_RHP.csv")
    lhp = load("metrics_vs_LHP.csv")
    pals = load("metrics_pals.csv")
    pitch = load("metrics_pitching_score.csv")
    oor = load("metrics_oor.csv")

    if rhp is None or lhp is None:
        print("  WARNING: split metrics missing for signals")
        return []

    contexts = []
    for _, g in matchups.iterrows():
        away = str(g.get("Away", "")).strip().upper()
        home = str(g.get("Home", "")).strip().upper()
        if not away or not home:
            continue

        away_hand = str(g.get("Away_Hand", "R")).strip().upper()[:1] or "R"
        home_hand = str(g.get("Home_Hand", "R")).strip().upper()[:1] or "R"

        away_full = build_team_metrics(away, rhp if away_hand == "R" else lhp, rhp, lhp, pals, pitch, oor)
        home_full = build_team_metrics(home, lhp if home_hand == "L" else rhp, rhp, lhp, pals, pitch, oor)

        away_lineup = team_metrics_for_hand(away, home_hand, rhp, lhp)
        home_lineup = team_metrics_for_hand(home, away_hand, rhp, lhp)

        for tm, full in ((away, away_full), (home, home_full)):
            if tm.abq_vs_rhp is None:
                tm.abq_vs_rhp = full.abq_vs_rhp
            if tm.abq_vs_lhp is None:
                tm.abq_vs_lhp = full.abq_vs_lhp
            if tm.pals is None:
                tm.pals = full.pals
            if tm.pitch_score is None:
                tm.pitch_score = full.pitch_score
            if tm.oor is None:
                tm.oor = full.oor
            if tm.hvp is None:
                tm.hvp = full.hvp

        contexts.append(
            MatchupContext(
                game_id=str(g.get("game_id", "")) if "game_id" in g.index else None,
                away=away,
                home=home,
                away_lineup=away_lineup,
                home_lineup=home_lineup,
                away_team=away_full,
                home_team=home_full,
                away_pitcher=PitcherMetrics(
                    str(g.get("Away_SP", "TBD")),
                    away_hand,
                    pct_value(g.get("Away_K%")),
                    pct_value(g.get("Away_BB%")),
                    num_value(g.get("Away_HR9")),
                    num_value(g.get("Away_FIP")),
                ),
                home_pitcher=PitcherMetrics(
                    str(g.get("Home_SP", "TBD")),
                    home_hand,
                    pct_value(g.get("Home_K%")),
                    pct_value(g.get("Home_BB%")),
                    num_value(g.get("Home_HR9")),
                    num_value(g.get("Home_FIP")),
                ),
            )
        )
    return contexts


def run():
    print("Computing cross-metric signals...")
    contexts = load_matchup_contexts()
    if not contexts:
        print("  No matchups to evaluate")
        return

    all_rows = []
    summary_rows = []

    for ctx in contexts:
        signals = evaluate_game(ctx)
        all_rows.extend(signals)

        for side in ("away", "home"):
            side_sigs = [s for s in signals if s["side"] == side]
            conv = compute_convergence(side_sigs)
            summary_rows.append({
                "game_id": ctx.game_id,
                "away": ctx.away,
                "home": ctx.home,
                "side": side,
                **conv,
            })

    out = os.path.join(DATA_DIR, "signals_today.csv")
    pd.DataFrame(all_rows).to_csv(out, index=False)
    print(f"  Saved: {out} ({len(all_rows)} signal rows)")

    summary_path = os.path.join(DATA_DIR, "signals_convergence.csv")
    pd.DataFrame(summary_rows).to_csv(summary_path, index=False)
    print(f"  Saved: {summary_path}")

    plays = [r for r in summary_rows if r["is_convergence_play"]]
    print(f"  Convergence plays: {len(plays)} side(s)")


if __name__ == "__main__":
    run()
