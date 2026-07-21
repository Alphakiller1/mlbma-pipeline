# Apply renderer contract update → `chase-content-engine`

This agent **cannot push** to [`Alphakiller1/chase-content-engine`](https://github.com/Alphakiller1/chase-content-engine)
(403). The §14 compliance work is complete locally and packaged here for you to land.

## What changed

`chase_content/render.py` now matches `design/CONTENT_DESIGN_CONTRACT.md` §14 (two commits:
`Align render.py with CONTENT_DESIGN_CONTRACT §14` + `Refine content renderer for brand
authenticity`):

- Real `chase-logo-horizontal-light.png` header (no typeset eyebrow)
- Metallic-silver report titles; compact 150–190 px utility header
- Morning Slate: run separation sort/labels; **no win-probability**
- ESPN team logos + 22–28 px abbreviations
- League-anchored `metricColor` for OSI / runs; divergence ≠ green-bet
- Bundled DM Sans + Roboto Condensed (no Arial/DejaVu)
- Fail-closed integrity + logo resolution before any PNG save
- Tests for sort, dimensions, metric colors, missing-logo fail

Authenticity refinements (commit 2):

- Chase mark sits in the sanctioned soft-grey brand plate (`.ca-brand-badge-light`) so the
  dark-ink wordmark reads on the near-black canvas — the mark is never recolored/traced (§2.13).
  Padding is trimmed and the single metadata line now sits above the divider (header ≤ 190 px).
- Report titles / section headings embossed on dark for a true metallic (chrome) read, using the
  fixed §1.5 fill.
- Compact Morning Slate (5/page) card layout reflowed so pitcher lines + opinion rail never
  overlap in sub-190 px cards.
- Public-vs-Sharp + Risers/Fallers arrows drawn as vectors (bundled fonts lack `→`/U+2192, which
  rendered as tofu); public = neutral, sharp = purple legend; full `observed … UTC` timestamp.

> **Pending art:** when a true transparent light/metallic-wordmark Chase logo is supplied, drop it
> in under `assets/brand/chase-logo-horizontal-light.png` and the header can render it bare per
> §3.4 (the light plate is the compliant fallback for the current dark-ink artwork).

Sample PNGs (from `examples/sample_bundle.json`) were generated during the agent run under
`/opt/cursor/artifacts/chase-content-sample/`.

## Option A — git bundle (preferred)

On a machine with push access to `chase-content-engine`:

```bash
cd /path/to/chase-content-engine
git fetch
git checkout main
git pull
git bundle unbundle path/to/mlbma-pipeline/docs/external/chase-content-engine/render-contract.bundle
git checkout cursor/render-contract-compliance-4fea
# The bundle carries ref refs/heads/cursor/render-contract-compliance-4fea (tip 860b81b,
# two commits on top of main).

python -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest tests/test_content_engine.py -q

git push -u origin cursor/render-contract-compliance-4fea
gh pr create --base main --title "Align render.py with CONTENT_DESIGN_CONTRACT §14"
```

## Option B — format-patch

```bash
cd /path/to/chase-content-engine
git checkout main
git am path/to/mlbma-pipeline/docs/external/chase-content-engine/render-contract.patch
```

Binary assets (fonts, brand logo, cached team logos) are included in the patch/bundle.

## Option C — copy files

Copy from this folder:

| Source in this package | Destination in content-engine |
|------------------------|-------------------------------|
| `chase_content/render.py` | `chase_content/render.py` |
| `tests/test_content_engine.py` | `tests/test_content_engine.py` |
| `design/CONTENT_DESIGN_CONTRACT.md` | `design/CONTENT_DESIGN_CONTRACT.md` |
| `assets/README.md` | `assets/README.md` |

Then recreate `assets/brand/`, `assets/fonts/`, `assets/team_logos/` per `assets/README.md`
(or extract them from the bundle).

## Verify

```bash
chase-content build --bundle examples/sample_bundle.json --report all --out dist/sample
# Expect: morning-slate-01.png, offensive-report.png, public-vs-sharp.png at 1080×1350
```
