#!/usr/bin/env python3
"""Run local, mobile Lighthouse performance/accessibility checks without public uploads."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PAGES = (("home", "/"), ("apps", "/apps/"), ("ai-tools", "/ai-tools/"), ("stream", "/stream/"))
MIN_PERFORMANCE = 0.60
MIN_ACCESSIBILITY = 0.90


class QuietSiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, _format, *args):
        pass


def main() -> int:
    browser = next(
        (shutil.which(name) for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser") if shutil.which(name)),
        None,
    )
    if not browser:
        print("No Chrome/Chromium executable found on PATH; Lighthouse cannot run.", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env["CHROME_PATH"] = browser
    chrome_flags = env.get("LHCI_CHROME_FLAGS", "--headless")
    report_dir = Path(tempfile.mkdtemp(prefix="lighthouse-ci-"))

    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietSiteHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    failures: list[str] = []

    try:
        with urlopen(base_url, timeout=10) as response:
            if response.status != 200:
                raise RuntimeError(f"Local preview returned HTTP {response.status}")

        for slug, path in PAGES:
            report_path = report_dir / f"{slug}.json"
            command = [
                "pnpm", "exec", "lighthouse", f"{base_url}{path}",
                "--output=json", f"--output-path={report_path}",
                "--only-categories=performance,accessibility",
                "--form-factor=mobile", f"--chrome-flags={chrome_flags}", "--quiet",
            ]
            print(f"Running Lighthouse mobile audit: {slug} ({path})", flush=True)
            result = subprocess.run(
                command,
                cwd=ROOT,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=240,
                check=False,
            )
            if result.returncode != 0:
                print(result.stdout[-5000:], file=sys.stderr)
                failures.append(f"{slug}: Lighthouse command failed with exit code {result.returncode}")
                continue

            report = json.loads(report_path.read_text(encoding="utf-8"))
            performance = report["categories"]["performance"]["score"]
            accessibility = report["categories"]["accessibility"]["score"]
            print(
                f"{slug}: performance {performance:.0%} (minimum {MIN_PERFORMANCE:.0%}); "
                f"accessibility {accessibility:.0%} (minimum {MIN_ACCESSIBILITY:.0%})",
                flush=True,
            )
            if performance < MIN_PERFORMANCE:
                failures.append(f"{slug}: performance score below {MIN_PERFORMANCE:.0%}")
            if accessibility < MIN_ACCESSIBILITY:
                failures.append(f"{slug}: accessibility score below {MIN_ACCESSIBILITY:.0%}")

        print(f"Temporary JSON reports: {report_dir}")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    if failures:
        print("\nLighthouse checks failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("All Lighthouse mobile thresholds passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
