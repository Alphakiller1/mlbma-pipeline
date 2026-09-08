"""
Capture FOCUSED Matchup Analysis crops for social / GPT.

Full panes confuse image models. Each crop is ONE board that maps to ONE
editorial bullet (header / lineup OSI / SP PitchScores / bullpen duo).

  python scripts/capture_matchup_artifacts.py
  python scripts/capture_matchup_artifacts.py --games LAD@PHI,PIT@NYY
  python scripts/capture_matchup_artifacts.py --shots bullpen
"""
from __future__ import annotations

import argparse
import csv
import http.server
import shutil
import socketserver
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

DASHBOARD = Path(r"C:\Users\chase\mlbma_pipeline\dashboard")
DATA_DIR = Path(r"C:\Users\chase\mlbma_pipeline\data")
OUT_ROOT = Path(r"C:\Users\chase\chase-content-engine\dist")
PORT = 8765

# Per-game: which focused shots matter for editorial bullets (fallback = all).
GAME_BULLETS = {
    "LAD@NYY": ["header", "lineup", "arms", "bullpen"],
    "TBR@BOS": ["cover", "header", "lineup", "arms"],
    "PIT@CLE": ["header", "lineup", "bullpen"],
    "TEX@ATL": ["header", "arms", "bullpen"],
    "MIA@MIL": ["header", "arms", "lineup"],
}

DEFAULT_SHOTS = ["header", "lineup", "arms", "bullpen"]

# Probable SP overrides when board slate differs (series Game 1, etc.)
# Rates from data/sp_profiles.csv; PitchScore = pool-normalized K/BB/HR9
SP_OVERRIDES = {
    "TBR@BOS": {
        "label": "Game 1",
        "away_sp": "Griffin Jax",
        "away_hand": "R",
        "away_ps": 61.0,
        "away_k": 25.1,
        "away_bb": 7.4,
        "away_hr9": 1.33,
        "home_sp": "Jake Bennett",
        "home_hand": "R",
        "home_ps": 65.9,
        "home_k": 19.2,
        "home_bb": 4.4,
        "home_hr9": 0.57,
    },
}


def _slate_games_from_csv() -> list[tuple[str, str]]:
    """Load Away/Home pairs from the current Today_Matchups CSV."""
    path = DATA_DIR / "today_matchups.csv"
    if not path.exists():
        return []
    games: list[tuple[str, str]] = []
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            away = str(row.get("Away") or row.get("Away_Team") or "").strip().upper()
            home = str(row.get("Home") or row.get("Home_Team") or "").strip().upper()
            if away and home:
                games.append((away, home))
    # de-dupe preserving order
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for away, home in games:
        key = f"{away}@{home}"
        if key in seen:
            continue
        seen.add(key)
        out.append((away, home))
    return out


