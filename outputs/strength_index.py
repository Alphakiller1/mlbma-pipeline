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

  OSI = c + a . offense inputs + b . league-average defense inputs
        (the EPA per play this offense is expected to gain on an average defense)
  DSI = c + a . league-average offense inputs + b . this defense's inputs
        (the EPA per play it is expected to allow to an average offense)
  NSI = w . (net, net_adj, p_net, m1), centred on the league
        (points per game against an average team on a neutral field)

Each is also printed on a 100 scale: the league average is 100 and every 10
points is one standard deviation, with higher always better.
"""
from __future__ import annotations

OFF_INPUTS = ("off", "off_adj", "p_off")
DEF_INPUTS = ("def", "def_adj", "p_def")
NET_INPUTS = ("net", "net_adj", "p_net", "m1")
HIGHER_BETTER = {"off", "off_adj", "p_off", "m1", "net", "net_adj", "p_net"}


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


def indices(inputs: dict[str, dict], spec: dict, week: int) -> dict[str, dict]:
    """{team: {"osi", "dsi", "nsi", "inputs", "weights"}} from each team's
    inputs and the week's weights."""
    cut = week_key(spec, week)
    rows = {t: dict(r, net=r["off"] - r["def"], net_adj=r["off_adj"] - r["def_adj"], p_net=r["p_off"] - r["p_def"])
            for t, r in inputs.items()}
    n = len(rows)
    mean = {k: sum(r[k] for r in rows.values()) / n for k in OFF_INPUTS + DEF_INPUTS}
    wo = spec["weights"]["off"][cut]
    c, a, b = wo[0], wo[1:4], wo[4:7]

    def off_part(r):
        return sum(w * r[k] for w, k in zip(a, OFF_INPUTS))

    def def_part(r):
        return sum(w * r[k] for w, k in zip(b, DEF_INPUTS))
    osi = scaled({t: c + off_part(r) + def_part(mean) for t, r in rows.items()}, True)
    dsi = scaled({t: c + off_part(mean) + def_part(r) for t, r in rows.items()}, False)
    wn = spec["weights"]["net"][cut]
    net = {t: sum(w * r[k] for w, k in zip(wn[1:], NET_INPUTS)) for t, r in rows.items()}
    centre = sum(net.values()) / n
    nsi = scaled({t: v - centre for t, v in net.items()}, True)
    ranked = {k: scaled({t: r[k] for t, r in rows.items()}, k in HIGHER_BETTER)
              for k in OFF_INPUTS + DEF_INPUTS + ("m1",)}
    weights = {
        "osi": {"intercept": c, **dict(zip(OFF_INPUTS, a)), **dict(zip(DEF_INPUTS, b))},
        "nsi": {"home_field": wn[0], **dict(zip(NET_INPUTS, wn[1:]))},
    }
    return {t: {"osi": osi[t], "dsi": dsi[t], "nsi": nsi[t],
                "inputs": {k: ranked[k][t] for k in ranked}, "weights": weights}
            for t in rows}
