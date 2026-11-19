"""Strength indices shared by the NFL and CFB desks (2026-11-18): OSI, DSI, NSI.

The site's MLB desk has composite indices (ABQ, OBR, OSI). These are the
football versions, fitted at game level so they measure strength rather than
schedule: for every week shown, each later game's margin and each side's
EPA (PPA in college) per play were predicted from the two teams' inputs,
with weights held non-negative so the formula reads the way its inputs do.

Inputs per team, measured on games so far:
  off / def        this season's offense EPA per play and defense EPA allowed
  off_adj / def_adj the same, opponent-adjusted
  p_off / p_def    last season's opponent-adjusted figures
  m1               point margin per game so far
and the preseason reads a sport's weight table may add (2026-11-19):
  ret              CFB: share of last season's offensive PPA returning
  talent           CFB: the 247 team talent composite
  qb_epa / qb_league NFL: the current quarterback's last-season EPA per
                   dropback (shrunk toward replacement) and the league's
and (v3, 2026-11-19):
  elo              an Elo rating after the team's latest game (NFL: built from
                   nflverse results since 1999, outputs/nfl_elo.py; CFB: CFBD's)
  off_sr / def_sr  NFL success rate, offense and allowed
  off_nf / def_nf  NFL EPA per play with lost fumbles left out
  off_pass / off_rush / def_pass / def_rush  CFB passing and rushing PPA per play

  OSI = c + a . offense features + b . league-average defense features
        (the EPA per play this offense is expected to gain on an average defense)
  DSI = c + a . league-average offense features + b . this defense's features
        (the EPA per play it is expected to allow to an average offense)
  NSI = w . net features, centred on the league
        (points per game against an average team on a neutral field)

The feature lists come from the weight table (fit.offense_features,
fit.defense_features, fit.net_features); a table without them reads the
base inputs. Each index is also printed on a 100 scale: the league average is
100 and every 10 points is one standard deviation, with higher always better.
"""
from __future__ import annotations

OFF_INPUTS = ("off", "off_adj", "p_off")
DEF_INPUTS = ("def", "def_adj", "p_def")
NET_INPUTS = ("net", "net_adj", "p_net", "m1")
EXTRA_INPUTS = ("ret", "talent", "qb_epa", "elo", "off_sr", "def_sr")
HIGHER_BETTER = {"off", "off_adj", "p_off", "m1", "net", "net_adj", "p_net", "ret", "talent", "qb_epa", "elo",
                 "off_sr", "off_nf", "off_pass", "off_rush"}
TALENT_SCALE = 0.05  # talent z-score in per-play units for the OSI/DSI fit (scratch fit, 2026-11-19)


def scaled(values: dict[str, float], higher_better: bool) -> dict[str, dict]:
    """Value, the 100 scale and the place among the pool, for each team."""
    pool = list(values.values())
    mean = sum(pool) / len(pool)
    sd = (sum((v - mean) ** 2 for v in pool) / len(pool)) ** 0.5 or 1.0
    out = {}
    for team, v in values.items():
        z = (v - mean) / sd
        place = 1 + sum(1 for o in pool if (o > v + 1e-12 if higher_better else o < v - 1e-12))
        out[team] = {"value": round(v, 4), "index": round(100 + 10 * (z if higher_better else -z), 1),
                     "rank": place, "of": len(pool)}
    return out


def week_key(spec: dict, week: int) -> str:
    keys = sorted(int(k) for k in spec["weights"]["net"])
    return str(min(max(week, keys[0]), keys[-1]))