def _slate_games() -> list[tuple[str, str]]:
    """Prefer live Today_Matchups; fall back to MLB schedule for the active slate."""
    from_csv = _slate_games_from_csv()
    if from_csv:
        return from_csv
    try:
        from core.config import TEAM_MAP
        from core.slate_date import eastern_slate_date_iso
        import json
        import urllib.request

        date = eastern_slate_date_iso()
        url = (
            f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}&hydrate=team"
        )
        with urllib.request.urlopen(url, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        games: list[tuple[str, str]] = []
        for day in payload.get("dates", []) or []:
            for game in day.get("games", []) or []:
                away_name = game["teams"]["away"]["team"]["name"]
                home_name = game["teams"]["home"]["team"]["name"]
                away = TEAM_MAP.get(away_name, away_name[:3].upper())
                home = TEAM_MAP.get(home_name, home_name[:3].upper())
                games.append((away, home))
        return games
    except Exception as exc:
        print(f"  WARNING: could not resolve live slate ({exc})")
        return []


# Legacy hardcoded slate — only used if CSV + API both unavailable.
DEFAULT_GAMES = [
    ("LAD", "NYY"),
    ("TBR", "BOS"),
    ("PIT", "CLE"),
    ("TEX", "ATL"),
    ("MIA", "MIL"),
]

# Injected once; builds #gptFocus boards from live sheet data already used by the page.
FOCUS_BOOTSTRAP = r"""
(() => {
  if (window.__gptFocusReady) return;
  window.__gptFocusReady = true;

  const CSS = `
    #gptFocusHost {
      position: fixed; inset: 0; z-index: 99999;
      background: #08090F; display: flex; align-items: flex-start;
      justify-content: center; padding: 24px; overflow: auto;
    }
    #gptFocusHost[hidden] { display: none !important; }
    #gptFocus {
      width: min(780px, 100%);
      position: relative;
      color: var(--text, #F4F4F7);
      font-family: "DM Sans", system-ui, sans-serif;
    }
    #gptFocus.gf-cover { width: 540px; min-height: 700px; }
    #gptFocus .gf-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    #gptFocus .gf-brand img { height: 28px; width: auto; }
    #gptFocus .gf-kicker {
      font-family: "Roboto Condensed", sans-serif;
      font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--accent-l, #C4B0FF); margin-bottom: 6px;
    }
    #gptFocus .gf-title {
      font-family: "Roboto Condensed", sans-serif;
      font-size: 24px; font-weight: 700; letter-spacing: 0.02em;
      color: var(--text, #F4F4F7); margin: 0 0 4px;
    }
    #gptFocus .gf-sub {
      font-size: 13px; color: var(--text-2, #9CA3AF); margin: 0 0 16px;
    }
    #gptFocus .gf-row {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch;
    }
    #gptFocus .gf-card {
      background: linear-gradient(180deg, rgba(255,255,255,0.05), transparent 40%),
        linear-gradient(180deg, var(--card, #14151f), #0A0C16);
      border: 1.5px solid var(--border-2, rgba(124,77,255,0.35));
      border-radius: 14px; padding: 14px;
    }
    #gptFocus .gf-vs {
      align-self: center; font-size: 11px; color: var(--text-3, #6B7280);
      font-family: "Roboto Condensed", sans-serif; letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    #gptFocus .gf-team {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    }
    #gptFocus .gf-team img { width: 36px; height: 36px; object-fit: contain; }
    #gptFocus .gf-abbr {
      font-family: "Roboto Condensed", sans-serif;
      font-size: 20px; font-weight: 700; color: var(--text, #F4F4F7);
    }
    #gptFocus .gf-rec { font-size: 12px; color: var(--text-2, #9CA3AF); }
    #gptFocus .gf-hero { margin: 6px 0 4px; }
    #gptFocus .gf-hero .chip {
      font-size: 26px !important; padding: 8px 14px !important;
      min-width: 72px; border-radius: 8px;
      font-family: "Roboto Condensed", sans-serif;
      font-variant-numeric: tabular-nums;
    }
    #gptFocus .gf-label {
      font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--text-2, #9CA3AF); margin-bottom: 2px;
      font-family: "Roboto Condensed", sans-serif;
    }
    #gptFocus .gf-meta {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center;
    }
    #gptFocus .gf-meta-item {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; color: var(--text-2, #9CA3AF);
      font-family: "Roboto Condensed", sans-serif;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    #gptFocus .gf-meta-item .chip { font-size: 12px !important; padding: 3px 7px !important; }
    #gptFocus .gf-note {
      margin-top: 14px; padding-top: 12px;
      border-top: 1px solid var(--border, rgba(255,255,255,0.08));
      font-size: 13px; color: var(--text-2, #D1D5DB); line-height: 1.35;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    #gptFocus .gf-sp {
      display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
    }
    #gptFocus .gf-sp img {
      width: 48px; height: 48px; border-radius: 50%;
      object-fit: cover; object-position: center top;
      border: 2px solid rgba(124, 77, 255, 0.55);
      box-shadow: 0 0 12px rgba(124, 77, 255, 0.35);
    }
    #gptFocus .gf-sp-name {
      font-family: "Roboto Condensed", sans-serif;
      font-size: 16px; font-weight: 700; color: var(--text, #F4F4F7);
    }
    #gptFocus .gf-hand {
      display: inline-block; margin-left: 6px; padding: 1px 6px;
      border-radius: 999px; font-size: 10px;
      background: rgba(124,77,255,0.2); color: var(--accent-l, #C4B0FF);
      border: 1px solid rgba(124,77,255,0.35);
    }
    #gptFocus .gf-verdict {
      margin-top: 16px; padding: 12px 14px; border-radius: 12px;
      border: 1.5px solid rgba(124,77,255,0.45);
      background: linear-gradient(90deg, rgba(124,77,255,0.18), rgba(124,77,255,0.05));
      font-family: "Roboto Condensed", sans-serif;
      font-size: 15px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--text, #F4F4F7);
    }
    #gptFocus .gf-legend { margin-top: 12px; transform: scale(0.92); transform-origin: left top; }
  `;

  function ensureHost() {
    if (!document.getElementById('gptFocusStyle')) {
      const s = document.createElement('style');
      s.id = 'gptFocusStyle';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    let host = document.getElementById('gptFocusHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'gptFocusHost';
      host.hidden = true;
      document.body.appendChild(host);
    }
    return host;
  }

  function chip(v, context, invert, decimals) {
    const A = window.MLBMAAssets;
    if (A && A.valChipHtml) {
      // Only pass invert when true. Passing false overrides CONTEXT_DEFAULTS.hi
      // and wrongly grades BB%/HR9/ERA as higher-is-better.
      const inv = (invert === true) ? true : null;
      const opts = {};
      if (decimals === 0 && v != null && !isNaN(Number(v))) {
        opts.display = String(Math.round(Number(v)));
      }
      return A.valChipHtml(v, context || 'osi', inv, decimals != null ? decimals : 1, opts);
    }
    if (v == null || isNaN(Number(v))) return '<span class="chip c-na">—</span>';
    const n = Number(v);
    const disp = (decimals === 0) ? String(Math.round(n)) : n.toFixed(decimals != null ? decimals : 1);
    return '<span class="chip c-mid">' + disp + '</span>';
  }

  function pctPoints(v) {
    if (v == null || isNaN(Number(v))) return null;
    let n = Number(v);
    if (Math.abs(n) <= 1.5) n *= 100;
    return n;
  }

  function fmt(v, d) {
    if (v == null || v === '' || isNaN(Number(v))) return '—';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function metaItem(label, html) {
    return '<span class="gf-meta-item"><span>' + label + '</span>' + html + '</span>';
  }

  function brandBar() {
    const A = window.MLBMAAssets;
    if (A && A.brandLogoNavHtml) return '<div class="gf-brand">' + A.brandLogoNavHtml() + '</div>';
    return '<div class="gf-brand"><img src="assets/chase-logo-horizontal.png" alt="Chase Analytics" height="28"></div>';
  }

  function legend() {
    const A = window.MLBMAAssets;
    if (A && A.metricLegendHtml) {
      return '<div class="gf-legend">' + A.metricLegendHtml({ title: 'Graded vs league avg' }) + '</div>';
    }
    return '';
  }

  function pick(row, names) {
    if (!row) return null;
    const keys = Object.keys(row);
    for (const name of names) {
      if (row[name] != null && row[name] !== '') return row[name];
      const norm = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of keys) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === norm && row[k] !== '') return row[k];
      }
    }
    return null;
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(/%/g, ''));
    return isNaN(n) ? null : n;
  }

  function logo(team) {
    const A = window.MLBMAAssets;
    if (A && A.teamLogoImg) return A.teamLogoImg(team, 36);
    return '';
  }

  function headshot(name) {
    const A = window.MLBMAAssets;
    if (A && A.pitcherAvatar) return A.pitcherAvatar(name, { crop: 'compare', size: 48 });
    return '';
  }

  async function loadPack(away, home, override) {
    override = override || null;
    const S = window.MLBMASharedMatchup;
    const T = (window.MLBMA_CONFIG && window.MLBMA_CONFIG.SHEET_TABS) || {};
    if (!S || !S.fetchSheetTab) throw new Error('MLBMASharedMatchup missing');

    const [matchups, pitching, bullpenRows, teamProfiles] = await Promise.all([
      S.fetchSheetTab(T.today_matchups || 'Today_Matchups'),
      S.fetchSheetTab(T.pitching_score || 'Pitching_Score').catch(() => []),
      S.fetchSheetTab(T.bullpen_unit || 'Bullpen_Unit').catch(() => []),
      S.fetchSheetTab(T.team_profiles || 'Team_Profiles').catch(() => []),
    ]);
    const bpMap = S.parseBullpenUnitRows ? S.parseBullpenUnitRows(bullpenRows || []) : {};
    const profMap = S.parseTeamProfilesMap ? S.parseTeamProfilesMap(teamProfiles || []) : {};

    const m = (matchups || []).find(r => {
      const a = String(pick(r, ['Away', 'away', 'AwayTeam']) || '').toUpperCase();
      const h = String(pick(r, ['Home', 'home', 'HomeTeam']) || '').toUpperCase();
      return a === away && h === home;
    });
    if (!m) throw new Error('matchup not found ' + away + '@' + home);

    let awaySP = String(pick(m, ['Away_SP', 'AwaySP', 'away_sp']) || 'TBD');
    let homeSP = String(pick(m, ['Home_SP', 'HomeSP', 'home_sp']) || 'TBD');
    let awayHand = String(pick(m, ['Away_Hand', 'AwayHand']) || '?').charAt(0);
    let homeHand = String(pick(m, ['Home_Hand', 'HomeHand']) || '?').charAt(0);
    if (override) {
      if (override.away_sp) awaySP = String(override.away_sp);
      if (override.home_sp) homeSP = String(override.home_sp);
      if (override.away_hand) awayHand = String(override.away_hand).charAt(0);
      if (override.home_hand) homeHand = String(override.home_hand).charAt(0);
    }

    function psFor(team, name) {
      const rows = pitching || [];
      const tk = team.toUpperCase();
      let best = null;
      for (const r of rows) {
        const t = String(pick(r, ['Team', 'Tm']) || '').toUpperCase();
        const n = String(pick(r, ['Name', 'Pitcher', 'Player']) || '');
        if (t === tk && n && name && n.toLowerCase().includes(name.split(' ').pop().toLowerCase())) {
          best = num(pick(r, ['PitchScore', 'Pitching Score', 'Pitchscore']));
          if (best != null) break;
        }
      }
      if (best == null) {
        for (const r of rows) {
          if (String(pick(r, ['Team', 'Tm']) || '').toUpperCase() === tk) {
            const v = num(pick(r, ['PitchScore', 'Pitching Score']));
            if (v != null) { best = v; break; }
          }
        }
      }
      return best;
    }

    function bpFor(team) {
      const tk = team.toUpperCase();
      const unit = bpMap[tk] || null;
      const r = (bullpenRows || []).find(row =>
        String(pick(row, ['Team', 'Tm', 'team']) || '').toUpperCase() === tk
      ) || null;
      let osiAllowed = num(pick(r, [
        'overall_OSI_allowed', 'OSI_allowed', 'overall OSI allowed',
        'osi_allowed', 'OSI Allowed', 'Overall_OSI_Allowed'
      ]));
      if (osiAllowed == null && unit && unit.osiAllowed != null) osiAllowed = unit.osiAllowed;
      // last resort: invert bullpen score if present
      const score = unit && S.bullpenPitchScore ? S.bullpenPitchScore(unit) : null;
      if (osiAllowed == null && score != null) osiAllowed = 100 - score;
      return {
        osiAllowed,
        abqAllowed: num(pick(r, ['overall_ABQ_allowed'])) ?? (unit && unit.abqAllowed),
        hiLevEra: num(pick(r, ['high_leverage_ERA', 'High Leverage ERA'])) ?? (unit && unit.hiLevEra),
        era: num(pick(r, ['overall_ERA', 'ERA', 'overall ERA'])),
        fip: num(pick(r, ['overall_FIP', 'FIP', 'overall FIP'])),
        kPct: num(pick(r, ['overall_K_pct', 'K%', 'overall K pct', 'K_pct'])),
        bbPct: num(pick(r, ['overall_BB_pct', 'BB%', 'BB_pct'])),
        score,
      };
    }

    function osiFor(team) {
      const prof = profMap[team] || {};
      // Lineup edge on matchup row is authoritative; components from team profiles.
      let osi = null;
      if (prof.osi && typeof prof.osi === 'object') osi = num(prof.osi.osi || prof.osi.value);
      if (osi == null) osi = num(prof.osi_ytd && (prof.osi_ytd.osi || prof.osi_ytd));
      if (osi == null) osi = num(prof.osi);
      return {
        osi: osi,
        abq: num(prof.abq),
        rcv: num(prof.rcv),
        obr: num(prof.obr),
      };
    }

    // Lineup edge from matchup row when present
    const edgeRaw = pick(m, ['Lineup_Edge', 'lineup_edge', 'OSI_Edge']);
    let edgeNum = null;
    let edgeTeam = null;
    if (edgeRaw != null) {
      const s = String(edgeRaw);
      const mm = s.match(/([A-Z]{2,3})?\s*\+?\s*(-?\d+(?:\.\d+)?)/i);
      if (mm) {
        edgeNum = parseFloat(mm[2]);
        edgeTeam = (mm[1] || '').toUpperCase() || null;
      }
    }

    const awayOsi = osiFor(away);
    const homeOsi = osiFor(home);
    // Prefer absolute OSI from matchup row when present
    const awayOsiM = num(pick(m, ['Away_OSI', 'AwayOSI', 'away_osi', 'Away_Lineup_OSI']));
    const homeOsiM = num(pick(m, ['Home_OSI', 'HomeOSI', 'home_osi', 'Home_Lineup_OSI']));
    if (awayOsiM != null) awayOsi.osi = awayOsiM;
    if (homeOsiM != null) homeOsi.osi = homeOsiM;
    if (edgeNum == null && awayOsi.osi != null && homeOsi.osi != null) {
      edgeNum = Math.abs(awayOsi.osi - homeOsi.osi);
      edgeTeam = awayOsi.osi >= homeOsi.osi ? away : home;
    }

    // Prefer live PitchScore from matchup columns
    let awayPs = num(pick(m, ['Away_PitchScore', 'AwayPitchScore', 'away_ps']));
    let homePs = num(pick(m, ['Home_PitchScore', 'HomePitchScore', 'home_ps']));
    if (awayPs == null) awayPs = psFor(away, awaySP);
    if (homePs == null) homePs = psFor(home, homeSP);

    let awayK = num(pick(m, ['Away_K', 'Away_K%', 'awayK']));
    let homeK = num(pick(m, ['Home_K', 'Home_K%', 'homeK']));
    let awayBB = num(pick(m, ['Away_BB', 'Away_BB%', 'awayBB']));
    let homeBB = num(pick(m, ['Home_BB', 'Home_BB%', 'homeBB']));
    let awayHR9 = num(pick(m, ['Away_HR9', 'Away_HR/9', 'awayHR9']));
    let homeHR9 = num(pick(m, ['Home_HR9', 'Home_HR/9', 'homeHR9']));

    if (override) {
      if (override.away_ps != null) awayPs = Number(override.away_ps);
      if (override.home_ps != null) homePs = Number(override.home_ps);
      if (override.away_k != null) awayK = Number(override.away_k);
      if (override.home_k != null) homeK = Number(override.home_k);
      if (override.away_bb != null) awayBB = Number(override.away_bb);
      if (override.home_bb != null) homeBB = Number(override.home_bb);
      if (override.away_hr9 != null) awayHR9 = Number(override.away_hr9);
      if (override.home_hr9 != null) homeHR9 = Number(override.home_hr9);
    }

    const rec = (team) => {
      if (window.MLBMAStandings && MLBMAStandings.formatRecord) {
        return MLBMAStandings.formatRecord(team) || '';
      }
      return '';
    };

    return {
      away, home,
      time: String(pick(m, ['Time', 'FirstPitch', 'time']) || 'TBD'),
      stadium: String(pick(m, ['Stadium', 'Park', 'stadium']) || ''),
      gameLabel: override && override.label ? String(override.label) : '',
      awaySP, homeSP, awayHand, homeHand,
      awayPs, homePs,
      awayK, homeK, awayBB, homeBB, awayHR9, homeHR9,
      awayOsi, homeOsi, edgeNum, edgeTeam,
      awayBp: bpFor(away),
      homeBp: bpFor(home),
      awayRec: rec(away),
      homeRec: rec(home),
      modelAway: num(pick(m, ['Model_Away', 'Away_Win%', 'away_win_pct'])),
      modelHome: num(pick(m, ['Model_Home', 'Home_Win%', 'home_win_pct'])),
    };
  }

  function boardHeader(p) {
    return brandBar() + `
      <div class="gf-kicker">Matchup · Identity</div>
      <h1 class="gf-title">${p.away} @ ${p.home}</h1>
      <p class="gf-sub">${p.time}${p.stadium ? ' · ' + p.stadium : ''}</p>
      <div class="gf-row">
        <div class="gf-card">
          <div class="gf-team">${logo(p.away)}<div><div class="gf-abbr">${p.away}</div>
          <div class="gf-rec">${p.awayRec || 'Away'}</div></div></div>
        </div>
        <div class="gf-vs">AT</div>
        <div class="gf-card">
          <div class="gf-team">${logo(p.home)}<div><div class="gf-abbr">${p.home}</div>
          <div class="gf-rec">${p.homeRec || 'Home'}</div></div></div>
        </div>
      </div>`;
  }

  function boardLineup(p) {
    const edgeChip = (p.edgeNum != null)
      ? chip(50 + Number(p.edgeNum), 'osi', false, 1)
      : '<span class="chip c-na">—</span>';
    const edgeLbl = p.edgeTeam ? (p.edgeTeam + ' edge') : 'OSI edge';
    return brandBar() + `
      <div class="gf-kicker">Lineup vs Lineup</div>
      <h1 class="gf-title">${p.away} @ ${p.home}</h1>
      <p class="gf-sub">Process OSI · healthier / fuller strength</p>
      <div class="gf-row">
        <div class="gf-card">
          <div class="gf-team">${logo(p.away)}<div class="gf-abbr">${p.away}</div></div>
          <div class="gf-label">Lineup OSI</div>
          <div class="gf-hero">${chip(p.awayOsi.osi, 'osi', false, 1)}</div>
          <div class="gf-meta">
            ${metaItem('ABQ', chip(p.awayOsi.abq, 'abq', false, 1))}
            ${metaItem('RCV', chip(p.awayOsi.rcv, 'rcv', false, 1))}
            ${metaItem('OBR', chip(p.awayOsi.obr, 'obr', false, 1))}
          </div>
        </div>
        <div class="gf-vs">VS</div>
        <div class="gf-card">
          <div class="gf-team">${logo(p.home)}<div class="gf-abbr">${p.home}</div></div>
          <div class="gf-label">Lineup OSI</div>
          <div class="gf-hero">${chip(p.homeOsi.osi, 'osi', false, 1)}</div>
          <div class="gf-meta">
            ${metaItem('ABQ', chip(p.homeOsi.abq, 'abq', false, 1))}
            ${metaItem('RCV', chip(p.homeOsi.rcv, 'rcv', false, 1))}
            ${metaItem('OBR', chip(p.homeOsi.obr, 'obr', false, 1))}
          </div>
        </div>
      </div>
      <div class="gf-note"><strong>${edgeLbl}</strong> ${edgeChip}${p.edgeNum != null ? ' <span style="opacity:.7">(+'+fmt(p.edgeNum,1)+')</span>' : ''}</div>
      ${legend()}`;
  }

  function boardArms(p) {
    const kicker = p.gameLabel ? ('Starting Pitchers · ' + p.gameLabel) : 'Starting Pitchers';
    const aK = pctPoints(p.awayK); const hK = pctPoints(p.homeK);
    const aBB = pctPoints(p.awayBB); const hBB = pctPoints(p.homeBB);
    return brandBar() + `
      <div class="gf-kicker">${kicker}</div>
      <h1 class="gf-title">${p.away} @ ${p.home}</h1>
      <p class="gf-sub">Pitching Score · K% · BB% · HR/9</p>
      <div class="gf-row">
        <div class="gf-card">
          <div class="gf-sp">${headshot(p.awaySP)}
            <div><div class="gf-sp-name">${p.awaySP}<span class="gf-hand">${p.awayHand}</span></div>
            <div class="gf-rec">${p.away} SP</div></div>
          </div>
          <div class="gf-label">Pitching Score</div>
          <div class="gf-hero">${chip(p.awayPs, 'pitching', null, 0)}</div>
          <div class="gf-meta">
            ${metaItem('K%', chip(aK, 'kpct', false, 1))}
            ${metaItem('BB%', chip(aBB, 'bbpct', false, 1))}
            ${metaItem('HR/9', chip(p.awayHR9, 'hr9', false, 2))}
          </div>
        </div>
        <div class="gf-vs">VS</div>
        <div class="gf-card">
          <div class="gf-sp">${headshot(p.homeSP)}
            <div><div class="gf-sp-name">${p.homeSP}<span class="gf-hand">${p.homeHand}</span></div>
            <div class="gf-rec">${p.home} SP</div></div>
          </div>
          <div class="gf-label">Pitching Score</div>
          <div class="gf-hero">${chip(p.homePs, 'pitching', null, 1)}</div>
          <div class="gf-meta">
            ${metaItem('K%', chip(hK, 'kpct', false, 1))}
            ${metaItem('BB%', chip(hBB, 'bbpct', false, 1))}
            ${metaItem('HR/9', chip(p.homeHR9, 'hr9', false, 2))}
          </div>
        </div>
      </div>
      ${legend()}`;
  }

  function boardBullpen(p) {
    const a = p.awayBp || {};
    const h = p.homeBp || {};
    return brandBar() + `
      <div class="gf-kicker">Bullpen vs Bullpen</div>
      <h1 class="gf-title">${p.away} @ ${p.home}</h1>
      <p class="gf-sub">Relief unit · ERA · Hi-Lev · FIP · K%</p>
      <div class="gf-row">
        <div class="gf-card">
          <div class="gf-team">${logo(p.away)}<div class="gf-abbr">${p.away} Pen</div></div>
          <div class="gf-label">Bullpen ERA</div>
          <div class="gf-hero">${chip(a.era, 'bp_era', false, 2)}</div>
          <div class="gf-meta">
            ${metaItem('Hi-Lev', chip(a.hiLevEra, 'bp_era', false, 2))}
            ${metaItem('FIP', chip(a.fip, 'bp_fip', false, 2))}
            ${metaItem('K%', chip(pctPoints(a.kPct), 'bp_kpct', false, 1))}
            ${metaItem('OSI all.', chip(a.osiAllowed, 'sp_osi_allowed', false, 1))}
          </div>
        </div>
        <div class="gf-vs">VS</div>
        <div class="gf-card">
          <div class="gf-team">${logo(p.home)}<div class="gf-abbr">${p.home} Pen</div></div>
          <div class="gf-label">Bullpen ERA</div>
          <div class="gf-hero">${chip(h.era, 'bp_era', false, 2)}</div>
          <div class="gf-meta">
            ${metaItem('Hi-Lev', chip(h.hiLevEra, 'bp_era', false, 2))}
            ${metaItem('FIP', chip(h.fip, 'bp_fip', false, 2))}
            ${metaItem('K%', chip(pctPoints(h.kPct), 'bp_kpct', false, 1))}
            ${metaItem('OSI all.', chip(h.osiAllowed, 'sp_osi_allowed', false, 1))}
          </div>
        </div>
      </div>
      ${legend()}`;
  }

  function boardCover(p) {
    // Site-faithful editorial: brand + arms hero + lineup edge + verdict
    const lean = (p.awayPs != null && p.homePs != null && p.homePs > p.awayPs)
      ? ('LEAN ' + (p.homeSP || p.home).split(' ').pop().toUpperCase())
      : (p.awayPs != null && p.homePs != null && p.awayPs > p.homePs)
        ? ('LEAN ' + (p.awaySP || p.away).split(' ').pop().toUpperCase())
        : 'WATCH';
    const aK = pctPoints(p.awayK); const hK = pctPoints(p.homeK);
    const aBB = pctPoints(p.awayBB); const hBB = pctPoints(p.homeBB);
    const edgeChip = (p.edgeNum != null) ? chip(50 + Number(p.edgeNum), 'osi', false, 1) : '';
    return brandBar() + `
      <div class="gf-kicker">${p.gameLabel ? p.gameLabel + ' · ' : ''}Matchup Board</div>
      <h1 class="gf-title">${p.away} @ ${p.home}</h1>
      <p class="gf-sub">${p.awaySP || 'TBD'} vs ${p.homeSP || 'TBD'} · ${p.time || ''}</p>
      <div class="gf-row">
        <div class="gf-card">
          <div class="gf-sp">${headshot(p.awaySP)}
            <div><div class="gf-sp-name">${p.awaySP}<span class="gf-hand">${p.awayHand}</span></div>
            <div class="gf-rec">${logo(p.away)} ${p.away}</div></div>
          </div>
          <div class="gf-label">Pitching Score</div>
          <div class="gf-hero">${chip(p.awayPs, 'pitching', null, 0)}</div>
          <div class="gf-meta">
            ${metaItem('K%', chip(aK, 'kpct', false, 1))}
            ${metaItem('BB%', chip(aBB, 'bbpct', false, 1))}
            ${metaItem('HR/9', chip(p.awayHR9, 'hr9', false, 2))}
          </div>
        </div>
        <div class="gf-vs">VS</div>
        <div class="gf-card">
          <div class="gf-sp">${headshot(p.homeSP)}
            <div><div class="gf-sp-name">${p.homeSP}<span class="gf-hand">${p.homeHand}</span></div>
            <div class="gf-rec">${logo(p.home)} ${p.home}</div></div>
          </div>
          <div class="gf-label">Pitching Score</div>
          <div class="gf-hero">${chip(p.homePs, 'pitching', null, 1)}</div>
          <div class="gf-meta">
            ${metaItem('K%', chip(hK, 'kpct', false, 1))}
            ${metaItem('BB%', chip(hBB, 'bbpct', false, 1))}
            ${metaItem('HR/9', chip(p.homeHR9, 'hr9', false, 2))}
          </div>
        </div>
      </div>
      <div class="gf-note">Lineup OSI ${chip(p.awayOsi.osi, 'osi', false, 1)} vs ${chip(p.homeOsi.osi, 'osi', false, 1)}
        ${p.edgeTeam ? ' · ' + p.edgeTeam + ' ' : ''}${edgeChip}</div>
      <div class="gf-verdict">${lean}</div>
      ${legend()}`;
  }

  window.__gptShowFocus = async function(away, home, shot, override) {
    const host = ensureHost();
    host.hidden = false;
    host.innerHTML = '<div id="gptFocus" class="ca-board"><p class="gf-sub">Loading…</p></div>';
    const p = await loadPack(away, home, override || null);
    let html = '';
    let coverCls = '';
    if (shot === 'header') html = boardHeader(p);
    else if (shot === 'lineup') html = boardLineup(p);
    else if (shot === 'arms') html = boardArms(p);
    else if (shot === 'bullpen') html = boardBullpen(p);
    else if (shot === 'cover') { html = boardCover(p); coverCls = ' gf-cover'; }
    else throw new Error('unknown shot ' + shot);
    host.innerHTML = '<div id="gptFocus" class="ca-board' + coverCls + '">' + html + '</div>';
    document.querySelectorAll('.chase-header, .compare-page, .mc-compare-nav').forEach(el => {
      el.style.visibility = 'hidden';
    });
    return true;
  };

  window.__gptHideFocus = function() {
    const host = document.getElementById('gptFocusHost');
    if (host) host.hidden = true;
    document.querySelectorAll('.chase-header, .compare-page, .mc-compare-nav').forEach(el => {
      el.style.visibility = '';
    });
  };
})();
"""

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD), **kwargs)

    def log_message(self, fmt, *args):  # noqa: A003
        return


