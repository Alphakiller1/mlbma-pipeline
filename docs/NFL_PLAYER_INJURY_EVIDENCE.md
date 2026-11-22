# NFL player snaps, practice and production

Each injury row shows actual current-season snaps across all clubs, with the
offense, defense and special-teams counts available in its tooltip. Games missed
means consecutive club games without a snap in any phase. A special-teams
appearance is an appearance. Stable nflverse GSIS/PFR identities bridge name
variants such as Mike/Michael Jackson. Known current players with no snap record
show zero recorded snaps; an unmatched identity remains unavailable.

Official club weekly injury tables supply each practice day's date and full,
limited or did-not-participate status. Blank/pending and not-listed cells are
kept distinct and are never counted as missed practices. Full plus limited
sessions form the participated count. The publisher archives each week's
reports in data/public/nfl/practice and retains only same-week evidence during
an outage. The live availability endpoint checks club reports with a five-minute
source cache alongside the league report and ESPN's dated fixture updates.

Chance to play is explicitly approximate. It uses the existing 2019–25 empirical
cohort for game status plus latest practice participation when at least 20
historical listings support it, otherwise game status alone. It is the chance of
any game appearance, not snap share. Daily counts provide context; they do not
receive invented probability multipliers. Out, confirmed inactive and reserve
designations have zero current eligibility. A later, dated post-practice update
can override an older game designation. A reserve return-window entry alone
does not imply a rule-out: an explicit current announcement of a rule-out or new
IR placement is required to replace an official game designation. Old stale
statuses still cannot revive a cleared injury, and post-kickoff updates do not
rewrite a completed fixture. A verified later rule-out survives a news-feed
outage until a dated newer update or the next fixture's report supersedes it.

Position rating is a descriptive 0–100 production percentile. It averages the
percentile positions of the listed components with equal weights, within the
same position group. The component values, cohort size, season and unit-snap
sample accompany the rating. It is not a film or assignment grade. Qualification
normally requires two unit appearances and 50 unit snaps. Kickers instead need
10 field-goal attempts and punters need 15 punts; cohorts need eight players.

| Position | Components |
| --- | --- |
| QB | Passing/rushing EPA per opportunity; adjusted net yards per attempt; passing/rushing yards per unit appearance |
| RB, WR, TE | Scrimmage yards per offensive snap; rushing/receiving EPA per carry or target; scrimmage yards per unit appearance |
| EDGE, DL | Sacks, QB hits and tackles for loss per 100 defensive snaps |
| LB | Tackles per 100 defensive/ST snaps; tackles for loss per 100 defensive snaps; sacks, interceptions, forced fumbles and passes defended per 100 defensive/ST snaps |
| CB, S | Passes defended and interceptions per 100 defensive snaps; tackles per 100 defensive/ST snaps |
| K | Field-goal conversion and field-goal points per appearance |
| P | Net yards per punt, inside-20 share and avoided-touchback share |

Adjusted net yards per attempt is (passing yards − sack yards + 20 × passing
TD − 45 × interceptions) / (attempts + sacks). QB opportunities include attempts,
sacks and carries. Tackles include solo plus tackles with an assist; their
denominator includes special teams rather than pretending every tackle came on
defense. Offensive-line blocking and long-snapper production are not measured by
these feeds and stay unrated. Insufficient samples stay unrated as well.

Sources: official club weekly reports, nflverse snap_counts, stats_player and
players releases. Practice check times are retrieval times, not announcements of
a final game-day inactive list.
