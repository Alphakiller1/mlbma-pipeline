#!/usr/bin/env python
"""Run all MLBMA platform diagnostics (UI, runtime, data) with an ephemeral local server."""

from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _run_script(name: str, args: list[str]) -> tuple[int, str]:
    cmd = [sys.executable, str(ROOT / "scripts" / name), *args]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run full MLBMA system diagnostic suite.")
    parser.add_argument("--port", type=int, default=0, help="HTTP port (0 = auto)")
    parser.add_argument("--timeout-ms", type=int, default=45000)
    parser.add_argument("--skip-data", action="store_true", help="Skip sheet/local data compare")
    args = parser.parse_args()

    port = args.port or _free_port()
    base = f"http://127.0.0.1:{port}"
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)

    suites: list[tuple[str, list[str]]] = [
        (
            "dashboard_runtime_diag.py",
            [
                "--base-url",
                f"{base}/dashboard/team_rankings.html?hubdebug=1&scope=team&team=NYY&family=scoring&hand=r&window=L30&loc=home",
                "--timeout-ms",
                str(args.timeout_ms),
            ],
        ),
        (
            "platform_ui_diag.py",
            ["--base-url", base, "--timeout-ms", str(min(args.timeout_ms, 30000))],
        ),
        (
            "trends_runtime_diag.py",
            ["--base-url", f"{base}/dashboard/chase_analytics_mlb_oem_v7.html", "--timeout-ms", str(args.timeout_ms)],
        ),
        (
            "compare_runtime_diag.py",
            ["--base-url", f"{base}/dashboard/chase_analytics_mlb_oem_v7.html", "--timeout-ms", str(args.timeout_ms)],
        ),
    ]
    if not args.skip_data:
        suites.append(("diagnose_hub_sheet_data.py", []))
        suites.append(("verify_window_data.py", []))

    print(f"FULL_SYSTEM_DIAGNOSTIC (http://127.0.0.1:{port})")
    print("=" * 60)

    failed = 0
    try:
        for script, script_args in suites:
            code, out = _run_script(script, script_args)
            print(out)
            print("-" * 60)
            if code != 0:
                failed += 1
                print(f"SUITE FAIL: {script} (exit {code})")
            else:
                print(f"SUITE PASS: {script}")
            print("-" * 60)
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()

    compile_proc = subprocess.run(
        [sys.executable, "-m", "compileall", "-q", "core", "pipeline", "scripts"],
        cwd=str(ROOT),
    )
    print("PYTHON_COMPILE", "PASS" if compile_proc.returncode == 0 else "FAIL")
    if compile_proc.returncode != 0:
        failed += 1

    print("=" * 60)
    if failed:
        print(f"OVERALL: FAIL ({failed} suite(s)/check(s) failed)")
        return 1
    print("OVERALL: PASS (all suites green)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
