#!/usr/bin/env python3
"""
MLBMA Research Terminal — lineup, pitcher, and matchup analysis modes.

Examples:
  python dashboard.py lineup NYY --hand RHP --window L14 --verbose 2
  python dashboard.py pitcher "Gerrit Cole" --hand RHP --team NYY
  python dashboard.py matchup NYY BOS --hp "Cole, G." --ap "Sale, C." --window L14
"""

from __future__ import annotations

import argparse
import sys

from core.compute_signals import PitcherMetrics
from core.config import CLI_DEFAULTS, METRIC_CHOICES, SIGNAL_NAMES, TIME_WINDOWS
from core.dashboard_terminal import (
    DashboardOptions,
    DataStore,
    bet_angle_matrix,
    build_verdict,
    convergence_panel,
    normalize_hand,
    normalize_team,
    render_archetype,
    render_bet_matrix,
    render_convergence,
    render_header_lineup,
    render_osi_dashboard,
    render_platoon,
    render_signals,
    render_submetrics,
    render_verdict,
    render_window_compare,
    run_signals_for_side,
    section,
    subsection,
    tier_label,
    fmt,
    PITCHING_TIERS,
    OSI_TIERS,
    primary_score,
    market_implication,
)


def parse_weights(raw: str | None) -> dict[str, float] | None:
    if not raw:
        return None
    parts = [float(x.strip()) for x in raw.split(",")]
    if len(parts) != 3:
        raise ValueError("--weights must be three comma-separated integers (e.g. 43,37,20)")
    if abs(sum(parts) - 100) > 0.01:
        raise ValueError(f"--weights must sum to 100 (got {sum(parts)})")
    return {"rcv": parts[0] / 100, "abq": parts[1] / 100, "obr": parts[2] / 100}