def start_server() -> socketserver.TCPServer:
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), QuietHandler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def wait_ready(page, timeout_ms: int = 90000) -> None:
    page.wait_for_selector(".mc-header, #compareRoot", timeout=timeout_ms)
    page.wait_for_timeout(2500)


def capture_focused(page, away: str, home: str, shot: str, out_dir: Path) -> Path | None:
    url = (
        f"http://127.0.0.1:{PORT}/matchup_compare.html"
        f"?away={away}&home={home}&compare=lvL&lvWin=ytd"
    )
    page.goto(url, wait_until="domcontentloaded", timeout=90000)
    wait_ready(page)
    page.evaluate(FOCUS_BOOTSTRAP)
    override = SP_OVERRIDES.get(f"{away}@{home}")
    page.evaluate(
        """async ([away, home, shot, override]) => {
          await window.__gptShowFocus(away, home, shot, override);
        }""",
        [away, home, shot, override],
    )
    page.wait_for_timeout(600)
    out_path = out_dir / f"{away}_{home}_{shot}.png"
    board = page.locator("#gptFocus")
    if board.count() == 0:
        return None
    board.screenshot(path=str(out_path), type="png")
    page.evaluate("() => window.__gptHideFocus && window.__gptHideFocus()")
    return out_path if out_path.exists() else None


