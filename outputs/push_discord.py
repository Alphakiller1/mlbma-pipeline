"""
Post to Discord — from the daily pipeline OR straight from a terminal / Claude Code.

Mirrors outputs/push_instagram.py: same daily-signals data, formatted for Discord.

Transport is auto-detected from the environment (webhook preferred — simplest):
  - DISCORD_WEBHOOK_URL                       a channel webhook URL (recommended)
  - DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID    posts via the existing bot instead

Command line (dry run by default — nothing is sent without --send):
  python -m outputs.push_discord --daily                 # preview the daily signals embed
  python -m outputs.push_discord --daily --send          # actually post it
  python -m outputs.push_discord --content "gm" --send   # post an arbitrary message

Importable (e.g. from pipeline/main.py to auto-post after the morning run):
  from outputs.push_discord import post_daily_signals, send_message
  post_daily_signals(send=True)

Secrets live in the .env file (load_dotenv) and must never be committed.
"""
import argparse
import json
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

from core.config import ENV_FILE
from outputs.push_instagram import (
    _top_convergence_lines,
    _top_matchup_lines,
    _top_team_lines,
)

SITE_URL = "https://chase-analytics.com"
DISCORD_API = "https://discord.com/api/v10"
BRAND_COLOR = 0x9A6BFF  # Chase Analytics purple
DEFAULT_USERNAME = "Chase Analytics"


def _transport():
    """Return ('webhook', url) | ('bot', (token, channel_id)) | (None, None)."""
    webhook = os.getenv("DISCORD_WEBHOOK_URL")
    if webhook:
        return "webhook", webhook
    token = os.getenv("DISCORD_BOT_TOKEN")
    channel = os.getenv("DISCORD_CHANNEL_ID")
    if token and channel:
        return "bot", (token, channel)
    return None, None


def send_message(content=None, embeds=None, username=None, send=False):
    """Post a message to Discord.

    With send=False (default) this is a DRY RUN: it prints the payload and posts nothing,
    so it's safe to wire into the pipeline before the webhook is configured.
    """
    payload = {}
    if content:
        payload["content"] = content
    if embeds:
        payload["embeds"] = embeds
    if not payload:
        raise ValueError("Nothing to send: pass content and/or embeds.")

    kind, cfg = _transport()

    if not send:
        print(f"[dry-run] would post to Discord via: {kind or 'NO TRANSPORT CONFIGURED'}")
        print(json.dumps(payload, indent=2)[:2000])
        if not kind:
            print(
                "Set DISCORD_WEBHOOK_URL (or DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID) "
                "in your .env, then re-run with --send."
            )
        return {"sent": False, "dry_run": True, "transport": kind}

    if not kind:
        raise RuntimeError(
            "No Discord transport configured. Set DISCORD_WEBHOOK_URL "
            "(or DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID) in your .env."
        )

    if kind == "webhook":
        if username:
            payload["username"] = username
        resp = requests.post(cfg, json=payload, params={"wait": "true"}, timeout=30)
    else:
        token, channel = cfg
        resp = requests.post(
            f"{DISCORD_API}/channels/{channel}/messages",
            headers={"Authorization": f"Bot {token}", "Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=30,
        )

    if not resp.ok:
        raise RuntimeError(f"Discord post failed {resp.status_code}: {resp.text[:500]}")
    print(f"Discord message posted via {kind} (HTTP {resp.status_code}).")
    return {"sent": True, "transport": kind, "status": resp.status_code}


def build_daily_embed():
    """Rich Discord embed built from today's pipeline signals (same source as Instagram)."""
    convergence = _top_convergence_lines()
    matchups = _top_matchup_lines()
    teams = _top_team_lines()

    fields = []
    if convergence:
        fields.append({"name": "🎯 Convergence plays", "value": "\n".join(convergence)[:1024], "inline": False})
    if matchups:
        fields.append({"name": "⚔️ Largest lineup edges", "value": "\n".join(matchups)[:1024], "inline": False})
    if teams:
        fields.append({"name": "🔥 Hot L14 team profiles", "value": "\n".join(teams)[:1024], "inline": False})
    if not fields:
        fields.append({
            "name": "No signals yet",
            "value": "Today's data hasn't been generated. Check back after the morning pipeline run.",
            "inline": False,
        })

    return {
        "title": "MLBMA Daily Signals",
        "url": SITE_URL,
        "description": f"Today's model snapshot — full board at {SITE_URL}",
        "color": BRAND_COLOR,
        "fields": fields,
        "footer": {"text": "Model-generated research. Not betting advice."},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def post_daily_signals(send=False):
    """Post (or dry-run) the daily signals embed. Call this from the pipeline."""
    return send_message(embeds=[build_daily_embed()], username=DEFAULT_USERNAME, send=send)


def main():
    load_dotenv(ENV_FILE)
    parser = argparse.ArgumentParser(description="Post to Discord (webhook or bot).")
    parser.add_argument("--content", help="Plain-text message to post.")
    parser.add_argument("--daily", action="store_true", help="Post today's daily signals embed.")
    parser.add_argument("--username", help="Override the webhook display name.")
    parser.add_argument("--send", action="store_true", help="Actually send (omit for a dry run).")
    args = parser.parse_args()

    if args.daily:
        post_daily_signals(send=args.send)
    elif args.content:
        send_message(content=args.content, username=args.username, send=args.send)
    else:
        parser.error("Provide --content '<text>' or --daily")


if __name__ == "__main__":
    main()
