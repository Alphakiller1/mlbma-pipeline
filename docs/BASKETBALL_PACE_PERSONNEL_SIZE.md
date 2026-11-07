# Basketball matchup expression update — November 7, 2026

The native CBB Units view adds observed season and recent-five pace per 40,
transition/half-court usage and offense-versus-defense PPP. Defense adds
personnel compositions with defensive use, allowed PPP and opponent offense
against that composition. Efficiency retains the four factors and adds 2P/3P
accuracy and assist rate. The seven existing tabs and matchup navigation remain.

Rotation adds separate **starter** and **whole-team** height averages overall
and by G/F/C position. Starter height is weighted by reported season starts;
whole-team height is an unweighted mean of known reported heights. Player and
start counts accompany the averages. This describes a season's recorded starter
pool and does not confirm the next game's five. Weight/wingspan are unavailable.

The new observed layer comes from free SportsDataverse NCAA possessions,
official boxes and rosters for 2025–26 and 2026–27. Team identity uses explicit
ESPN crosswalks. Both team scores must reconcile before tactical rates are
published. Every panel has a source, date and sample count; this coverage can
be narrower than the original Basketball Quant box-score panels. Personnel
composition is distinct from geometric sets and defensive schemes.

PPP colors require 100 possessions, five games and ten eligible same-season
peers for the same cell. Higher offense and lower allowed PPP are favorable.
Smaller samples stay gray. NBA coverage keeps its existing 20-possession rule
and the same direction convention. Blue bars encode usage without a good/bad
grade. Header labels and numeric values share alignment and padding.

CBB shot share uses a common 0–50% blue volume scale across teams, seasons and
offense/allowance views. Zero is dark; 50%+ is light. Frequency does not invert
for defense. Court zones now have even-odd cutouts, preventing translucent nested
areas from adding another zone's color. FG% retains the five performance colors.

The website vendors only the CBB factual ingestion/export adapters. Daily source
refresh keeps its cache and rejects incomplete source collections. All outputs
pass the per-field public classifier, including rank overrides limited to
observed tactical PPP. Private model posteriors and regression pressures remain
excluded from public artifacts. Existing BQ scores/rates were preserved when
porting the new 730 team-season tactical contexts.

Validation: model suites (24 CBB / 74 NBA), 309 website unit tests, the public
field gate, design token gate, 203 browser runtime checks, desktop header/cell
edge checks and phone overflow/tap checks. New captures use the actual pages,
the user's Washington State–High Point fixture, and Boston–Charlotte for NBA.
