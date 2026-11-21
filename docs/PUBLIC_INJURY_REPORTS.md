# Matchup injury reports

## College football

The Injuries tab requests `/api/cfb-availability` independently of the weekly
slate. It checks when the matchup opens and every minute while the page is
visible and the game is current. It also checks when the tab returns to view.
The Pages Function caches normalized upstream reports for 45 seconds.

The official sources are [SEC](https://www.secsports.com/fbreports),
[ACC](https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx),
[Big 12](https://big12sports.com/FBReporting),
[Big Ten](https://bigten.org/fb/availability-reports/),
[Pac-12](https://pac-12.com/news/2026/9/11/2026-football-reports.aspx), and
[Sun Belt](https://sunbeltsports.org/news/2025/8/11/football-availability-report-new.aspx),
[American](https://theamerican.org/sports/2026/8/6/football_player_availability.aspx),
[MAC](https://getsomemaction.com/sports/2026/7/28/FB_0728265050.aspx.aspx),
[Mountain West](https://themw.com/sports/2026/8/21/football_reports.aspx), and
[Conference USA](https://conferenceusa.com/sports/2025/8/23/FB_0823254134.aspx).
The API matches both schools and the fixture date or kickoff. It uses the latest
published revision and keeps the actual designations, including first-half
absences. A publication timestamp describes the report. A check timestamp
describes when the site last read the source.
The HD Intelligence conference archives also supply dated game-day designations
for recent games that have left the current report feed.

Every player on a live official report carries his columns (2026-11-21):
- value and games missed from his school's value table, which the slate
  publishes for every player in its box scores (`away_value_table`/
  `home_value_table`: name, value, value on the last three games, games
  missed). Defenders and linemen have no priced measure and read
  "Not rated"; a player with no box-score line reads "No record";
- the play rate of his designation (the NFL official report's record, as
  on saved reports);
- the injury from the saved Covers or RotoWire list when it names him
  (conference reports do not give one).

When a conference lists a fixture's report as pending (the American posts
game-day reports only), the API returns `due_at_utc` and the tab reads
"Official report due ...". A feed that cannot be read is named, with the
reason, in the response's `issues`.

When no official report matches, the tab can show partial RotoWire coverage for
the matching school and kickoff. An older slate report remains labeled as saved
coverage. An absent source or report never confirms a healthy roster. Report
coverage follows the conference's publication schedule and scope.

## NFL, NBA, and men's college basketball

The active matchup pages check their injury endpoints on open, each minute
while visible, and when the page regains focus. Repeated reads share short
server-side caches. A failed check keeps the last report and shows that the
refresh is temporarily unavailable.

- NFL uses the official weekly report for the fixture, with dated ESPN
  matchup updates for game-day inactives and roster designations. A practice
  designation is kept distinct from a game status.
- NBA uses the league's latest [official injury report](https://official.nba.com/nba-injury-report-2026-27-season/)
  with the exact date and opponent. ESPN is a partial fallback for the
  current day. The edge parser reads the PDF table's columns with the pinned
  `unpdf` dependency. Run `npm ci` at the repository root before running the
  local Pages preview.
- CBB checks Covers matchup pages, Action Network, and RotoWire. Player names
  must match a unique player on the current ESPN roster. The tab distinguishes
  a verified empty Covers listing from missing or partial coverage. Completed
  prior days keep their archived reports.
