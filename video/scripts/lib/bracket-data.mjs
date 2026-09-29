/**
 * The MLB postseason bracket, live from MLB's stats API (statsapi.mlb.com, no key).
 *
 * The postseason/series endpoint has every series of the bracket (Wild Card, Division,
 * LCS, World Series) with its games, but leaves `seed` empty, so seeds come from the
 * final standings: division champions by record are 1-3, wild cards by rank are 4-6.
 * Series scores are counted from the Final games, so the bracket marks real results
 * as the postseason plays out.
 */
const API = "https://statsapi.mlb.com/api/v1";
const LEAGUES = { 103: "AL", 104: "NL" };

// statsapi team id -> the ESPN logo code the site uses (a.espncdn.com/.../500-dark/<code>.png)
const ESPN = {
  108: "laa", 109: "ari", 110: "bal", 111: "bos", 112: "chc", 113: "cin", 114: "cle", 115: "col", 116: "det",
  117: "hou", 118: "kc", 119: "lad", 120: "wsh", 121: "nym", 133: "oak", 134: "pit", 135: "sd", 136: "sea",
  137: "sf", 138: "stl", 139: "tb", 140: "tex", 141: "tor", 142: "min", 143: "phi", 144: "atl", 145: "chw",
  146: "mia", 147: "nyy", 158: "mil",
};

const getJson = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "chase-analytics-booth" } });
  if (!r.ok) throw new Error(`${r.status} from ${url}`);
  return r.json();
};

async function seedsFor(season) {
  const out = {};
  for (const [id, lg] of Object.entries(LEAGUES)) {
    const d = await getJson(`${API}/standings?leagueId=${id}&season=${season}&standingsTypes=regularSeason&hydrate=team`);
    const teams = d.records.flatMap((r) => r.teamRecords);
    const champs = teams.filter((t) => t.divisionChamp).sort((a, b) => b.wins - a.wins || Number(a.leagueRank) - Number(b.leagueRank));
    const wild = teams
      .filter((t) => !champs.slice(0, 3).includes(t) && t.wildCardRank && Number(t.wildCardRank) <= 3)
      .sort((a, b) => Number(a.wildCardRank) - Number(b.wildCardRank));
    [...champs.slice(0, 3), ...wild].forEach((t, i) => {
      out[t.team.id] = {
        seed: i + 1,
        league: lg,
        wins: t.wins,
        losses: t.losses,
        abbr: t.team.abbreviation,
        name: t.team.teamName,
        full: t.team.name,
        logo: ESPN[t.team.id] ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500-dark/${ESPN[t.team.id]}.png&w=200&h=200` : "",
      };
    });
  }
  return out;
}

/** { season, teams: {id: team}, series: [{id, round, league, bestOf, away, home, wins:{away,home}, winner, next}] } */
export async function loadBracket(season) {
  const [teams, sched] = await Promise.all([seedsFor(season), getJson(`${API}/schedule/postseason/series?sportId=1&season=${season}`)]);
  const series = sched.series.map((s) => {
    const id = s.series.id; // F_1..F_4 (Wild Card), D_1..D_4, L_1..L_2, W_1
    const g0 = s.games[0];
    const known = (side) => (teams[g0.teams[side].team.id] ? g0.teams[side].team.id : null);
    const wins = { away: 0, home: 0 };
    for (const g of s.games) {
      if (g.status.abstractGameState !== "Final") continue;
      // home/away can flip game to game; credit the winning club, then map to this series' sides
      const w = g.teams.home.isWinner ? g.teams.home.team.id : g.teams.away.isWinner ? g.teams.away.team.id : null;
      if (w && w === known("away")) wins.away++;
      if (w && w === known("home")) wins.home++;
    }
    const bestOf = g0.gamesInSeries;
    const need = Math.floor(bestOf / 2) + 1;
    const away = known("away");
    const home = known("home");
    return {
      id,
      round: id[0],
      label: g0.seriesDescription,
      league: /^AL /.test(g0.seriesDescription) ? "AL" : /^NL /.test(g0.seriesDescription) ? "NL" : "",
      bestOf,
      away,
      home,
      wins,
      winner: wins.away >= need ? away : wins.home >= need ? home : null,
      start: g0.gameDate,
    };
  });
  return { season, teams, series, fetched: new Date().toISOString() };
}
