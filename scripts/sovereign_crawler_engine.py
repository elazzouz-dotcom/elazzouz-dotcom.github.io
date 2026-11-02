#!/usr/bin/env python3
"""Safe, bounded crawler for public URLs configured on SemVer nodes.

The structural registry is read-only. Crawl results are written to a separate
report so link health can never corrupt the 6600-node topology.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, build_opener
import ipaddress

EXPECTED_NODES = 6600
DEFAULT_REGISTRY = Path("semver-node-metrics.json")
DEFAULT_REPORT = Path("reports/sovereign-crawl-report.json")
USER_AGENT = "Slaks-SovereignCrawler/1.0 (+https://elazzouz-dotcom.github.io/semver-bnf/)"


def is_public_host(hostname: str) -> bool:
    host = (hostname or "").strip().lower().rstrip(".")
    if not host or host in {"localhost", "localhost.localdomain"} or host.endswith((".local", ".internal", ".localhost")):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return "." in host and not host.endswith(".test")
    return not (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast)


def valid_public_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not is_public_host(parsed.hostname):
        return None
    if parsed.username or parsed.password:
        return None
    return parsed.geturl()


def load_targets(registry_path: Path, limit: int) -> tuple[list[dict], int]:
    data = json.loads(registry_path.read_text(encoding="utf-8"))
    nodes = data.get("nodes", [])
    if len(nodes) != EXPECTED_NODES:
        raise ValueError(f"registry must contain {EXPECTED_NODES} nodes, found {len(nodes)}")
    targets = []
    skipped = 0
    seen: set[str] = set()
    for node in nodes:
        url = valid_public_url(node.get("url") if isinstance(node, dict) else None)
        if not url or url in seen:
            if isinstance(node, dict) and node.get("url"):
                skipped += 1
            continue
        seen.add(url)
        targets.append({"node_id": node.get("id"), "url": url})
        if len(targets) >= limit:
            break
    return targets, skipped


def crawl_one(target: dict, timeout: float, max_bytes: int) -> dict:
    started = time.monotonic()
    url = target["url"]
    result = {"node_id": target["node_id"], "url": url, "status_code": None, "health": "فشل", "bytes_read": 0}
    try:
        request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.2"})
        with build_opener().open(request, timeout=timeout) as response:
            body = response.read(max_bytes + 1)
            result["status_code"] = response.status
            result["content_type"] = response.headers.get_content_type()
            result["bytes_read"] = min(len(body), max_bytes)
            result["truncated"] = len(body) > max_bytes
            result["health"] = "سليم" if 200 <= response.status < 400 else "يحتاج مراجعة"
    except (HTTPError, URLError, TimeoutError, socket.timeout, ValueError) as error:
        result["error"] = str(error)[:240]
    result["latency_ms"] = round((time.monotonic() - started) * 1000, 1)
    result["scanned_at"] = datetime.now(timezone.utc).isoformat()
    return result


def run(registry: Path, report: Path, limit: int, timeout: float, max_bytes: int, workers: int) -> int:
    targets, skipped = load_targets(registry, limit)
    print(f"[بدء الزحف الآمن] 6600 عقدة مفحوصة · أهداف عامة مهيأة: {len(targets)} · متجاوزة: {skipped}")
    results = []
    if targets:
        with ThreadPoolExecutor(max_workers=max(1, min(workers, len(targets)))) as pool:
            futures = [pool.submit(crawl_one, target, timeout, max_bytes) for target in targets]
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
                print(f"  N-{int(result['node_id']):03d} · {result['health']} · {result['url']}")
    results.sort(key=lambda item: int(item["node_id"]))
    report.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "registry": str(registry),
        "nodeCount": EXPECTED_NODES,
        "targetCount": len(targets),
        "skippedInvalidOrDuplicate": skipped,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "limits": {"timeoutSeconds": timeout, "maxBytesPerResponse": max_bytes, "workers": workers},
        "results": results,
    }
    report.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    healthy = sum(item["health"] == "سليم" for item in results)
    print(f"[اكتمل الزحف] {healthy}/{len(results)} أهداف سليمة · التقرير: {report}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded public URL crawler for SemVer nodes")
    parser.add_argument("--registry", type=Path, default=Path(os.getenv("CRAWL_REGISTRY", DEFAULT_REGISTRY)))
    parser.add_argument("--report", type=Path, default=Path(os.getenv("CRAWL_REPORT", DEFAULT_REPORT)))
    parser.add_argument("--limit", type=int, default=int(os.getenv("CRAWL_LIMIT", EXPECTED_NODES)))
    parser.add_argument("--timeout", type=float, default=float(os.getenv("CRAWL_TIMEOUT", "8")))
    parser.add_argument("--max-bytes", type=int, default=int(os.getenv("CRAWL_MAX_BYTES", "300000")))
    parser.add_argument("--workers", type=int, default=int(os.getenv("CRAWL_WORKERS", "4")))
    args = parser.parse_args()
    if args.limit < 1 or args.limit > EXPECTED_NODES or args.workers < 1 or args.max_bytes < 1024:
        print("invalid crawler limits", file=sys.stderr)
        return 2
    try:
        return run(args.registry, args.report, args.limit, args.timeout, args.max_bytes, args.workers)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[فشل الزحف] {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
