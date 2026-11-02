#!/usr/bin/env python3
"""Validate and optionally deploy the Slaks Cloudflare Preview Worker.

Examples:
  python3 scripts/test_preview_deployment.py
  python3 scripts/test_preview_deployment.py --deploy
  PREVIEW_WORKER_URL=https://worker.example.workers.dev \
    python3 scripts/test_preview_deployment.py --deploy

The default mode is read-only: it audits the local Worker and probes the live
endpoint. Use --deploy only when Wrangler is authenticated and deployment is
intended. Secrets are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKER_URL = "https://github-oauth-proxy.elazzouz4.workers.dev"
DEFAULT_TARGET_URL = "https://example.com"


@dataclass
class Result:
    name: str
    ok: bool
    detail: str


def local_audit(worker_file: Path, wrangler_file: Path) -> list[Result]:
    results: list[Result] = []
    if not worker_file.is_file():
        return [Result("local Worker source", False, f"missing file: {worker_file}")]
    source = worker_file.read_text(encoding="utf-8")
    results.append(Result("local Worker source", True, str(worker_file.relative_to(ROOT))))
    route_ok = "path === '/preview'" in source and "handleExternalPreview" in source
    results.append(Result(
        "local /preview route",
        route_ok,
        "GET /preview handler found" if route_ok else "route or handler is missing",
    ))
    safe_fetch = "isPublicHostname" in source and "sanitizePreviewHtml" in source
    results.append(Result(
        "preview safety guards",
        safe_fetch,
        "public-host validation and HTML sanitization found" if safe_fetch else "safety guards are incomplete",
    ))
    if not wrangler_file.is_file():
        results.append(Result("Wrangler configuration", False, f"missing file: {wrangler_file}"))
    else:
        config = wrangler_file.read_text(encoding="utf-8")
        name_match = re.search(r"^name\s*=\s*['\"]([^'\"]+)['\"]", config, re.MULTILINE)
        main_match = re.search(r"^main\s*=\s*['\"]([^'\"]+)['\"]", config, re.MULTILINE)
        config_ok = bool(name_match and main_match and main_match.group(1) == worker_file.name)
        detail = f"name={name_match.group(1) if name_match else 'missing'}, main={main_match.group(1) if main_match else 'missing'}"
        results.append(Result("Wrangler configuration", config_ok, detail))
    return results


def http_json(url: str, timeout: float) -> tuple[int, dict[str, str], Any]:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Slaks-preview-deployment-test/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(2_000_000)
            headers = {key.lower(): value for key, value in response.headers.items()}
            try:
                payload: Any = json.loads(raw.decode("utf-8", "replace"))
            except json.JSONDecodeError:
                payload = raw.decode("utf-8", "replace")
            return response.status, headers, payload
    except HTTPError as error:
        raw = error.read(200_000)
        headers = {key.lower(): value for key, value in error.headers.items()}
        try:
            payload = json.loads(raw.decode("utf-8", "replace"))
        except json.JSONDecodeError:
            payload = raw.decode("utf-8", "replace")
        return error.code, headers, payload


def compact_payload(payload: Any) -> str:
    if isinstance(payload, dict):
        keys = ", ".join(str(key) for key in payload.keys())
        message = payload.get("message") or payload.get("error") or ""
        return f"keys=[{keys}]" + (f" message={message}" if message else "")
    return str(payload).replace("\n", " ")[:180]


def probe_live(worker_url: str, target_url: str, timeout: float) -> list[Result]:
    base = worker_url.rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return [Result("live Worker URL", False, f"invalid URL: {worker_url}")]
    results: list[Result] = []

    try:
        status, headers, payload = http_json(f"{base}/", timeout)
        root_ok = status == 200 and isinstance(payload, dict)
        results.append(Result("live Worker root", root_ok, f"HTTP {status}; {compact_payload(payload)}"))
    except (URLError, TimeoutError, OSError) as error:
        results.append(Result("live Worker root", False, f"network error: {error}"))
        return results

    preview_url = f"{base}/preview?url={quote(target_url, safe='')}"
    try:
        status, headers, payload = http_json(preview_url, timeout)
    except (URLError, TimeoutError, OSError) as error:
        results.append(Result("live /preview endpoint", False, f"network error: {error}"))
        return results

    if status == 200 and isinstance(payload, dict) and isinstance(payload.get("html"), str) and payload["html"]:
        results.append(Result("live /preview endpoint", True, f"HTTP 200; HTML={len(payload['html'])} chars; title={payload.get('title', '')}"))
    elif status == 404 and isinstance(payload, dict) and "Route GET /preview not found" in str(payload.get("message", "")):
        results.append(Result("live /preview endpoint", False, "HTTP 404: route is not deployed on the live Worker"))
    elif status in {401, 403}:
        results.append(Result("live /preview endpoint", False, f"HTTP {status}: authorization or Worker access policy blocked the route"))
    elif status >= 500:
        results.append(Result("live /preview endpoint", False, f"HTTP {status}: Worker/upstream failure; {compact_payload(payload)}"))
    else:
        results.append(Result("live /preview endpoint", False, f"HTTP {status}; {compact_payload(payload)}"))

    cors_ok = headers.get("access-control-allow-origin") in {"*", "https://elazzouz-dotcom.github.io"}
    results.append(Result("preview CORS header", cors_ok, headers.get("access-control-allow-origin", "missing")))
    return results


def check_wrangler_auth(timeout: float) -> Result:
    """Run a non-interactive Wrangler identity check before any deployment."""
    command = ["npx", "--yes", "wrangler", "whoami"]
    try:
        completed = subprocess.run(
            command,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return Result("Wrangler authentication", False, f"could not check login state: {error}")

    output = completed.stdout[-4000:]
    if re.search(r"not authenticated|please run .*wrangler login|login required", output, re.I):
        return Result(
            "Wrangler authentication",
            False,
            "not authenticated; run `wrangler login` or configure CLOUDFLARE_API_TOKEN, then retry",
        )
    if re.search(r"permission|forbidden|unauthorized|authentication|api token", output, re.I) and completed.returncode != 0:
        return Result("Wrangler authentication", False, "Cloudflare rejected the current credentials; no secrets printed")
    if completed.returncode != 0:
        return Result("Wrangler authentication", False, f"identity check failed with exit {completed.returncode}")

    identity = next((line.strip() for line in output.splitlines() if line.strip() and "wrangler" not in line.lower()), "authenticated")
    return Result("Wrangler authentication", True, identity[:240])


def deploy(wrangler_file: Path, timeout: float) -> Result:
    command = ["npx", "--yes", "wrangler", "deploy", "--config", str(wrangler_file)]
    try:
        completed = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        return Result("Wrangler deploy", False, f"could not run deployment: {error}")
    output = completed.stdout[-3000:].replace("\n", " ")
    if completed.returncode == 0:
        return Result("Wrangler deploy", True, output)
    if re.search(r"(permission|forbidden|unauthorized|authentication|not authorized|api token)", output, re.I):
        return Result("Wrangler deploy", False, "Cloudflare authorization/permission failed; no secrets printed")
    return Result("Wrangler deploy", False, f"exit {completed.returncode}: {output}")


def print_report(results: list[Result]) -> None:
    print("Slaks Preview deployment test")
    print("=" * 31)
    for result in results:
        marker = "PASS" if result.ok else "FAIL"
        print(f"[{marker}] {result.name}: {result.detail}")
    failures = [result for result in results if not result.ok]
    print("-" * 31)
    if failures:
        print(f"Result: FAILED ({len(failures)} check(s) failed)")
    else:
        print("Result: PASSED")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit, optionally deploy, and probe the Slaks Cloudflare Preview Worker.")
    parser.add_argument("--worker-url", default=os.getenv("PREVIEW_WORKER_URL", DEFAULT_WORKER_URL), help="Published Worker base URL")
    parser.add_argument("--target-url", default=os.getenv("PREVIEW_TEST_TARGET", DEFAULT_TARGET_URL), help="Public URL fetched by /preview")
    parser.add_argument("--worker-file", type=Path, default=ROOT / "cloudflare-worker-oauth-proxy.js")
    parser.add_argument("--wrangler-file", type=Path, default=ROOT / "wrangler.toml")
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--deploy", action="store_true", help="Check Wrangler login, then deploy before probing the live route")
    parser.add_argument("--check-auth", action="store_true", help="Check Wrangler login without deploying")
    args = parser.parse_args()

    results = local_audit(args.worker_file, args.wrangler_file)
    if args.check_auth or args.deploy:
        auth_result = check_wrangler_auth(max(args.timeout, 45.0))
        results.append(auth_result)
        if args.deploy:
            if auth_result.ok:
                results.append(deploy(args.wrangler_file, max(args.timeout, 120.0)))
            else:
                results.append(Result("Wrangler deploy", False, "skipped because Wrangler authentication did not pass"))
    results.extend(probe_live(args.worker_url, args.target_url, args.timeout))
    print_report(results)
    return 1 if any(not result.ok for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
