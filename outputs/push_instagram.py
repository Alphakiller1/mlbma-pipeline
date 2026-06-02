import argparse
import json
import os
import textwrap
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv

from core.config import DATA_DIR, ENV_FILE, PROJECT_ROOT


GRAPH_VERSION = os.getenv("INSTAGRAM_GRAPH_VERSION", "v24.0")
GRAPH_BASE_URL = f"https://graph.facebook.com/{GRAPH_VERSION}"
DEFAULT_MANIFEST = PROJECT_ROOT / "outputs" / "instagram_post_manifest.json"


@dataclass
class InstagramPost:
    caption: str
    image_url: str | None
    generated_at: str
    source_files: list[str]
    dry_run: bool = True
    published_media_id: str | None = None


def _read_csv(filename: str) -> pd.DataFrame:
    path = DATA_DIR / filename
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def _fmt_score(value: Any, digits: int = 1) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "--"


def _top_convergence_lines(limit: int = 4) -> list[str]:
    df = _read_csv("signals_convergence.csv")
    if df.empty:
        return []

    plays = df.copy()
    if "is_convergence_play" in plays.columns:
        plays = plays[plays["is_convergence_play"].astype(str).str.lower() == "true"]
    if "convergence_count" in plays.columns:
        plays = plays.sort_values("convergence_count", ascending=False)

    lines = []
    for _, row in plays.head(limit).iterrows():
        side = str(row.get("side", "")).lower()
        team = row.get("away") if side == "away" else row.get("home")
        matchup = f"{row.get('away', '--')} at {row.get('home', '--')}"
        count = _fmt_score(row.get("convergence_count"), 0)
        direction = str(row.get("convergence_direction", "signal")).strip()
        lines.append(f"- {team}: {count}x {direction} convergence ({matchup})")
    return lines


def _top_matchup_lines(limit: int = 3) -> list[str]:
    df = _read_csv("today_matchups.csv")
    if df.empty or "Lineup_Edge" not in df.columns:
        return []

    scored = df.copy()
    scored["_edge_abs"] = (
        scored["Lineup_Edge"]
        .astype(str)
        .str.extract(r"([-+]?\d+(?:\.\d+)?)")[0]
        .astype(float)
        .abs()
    )
    scored = scored.sort_values("_edge_abs", ascending=False)

    lines = []
    for _, row in scored.head(limit).iterrows():
        time_label = str(row.get("Time", "")).strip()
        label = f"{row.get('Away', '--')} at {row.get('Home', '--')}"
        edge = str(row.get("Lineup_Edge", "--")).strip()
        time_suffix = f" ({time_label})" if time_label else ""
        lines.append(f"- {label}{time_suffix}: {edge}")
    return lines


def _top_team_lines(limit: int = 3) -> list[str]:
    df = _read_csv("team_profiles.csv")
    if df.empty or "osi_l14" not in df.columns:
        return []

    scored = df.copy()
    scored["osi_l14"] = pd.to_numeric(scored["osi_l14"], errors="coerce")
    scored = scored.dropna(subset=["osi_l14"]).sort_values("osi_l14", ascending=False)

    lines = []
    for _, row in scored.head(limit).iterrows():
        lines.append(
            f"- {row.get('team', '--')}: L14 OSI {_fmt_score(row.get('osi_l14'))}, "
            f"YTD OSI {_fmt_score(row.get('osi_ytd'))}"
        )
    return lines


def build_caption() -> str:
    convergence = _top_convergence_lines()
    matchups = _top_matchup_lines()
    teams = _top_team_lines()

    sections = ["MLBMA Daily Signals"]
    if convergence:
        sections.append("Convergence plays:\n" + "\n".join(convergence))
    if matchups:
        sections.append("Largest lineup edges:\n" + "\n".join(matchups))
    if teams:
        sections.append("Hot L14 team profiles:\n" + "\n".join(teams))

    sections.append(
        "Model-generated research snapshot. Not betting advice.\n"
        "#MLB #MLBAnalytics #SportsBetting #Baseball"
    )
    return "\n\n".join(sections)


def build_post(image_url: str | None = None) -> InstagramPost:
    return InstagramPost(
        caption=build_caption(),
        image_url=image_url or os.getenv("INSTAGRAM_IMAGE_URL"),
        generated_at=datetime.now().isoformat(timespec="seconds"),
        source_files=[
            "data/signals_convergence.csv",
            "data/today_matchups.csv",
            "data/team_profiles.csv",
        ],
    )


def write_manifest(post: InstagramPost, path: Path = DEFAULT_MANIFEST) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(post), indent=2), encoding="utf-8")
    print(f"Instagram manifest written: {path}")


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _post_graph(endpoint: str, payload: dict[str, str]) -> dict[str, Any]:
    response = requests.post(f"{GRAPH_BASE_URL}/{endpoint}", data=payload, timeout=60)
    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text}
    if not response.ok:
        raise RuntimeError(f"Instagram API error {response.status_code}: {body}")
    return body


def _get_graph(endpoint: str, params: dict[str, str]) -> dict[str, Any]:
    response = requests.get(f"{GRAPH_BASE_URL}/{endpoint}", params=params, timeout=60)
    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text}
    if not response.ok:
        raise RuntimeError(f"Instagram API error {response.status_code}: {body}")
    return body


def publish_photo(post: InstagramPost, poll_seconds: int = 30) -> str:
    if not post.image_url:
        raise RuntimeError(
            "Instagram requires a public image URL. Set INSTAGRAM_IMAGE_URL or pass --image-url."
        )

    access_token = _require_env("INSTAGRAM_ACCESS_TOKEN")
    ig_user_id = _require_env("INSTAGRAM_USER_ID")

    container = _post_graph(
        f"{ig_user_id}/media",
        {
            "image_url": post.image_url,
            "caption": post.caption,
            "access_token": access_token,
        },
    )
    creation_id = str(container["id"])

    deadline = time.time() + poll_seconds
    while time.time() < deadline:
        status = _get_graph(
            creation_id,
            {"fields": "status_code", "access_token": access_token},
        )
        if status.get("status_code") in {None, "FINISHED"}:
            break
        if status.get("status_code") == "ERROR":
            raise RuntimeError(f"Instagram container failed processing: {status}")
        time.sleep(3)

    published = _post_graph(
        f"{ig_user_id}/media_publish",
        {"creation_id": creation_id, "access_token": access_token},
    )
    media_id = str(published["id"])
    post.dry_run = False
    post.published_media_id = media_id
    return media_id


def run(
    publish: bool = False,
    image_url: str | None = None,
    manifest_path: Path = DEFAULT_MANIFEST,
) -> InstagramPost:
    load_dotenv(ENV_FILE)
    post = build_post(image_url=image_url)

    if publish:
        media_id = publish_photo(post)
        print(f"Instagram post published: {media_id}")
    else:
        preview = textwrap.shorten(post.caption.replace("\n", " "), width=180)
        print(f"Instagram dry run. Caption preview: {preview}")
        if not post.image_url:
            print("No image URL configured; publish mode will require INSTAGRAM_IMAGE_URL.")

    write_manifest(post, manifest_path)
    return post


def main() -> None:
    parser = argparse.ArgumentParser(description="Build or publish MLBMA Instagram posts.")
    parser.add_argument("--publish", action="store_true", help="Publish via Instagram Graph API.")
    parser.add_argument("--image-url", help="Public image URL to attach to the post.")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help="Where to write the generated post manifest.",
    )
    args = parser.parse_args()
    run(publish=args.publish, image_url=args.image_url, manifest_path=args.manifest)


if __name__ == "__main__":
    main()