def parse_signals(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    indices = [int(x.strip()) for x in raw.split(",")]
    for i in indices:
        if i < 1 or i > 9:
            raise ValueError("--signals must be comma-separated indices 1-9")
    return indices


def parse_metrics(raw: str | None) -> list[str]:
    if not raw:
        return list(METRIC_CHOICES)
    names = [m.strip() for m in raw.split(",") if m.strip()]
    return names


def build_options(args: argparse.Namespace) -> DashboardOptions:
    return DashboardOptions(
        window=args.window.upper(),
        hand=normalize_hand(args.hand),
        verbose=args.verbose,
        metrics=parse_metrics(args.metrics),
        osi_weights=parse_weights(args.weights),
        signal_indices=parse_signals(args.signals),
        convergence_threshold=args.convergence_threshold,
        window_compare=args.window_compare,
        platoon_detail=args.platoon_detail,
        projected=args.projected,
    )


def add_shared_flags(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--window",
        default=CLI_DEFAULTS["window"],
        choices=list(TIME_WINDOWS),
        help="Stat window (default YTD)",
    )
    p.add_argument(
        "--hand",
        default=CLI_DEFAULTS["hand"],
        help="R, L, RHP, LHP, or both (default both)",
    )
    p.add_argument(
        "--verbose",
        type=int,
        default=CLI_DEFAULTS["verbose"],
        choices=[0, 1, 2],
        help="0=one-liner, 1=narrative, 2=audit trail",
    )
    p.add_argument(
        "--metrics",
        default=None,
        help="Comma-separated metrics to show in breakdown",
    )
    p.add_argument(
        "--weights",
        default=None,
        help="Custom OSI weights as rcv,abq,obr summing to 100 (e.g. 43,37,20)",
    )
    p.add_argument(
        "--signals",
        default=None,
        help="Comma-separated signal indices 1-9 to evaluate",
    )
    p.add_argument(
        "--convergence-threshold",
        type=int,
        default=CLI_DEFAULTS["convergence_threshold"],
        dest="convergence_threshold",
    )
    p.add_argument("--window-compare", action="store_true", help="Show OSI/PALS across windows")
    p.add_argument("--platoon-detail", action="store_true", help="Expanded platoon notes")
    p.add_argument("--projected", action="store_true", help="Use projOSI as headline score")


def cmd_lineup(team: str, args: argparse.Namespace) -> int:
    store = DataStore()
    opts = build_options(args)
    team = normalize_team(team)

    try:
        snap = store.team_snapshot(team, opts)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    opp = args.opposing_pitcher
    opp_hand = args.opposing_hand or ("R" if opts.hand == "R" else "L" if opts.hand == "L" else "R")
    pitcher = PitcherMetrics(
        name=opp or "TBD",
        hand=pitcher_hand_code(opp_hand),
        k_pct=args.opp_k,
        bb_pct=args.opp_bb,
        hr9=args.opp_hr9,
        fip=None,
    )
    if args.opposing_pitcher and store.sp_ytd() is not None:
        try:
            ps = store.pitcher_snapshot(args.opposing_pitcher, None, opp_hand)
            pitcher = PitcherMetrics(ps.name, ps.hand, ps.k_pct, ps.bb_pct, ps.hr9, ps.fip)
        except (FileNotFoundError, ValueError):
            pass

    offense = store.team_metrics_from_snapshot(snap)
    opponent_tm = store.team_metrics_from_snapshot(snap)
    if args.opponent:
        try:
            opp_snap = store.team_snapshot(normalize_team(args.opponent), opts)
            opponent_tm = store.team_metrics_from_snapshot(opp_snap)
            opponent_tm.oor = opp_snap.oor
            opponent_tm.hvp = opp_snap.hvp
        except (FileNotFoundError, ValueError):
            pass

    signals = run_signals_for_side(
        offense,
        offense,
        pitcher,
        opponent_tm,
        opponent_tm.pitch_score,
        opts,
    )
    conv = convergence_panel(signals, opts.convergence_threshold)
    matrix = bet_angle_matrix(signals, conv, snap, team)
    v0, v1, v2 = build_verdict("lineup", snap, conv, signals, opts)

    render_header_lineup(snap, opts)
    render_osi_dashboard(snap, opts)
    render_platoon(snap, opts, pitcher.hand)
    render_submetrics(snap, opts)
    render_archetype(snap)
    if opts.window_compare:
        render_window_compare(store, team, opts.hand)
    render_signals(signals, opts.verbose)
    render_convergence(conv)
    render_bet_matrix(matrix)
    render_verdict(v0, v1, v2, opts.verbose)
    return 0


def cmd_pitcher(name: str, args: argparse.Namespace) -> int:
    store = DataStore()
    opts = build_options(args)
    team = normalize_team(args.team) if args.team else None

    try:
        ps = store.pitcher_snapshot(name, team, args.hand)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    section("PITCHER MODE")
    print(f"  {ps.name}  |  {ps.team or '—'}  |  {ps.hand}HP  |  IP {fmt(ps.ip)}")

    subsection("Staleness Check (L14 vs season)")
    print(f"  {'Stat':<8} {'Season':>10} {'L14':>10} {'Δ':>8}")
    for label, season, recent in (
        ("K%", ps.k_pct, ps.k_pct_l14),
        ("BB%", ps.bb_pct, ps.bb_pct_l14),
        ("HR/9", ps.hr9, ps.hr9_l14),
    ):
        delta = (recent - season) if season is not None and recent is not None else None
        print(
            f"  {label:<8} {fmt(season):>10} {fmt(recent):>10} "
            f"{fmt(delta, 2) if delta is not None else '—':>8}"
        )
    print(f"  Verdict: {ps.staleness}")

    subsection("Pitching Score")
    tier = tier_label(ps.pitch_score, PITCHING_TIERS)
    print(f"  Score: {fmt(ps.pitch_score)}  ({tier})")
    print(f"  Components: K% {fmt(ps.k_pct)}  |  BB% {fmt(ps.bb_pct)}  |  HR/9 {fmt(ps.hr9)}  |  FIP {fmt(ps.fip)}")

    subsection("Handedness Splits")
    print(f"  {'Split':<10} {'K%':>8} {'BB%':>8} {'HR/9':>8}")
    print(
        f"  {'vs LHH':<10} {fmt(ps.vs_lhh.get('K%')):>8} "
        f"{fmt(ps.vs_lhh.get('BB%')):>8} {fmt(ps.vs_lhh.get('HR/9')):>8}"
    )
    print(
        f"  {'vs RHH':<10} {fmt(ps.vs_rhh.get('K%')):>8} "
        f"{fmt(ps.vs_rhh.get('BB%')):>8} {fmt(ps.vs_rhh.get('HR/9')):>8}"
    )
    if ps.vs_lhh == ps.vs_rhh:
        print("  Note: dedicated LHH/RHH export not in pipeline — season line shown for both.")

    subsection("Schedule Context")
    if team:
        try:
            opp_snap = store.team_snapshot(team, opts)
            if opp_snap.oor is not None and opp_snap.hvp is not None:
                delta = opp_snap.oor - opp_snap.hvp
                print(
                    f"  Team {team} OOR {fmt(opp_snap.oor)} vs HvP baseline {fmt(opp_snap.hvp)} "
                    f"(Δ {delta:+.1f})"
                )
            else:
                print(f"  Team {team} offensive context loaded from OOR sheet.")
        except (FileNotFoundError, ValueError):
            print("  Opponent team metrics unavailable for schedule context.")
    else:
        print("  Pass --team for opponent OOR context.")

    pitcher = PitcherMetrics(ps.name, ps.hand, ps.k_pct, ps.bb_pct, ps.hr9, ps.fip)
    snap_for_matrix = None
    offense = _empty_team_metrics(team or "UNK")
    try:
        if team:
            snap_for_matrix = store.team_snapshot(team, opts)
            offense = store.team_metrics_from_snapshot(snap_for_matrix)
    except (FileNotFoundError, ValueError):
        pass

    signals = run_signals_for_side(
        offense,
        offense,
        pitcher,
        offense,
        ps.pitch_score,
        opts,
    )
    conv = convergence_panel(signals, opts.convergence_threshold)
    matrix = bet_angle_matrix(
        signals,
        conv,
        snap_for_matrix or _empty_snap(team or "UNK"),
        ps.name,
    )
    v0, v1, v2 = build_verdict(
        "pitcher",
        snap_for_matrix,
        conv,
        signals,
        opts,
        extra=f"Pitcher framing: {ps.name} {ps.hand}HP — signals evaluated vs listed opponent offense.",
    )

    render_signals(signals, opts.verbose)
    render_convergence(conv)
    render_bet_matrix(matrix, "Bet Angle Matrix (pitcher-side)")
    render_verdict(v0, v1, v2, opts.verbose)
    return 0


def _empty_snap(team: str):
    from core.dashboard_terminal import TeamSnapshot

    return TeamSnapshot(team=team, window="YTD", hand="both", source_file="")


def _empty_team_metrics(team: str):
    from core.compute_signals import TeamMetrics

    return TeamMetrics(team, None, None, None, None, None, None, None, None, None, None, None, None)


def cmd_matchup(away: str, home: str, args: argparse.Namespace) -> int:
    store = DataStore()
    opts = build_options(args)
    away = normalize_team(away)
    home = normalize_team(home)

    try:
        ctx = store.build_matchup_context(away, home, args.ap, args.hp, opts)
        away_snap = store.team_snapshot(away, opts)
        home_snap = store.team_snapshot(home, opts)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    section("MATCHUP MODE")
    print(f"  {away} @ {home}  |  window {opts.window}")
    print(f"  SP: {ctx.away_pitcher.name} ({ctx.away_pitcher.hand}HP) vs {ctx.home_pitcher.name} ({ctx.home_pitcher.hand}HP)")

    subsection("Head-to-Head Metric Table")
    print(f"  {'Team':<6} {'OSI':>7} {'PALS':>7} {'projOSI':>7} {'ABQ':>7} {'RCV':>7} {'OBR':>7} {'Archetype':<20}")
    for label, snap in ((away, away_snap), (home, home_snap)):
        print(
            f"  {label:<6} {fmt(snap.osi):>7} {fmt(snap.pals):>7} {fmt(snap.proj_osi):>7} "
            f"{fmt(snap.abq):>7} {fmt(snap.rcv):>7} {fmt(snap.obr):>7} {snap.archetype_label:<20}"
        )

    subsection("Platoon Alignment")
    for label, snap, opp_hand in (
        (away, away_snap, ctx.home_pitcher.hand),
        (home, home_snap, ctx.away_pitcher.hand),
    ):
        render_platoon(snap, opts, opp_hand)
        print(f"  ({label} lineup)")

    away_sigs = run_signals_for_side(
        ctx.away_lineup,
        ctx.away_team,
        ctx.home_pitcher,
        ctx.home_team,
        ctx.home_team.pitch_score,
        opts,
    )
    home_sigs = run_signals_for_side(
        ctx.home_lineup,
        ctx.home_team,
        ctx.away_pitcher,
        ctx.away_team,
        ctx.away_team.pitch_score,
        opts,
    )

    subsection("Signal Matrix (9 signals)")
    print(f"  {'Signal':<30} {away:>6} {home:>6}")
    for idx, name in enumerate(SIGNAL_NAMES, 1):
        a = next((s for s in away_sigs if _signal_match(s, name, idx)), None)
        h = next((s for s in home_sigs if _signal_match(s, name, idx)), None)
        a_cell = _side_cell(a, away)
        h_cell = _side_cell(h, home)
        print(f"  {name:<30} {a_cell:>6} {h_cell:>6}")

    away_conv = convergence_panel(away_sigs, opts.convergence_threshold)
    home_conv = convergence_panel(home_sigs, opts.convergence_threshold)

    subsection("Convergence")
    print(f"  {away}: {away_conv['convergence_count']}/{away_conv['threshold']} "
          f"{'CONVERGENCE PLAY' if away_conv['is_convergence_play'] else '—'} "
          f"({away_conv['convergence_direction']})")
    print(f"  {home}: {home_conv['convergence_count']}/{home_conv['threshold']} "
          f"{'CONVERGENCE PLAY' if home_conv['is_convergence_play'] else '—'} "
          f"({home_conv['convergence_direction']})")

    render_bet_matrix(bet_angle_matrix(away_sigs, away_conv, away_snap, away), f"{away} Bet Angles")
    render_bet_matrix(bet_angle_matrix(home_sigs, home_conv, home_snap, home), f"{home} Bet Angles")

    combined_note = (
        f"Combined: {away} OSI/PALS {fmt(away_snap.osi)}/{fmt(away_snap.pals)} vs "
        f"{home} {fmt(home_snap.osi)}/{fmt(home_snap.pals)}; "
        f"projOSI market: {market_implication(away_snap)} | {market_implication(home_snap)}"
    )
    v0_a, v1_a, v2_a = build_verdict("matchup", away_snap, away_conv, away_sigs, opts, extra=combined_note)
    v0_h, _, _ = build_verdict("matchup", home_snap, home_conv, home_sigs, opts)

    subsection("Verdict by Bet Type")
    print("  ML:       ", _pick_ml(away_snap, home_snap, away_conv, home_conv, away, home))
    print("  Run Line: ", _pick_rl(away_sigs, home_sigs, away, home))
    print("  F5:       ", _pick_f5(away_sigs, home_sigs))
    print("  Total:    ", _pick_total(away_sigs, home_sigs))
    render_verdict(f"{away}: {v0_a} | {home}: {v0_h}", v1_a, v2_a, opts.verbose)
    return 0


def _signal_match(sig: dict, canonical: str, idx: int) -> bool:
    nm = sig.get("signal_name", "")
    if nm == canonical:
        return True
    if canonical == "ABQ platoon" and "platoon" in nm.lower():
        return True
    return SIGNAL_NAMES[idx - 1] == canonical if idx <= len(SIGNAL_NAMES) else False


def _side_cell(sig: dict | None, team: str) -> str:
    if not sig or not sig.get("fired"):
        return "—"
    d = sig.get("direction", "")
    if d in ("lineup", "high", "profile", "hot"):
        return team[:3]
    if d in ("pitching", "low", "cold"):
        return "PIT"
    return "•"


def _pick_ml(a_snap, h_snap, a_conv, h_conv, away, home) -> str:
    if a_conv["is_convergence_play"] and not h_conv["is_convergence_play"]:
        return f"{away} ML (convergence)"
    if h_conv["is_convergence_play"] and not a_conv["is_convergence_play"]:
        return f"{home} ML (convergence)"
    ao, ho = a_snap.osi or 0, h_snap.osi or 0
    if ao > ho + 3:
        return f"{away} ML lean (OSI/PALS edge)"
    if ho > ao + 3:
        return f"{home} ML lean (OSI/PALS edge)"
    return "No strong ML lean — pass or reduce size"


def _pick_rl(a_sigs, h_sigs, away, home) -> str:
    a_pwr = sum(1 for s in a_sigs if s.get("fired") and "HR" in s.get("signal_name", ""))
    h_pwr = sum(1 for s in h_sigs if s.get("fired") and "HR" in s.get("signal_name", ""))
    if a_pwr > h_pwr:
        return f"{away} RL + (damage signals)"
    if h_pwr > a_pwr:
        return f"{home} RL + (damage signals)"
    return "RL neutral"


def _pick_f5(a_sigs, h_sigs) -> str:
    proc = sum(
        1
        for s in a_sigs + h_sigs
        if s.get("fired") and ("BB%" in s.get("signal_name", "") or "PP-Gap" in s.get("signal_name", ""))
    )
    return "F5 over lean (walk/process)" if proc >= 2 else "F5 no strong lean"


def _pick_total(a_sigs, h_sigs) -> str:
    overs = sum(1 for s in a_sigs + h_sigs if s.get("fired") and "over" in str(s.get("bet_angle", "")).lower())
    unders = sum(1 for s in a_sigs + h_sigs if s.get("fired") and "under" in str(s.get("bet_angle", "")).lower())
    if overs > unders:
        return "Game over lean"
    if unders > overs:
        return "Game under lean"
    return "Total neutral"


def pitcher_hand_code(raw: str | None) -> str:
    from core.dashboard_terminal import pitcher_hand_code as _ph

    return _ph(raw)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="MLBMA Research Terminal",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="mode", required=True)

    p_lineup = sub.add_parser("lineup", help="Team lineup research")
    p_lineup.add_argument("team", help="Team abbreviation (e.g. NYY)")
    p_lineup.add_argument("--opposing-pitcher", default=None, help="Opposing SP name for signals")
    p_lineup.add_argument("--opposing-hand", default=None, help="Opposing SP hand R/L")
    p_lineup.add_argument("--opponent", default=None, help="Opponent team for schedule signal")
    p_lineup.add_argument("--opp-k", type=float, default=None, help="Override opposing K%")
    p_lineup.add_argument("--opp-bb", type=float, default=None, help="Override opposing BB%")
    p_lineup.add_argument("--opp-hr9", type=float, default=None, help="Override opposing HR/9")
    add_shared_flags(p_lineup)

    p_pitcher = sub.add_parser("pitcher", help="Starting pitcher research")
    p_pitcher.add_argument("name", help='Pitcher name (e.g. "Gerrit Cole" or "Cole, G.")')
    p_pitcher.add_argument("--team", default=None, help="Pitcher team abbreviation")
    add_shared_flags(p_pitcher)

    p_match = sub.add_parser("matchup", help="Head-to-head matchup research")
    p_match.add_argument("away", help="Away team abbr")
    p_match.add_argument("home", help="Home team abbr")
    p_match.add_argument("--hp", default="TBD", help="Home SP name")
    p_match.add_argument("--ap", default="TBD", help="Away SP name")
    add_shared_flags(p_match)

    args = parser.parse_args(argv)

    try:
        if args.mode == "lineup":
            return cmd_lineup(args.team, args)
        if args.mode == "pitcher":
            return cmd_pitcher(args.name, args)
        if args.mode == "matchup":
            return cmd_matchup(args.away, args.home, args)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
