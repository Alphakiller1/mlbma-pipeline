# Matchup Desk Label Standard

This standard covers the NFL, CFB, NBA and CBB matchup desks (`dashboard/public_game_detail.js`). It was set on 2026-11-19, after a crawl of every live section found 132 label violations. The diag runs `LABEL_AUDIT` on every desk (`scripts/public_site_runtime_diag.py`), so a change that breaks these rules fails the deploy gate.

## Casing

- **Desk casing:** every word in a section title, subtitle, panel title, column header, group title and stat label starts with a capital. Example: "Pace And Possession", "Strength Of Schedule".
- **Applied in code:** `deskCase()` applies this in `section()`, `deskPanel()`, `cfbLedgerRow()`, `nflSplitTable()` and `cbbTable()` headers, plain first-column labels, and data-supplied zone and coverage labels. Pass it plain text only, never HTML.
- **Words that keep their own form:**
  - words that already carry a capital or a digit: eFG%, xeFG%, 3P%, D-I, P&R, OREB%;
  - player names;
  - "vs", which never takes a period;
  - a unit in parentheses: (in), (lb), (mph).

## Names

- **One name per team inside the analysis:** `deskName()`. In the NFL and NBA that is the club nickname ("Colts", "Warriors"). In college it is the school ("Western Michigan", "High Point").
- **Where the full name goes:** only the hero and the logo'd identity cards use it.
- **Panel titles:**
  - "Colts Offense vs Texans Defense" for one unit against the unit it meets;
  - "Colts vs Texans Strength Index" for a head-to-head panel.

## Abbreviations

| Concept | Write | Not |
|---|---|---|
| Per game / per 100 possessions / per play | `/G`, `/100`, `/Play` | ` / G`, `Per Game` in a stat label |
| Points, yards | `Pts`, `Yds` | `Points/G`, `Yards`, `Y/A` |
| Opponents' figure (basketball) | `Opp Pts/100`, `Opp Pts/G` | `Defense /100`, `Allowed/G` |
| A rate printed as a percentage | `Success%`, `Explosive%`, `Sack%`, `Stuff%`, `Havoc%`, `TD%`, `INT%`, `Comp%`, `1st Down%`, `TOV%`, `OREB%` | `Succ`, `Stuffed`, `TD Rate`, `Cmp%`, `Turnover % (Lost / Forced)` |
| A share of attempts or plays | `Share` (`3PA Share`, `Deep Share`) | `Rate` for shares |
| Conversion by down | `3rd-Down Conv%`, `4th-Down Conv%` | `3rd Dn`, `3rd Down` for a rate |
| Allowed | "… Allowed" after the stat (`Success% Allowed`, `Yds/Play Allowed`) | `Def Success`, `Allowed/Play` |
| Offense / defense in a column header | `Offense Share`, `Defense PPP Allowed` | `O share`, `D PPP allowed` |
| Noise-adjusted final | `Noise-Adj` | `Adj. Score` |
| Final score column | `Final` | `Result` |

- **Slashes are never spaced.** The one exception is the CBB "ORB% / DRB%" row, which pairs two stats.
- **Signed numbers** use an ASCII minus.

## Shared structure

| Item | Rule |
|---|---|
| First tab | Units on every desk: Power Ranking first, then the sport's strength/efficiency reads, then Predictability |
| Games tab | Called Games |
| Injury tab and section | The tab is Injuries (CFB, NBA); the NFL keeps Lineups and CBB keeps Roster because they hold more than injuries. The section is Injury Report, subtitle "Every Listed Player, Out First" |
| Same-concept sections | One name on every desk: Efficiency ("Each Offense Against The Defense It Meets"), Strength Of Schedule, Regression Watch ("Shooting Luck And Close Games"), Schedule Load, Rest, Travel And Venue |
| Subtitles | A short descriptor of what the section holds, never an explanation of how to read it ("Longest bar is 1st", "Negative Is Better") |
| Panel captions | None on any desk (owner rules 2026-11-11 and 2026-11-12). Provenance stays in the DOM, and the diag reads it with `text_content()`. Status and empty-state lines (`pending()`) remain |
| Colour and rank | Follow `unit-connotation` (owner rule 2026-11-12): fewer committed and lower allowed read better; style shares are neutral |
