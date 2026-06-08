"""Show that aggregate pitching cells now spread across the palette instead of washing
to amber, by grading each population against (a) the OLD individual-pitcher baseline vs
(b) the NEW own-population baseline."""
import os, json
import numpy as np, pandas as pd
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D, DASH = os.path.join(ROOT, "data"), os.path.join(ROOT, "dashboard")

def num(s): return pd.to_numeric(s.astype(str).str.replace("%","",regex=False).str.strip(), errors="coerce")
lb = json.load(open(os.path.join(DASH, "league_baselines.json")))["baselines"]

EDGES = [-np.inf,-1.5,-0.85,-0.30,0.30,0.85,1.5,np.inf]
LAB = ["veryWeak","weak","belowAvg","average","aboveAvg","strong","elite"]
def buckets(vals, mean, std, hi=False):
    z = (np.asarray(vals,float)-mean)/std
    if not hi: z = -z
    idx = np.digitize(z, EDGES[1:-1])
    return {LAB[i]: int((idx==i).sum()) for i in range(7)}
def show(name, vals, old_ctx, new_ctx, hi=False):
    o, n = lb[old_ctx], lb[new_ctx]
    print(f"\n  {name} (n={len(vals)}, range [{min(vals):.2f},{max(vals):.2f}])")
    print(f"    OLD '{old_ctx}' (mean {o['mean']}/std {o['std']}): " +
          " ".join(f"{k}:{v}" for k,v in buckets(vals,o['mean'],o['std'],hi).items()))
    print(f"    NEW '{new_ctx}' (mean {n['mean']}/std {n['std']}): " +
          " ".join(f"{k}:{v}" for k,v in buckets(vals,n['mean'],n['std'],hi).items()))

bpu = pd.read_csv(os.path.join(D,"bullpen_unit.csv"))
show("Bullpen-unit ERA", num(bpu["overall_ERA"]).dropna().values, "era", "bp_era")
show("Bullpen-unit FIP", num(bpu["overall_FIP"]).dropna().values, "fip", "bp_fip")

# team staff ERA (IP-weighted)
sp = pd.read_csv(os.path.join(D,"sp_standard.csv"))
sp = sp[sp["Tm"].notna() & ~sp["Tm"].astype(str).str.contains("Tms",na=False)].copy()
sp["IP"]=num(sp["IP"]); sp["ERA"]=num(sp["ERA"]); sp=sp[sp["IP"]>0].dropna(subset=["ERA","IP"])
team_era = sp.groupby("Tm").apply(lambda x:(x.ERA*x.IP).sum()/x.IP.sum(), include_groups=False)
show("Team-staff ERA", team_era.dropna().values, "era", "team_era")

bpi = pd.read_csv(os.path.join(D,"bullpen_individual.csv"))
bpi = bpi[num(bpi["appearances"])>=10]
show("Individual-reliever ERA", num(bpi["overall_ERA"]).dropna().values, "era", "rp_era")
print("\n  (OLD = washed toward 'average'; NEW = uses the full palette)")
