#!/usr/bin/env python3
"""Validate and optionally deploy the Slaks Cloudflare Preview Worker.

Default mode performs a read-only local audit and a live cache probe. Use
--local-only in CI before deployment and --live-only immediately afterward.
Secrets are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tomllib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKER_URL = "https://github-oauth-proxy.elazzouz4.workers.dev"
DEFAULT_TARGET_URL = "https://example.com"
WRANGLER_VERSION = "4.107.0"
SITE_ORIGIN = "https://elazzouz-dotcom.github.io"
EXPECTED_CACHE_VERSION = "v2"
EXPECTED_CACHE_TTL = 300


@dataclass
class Result:
    name: str
    ok: bool
    detail: str


def local_audit(worker_file: Path, wrangler_file: Path, workflow_file: Path) -> list[Result]:
    results: list[Result] = []
    if not worker_file.is_file():
        return [Result("local Worker source", False, f"missing file: {worker_file}")]
    source = worker_file.read_text(encoding="utf-8")
    results.append(Result("local Worker source", True, str(worker_file.relative_to(ROOT))))

    route_ok = (
        "path === '/preview' && method === 'GET'" in source
        and "ctx.exports.Preview.fetch" in source
        and "export class Preview extends WorkerEntrypoint" in source
    )
    results.append(Result(
        "isolated /preview entrypoint",
        route_ok,
        "GET /preview routes to the named Preview entrypoint" if route_ok else "named entrypoint routing is missing",
    ))

    safety_ok = (
        "previewPublicHost" in source
        and "previewCleanHtml" in source
        and "X-Preview-Cacheable" in source
        and "headers.delete('X-Preview-Cacheable')" in source
    )
    results.append(Result(
        "preview safety guards",
        safety_ok,
        "public-host validation, HTML cleanup, and internal marker removal found" if safety_ok else "safety guards are incomplete",
    ))

    version_key_ok = (
        f"PREVIEW_CACHE_VERSION = '{EXPECTED_CACHE_VERSION}'" in source
        and f"PREVIEW_CACHE_TTL = {EXPECTED_CACHE_TTL}" in source
        and "Cloudflare-Workers-Version-Key" in source
    )
    results.append(Result(
        "five-minute versioned cache policy",
        version_key_ok,
        f"version={EXPECTED_CACHE_VERSION}; ttl={EXPECTED_CACHE_TTL}s; explicit version key"
        if version_key_ok else "version, TTL, or cache version key does not match contract",
    ))

    bypass_ok = "searchParams.get('refresh') === '1'" in source and "X-Preview-Cache', 'BYPASS'" in source
    exposed_ok = "CF-Cache-Status" in source and "'Vary': 'Origin'" in source
    results.append(Result(
        "refresh and cache-status headers",
        bypass_ok and exposed_ok,
        "refresh=1 bypass plus CORS-exposed CF-Cache-Status found" if bypass_ok and exposed_ok
        else "bypass or CORS cache-status exposure is missing",
    ))

    if not wrangler_file.is_file():
        results.append(Result("Wrangler configuration", False, f"missing file: {wrangler_file}"))
    else:
        try:
            config = tomllib.loads(wrangler_file.read_text(encoding="utf-8"))
            exports = config.get("exports", {})
            default_cache = exports.get("default", {}).get("cache", {})
            preview_cache = exports.get("Preview", {}).get("cache", {})
            cache_ok = (
                config.get("name") == "github-oauth-proxy"
                and Path(config.get("main", "")).name == worker_file.name
                and config.get("cache", {}).get("enabled") is True
                and config.get("cache", {}).get("cross_version_cache") is False
                and default_cache.get("enabled") is False
                and preview_cache.get("enabled") is True
                and config.get("keep_vars") is True
            )
            detail = (
                f"default cache={default_cache.get('enabled')}; "
                f"Preview cache={preview_cache.get('enabled')}; "
                f"cross-version={config.get('cache', {}).get('cross_version_cache')}; "
                f"keep-vars={config.get('keep_vars')}"
            )
            results.append(Result("per-entrypoint Wrangler cache config", cache_ok, detail))
        except (tomllib.TOMLDecodeError, OSError) as error:
            results.append(Result("per-entrypoint Wrangler cache config", False, f"invalid config: {error}"))

    if not workflow_file.is_file():
        results.append(Result("deployment workflow", False, f"missing file: {workflow_file}"))
    else:
        workflow = workflow_file.read_text(encoding="utf-8")
        pinned = bool(re.search(rf"wranglerVersion:\s*['\"]?{re.escape(WRANGLER_VERSION)}", workflow))
        local_gate = "test_preview_deployment.py --local-only" in workflow
        live_gate = "test_preview_deployment.py --live-only" in workflow
        conditional_deploy = (
            "id: cloudflare-secrets" in workflow
            and "steps.cloudflare-secrets.outputs.configured == 'true'" in workflow
            and "Report skipped automatic deployment" in workflow
        )
        results.append(Result(
            "pinned deployment and verification",
            pinned and local_gate and live_gate and conditional_deploy,
            f"Wrangler pinned={pinned}; local gate={local_gate}; live gate={live_gate}; "
            f"conditional deploy reporting={conditional_deploy}",
        ))
    return results


def http_json(url: str, timeout: float, origin: str = SITE_ORIGIN) -> tuple[int, dict[str, str], Any]:
    request = Request(url, headers={
        "Accept": "application/json",
        "Origin": origin,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    })
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

    # The random query component forces a cold entry without changing the target being previewed.
    probe_id = uuid.uuid4().hex
    preview_url = f"{base}/preview?url={quote(target_url, safe='')}&cache_probe={probe_id}"
    try:
        first_status, first_headers, first_payload = http_json(preview_url, timeout)
    except (URLError, TimeoutError, OSError) as error:
        return [Result("live /preview endpoint", False, f"network error: {error}")]

    payload_ok = (
        first_status == 200
        and isinstance(first_payload, dict)
        and isinstance(first_payload.get("html"), str)
        and bool(first_payload["html"])
    )
    if payload_ok:
        results.append(Result(
            "live /preview endpoint",
            True,
            f"HTTP 200; HTML={len(first_payload['html'])} chars; title={first_payload.get('title', '')}",
        ))
    elif first_status == 404 and isinstance(first_payload, dict) and "Route GET /preview not found" in str(first_payload.get("message", "")):
        results.append(Result("live /preview endpoint", False, "HTTP 404: route is not deployed on the live Worker"))
    elif first_status in {401, 403}:
        results.append(Result("live /preview endpoint", False, f"HTTP {first_status}: authorization or Worker access policy blocked the route"))
    else:
        results.append(Result("live /preview endpoint", False, f"HTTP {first_status}; {compact_payload(first_payload)}"))

    cors_ok = first_headers.get("access-control-allow-origin") == SITE_ORIGIN
    results.append(Result("preview CORS header", cors_ok, first_headers.get("access-control-allow-origin", "missing")))
    version_ok = first_headers.get("x-preview-cache-version") == EXPECTED_CACHE_VERSION
    results.append(Result("live cache version", version_ok, first_headers.get("x-preview-cache-version", "missing")))
    first_cache_status = first_headers.get("cf-cache-status", "").upper()
    miss_ok = payload_ok and first_cache_status == "MISS"
    results.append(Result("cold cache miss", miss_ok, f"first CF-Cache-Status={first_cache_status or 'missing'}"))

    if not payload_ok:
        return results

    try:
        second_status, second_headers, second_payload = http_json(preview_url, timeout)
    except (URLError, TimeoutError, OSError) as error:
        results.append(Result("cache hit", False, f"second request failed: {error}"))
        return results
    hit = second_status == 200 and second_headers.get("cf-cache-status", "").upper() == "HIT"
    results.append(Result(
        "cache hit",
        hit,
        f"second request CF-Cache-Status={second_headers.get('cf-cache-status', 'missing')}; first={first_headers.get('cf-cache-status', 'missing')}",
    ))

    secondary_origin = "https://onecompiler.com"
    try:
        variant_status, variant_headers, _ = http_json(preview_url, timeout, origin=secondary_origin)
        origin_ok = (
            variant_status == 200
            and variant_headers.get("access-control-allow-origin") == secondary_origin
            and "origin" in variant_headers.get("vary", "").lower()
        )
        origin_detail = (
            f"HTTP {variant_status}; allow-origin="
            f"{variant_headers.get('access-control-allow-origin', 'missing')}; "
            f"CF-Cache-Status={variant_headers.get('cf-cache-status', 'missing')}"
        )
    except (URLError, TimeoutError, OSError) as error:
        origin_ok = False
        origin_detail = f"request failed: {error}"
    results.append(Result("CORS origin cache isolation", origin_ok, origin_detail))

    bypass_url = preview_url + "&refresh=1"
    try:
        bypass_status, bypass_headers, _ = http_json(bypass_url, timeout)
    except (URLError, TimeoutError, OSError) as error:
        results.append(Result("refresh=1 bypass", False, f"bypass request failed: {error}"))
        return results
    bypass_ok = (
        bypass_status == 200
        and bypass_headers.get("x-preview-cache", "").upper() == "BYPASS"
        and "no-store" in bypass_headers.get("cache-control", "").lower()
    )
    results.append(Result(
        "refresh=1 bypass",
        bypass_ok,
        f"marker={bypass_headers.get('x-preview-cache', 'missing')}; CF-Cache-Status={bypass_headers.get('cf-cache-status', 'missing')}",
    ))

    try:
        health_status, health_headers, _ = http_json(f"{base}/health", timeout)
        health_again_status, health_again_headers, _ = http_json(f"{base}/health", timeout)
        health_not_cached = (
            health_status == 200
            and health_again_status == 200
            and "no-store" in health_headers.get("cache-control", "").lower()
            and health_again_headers.get("cf-cache-status", "").upper() != "HIT"
        )
        health_detail = (
            f"HTTP {health_status}/{health_again_status}; "
            f"second CF-Cache-Status={health_again_headers.get('cf-cache-status', 'missing')}"
        )
    except (URLError, TimeoutError, OSError) as error:
        health_not_cached = False
        health_detail = f"request failed: {error}"
    results.append(Result("non-preview routes stay uncached", health_not_cached, health_detail))
    return results


def check_wrangler_auth(timeout: float) -> Result:
    """Run a non-interactive Wrangler identity check before any deployment."""
    command = ["npx", "--yes", f"wrangler@{WRANGLER_VERSION}", "whoami"]
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
        return Result("Wrangler authentication", False, "not authenticated; configure CLOUDFLARE_API_TOKEN, then retry")
    if re.search(r"permission|forbidden|unauthorized|authentication|api token", output, re.I) and completed.returncode != 0:
        return Result("Wrangler authentication", False, "Cloudflare rejected the current credentials; no secrets printed")
    if completed.returncode != 0:
        return Result("Wrangler authentication", False, f"identity check failed with exit {completed.returncode}")

    identity = next((line.strip() for line in output.splitlines() if line.strip() and "wrangler" not in line.lower()), "authenticated")
    return Result("Wrangler authentication", True, identity[:240])


def deploy(wrangler_file: Path, timeout: float) -> Result:
    command = ["npx", "--yes", f"wrangler@{WRANGLER_VERSION}", "deploy", "--config", str(wrangler_file)]
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
    print(f"Result: {'FAILED (' + str(len(failures)) + ' check(s) failed)' if failures else 'PASSED'}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit, optionally deploy, and probe the Slaks Cloudflare Preview Worker.")
    parser.add_argument("--worker-url", default=os.getenv("PREVIEW_WORKER_URL", DEFAULT_WORKER_URL), help="Published Worker base URL")
    parser.add_argument("--target-url", default=os.getenv("PREVIEW_TEST_TARGET", DEFAULT_TARGET_URL), help="Public URL fetched by /preview")
    parser.add_argument("--worker-file", type=Path, default=ROOT / "cloudflare-worker-oauth-proxy.js")
    parser.add_argument("--wrangler-file", type=Path, default=ROOT / "wrangler.toml")
    parser.add_argument("--workflow-file", type=Path, default=ROOT / ".github/workflows/deploy-worker.yml")
    parser.add_argument("--timeout", type=float, default=20.0)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--local-only", action="store_true", help="Run local source/config checks only")
    modes.add_argument("--live-only", action="store_true", help="Probe the deployed endpoint only")
    parser.add_argument("--deploy", action="store_true", help="Check Wrangler login, deploy, then run live cache probes")
    parser.add_argument("--check-auth", action="store_true", help="Check Wrangler login without deploying")
    args = parser.parse_args()

    results: list[Result] = []
    if not args.live_only:
        results.extend(local_audit(args.worker_file, args.wrangler_file, args.workflow_file))

    if args.check_auth or args.deploy:
        local_ok = all(result.ok for result in results)
        auth_result = check_wrangler_auth(max(args.timeout, 45.0))
        results.append(auth_result)
        if args.deploy:
            if local_ok and auth_result.ok:
                results.append(deploy(args.wrangler_file, max(args.timeout, 120.0)))
            else:
                results.append(Result("Wrangler deploy", False, "skipped because local checks or Wrangler authentication failed"))

    if not args.local_only:
        results.extend(probe_live(args.worker_url, args.target_url, args.timeout))

    print_report(results)
    return 1 if any(not result.ok for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
