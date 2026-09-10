#!/usr/bin/env python3
"""Phase 6 boundary proof: crawl every public route with a real browser.

The static validator reads files. This watches a running page and asserts the
prohibition against two things the files cannot show:

  1. Every network payload the page actually receives - not merely what it
     renders. A field that arrives and is left unrendered has still been
     published to the reader's machine.
  2. The rendered text of every section, after the evidence stack has resolved.

It also pins the three structural rules the handoff closes on: Model Center is
the only route that requests an entitled artifact, the parked sports appear in
neither navigation nor content, and past results are not a destination.

Usage:  python scripts/public_boundary_crawl.py [base_url]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "design" / "public_metric_classification.json")
                  .read_text(encoding="utf-8"))
PRIVATE_CLASSES = {n for n, m in SPEC["classes"].items() if not m["public"]}
PRIVATE_KEYS = {k for name in PRIVATE_CLASSES for k in SPEC.get(name, [])}

# `rank` and `note` are private only in the wrong position, and the payload
# check is a blunt key-name scan, so the path-sensitive ones are checked by
# the classifier instead (scripts/validate_public_fields.py).
PATH_SENSITIVE = {"rank", "note", "teams", "evidence", "constants", "value", "count"}
PAYLOAD_BANNED = sorted(PRIVATE_KEYS - PATH_SENSITIVE)

# Phrases that would give a factual page a betting voice.
PROHIBITED_TEXT = re.compile(
    r"\b(?:model (?:vs\.?|versus) market|projected (?:score|runs|points|total)|"
    r"win probability|betting edge|model edge|confidence score|"
    r"recommended pick|our pick|best bet|lean(?:s|ing)? (?:to|toward)|"
    r"against the spread|moneyline|implied probability)\b", re.I)

# Hosts that serve an entitled artifact. Only Model Center may talk to one.
ENTITLED = ("/api/model-center/", "alphakiller1.github.io")


def routes(base: str, slates: dict) -> list[tuple[str, str]]:
    out = [("home", f"{base}/"),
           ("mlb slate", f"{base}/mlb/"),
           ("mlb matchups", f"{base}/mlb/matchups.html"),
           ("nfl slate", f"{base}/nfl/"),
           ("nfl matchups", f"{base}/nfl/matchups.html"),
           ("glossary", f"{base}/dashboard/glossary.html")]
    mlb = (slates.get("mlb") or {}).get("games") or []
    nfl = (slates.get("nfl") or {}).get("games") or []
    if mlb:
        out.append(("mlb matchup analysis",
                    f"{base}/mlb/matchup.html?game={mlb[0].get('game_pk') or mlb[0]['id']}"))
    if nfl:
        out.append(("nfl matchup analysis", f"{base}/nfl/matchup.html?game={nfl[0]['id']}"))
    return out


def payload_keys(obj, path="$"):
    found = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            found.append((key, f"{path}.{key}"))
            found.extend(payload_keys(value, f"{path}.{key}"))
    elif isinstance(obj, list):
        for value in obj[:40]:
            found.extend(payload_keys(value, f"{path}[]"))
    return found


def main(argv: list[str]) -> int:
    base = (argv[1] if len(argv) > 1 else "http://127.0.0.1:8765").rstrip("/")
    slates = {}
    for sport in ("mlb", "nfl"):
        path = ROOT / "data" / "public" / sport / "slate.json"
        if path.is_file():
            slates[sport] = json.loads(path.read_text(encoding="utf-8"))

    failures: list[str] = []
    checks = 0

    def check(label: str, ok: bool, detail: str = "") -> None:
        nonlocal checks
        checks += 1
        print(f"{'PASS' if ok else 'FAIL'} | {label}" + (f" | {detail}" if detail else ""))
        if not ok:
            failures.append(f"{label}{': ' + detail if detail else ''}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        for name, url in routes(base, slates):
            leaks: list[str] = []
            entitled_calls: list[str] = []
            console: list[str] = []

            def on_response(response, leaks=leaks):
                if response.request.resource_type not in {"fetch", "xhr", "document"}:
                    return
                ctype = (response.headers or {}).get("content-type", "")
                if "json" not in ctype:
                    return
                try:
                    body = response.json()
                except Exception:
                    return
                for key, where in payload_keys(body):
                    if key in PAYLOAD_BANNED:
                        leaks.append(f"{key} at {where} from {response.url.split('?')[0]}")

            def on_request(request, calls=entitled_calls):
                if any(token in request.url for token in ENTITLED):
                    calls.append(request.url.split("?")[0])

            page.on("response", on_response)
            page.on("request", on_request)
            page.on("pageerror", lambda e: console.append(str(e)[:160]))
            page.goto(url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(9000 if "matchup.html" in url else 4000)

            text = page.locator("main").inner_text() if page.locator("main").count() else ""
            match = PROHIBITED_TEXT.search(text)
            check(f"{name}: no betting voice in rendered copy", match is None,
                  match.group(0) if match else "")
            check(f"{name}: no private field in any payload", not leaks,
                  "; ".join(sorted(set(leaks))[:3]))
            check(f"{name}: requests no entitled artifact", not entitled_calls,
                  "; ".join(sorted(set(entitled_calls))[:2]))
            check(f"{name}: no page errors", not console, "; ".join(console[:2]))
            html = page.content().lower()
            parked = [s for s in ("/wnba/", "/cfb/") if s in html]
            check(f"{name}: parked sports absent", not parked, ", ".join(parked))
            page.remove_listener("response", on_response)
            page.remove_listener("request", on_request)

        # Past results are not a public destination.
        for sport in ("mlb", "nfl", "wnba", "cfb"):
            status = page.request.get(f"{base}/{sport}/results.html").status
            check(f"{sport}: results route is gone", status == 404, f"status={status}")

        # Model Center is the one route allowed to touch the entitlement path at
        # all. Signed out it asks /api/me and stops there - it must not request
        # the board itself without an entitled answer.
        mc_calls: list[str] = []
        page.on("request", lambda r: mc_calls.append(r.url.split("?")[0])
                if ("/api/me" in r.url or "/api/model-center/" in r.url) else None)
        page.goto(f"{base}/model-center/", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(4000)
        check("model center: checks entitlement",
              any(url.endswith("/api/me") for url in mc_calls),
              f"calls={sorted(set(mc_calls))}")
        check("model center: does not request the board unentitled",
              not any("/api/model-center/board" in url for url in mc_calls))

        browser.close()

    print("---")
    print(f"TOTAL {checks} PASS {checks - len(failures)} FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
