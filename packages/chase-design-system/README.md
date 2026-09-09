# @chase-analytics/design-system 1.0.0

TIER-1 primitives only (`--ca-ink-*`, `--ca-violet-*`, status ramps). Copy `css/chase-tokens-v1.css` from `design/chase-tokens-v1.css` in mlbma-pipeline.

Model desks import this file, then map `--bg` / `--text` onto `var(--ca-*)` in their local `chase_tokens.css`. Do not put hex in those semantic alias files.