def features(inputs: dict[str, dict]) -> dict[str, dict]:
    """Each team's inputs plus every derived feature a weight table may name.

    p_off_r / p_net_r  last season's offense read through the share of its
                       production returning (centred on the pool)
    tal_off / tal_def / tal_net  the talent composite as a pool z-score
    qbp                the current quarterback's last-season EPA per dropback
                       against the league's
    A team without a preseason read takes what the fit gave it: the pool's
    middle returning share, the pool's lower-quartile talent, the league's
    quarterback figure."""
    rows = {t: dict(r) for t, r in inputs.items()}
    n = len(rows)
    mo = sum(r["p_off"] for r in rows.values()) / n
    md = sum(r["p_def"] for r in rows.values()) / n
    rets = sorted(r["ret"] for r in rows.values() if r.get("ret") is not None)
    ret_mid = rets[len(rets) // 2] if rets else 1.0
    # A school without a talent row takes the pool's lower quartile, as in the fit.
    tal = sorted(r["talent"] for r in rows.values() if r.get("talent") is not None)
    t_low = tal[int(0.25 * (len(tal) - 1))] if tal else None
    pool = [r["talent"] if r.get("talent") is not None else t_low for r in rows.values()] if tal else []
    t_mean = sum(pool) / len(pool) if pool else 0.0
    t_sd = (sum((x - t_mean) ** 2 for x in pool) / (len(pool) - 1)) ** 0.5 if len(pool) > 1 else 1.0
    elos = [r["elo"] for r in rows.values() if r.get("elo") is not None]
    e_mean = sum(elos) / len(elos) if elos else 0.0
    for r in rows.values():
        r["net"], r["net_adj"], r["p_net"] = r["off"] - r["def"], r["off_adj"] - r["def_adj"], r["p_off"] - r["p_def"]
        r["elo_c"] = ((r["elo"] if r.get("elo") is not None else e_mean) - e_mean) / 100.0
        for a, b, k in (("off_sr", "def_sr", "net_sr"), ("off_nf", "def_nf", "net_nf")):
            if r.get(a) is not None and r.get(b) is not None:
                r[k] = r[a] - r[b]
        ret = r["ret"] if r.get("ret") is not None else ret_mid
        r["p_off_r"] = (r["p_off"] - mo) * ret + mo
        r["p_net_r"] = (r["p_off"] - mo) * ret - (r["p_def"] - md)
        talent = r["talent"] if r.get("talent") is not None else t_low
        z = (talent - t_mean) / (t_sd or 1.0) if talent is not None else 0.0
        r["tal_off"], r["tal_def"], r["tal_net"] = TALENT_SCALE * z, -TALENT_SCALE * z, z
        r["qbp"] = (r["qb_epa"] - r["qb_league"]) if r.get("qb_epa") is not None and r.get("qb_league") is not None else 0.0
    return rows


def indices(inputs: dict[str, dict], spec: dict, week: int) -> dict[str, dict]:
    """{team: {"osi", "dsi", "nsi", "inputs", "weights"}} from each team's
    inputs and the week's weights."""
    cut = week_key(spec, week)
    fit = spec.get("fit") or {}
    o_feats = tuple(fit.get("offense_features") or OFF_INPUTS)
    d_feats = tuple(fit.get("defense_features") or DEF_INPUTS)
    n_feats = tuple(fit.get("net_features") or NET_INPUTS)
    rows = features(inputs)
    n = len(rows)
    # A feature a team has no reading for takes the pool's average.
    for k in set(o_feats + d_feats + n_feats):
        have = [r[k] for r in rows.values() if r.get(k) is not None]
        fill = sum(have) / len(have) if have else 0.0
        for r in rows.values():
            if r.get(k) is None:
                r[k] = fill
    mean = {k: sum(r[k] for r in rows.values()) / n for k in o_feats + d_feats}
    wo = spec["weights"]["off"][cut]
    c, a, b = wo[0], wo[1:1 + len(o_feats)], wo[1 + len(o_feats):1 + len(o_feats) + len(d_feats)]

    def off_part(r):
        return sum(w * r[k] for w, k in zip(a, o_feats))

    def def_part(r):
        return sum(w * r[k] for w, k in zip(b, d_feats))
    osi = scaled({t: c + off_part(r) + def_part(mean) for t, r in rows.items()}, True)
    dsi = scaled({t: c + off_part(mean) + def_part(r) for t, r in rows.items()}, False)
    wn = spec["weights"]["net"][cut]
    net = {t: sum(w * r[k] for w, k in zip(wn[1:], n_feats)) for t, r in rows.items()}
    centre = sum(net.values()) / n
    nsi = scaled({t: v - centre for t, v in net.items()}, True)
    shown = OFF_INPUTS + DEF_INPUTS + ("m1",) + tuple(
        k for k in EXTRA_INPUTS if any(r.get(k) is not None for r in inputs.values()))
    ranked = {}
    for k in shown:
        present = {t: r[k] for t, r in inputs.items() if r.get(k) is not None}
        if present:
            ranked[k] = scaled(present, k in HIGHER_BETTER)
    weights = {
        "osi": {"intercept": c, **dict(zip(o_feats, a)), **dict(zip(d_feats, b))},
        "nsi": {"home_field": wn[0], **dict(zip(n_feats, wn[1:]))},
    }
    return {t: {"osi": osi[t], "dsi": dsi[t], "nsi": nsi[t],
                "inputs": {k: ranked[k][t] for k in ranked if t in ranked[k]}, "weights": weights}
            for t in rows}