def write_gpt_index(out_dir: Path, written: list[tuple[str, str, Path]]) -> Path:
    lines = [
        "# GPT REFERENCE — one crop per bullet",
        "",
        "Use ONLY these images. Each file = ONE talking point. Do not invent extra modules.",
        "",
    ]
    by_game: dict[str, list[tuple[str, Path]]] = {}
    for game, shot, path in written:
        by_game.setdefault(game, []).append((shot, path))

    bullet_copy = {
        "LAD@NYY": {
            "header": "Prime Time identity / records",
            "lineup": "LAD healthier — OSI edge only",
            "arms": "Sasaki vs Cole — Pitching Score only",
            "bullpen": "Both pens — ERA / Hi-Lev / FIP",
        },
        "TBR@BOS": {
            "cover": "Game 1 cover — Jax vs Bennett (site chips)",
            "header": "AL East race / records",
            "lineup": "Rays healthier — OSI edge only",
            "arms": "Jax vs Bennett — Pitching Score only",
        },
        "PIT@CLE": {
            "header": "Identity / records",
            "lineup": "PIT elite offense — OSI only",
            "bullpen": "CLE pen vs PIT pen — ERA duo",
        },
        "TEX@ATL": {
            "header": "Identity / records",
            "arms": "Sale vs Quantrill — Pitching Score only",
            "bullpen": "ATL pen vs TEX pen — ERA duo",
        },
        "MIA@MIL": {
            "header": "Identity / records",
            "arms": "Henderson vs Alcantara — Pitching Score only",
            "lineup": "MIL lineup edge — OSI only",
        },
    }

    for game, shots in by_game.items():
        lines.append(f"## {game}")
        copy = bullet_copy.get(game, {})
        for shot, path in shots:
            label = copy.get(shot, shot)
            lines.append(f"- `{path.name}` → {label}")
        lines.append("")

    lines.extend(
        [
            "## Condensed graphic rules",
            "- 1080×1350, top-70% crop-safe",
            "- Max 5 rows: header, hook, 3 tiles, hero number, verdict",
            "- Max ~40 words on canvas",
            "- Leave [TEAM LOGO] / [HEADSHOT] placeholders — do not invent marks",
            "- Pull numbers ONLY from these crops + caption pack",
            "",
        ]
    )
    path = out_dir / "GPT_FOCUSED_INDEX.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.add_argument("--games", default="")
    ap.add_argument(
        "--shots",
        default="",
        help="Comma list of shots to capture (default: per-game bullets or all). "
        "Example: --shots bullpen",
    )
    args = ap.parse_args()

    date = args.date or datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    out_dir = OUT_ROOT / date / "matchup_focused"
    out_dir.mkdir(parents=True, exist_ok=True)
    social_dir = Path(
        r"C:\Users\chase\mlbma_pipeline\outputs\social_queue\cards\matchup_focused"
    )
    social_dir.mkdir(parents=True, exist_ok=True)

    shot_override = [s.strip() for s in args.shots.split(",") if s.strip()]

    if args.games.strip():
        games = []
        for g in args.games.split(","):
            a, h = g.strip().upper().split("@")
            games.append((a, h))
    else:
        games = _slate_games()
        if games:
            print(f"Using live slate ({len(games)} games) from Today_Matchups / MLB API")
        else:
            print("WARNING: no live slate found — falling back to legacy DEFAULT_GAMES")
            games = DEFAULT_GAMES

    httpd = start_server()
    time.sleep(0.4)
    from playwright.sync_api import sync_playwright

    written: list[tuple[str, str, Path]] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(
                viewport={"width": 900, "height": 1100},
                device_scale_factor=2,
            )
            for away, home in games:
                key = f"{away}@{home}"
                shots = shot_override or GAME_BULLETS.get(key, DEFAULT_SHOTS)
                print(f"==> {key} focused: {', '.join(shots)}")
                for shot in shots:
                    try:
                        path = capture_focused(page, away, home, shot, out_dir)
                        if path:
                            written.append((key, shot, path))
                            print(f"  ok {shot} -> {path.name}")
                        else:
                            print(f"  miss {shot}")
                    except Exception as exc:
                        print(f"  fail {shot}: {exc}")
            browser.close()
    finally:
        httpd.shutdown()

    for _, _, path in written:
        shutil.copy2(path, social_dir / path.name)

    index = write_gpt_index(out_dir, written)
    print(f"Wrote {len(written)} focused crops -> {out_dir}")
    print(f"Mirrored to {social_dir}")
    print(f"GPT index: {index}")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
