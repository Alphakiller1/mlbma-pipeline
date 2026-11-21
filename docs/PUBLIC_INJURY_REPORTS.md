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

When no official report matches, the tab can show partial RotoWire coverage for
the matching school and kickoff. An older slate report remains labeled as saved
coverage. An absent source or report never confirms a healthy roster. Report
coverage follows the conference's publication schedule and scope.
