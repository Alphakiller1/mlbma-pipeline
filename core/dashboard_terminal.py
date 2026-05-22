"""
MLBMA research terminal -- data loading, metric assembly, and rendering helpers.
Used by dashboard.py CLI.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from core.compute_abq import calc_abq
from core.compute_obr import calc_obr
from core.compute_osi import calc_osi
from core.compute_rcv import calc_rcv
from core.compute_signals import (
    MatchupContext,
    PitcherMetrics,
    TeamMetrics,
    build_team_metrics,
    compute_convergence,
    evaluate_matchup_side,
    num_value,
    pct_value,
    rcv_archetype,
    signal_pp_gap,
    signal_weight,
    team_metrics_for_hand,
)
from core.config import (
    ARCHETYPE_NAMES,
    CLI_DEFAULTS,
    CONVERGENCE_PP_GAP_WEIGHT,
    CONVERGENCE_THRESHOLD,
    DATA_DIR,
    METRIC_CHOICES,
    OSI_TIERS,
    OSI_WEIGHTS,
    PITCHING_TIERS,
    PROJ_OSI_REG_CLIP,
    PROJ_OSI_REG_SCALE,
    SIGNAL_NAMES,
    TEAM_MAP,
    TIME_WINDOWS,
)
from core.metrics_utils import clean_pct, invert, load, normalize

# ── Formatting ────────────────────────────────────────────────────────────────

W = 72
RULE = "═" * W
SUB = "─" * W


def section(title: str) -> None:
    print()
    print(RULE)
    print(f"  {title}")
    print(RULE)


def subsection(title: str) -> None:
    print()
    print(f"  ▸ {title}")
    print(SUB)


def fmt(v: float | None, digits: int = 1, suffix: str = "") -> str:
    if v is None:
        return "--"
    return f"{v:.{digits}f}{suffix}"


def tier_label(score: float | None, tiers: tuple) -> str:
    if score is None:
        return "--"
    for floor, label in tiers:
        if score >= floor:
            return label
    return tiers[-1][1]


# ── Normalization ─────────────────────────────────────────────────────────────

TEAM_ALIASES = {v: v for v in TEAM_MAP.values()}
for full, abbr in TEAM_MAP.items():
    TEAM_ALIASES[full.upper()] = abbr
    TEAM_ALIASES[abbr.upper()] = abbr
    TEAM_ALIASES[full.split()[-1].upper()] = abbr


def normalize_team(raw: str) -> str:
    key = raw.strip().upper()
    if key in TEAM_ALIASES:
        return TEAM_ALIASES[key]
    if len(key) <= 4:
        return key
    raise ValueError(f"Unknown team: {raw}")


def normalize_hand(raw: str | None) -> str:
    if not raw:
        return "both"
    h = raw.strip().upper()
    if h in ("R", "RHP", "VS RHP", "VS_RHP"):
        return "R"
    if h in ("L", "LHP", "VS LHP", "VS_LHP"):
        return "L"
    if h in ("BOTH", "ALL", "B"):
        return "both"
    raise ValueError(f"Unknown hand: {raw}")


def split_for_hand(hand: str) -> str:
    return "vs_RHP" if hand == "R" else "vs_LHP"


def pitcher_hand_code(raw: str | None) -> str:
    if not raw:
        return "R"
    return normalize_hand(raw)[0]  # R or L


def match_pitcher_name(query: str, names: pd.Series) -> str | None:
    if not query or not len(names):
        return None
    q = query.strip().lower()
    q_last = q.split(",")[0].split()[-1] if "," in q else q.split()[-1]
    for name in names.dropna().unique():
        nl = str(name).lower()
        if q in nl or q_last in nl:
            return name
        if "," in q:
            last, first = [p.strip() for p in q.split(",", 1)]
            if last in nl and (not first or first[0] in nl):
                return name
    return None


# ── Window file resolution ──────────────────────────────────────────────────────

def metrics_csv_candidates(window: str, split_label: str) -> list[str]:
    """split_label: vs_RHP or vs_LHP"""
    base = split_label
    w = window.upper()
    return [
        f"metrics_{base}_{w}.csv",
        f"metrics_{base}_{w.lower()}.csv",
        f"{w}_metrics_{base}.csv",
        f"{w.lower()}_metrics_{base}.csv",
        f"metrics_{base}.csv" if w == "YTD" else "",
    ]


def resolve_metrics_df(window: str, split_label: str) -> tuple[pd.DataFrame | None, str]:
    for fname in metrics_csv_candidates(window, split_label):
        if not fname:
            continue
        path = DATA_DIR / fname
        if path.is_file():
            return pd.read_csv(path), fname
    return None, ""


def resolve_sp_df(window: str) -> tuple[pd.DataFrame | None, str]:
    w = window.upper()
    for fname in (
        "sp_l14.csv" if w == "L14" else "",
        f"sp_standard_{w}.csv",
        f"sp_standard_{w.lower()}.csv",
        f"{w}_sp_standard.csv",
        "sp_standard.csv" if w == "YTD" else "",
    ):
        if not fname:
            continue
        path = DATA_DIR / fname
        if path.is_file():
            return pd.read_csv(path), fname
    return None, ""


# ── Snapshots ─────────────────────────────────────────────────────────────────

@dataclass
class SubMetricDetail:
    abq_discipline: float | None = None
    abq_contact: float | None = None
    abq_pitch_pressure: float | None = None
    abq_k_avoid: float | None = None
    rcv_wrc: float | None = None
    rcv_barrel: float | None = None
    rcv_iso: float | None = None
    rcv_hard: float | None = None
    obr_xwoba: float | None = None
    obr_bb: float | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class TeamSnapshot:
    team: str
    window: str
    hand: str
    source_file: str
    abq: float | None = None
    rcv: float | None = None
    obr: float | None = None
    osi: float | None = None
    proj_osi: float | None = None
    reg_signal: float | None = None
    pals: float | None = None
    pp_gap: float | None = None
    df_gap: float | None = None
    abq_vs_rhp: float | None = None
    abq_vs_lhp: float | None = None
    osi_vs_rhp: float | None = None
    osi_vs_lhp: float | None = None
    rcv_vs_rhp: float | None = None
    rcv_vs_lhp: float | None = None
    obr_vs_rhp: float | None = None
    obr_vs_lhp: float | None = None
    oor: float | None = None
    hvp: float | None = None
    hvr: float | None = None
    hvl: float | None = None
    pitch_score_team: float | None = None
    archetype_key: str = "Mid/Mid"
    archetype_label: str = "Balanced"
    archetype_desc: str = ""
    sub: SubMetricDetail = field(default_factory=SubMetricDetail)
    reliability: str = "high"
    custom_osi: bool = False


@dataclass
class PitcherSnapshot:
    name: str
    team: str | None
    hand: str
    k_pct: float | None
    bb_pct: float | None
    hr9: float | None
    fip: float | None
    ip: float | None
    pitch_score: float | None
    k_pct_l14: float | None = None
    bb_pct_l14: float | None = None
    hr9_l14: float | None = None
    vs_lhh: dict[str, float | None] = field(default_factory=dict)
    vs_rhh: dict[str, float | None] = field(default_factory=dict)
    stale: bool = False
    staleness: str = ""
    staleness_warning: str = ""
    data_source: str = "season"
    l14_starts: int = 0
    reliability: str = "high"


@dataclass
class DashboardOptions:
    window: str = CLI_DEFAULTS["window"]
    hand: str = CLI_DEFAULTS["hand"]
    verbose: int = CLI_DEFAULTS["verbose"]
    metrics: list[str] = field(default_factory=lambda: list(METRIC_CHOICES))
    osi_weights: dict[str, float] | None = None
    signal_indices: list[int] | None = None
    convergence_threshold: int = CONVERGENCE_THRESHOLD
    window_compare: bool = False
    platoon_detail: bool = False
    projected: bool = False
    opponent_pitcher: PitcherMetrics | None = None
    opponent_team: str | None = None


class DataStore:
    """Cached loaders for pipeline CSV outputs."""

    def __init__(self):
        self._pals: pd.DataFrame | None = None
        self._oor: pd.DataFrame | None = None
        self._pitch: pd.DataFrame | None = None
        self._sp_ytd: pd.DataFrame | None = None
        self._sp_l14: pd.DataFrame | None = None
        self._raw_cache: dict[str, pd.DataFrame | None] = {}
        self._pals_warned = False
        self._oor_warned = False

    def pals_df(self) -> pd.DataFrame | None:
        if self._pals is None:
            path = DATA_DIR / "metrics_pals.csv"
            if path.is_file():
                self._pals = pd.read_csv(path)
            else:
                if not self._pals_warned:
                    print(
                        "WARNING: metrics_pals.csv not found - PALS data unavailable. "
                        "Run full pipeline first."
                    )
                    self._pals_warned = True
        return self._pals

    def oor_df(self) -> pd.DataFrame | None:
        if self._oor is None:
            path = DATA_DIR / "metrics_oor.csv"
            if path.is_file():
                self._oor = pd.read_csv(path)
            else:
                if not self._oor_warned:
                    print(
                        "WARNING: metrics_oor.csv not found - OOR data unavailable. "
                        "Run full pipeline first."
                    )
                    self._oor_warned = True
        return self._oor

    def pitch_df(self) -> pd.DataFrame | None:
        if self._pitch is None:
            self._pitch = load("metrics_pitching_score.csv")
        return self._pitch

    def sp_ytd(self) -> pd.DataFrame | None:
        if self._sp_ytd is None:
            self._sp_ytd, _ = resolve_sp_df("YTD")
        return self._sp_ytd

    def sp_l14(self) -> pd.DataFrame | None:
        if self._sp_l14 is None:
            self._sp_l14, _ = resolve_sp_df("L14")
        return self._sp_l14

    def raw_bundle(self, split_label: str) -> dict[str, pd.DataFrame | None]:
        key = split_label
        if key not in self._raw_cache:
            self._raw_cache[key] = {
                "std": load(f"{split_label}_standard.csv"),
                "bb": load(f"{split_label}_batted_ball.csv"),
                "savant": load(f"savant_{split_label}.csv") or load("savant_team_leaderboard.csv"),
            }
        return self._raw_cache[key]

    def row(self, df: pd.DataFrame | None, team: str) -> dict | None:
        if df is None or df.empty:
            return None
        m = df[df["Tm"].astype(str).str.upper() == team.upper()]
        if m.empty:
            return None
        return m.iloc[0].to_dict()

    def build_sub_metrics(self, team: str, split_label: str) -> SubMetricDetail:
        bundle = self.raw_bundle(split_label)
        std, sav = bundle.get("std"), bundle.get("savant")
        if std is None or sav is None:
            return SubMetricDetail()
        std_t = std[std["Tm"].astype(str).str.upper() == team.upper()]
        sav_t = sav[sav["Tm"].astype(str).str.upper() == team.upper()]
        if std_t.empty:
            return SubMetricDetail()
        std_row = std_t.iloc[0]
        sav_row = sav_t.iloc[0] if not sav_t.empty else None
        try:
            abq_df = calc_abq(std_t, sav_t if not sav_t.empty else sav)
            rcv_df = calc_rcv(std_t, bundle.get("bb") or std_t, sav_t if not sav_t.empty else sav)
            obr_df = calc_obr(std_t, sav_t if not sav_t.empty else sav)
            osi_df = calc_osi(abq_df, rcv_df, obr_df)
            row = osi_df.iloc[0]
        except Exception:
            return SubMetricDetail()

        detail = SubMetricDetail(
            abq_discipline=num_value(row.get("discipline")) if "discipline" in row else None,
            rcv_wrc=num_value(std_row.get("wRC+")),
            obr_xwoba=num_value(sav_row.get("xwOBA")) if sav_row is not None else None,
            obr_bb=num_value(std_row.get("BB%")),
            raw={"wRC+": std_row.get("wRC+"), "ISO": std_row.get("ISO")},
        )
        if sav_row is not None:
            detail.raw.update({
                "Chase%": sav_row.get("Chase%"),
                "ZCon%": sav_row.get("ZCon%"),
                "OCon%": sav_row.get("OCon%"),
                "SwStr%": sav_row.get("SwStr%"),
                "Barrel%": sav_row.get("Barrel%"),
                "HardHit%": sav_row.get("HardHit%"),
            })
        # Component reconstruction from single-team frames
        std_one = std_t.copy()
        if sav_t is None or sav_t.empty:
            return detail
        sav_one = sav_t.copy()
        if not sav_one.empty:
            from core.config import ABQ_CONTACT_WEIGHTS, ABQ_DISCIPLINE_WEIGHTS, ABQ_WEIGHTS

            std_one["K%"] = clean_pct(std_one["K%"])
            std_one["BB%"] = clean_pct(std_one["BB%"])
            sav_one["Chase%"] = pd.to_numeric(sav_one["Chase%"], errors="coerce")
            sav_one["ZCon%"] = pd.to_numeric(sav_one["ZCon%"], errors="coerce")
            sav_one["OCon%"] = pd.to_numeric(sav_one["OCon%"], errors="coerce")
            sav_one["SwStr%"] = pd.to_numeric(sav_one["SwStr%"], errors="coerce")
            bb_n = float(normalize(std_one["BB%"]).iloc[0])
            chase_inv = float(invert(sav_one["Chase%"].fillna(std_one["K%"] * 100)).iloc[0])
            z_n = float(normalize(sav_one["ZCon%"].fillna(80)).iloc[0])
            o_n = float(normalize(sav_one["OCon%"].fillna(60)).iloc[0])
            detail.abq_discipline = (
                ABQ_DISCIPLINE_WEIGHTS["bb_pct"] * bb_n
                + ABQ_DISCIPLINE_WEIGHTS["chase_inv"] * chase_inv
            )
            detail.abq_contact = (
                ABQ_CONTACT_WEIGHTS["zcon"] * z_n + ABQ_CONTACT_WEIGHTS["ocon"] * o_n
            )
            detail.abq_pitch_pressure = float(
                invert(sav_one["SwStr%"].fillna(std_one["K%"] * 100)).iloc[0]
            )
            detail.abq_k_avoid = float(invert(std_one["K%"]).iloc[0])
            detail.rcv_barrel = float(
                normalize(
                    pd.to_numeric(sav_one["Barrel%"], errors="coerce").fillna(8)
                ).iloc[0]
            )
            detail.rcv_iso = float(normalize(std_one["ISO"]).iloc[0])
            detail.rcv_hard = float(
                normalize(
                    pd.to_numeric(sav_one["HardHit%"], errors="coerce").fillna(38)
                ).iloc[0]
            )
        detail.rcv_wrc = float(normalize(pd.to_numeric(std_one["wRC+"], errors="coerce")).iloc[0])
        if sav_row is not None:
            detail.obr_xwoba = float(
                normalize(pd.to_numeric(sav_one["xwOBA"], errors="coerce")).iloc[0]
            )
        detail.obr_bb = float(normalize(std_one["BB%"]).iloc[0])
        return detail

    def team_snapshot(
        self,
        team: str,
        opts: DashboardOptions,
        split_override: str | None = None,
    ) -> TeamSnapshot:
        hand = normalize_hand(opts.hand)
        split = split_override or (split_for_hand(hand) if hand != "both" else "vs_RHP")
        df, src = resolve_metrics_df(opts.window, split)
        reliability = "high" if opts.window == "YTD" or src.endswith(f"_{opts.window}.csv") else "medium"
        if df is None:
            raise FileNotFoundError(
                f"No metrics file for {team} window={opts.window} split={split}. "
                f"Run pipeline compute first (expected under {DATA_DIR})."
            )

        row = self.row(df, team)
        if row is None:
            raise ValueError(f"Team {team} not found in {src}")

        rhp_df, _ = resolve_metrics_df(opts.window, "vs_RHP")
        lhp_df, _ = resolve_metrics_df(opts.window, "vs_LHP")
        rhp_row = self.row(rhp_df, team)
        lhp_row = self.row(lhp_df, team)

        abq = num_value(row.get("ABQ"))
        rcv = num_value(row.get("RCV"))
        obr = num_value(row.get("OBR"))
        osi = num_value(row.get("OSI"))
        proj = num_value(row.get("projOSI"))
        reg = num_value(row.get("reg_signal"))

        pals_row = self.row(self.pals_df(), team)
        oor_row = self.row(self.oor_df(), team)
        pitch_row = self.row(self.pitch_df(), team)

        pals = num_value(pals_row.get("PALS")) if pals_row else None
        pp_gap = (abq - rcv) if abq is not None and rcv is not None else None
        df_gap = (rcv - obr) if rcv is not None and obr is not None else None

        weights = opts.osi_weights or OSI_WEIGHTS
        custom_osi = opts.osi_weights is not None
        if custom_osi and all(v is not None for v in (abq, rcv, obr)):
            osi = weights["rcv"] * rcv + weights["abq"] * abq + weights["obr"] * obr
            if reg is not None:
                proj = osi + reg
            elif proj is None:
                proj = osi

        arch = rcv_archetype(rcv, obr)
        arch_info = ARCHETYPE_NAMES.get(arch, {})

        if hand == "both" and rhp_row and lhp_row:
            osi = _avg(num_value(rhp_row.get("OSI")), num_value(lhp_row.get("OSI")))
            abq = _avg(num_value(rhp_row.get("ABQ")), num_value(lhp_row.get("ABQ")))
            rcv = _avg(num_value(rhp_row.get("RCV")), num_value(lhp_row.get("RCV")))
            obr = _avg(num_value(rhp_row.get("OBR")), num_value(lhp_row.get("OBR")))
            proj = _avg(num_value(rhp_row.get("projOSI")), num_value(lhp_row.get("projOSI")))
            pp_gap = (abq - rcv) if abq is not None and rcv is not None else pp_gap
            df_gap = (rcv - obr) if rcv is not None and obr is not None else df_gap
            arch = rcv_archetype(rcv, obr)

        snap = TeamSnapshot(
            team=team,
            window=opts.window,
            hand=hand,
            source_file=src,
            abq=abq,
            rcv=rcv,
            obr=obr,
            osi=osi,
            proj_osi=proj,
            reg_signal=reg,
            pals=pals,
            pp_gap=pp_gap,
            df_gap=df_gap,
            abq_vs_rhp=num_value(rhp_row.get("ABQ")) if rhp_row else None,
            abq_vs_lhp=num_value(lhp_row.get("ABQ")) if lhp_row else None,
            osi_vs_rhp=num_value(rhp_row.get("OSI")) if rhp_row else None,
            osi_vs_lhp=num_value(lhp_row.get("OSI")) if lhp_row else None,
            rcv_vs_rhp=num_value(rhp_row.get("RCV")) if rhp_row else None,
            rcv_vs_lhp=num_value(lhp_row.get("RCV")) if lhp_row else None,
            obr_vs_rhp=num_value(rhp_row.get("OBR")) if rhp_row else None,
            obr_vs_lhp=num_value(lhp_row.get("OBR")) if lhp_row else None,
            oor=num_value(oor_row.get("OOR")) if oor_row else None,
            hvp=num_value(oor_row.get("HvP")) if oor_row else None,
            hvr=num_value(oor_row.get("HvR")) if oor_row else None,
            hvl=num_value(oor_row.get("HvL")) if oor_row else None,
            pitch_score_team=num_value(pitch_row.get("PitchScore")) if pitch_row else None,
            archetype_key=arch,
            archetype_label=arch_info.get("label", arch),
            archetype_desc=arch_info.get("description", ""),
            sub=self.build_sub_metrics(team, split),
            reliability=reliability,
            custom_osi=custom_osi,
        )
        return snap

    def window_osi_row(self, team: str, window: str, hand: str) -> dict:
        opts = DashboardOptions(window=window, hand=hand)
        try:
            s = self.team_snapshot(team, opts)
            head = s.osi if not opts.projected else s.proj_osi
            return {
                "window": window,
                "osi": s.osi,
                "pals": s.pals,
                "proj_osi": s.proj_osi,
                "headline": head,
                "source": s.source_file,
                "ok": True,
            }
        except (FileNotFoundError, ValueError):
            return {"window": window, "osi": None, "pals": None, "proj_osi": None, "headline": None, "ok": False}

    def pitcher_snapshot(
        self,
        name: str,
        team: str | None,
        hand: str | None,
    ) -> PitcherSnapshot:
        sp = self.sp_ytd()
        if sp is None or sp.empty:
            raise FileNotFoundError("sp_standard.csv not found -- run FanGraphs scrape first.")
        matched = match_pitcher_name(name, sp["Name"])
        if not matched:
            raise ValueError(f"Pitcher not found: {name}")
        row = sp[sp["Name"] == matched].iloc[0]
        p_hand = pitcher_hand_code(hand or row.get("Hand") or row.get("Throws") or "R")
        tm = team or str(row.get("Tm", "")).strip() or None
        if tm and "Tms" in tm:
            tm = None

        k = pct_value(row.get("K%"))
        bb = pct_value(row.get("BB%"))
        hr9 = num_value(row.get("HR/9"))
        fip = num_value(row.get("FIP"))
        ip = num_value(row.get("IP"))

        from core.compute_pitching import evaluate_pitcher_staleness

        sp14 = self.sp_l14()
        l14_row = None
        if sp14 is not None:
            m14 = match_pitcher_name(name, sp14["Name"])
            if m14:
                l14_row = sp14[sp14["Name"] == m14].iloc[0]

        st = evaluate_pitcher_staleness(row, l14_row)
        k14 = st["k_pct_l14"]
        bb14 = st["bb_pct_l14"]
        hr14 = st["hr9_l14"]
        staleness = st["staleness_warning"]

        ps = None
        if tm:
            pr = self.row(self.pitch_df(), tm)
            if pr:
                ps = num_value(pr.get("PitchScore"))

        if ps is None and all(v is not None for v in (k, bb, hr9)):
            ps = _pitcher_individual_score(sp, matched)

        vs_lhh, vs_rhh = _pitcher_platoon_rows(sp, matched)

        rel = "high" if ip and ip >= 30 else ("medium" if ip and ip >= 15 else "low")

        return PitcherSnapshot(
            name=matched,
            team=tm,
            hand=p_hand,
            k_pct=k,
            bb_pct=bb,
            hr9=hr9,
            fip=fip,
            ip=ip,
            pitch_score=ps,
            k_pct_l14=k14,
            bb_pct_l14=bb14,
            hr9_l14=hr14,
            vs_lhh=vs_lhh,
            vs_rhh=vs_rhh,
            stale=st["stale"],
            staleness=staleness,
            staleness_warning=st["staleness_warning"],
            data_source=st["data_source"],
            l14_starts=st["l14_starts"],
            reliability=rel if st["data_source"] == "L14" else "medium",
        )

    def team_metrics_from_snapshot(self, snap: TeamSnapshot, for_platoon: bool = False) -> TeamMetrics:
        return TeamMetrics(
            team=snap.team,
            abq=snap.abq,
            rcv=snap.rcv,
            obr=snap.obr,
            osi=snap.osi,
            proj_osi=snap.proj_osi,
            pp_gap=snap.pp_gap,
            abq_vs_rhp=snap.abq_vs_rhp,
            abq_vs_lhp=snap.abq_vs_lhp,
            pals=snap.pals,
            pitch_score=snap.pitch_score_team,
            oor=snap.oor,
            hvp=snap.hvp,
        )

    def load_matchup_row(self, away: str, home: str) -> dict | None:
        path = DATA_DIR / "today_matchups.csv"
        if not path.is_file():
            return None
        df = pd.read_csv(path)
        for col_a, col_h in [("Away", "Home"), ("away", "home"), ("Away_Team", "Home_Team")]:
            if col_a in df.columns and col_h in df.columns:
                m = df[
                    (df[col_a].astype(str).str.upper() == away)
                    & (df[col_h].astype(str).str.upper() == home)
                ]
                if not m.empty:
                    return m.iloc[0].to_dict()
        return None

    def build_matchup_context(
        self,
        away: str,
        home: str,
        away_sp: str,
        home_sp: str,
        opts: DashboardOptions,
    ) -> MatchupContext:
        rhp, _ = resolve_metrics_df(opts.window, "vs_RHP")
        lhp, _ = resolve_metrics_df(opts.window, "vs_LHP")
        if rhp is None or lhp is None:
            raise FileNotFoundError("metrics_vs_RHP / metrics_vs_LHP required for matchup mode.")

        pals = self.pals_df()
        pitch = self.pitch_df()
        oor = self.oor_df()

        away_snap = self.team_snapshot(away, opts)
        home_snap = self.team_snapshot(home, opts)

        away_hand = pitcher_hand_code(
            opts.opponent_pitcher.hand if opts.opponent_pitcher else None
        )
        # away lineup faces home SP
        home_pitcher = opts.opponent_pitcher or PitcherMetrics(
            home_sp, "R", None, None, None, None
        )
        away_pitcher = PitcherMetrics(away_sp, "R", None, None, None, None)

        row = self.load_matchup_row(away, home)
        if row:
            home_pitcher = PitcherMetrics(
                str(row.get("Home_SP", home_sp)),
                str(row.get("Home_Hand", row.get("Home_SP_Hand", "R"))).upper()[:1] or "R",
                pct_value(row.get("Home_K%")),
                pct_value(row.get("Home_BB%")),
                num_value(row.get("Home_HR9")),
                num_value(row.get("Home_FIP")),
            )
            away_pitcher = PitcherMetrics(
                str(row.get("Away_SP", away_sp)),
                str(row.get("Away_Hand", row.get("Away_SP_Hand", "R"))).upper()[:1] or "R",
                pct_value(row.get("Away_K%")),
                pct_value(row.get("Away_BB%")),
                num_value(row.get("Away_HR9")),
                num_value(row.get("Away_FIP")),
            )
        else:
            try:
                hp = self.pitcher_snapshot(home_sp, home, None)
                ap = self.pitcher_snapshot(away_sp, away, None)
                home_pitcher = PitcherMetrics(
                    hp.name, hp.hand, hp.k_pct, hp.bb_pct, hp.hr9, hp.fip
                )
                away_pitcher = PitcherMetrics(
                    ap.name, ap.hand, ap.k_pct, ap.bb_pct, ap.hr9, ap.fip
                )
            except (FileNotFoundError, ValueError):
                pass

        away_full = build_team_metrics(away, rhp, rhp, lhp, pals, pitch, oor)
        home_full = build_team_metrics(home, lhp, rhp, lhp, pals, pitch, oor)
        _merge_snap_into_metrics(away_full, away_snap)
        _merge_snap_into_metrics(home_full, home_snap)

        away_lineup = team_metrics_for_hand(away, home_pitcher.hand, rhp, lhp)
        home_lineup = team_metrics_for_hand(home, away_pitcher.hand, rhp, lhp)
        _merge_snap_into_metrics(away_lineup, away_snap)
        _merge_snap_into_metrics(home_lineup, home_snap)

        return MatchupContext(
            game_id=None,
            away=away,
            home=home,
            away_lineup=away_lineup,
            home_lineup=home_lineup,
            away_team=away_full,
            home_team=home_full,
            away_pitcher=away_pitcher,
            home_pitcher=home_pitcher,
        )


def _avg(a: float | None, b: float | None) -> float | None:
    if a is None and b is None:
        return None
    if a is None:
        return b
    if b is None:
        return a
    return (a + b) / 2


def _merge_snap_into_metrics(tm: TeamMetrics, snap: TeamSnapshot) -> None:
    if tm.pals is None:
        tm.pals = snap.pals
    if tm.abq_vs_rhp is None:
        tm.abq_vs_rhp = snap.abq_vs_rhp
    if tm.abq_vs_lhp is None:
        tm.abq_vs_lhp = snap.abq_vs_lhp
    if tm.osi is None:
        tm.osi = snap.osi
    if tm.proj_osi is None:
        tm.proj_osi = snap.proj_osi


def _pitcher_individual_score(sp: pd.DataFrame, name: str) -> float | None:
    from core.config import PITCHING_WEIGHTS
    from core.metrics_utils import invert, normalize

    df = sp.copy()
    df = df[~df["Tm"].astype(str).str.contains("Tms", na=False)]
    df["K%"] = clean_pct(df["K%"])
    df["BB%"] = clean_pct(df["BB%"])
    df["HR/9"] = pd.to_numeric(df["HR/9"], errors="coerce")
    df = df.dropna(subset=["K%", "BB%", "HR/9"])
    if df.empty:
        return None
    df["k_n"] = normalize(df["K%"])
    df["bb_n"] = invert(df["BB%"])
    df["hr_n"] = invert(df["HR/9"])
    w = PITCHING_WEIGHTS
    df["ps"] = w["k_pct"] * df["k_n"] + w["inv_bb_pct"] * df["bb_n"] + w["inv_hr9"] * df["hr_n"]
    m = df[df["Name"] == name]
    if m.empty:
        return None
    return round(float(m.iloc[0]["ps"]), 1)


def _pitcher_platoon_rows(sp: pd.DataFrame, name: str) -> tuple[dict, dict]:
    rows = sp[sp["Name"] == name]
    base = {
        "K%": pct_value(rows.iloc[0].get("K%")) if len(rows) else None,
        "BB%": pct_value(rows.iloc[0].get("BB%")) if len(rows) else None,
        "HR/9": num_value(rows.iloc[0].get("HR/9")) if len(rows) else None,
    }
    if "Split" not in sp.columns:
        return base, base
    lhh = rows[rows["Split"].astype(str).str.contains("L", case=False, na=False)]
    rhh = rows[rows["Split"].astype(str).str.contains("R", case=False, na=False)]
    if lhh.empty or rhh.empty:
        return base, base

    def pack(r):
        return {
            "K%": pct_value(r.get("K%")),
            "BB%": pct_value(r.get("BB%")),
            "HR/9": num_value(r.get("HR/9")),
        }

    return pack(lhh.iloc[0]), pack(rhh.iloc[0])


# ── Signals & convergence ─────────────────────────────────────────────────────

SIGNAL_EVALUATORS = [
    ("K% vs OBR", None),
    ("BB% vs ABQ", None),
    ("HR/9 vs RCV", None),
    ("OSI vs Pitching Score", None),
    ("PALS + projOSI", None),
    ("OBR + BB%", None),
    ("ABQ platoon", None),
    ("RCV archetype", None),
    ("Schedule context", None),
]


def run_signals_for_side(
    offense: TeamMetrics,
    offense_platoon: TeamMetrics,
    pitcher: PitcherMetrics,
    opponent: TeamMetrics,
    opp_pitch_score: float | None,
    opts: DashboardOptions,
) -> list[dict]:
    all_sigs = evaluate_matchup_side(
        offense, offense_platoon, pitcher, opponent, opp_pitch_score
    )
    pp = signal_pp_gap(offense_platoon)
    combined = all_sigs + [pp]

    if opts.signal_indices:
        allowed = {SIGNAL_NAMES[i - 1] for i in opts.signal_indices if 1 <= i <= 9}
        allowed.add("PP-Gap")
        name_map = {"ABQ split gap + handedness": "ABQ platoon"}
        filtered = []
        for s in combined:
            nm = s["signal_name"]
            display = name_map.get(nm, nm)
            if display in allowed or nm in allowed:
                filtered.append(s)
        combined = filtered
    return combined


def convergence_panel(signals: list[dict], threshold: int) -> dict:
    fired = [s for s in signals if s.get("fired")]
    weighted = sum(signal_weight(s.get("signal_name", "")) for s in fired)
    direction_scores: dict[str, float] = {}
    for s in fired:
        d = s.get("direction") or "neutral"
        w = signal_weight(s.get("signal_name", ""))
        direction_scores[d] = direction_scores.get(d, 0.0) + w
    direction = max(direction_scores, key=direction_scores.get) if direction_scores else "none"
    return {
        "convergence_count": weighted,
        "convergence_direction": direction,
        "is_convergence_play": weighted >= threshold,
        "signals_fired": len(fired),
        "threshold": threshold,
    }


def primary_score(snap: TeamSnapshot, projected: bool) -> float | None:
    if projected and snap.proj_osi is not None:
        return snap.proj_osi
    return snap.osi


def market_implication(snap: TeamSnapshot) -> str:
    if snap.proj_osi is None or snap.osi is None:
        return "projOSI unavailable -- market lean indeterminate."
    delta = snap.proj_osi - snap.osi
    if delta >= 3:
        return (
            f"projOSI {fmt(snap.proj_osi)} runs {delta:+.1f} above OSI {fmt(snap.osi)} -- "
            "process/xStats ahead of box score; market may be slow to price improvement (buy-low lean)."
        )
    if delta <= -3:
        return (
            f"projOSI {fmt(snap.proj_osi)} runs {delta:+.1f} below OSI {fmt(snap.osi)} -- "
            "results ahead of underlying process; regression risk to the under on totals."
        )
    return (
        f"projOSI {fmt(snap.proj_osi)} aligned with OSI {fmt(snap.osi)} -- "
        "market and process largely in sync."
    )


def bet_angle_matrix(
    signals: list[dict],
    conv: dict,
    snap: TeamSnapshot,
    side_label: str = "lineup",
) -> dict[str, dict]:
    fired = [s for s in signals if s.get("fired")]
    headline = primary_score(snap, True)
    osi = snap.osi
    pals = snap.pals

    def lean_from_direction(default: str = "neutral") -> str:
        if conv["is_convergence_play"]:
            d = conv["convergence_direction"]
            if d in ("lineup", "high"):
                return "toward offense"
            if d in ("pitching", "low"):
                return "toward pitching"
            if d == "hot":
                return "fade pitcher / over lean"
            if d == "cold":
                return "back pitcher / under lean"
        return default

    matrix = {}
    for bt in ("ML", "Run Line", "F5", "Over", "Under"):
        matrix[bt] = {"lean": "neutral", "confidence": "low", "note": ""}

    if conv["is_convergence_play"]:
        for bt in matrix:
            matrix[bt]["confidence"] = "high" if conv["convergence_count"] >= conv["threshold"] + 2 else "medium"

    if headline and pals:
        if headline > (pals or 0) + 2:
            matrix["ML"]["lean"] = f"back {side_label}"
            matrix["ML"]["note"] = "OSI/PALS stack favors offensive side."
        elif headline < (pals or 0) - 2:
            matrix["ML"]["lean"] = "caution on offense"
            matrix["ML"]["note"] = "PALS ahead of OSI -- production may lag process."

    for s in fired:
        angle = (s.get("bet_angle") or "").lower()
        nm = s.get("signal_name", "")
        if "over" in angle or "offense" in angle:
            matrix["Over"]["lean"] = "over"
            matrix["Over"]["note"] = s.get("verdict_text", "")[:80]
        if "under" in angle or "pitcher" in angle:
            matrix["Under"]["lean"] = "under"
            matrix["Under"]["note"] = s.get("verdict_text", "")[:80]
        if "walk" in angle:
            matrix["F5"]["lean"] = "over F5 runs"
            matrix["F5"]["note"] = "Process / traffic signal (BB% vs ABQ)."
        if "hr" in angle or "power" in angle:
            matrix["Run Line"]["lean"] = f"{side_label} RL +"
            matrix["Run Line"]["note"] = nm
        if "buy-low" in angle:
            matrix["ML"]["lean"] = f"{side_label} ML value"
            matrix["ML"]["note"] = "PALS + projOSI convergence."

    base = lean_from_direction()
    if base != "neutral":
        matrix["ML"]["lean"] = base
        matrix["Run Line"]["lean"] = base

    if snap.pp_gap and snap.pp_gap > 4:
        matrix["F5"]["lean"] = "F5 over lean"
        matrix["F5"]["note"] = (matrix["F5"]["note"] or "") + " PP-Gap process edge."

    if snap.df_gap and snap.df_gap > 8:
        matrix["Over"]["confidence"] = "medium"
        matrix["Over"]["note"] = (matrix["Over"]["note"] or "") + " DF-Gap power variance."

    return matrix


# ── Narrative (verbose language rules) ────────────────────────────────────────

def build_verdict(
    mode: str,
    snap: TeamSnapshot | None,
    conv: dict,
    signals: list[dict],
    opts: DashboardOptions,
    extra: str = "",
) -> tuple[str, str, str]:
    """Returns (v0, v1, v2) verdict strings."""
    fired = [s for s in signals if s.get("fired")]
    head = primary_score(snap, opts.projected) if snap else None
    pals = snap.pals if snap else None
    arch = snap.archetype_label if snap else "--"
    osi = snap.osi if snap else None
    proj = snap.proj_osi if snap else None

    v0_parts = []
    if conv.get("is_convergence_play"):
        v0_parts.append(
            f"CONVERGENCE PLAY ({conv['convergence_count']}/{conv['threshold']}, "
            f"{conv['convergence_direction']})."
        )
    if snap and head is not None and pals is not None:
        v0_parts.append(
            f"{snap.team} OSI {fmt(osi)} / PALS {fmt(pals)} with {arch} archetype -- "
            f"{len(fired)} active signals."
        )
    else:
        v0_parts.append(f"{len(fired)} signals fired; see matrix.")
    v0 = " ".join(v0_parts) if v0_parts else "Insufficient data for verdict."

    v1 = []
    if conv.get("is_convergence_play"):
        v1.append(
            f"**CONVERGENCE PLAY** -- weighted count {conv['convergence_count']} "
            f"(threshold {conv['threshold']}), direction `{conv['convergence_direction']}`."
        )
    if snap:
        v1.append(
            f"{snap.team} pairs OSI {fmt(osi)} with PALS {fmt(pals)} on {snap.window} "
            f"({snap.hand} split view); headline {'projOSI' if opts.projected else 'OSI'} "
            f"{fmt(head)}."
        )
        v1.append(market_implication(snap))
        v1.append(
            f"Offensive shape reads as **{arch}** ({snap.archetype_key}) -- "
            f"not isolated ABQ/RCV prints."
        )
        if snap.pp_gap is not None:
            v1.append(f"PP-Gap {snap.pp_gap:+.1f} (process vs production); DF-Gap {fmt(snap.df_gap)}.")
    for s in sorted(fired, key=lambda x: -x.get("magnitude", 0))[:4]:
        v1.append(f"• {s['signal_name']}: {s['verdict_text']}")
    if snap and snap.reliability != "high":
        v1.append(
            f"Sample-size caveat: {snap.window} data reliability `{snap.reliability}` -- "
            "confirm before sizing."
        )
    if extra:
        v1.append(extra)
    v1_text = "\n".join(v1)

    audit = []
    audit.append("AUDIT TRAIL")
    if snap:
        audit.append(f"  source={snap.source_file} team={snap.team} window={snap.window}")
        audit.append(
            f"  ABQ={fmt(snap.abq)} RCV={fmt(snap.rcv)} OBR={fmt(snap.obr)} "
            f"OSI={fmt(snap.osi)} projOSI={fmt(snap.proj_osi)} reg={fmt(snap.reg_signal)}"
        )
        audit.append(f"  PALS={fmt(snap.pals)} OOR={fmt(snap.oor)} HvP={fmt(snap.hvp)}")
    audit.append(f"  signals_evaluated={len(signals)} fired={len(fired)}")
    for s in signals:
        audit.append(
            f"    [{ 'F' if s.get('fired') else '·' }] {s['signal_name']}: "
            f"dir={s.get('direction')} mag={s.get('magnitude')} angle={s.get('bet_angle')}"
        )
    audit.append(f"  convergence={conv}")
    if extra:
        audit.append(f"  notes={extra}")
    v2 = "\n".join(audit)

    return v0, v1_text, v2


# ── Render sections ───────────────────────────────────────────────────────────

def render_pitcher_staleness(ps: PitcherSnapshot) -> None:
    """Section 1 -- L14 vs season staleness for pitcher mode."""
    subsection("1. Staleness Check (L14 vs season)")
    source_lbl = ps.data_source.upper() if ps.data_source else "SEASON"
    print(f"  Operative data source: {source_lbl} ({ps.l14_starts} L14 starts)")
    print(f"  {'Stat':<8} {'Season':>10} {'L14':>10} {'Δ':>8}")
    for label, season, recent in (
        ("K%", ps.k_pct, ps.k_pct_l14),
        ("BB%", ps.bb_pct, ps.bb_pct_l14),
        ("HR/9", ps.hr9, ps.hr9_l14),
    ):
        delta = (recent - season) if season is not None and recent is not None else None
        print(
            f"  {label:<8} {fmt(season):>10} {fmt(recent):>10} "
            f"{fmt(delta, 2) if delta is not None else '--':>8}"
        )
    if ps.stale:
        print()
        print("  *** STALE DATA WARNING ***")
        print(f"  {ps.staleness_warning}")
    else:
        print(f"  Status: {ps.staleness_warning or 'Within drift thresholds.'}")


def render_header_lineup(snap: TeamSnapshot, opts: DashboardOptions) -> None:
    section("LINEUP MODE")
    hand_lbl = {"R": "vs RHP", "L": "vs LHP", "both": "both splits"}.get(snap.hand, snap.hand)
    weight_badge = ""
    if opts.osi_weights:
        w = opts.osi_weights
        weight_badge = f"  [custom OSI weights: RCV {w['rcv']:.0%} | ABQ {w['abq']:.0%} | OBR {w['obr']:.0%}]"
    print(f"  {snap.team}  |  window {snap.window}  |  {hand_lbl}  |  source: {snap.source_file}{weight_badge}")


def render_osi_dashboard(snap: TeamSnapshot, opts: DashboardOptions) -> None:
    subsection("OSI Dashboard")
    head = primary_score(snap, opts.projected)
    label = "projOSI" if opts.projected else "OSI"
    tier = tier_label(head, OSI_TIERS)
    pp_dir = "process > production" if (snap.pp_gap or 0) > 0 else "production > process"
    print(f"  {label}: {fmt(head)}  ({tier})")
    pals_display = fmt(snap.pals) if snap.pals is not None else "awaiting pipeline run"
    print(f"  OSI: {fmt(snap.osi)}  |  PALS: {pals_display}  |  projOSI: {fmt(snap.proj_osi)}")
    print(f"  PP-Gap: {fmt(snap.pp_gap, 1, '')} ({pp_dir})")
    print(f"  {market_implication(snap)}")


def render_platoon(snap: TeamSnapshot, opts: DashboardOptions, opp_hand: str | None) -> None:
    subsection("Platoon Analysis")
    print(f"  {'Split':<12} {'ABQ':>8} {'RCV':>8} {'OBR':>8} {'OSI':>8}")
    for label, abq, rcv, obr, osi in (
        ("vs RHP", snap.abq_vs_rhp, snap.rcv_vs_rhp, snap.obr_vs_rhp, snap.osi_vs_rhp),
        ("vs LHP", snap.abq_vs_lhp, snap.rcv_vs_lhp, snap.obr_vs_lhp, snap.osi_vs_lhp),
    ):
        print(f"  {label:<12} {fmt(abq):>8} {fmt(rcv):>8} {fmt(obr):>8} {fmt(osi):>8}")
    if snap.abq_vs_rhp is not None and snap.abq_vs_lhp is not None:
        gap = abs(snap.abq_vs_rhp - snap.abq_vs_lhp)
        dom = "RHP" if snap.abq_vs_rhp > snap.abq_vs_lhp else "LHP"
        align = "--"
        if opp_hand:
            oh = pitcher_hand_code(opp_hand)
            align = (
                f"ALIGNED vs {oh}HP ({dom} hitters)"
                if (oh == "R" and dom == "RHP") or (oh == "L" and dom == "LHP")
                else f"MISALIGNED vs {oh}HP (best {dom} side)"
            )
        print(f"  ABQ platoon gap: {gap:.1f}  |  dominant: {dom}  |  {align}")
    if opts.platoon_detail:
        print("  Platoon detail: compare lineup construction to dominant split before ML/total bets.")


def render_submetrics(snap: TeamSnapshot, opts: DashboardOptions) -> None:
    subsection("Sub-Metric Breakdown")
    m = opts.metrics
    sub = snap.sub

    def show(name):
        key = name.upper().replace("-", "").replace(" ", "")
        aliases = {x.upper().replace("-", "") for x in m}
        return not m or key in aliases or name.upper() in aliases

    if show("ABQ"):
        print("  ABQ components:")
        print(f"    discipline:      {fmt(sub.abq_discipline)}")
        print(f"    contact_quality: {fmt(sub.abq_contact)}")
        print(f"    pitch_pressure:  {fmt(sub.abq_pitch_pressure)}")
        print(f"    k_avoidance:     {fmt(sub.abq_k_avoid)}")
        print(f"    composite ABQ:   {fmt(snap.abq)}")
    if show("RCV"):
        print("  RCV components:")
        print(f"    wRC+ norm:  {fmt(sub.rcv_wrc)}  |  Barrel norm: {fmt(sub.rcv_barrel)}")
        print(f"    ISO norm:   {fmt(sub.rcv_iso)}  |  HardHit norm: {fmt(sub.rcv_hard)}")
        print(f"    composite RCV: {fmt(snap.rcv)}")
    if show("OBR"):
        print("  OBR components:")
        print(f"    xwOBA norm: {fmt(sub.obr_xwoba)}  |  BB% norm: {fmt(sub.obr_bb)}")
        print(f"    composite OBR: {fmt(snap.obr)}")


def render_archetype(snap: TeamSnapshot) -> None:
    subsection("Archetype")
    print(f"  Grid: {snap.archetype_key}  →  {snap.archetype_label}")
    print(f"  {snap.archetype_desc}")
    bet_hints = []
    if "Boom" in snap.archetype_label or "Power" in snap.archetype_label:
        bet_hints.append("HR/team-total overs more viable when facing flyball arms.")
    if "OBP" in snap.archetype_label or "Table" in snap.archetype_label:
        bet_hints.append("Run-line / ML lean when paired with high walk environments.")
    if snap.archetype_key == "Mid/Mid":
        bet_hints.append("Neutral archetype -- lean on convergence signals, not shape alone.")
    if bet_hints:
        print("  Bet angle:")
        for h in bet_hints:
            print(f"    • {h}")


def render_window_compare(store: DataStore, team: str, hand: str) -> None:
    subsection("Window Comparison")
    print(f"  {'Window':<8} {'OSI':>8} {'PALS':>8} {'projOSI':>8} {'Headline':>8}  Source")
    for w in TIME_WINDOWS:
        row = store.window_osi_row(team, w, hand)
        flag = "" if row["ok"] else " (missing)"
        print(
            f"  {w:<8} {fmt(row['osi']):>8} {fmt(row['pals']):>8} "
            f"{fmt(row['proj_osi']):>8} {fmt(row['headline']):>8}  "
            f"{row.get('source', '--')}{flag}"
        )


def render_signals(signals: list[dict], verbose: int) -> None:
    subsection("Signals")
    ranked = sorted(signals, key=lambda s: (-int(s.get("fired", False)), -s.get("magnitude", 0)))
    print(f"  {'#':<3} {'Signal':<28} {'F':^3} {'Mag':>6} {'Dir':<10} Bet angle")
    for i, s in enumerate(ranked, 1):
        fired = "YES" if s.get("fired") else "no"
        print(
            f"  {i:<3} {s['signal_name']:<28} {fired:^3} "
            f"{s.get('magnitude', 0):>6.1f} {str(s.get('direction','')):<10} "
            f"{str(s.get('bet_angle',''))[:24]}"
        )
        if s.get("fired") and verbose >= 1:
            print(f"       → {s.get('verdict_text', '')}")


def render_convergence(conv: dict) -> None:
    subsection("Convergence Panel")
    flag = "✓ CONVERGENCE PLAY" if conv["is_convergence_play"] else "-- below threshold"
    print(f"  Weighted count: {conv['convergence_count']} / threshold {conv['threshold']}  {flag}")
    print(f"  Direction: {conv['convergence_direction']}  |  Raw signals fired: {conv['signals_fired']}")
    print(f"  (PP-Gap counts as {CONVERGENCE_PP_GAP_WEIGHT}x weight when fired)")


def render_bet_matrix(matrix: dict[str, dict], title: str = "Bet Angle Matrix") -> None:
    subsection(title)
    print(f"  {'Market':<12} {'Lean':<22} {'Conf':<8} Note")
    for bt, row in matrix.items():
        print(f"  {bt:<12} {row['lean']:<22} {row['confidence']:<8} {row.get('note','')[:32]}")


def render_verdict(v0: str, v1: str, v2: str, verbose: int) -> None:
    subsection("Verdict")
    if verbose <= 0:
        print(f"  {v0}")
    elif verbose == 1:
        for line in v1.split("\n"):
            print(f"  {line}")
    else:
        print(f"  {v0}")
        print()
        for line in v1.split("\n"):
            print(f"  {line}")
        print()
        for line in v2.split("\n"):
            print(f"  {line}")
