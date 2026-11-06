# CBB matchup launch — 2026-11-06

The public desk now covers men's Division I college basketball. NFL, CFB and NBA retain their existing owners; CBB extends the existing slate cards, fixture header, detail tabs, club switch and design tokens. MLB is removed from public navigation and its old section redirects home.

## Evidence and display

- Season ending 2027 means 2026–27; ending 2026 means 2025–26. Both contain 365 team contexts. An identity introduced this year can lack prior-year evidence.
- Basketball Quant supplies public team/player box-score evidence, schedules and coordinate shots. CBB Analytics supplies the publicly exposed shot-zone subset, not a complete all-team subscription feed. No subscription barrier is bypassed.
- Paired courts always use the same schema. Reference-team pairs can use CBB Analytics zones6; other comparisons use explicitly labeled `chase-coordinates-v1` derived from available shot events. The two definitions are never merged into one zone baseline.
- FG% uses makes/attempts; shot share uses attempts/total attempts. Zero attempts produces a dash. Opponent-allowed grading reverses the performance direction. Zone counts and coverage dates remain visible.
- Current and previous seasons are selectable without silently substituting prior-year stats. A two-game sample is labeled two games. Missing team, roster or availability evidence remains missing.
- ESPN's public scoreboard refreshes fixture state, scores, records, venue and original UTC tip-off time after the dated research slate has rendered. The same-origin `/api/cbb-fixtures` endpoint allows only those fields through; forecasts, odds and probabilities never reach Research. If ESPN is unavailable, the published fixture remains usable.
- Rotation shows reported players and MIN%, not projected starters. Prior-year rosters are historical. Availability is explicitly not collected.

## Model Center boundary

The private `Alphakiller1/cbb-model` repository owns source snapshots, warehouse and fitted scoring model. Only validated factual exports enter `data/public/cbb/`. Provider model ratings are excluded from that export.

The separate experimental score board is stored under `functions/api/model-center/cbb-board.json` and served by the existing `/api/model-center/board?sport=cbb` Worker endpoint. It does not enter the public factual dependency graph. The UI shows its actual model date and cutoff. There are no published win probabilities or betting recommendations. This score baseline has no injury, roster-change or market adjustment; its uncertainty is not a calibrated current-season confidence interval. The private model card contains evaluation and limitations.

## Refresh and publication

`Publish CBB Slate` runs daily at 14:20 UTC during November–April and can be dispatched manually. It collects both seasons into a temporary warehouse, exports factual fields, validates all 730 contexts and checks non-regression before publication. A failed collection or validation retains the last good public files. Its successful run triggers the existing Cloudflare deployment workflow.

The experimental model board is a separately dated, manual publication. The daily factual job does not imply a fresh model run.

```powershell
# In cbb-model
python -m cbb_model.cli build --as-of 2026-11-06
python -m unittest discover -s tests -v

# In this repository
python scripts/publish_public_cbb.py --source C:/Users/chase/cbb-model/artifacts/public/cbb
python scripts/publish_cbb_model_board.py --source C:/Users/chase/cbb-model/artifacts/private
python scripts/refresh_public_cbb.py --as-of 2026-11-06
```

The last command performs a full factual collection and is not needed merely to republish an existing validated snapshot. `pipeline/cbb_public/UPSTREAM.json` pins hashes of the vendored factual collectors/exporter. After changing upstream collection/export logic, copy those modules and update the receipt together; model fitting code is not vendored.

## Release checks and rollback

The PR gate runs Python unit tests, token checks, per-field public-boundary validation, the public runtime and boundary browser crawls, and strict 360/390px overflow audits. Cloudflare's existing release quality gate also runs before deployment. Native desktop and 375px review covers current/prior shot charts, paired table values, the six-team comparison and Model Center.

Rollback uses the existing Git/Cloudflare release path: revert the launch merge and deploy the resulting master revision. Raw source snapshots remain in cbb-model; neither launch nor rollback edits the user's original dirty checkout.
