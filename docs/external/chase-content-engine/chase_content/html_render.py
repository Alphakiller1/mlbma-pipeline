"""HTML backend — render finals by screenshotting the live website export frames.

The visual source of truth for Chase daily graphics is the deployed product CSS, exposed as
1080×1350 export frames in the mlbma-pipeline repo:

    dashboard/content_export/morning_slate_frame.html
    dashboard/content_export/offensive_report_frame.html

Those frames read the same bundle shape this engine produces (see examples/sample_bundle.json),
so we simply serve the pipeline ``dashboard/`` directory over a local static server, open each
frame with ``?bundle=<url>`` in Playwright Chromium at deviceScaleFactor 2, wait for the frame's
``data-ce-ready`` flag, and screenshot.

This backend is intentionally thin and its browser dependency is OPTIONAL: the default Pillow
backend (chase_content/render.py) has no browser requirement. If Playwright or the frames dir is
unavailable, this backend fails closed with an actionable message.

See docs/WEBSITE_ARTIFACT_RENDER.md.
"""

from __future__ import annotations

import contextlib
import functools
import http.server
import socket
import socketserver
import threading
from pathlib import Path
from urllib.parse import quote

# report key -> (frame path under <frames-dir>, output filename)
FRAMES: dict[str, tuple[str, str]] = {
    "morning-slate": ("content_export/morning_slate_frame.html", "morning-slate-01.png"),
    "offensive-report": ("content_export/offensive_report_frame.html", "offensive-report.png"),
    # public-vs-sharp has no website frame yet — use the Pillow fallback backend for it.
}

VIEWPORT = {"width": 1080, "height": 1350}
DEVICE_SCALE_FACTOR = 2
READY_FLAG = "document.documentElement.dataset.ceReady === '1'"


class HtmlBackendError(RuntimeError):
    """Raised when the HTML backend cannot run (missing deps, frames, or reports)."""


def _require_playwright():
    try:
        from playwright.sync_api import sync_playwright  # noqa: WPS433 (optional import)
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise HtmlBackendError(
            "The HTML backend needs Playwright. Install it with:\n"
            '    pip install -e ".[html]"\n'
            "    python -m playwright install chromium\n"
            "Or fall back to the Pillow backend (drop --backend html)."
        ) from exc
    return sync_playwright


@contextlib.contextmanager
def _static_server(root: Path):
    """Serve ``root`` on an ephemeral localhost port for the duration of the context."""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))

    class _Quiet(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

        def log_message(self, *_args):  # noqa: D401 - silence access log
            pass

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    server = _Quiet(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()


def _reports_for(report: str) -> list[str]:
    if report == "all":
        return list(FRAMES)
    if report not in FRAMES:
        raise HtmlBackendError(
            f"No website frame for report '{report}'. "
            f"Available: {', '.join(FRAMES)} (use the Pillow backend for others)."
        )
    return [report]


def render_via_html(
    bundle_path: Path,
    out_dir: Path,
    frames_dir: Path,
    report: str = "all",
) -> list[Path]:
    """Screenshot the website export frames into ``out_dir``.

    Parameters
    ----------
    bundle_path: the canonical bundle JSON (output of ``chase-content migrate``).
    out_dir: directory to write PNGs into.
    frames_dir: the mlbma-pipeline ``dashboard/`` directory (contains ``content_export/``).
    report: ``all`` or a specific report key in :data:`FRAMES`.
    """
    frames_dir = frames_dir.resolve()
    bundle_path = bundle_path.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    for rel, _ in FRAMES.values():
        if not (frames_dir / rel).exists():
            raise HtmlBackendError(
                f"Export frame not found: {frames_dir / rel}. "
                "Point --frames-dir at the mlbma-pipeline 'dashboard' directory."
            )

    # Bundle must be reachable by the browser. Serve it from the frames dir so the frame can
    # fetch it via a same-origin relative URL.
    served_bundle = frames_dir / "content_export" / "_bundle_render.json"
    served_bundle.write_text(bundle_path.read_text(encoding="utf-8"), encoding="utf-8")

    sync_playwright = _require_playwright()
    written: list[Path] = []
    try:
        with _static_server(frames_dir) as base_url, sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(
                viewport=VIEWPORT, device_scale_factor=DEVICE_SCALE_FACTOR
            )
            bundle_url = base_url + "/content_export/" + quote(served_bundle.name)
            for key in _reports_for(report):
                rel, out_name = FRAMES[key]
                url = f"{base_url}/{rel}?bundle={quote(bundle_url, safe='')}"
                page.goto(url, wait_until="networkidle")
                page.wait_for_function(READY_FLAG, timeout=15000)
                target = out_dir / out_name
                page.screenshot(path=str(target))
                written.append(target)
            browser.close()
    finally:
        with contextlib.suppress(FileNotFoundError):
            served_bundle.unlink()
    return written
