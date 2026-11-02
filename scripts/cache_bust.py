#!/usr/bin/env python3
"""Append content hashes to local static asset URLs in HTML files for GitHub Pages."""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ASSET_EXTENSIONS = {'.css', '.js', '.mjs', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'}
ATTRIBUTE_RE = re.compile(r"(?P<prefix>\b(?:src|href)\s*=\s*[\"'])(?P<url>[^\"']+)(?P<suffix>[\"'])", re.IGNORECASE)
HASH_LENGTH = 12


def local_asset_path(html_path: Path, url: str, root: Path) -> Path | None:
    if not url or url.startswith(('#', '//', 'http:', 'https:', 'data:', 'mailto:', 'tel:', 'javascript:')):
        return None
    parts = urlsplit(url)
    path = parts.path
    if Path(path).suffix.lower() not in ASSET_EXTENSIONS:
        return None
    candidate = root / path.lstrip('/') if path.startswith('/') else html_path.parent / path
    try:
        candidate = candidate.resolve()
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def versioned_url(url: str, digest: str) -> str:
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != 'v']
    query.append(('v', digest))
    return urlunsplit(('', '', parts.path, urlencode(query), parts.fragment))


def process_file(html_path: Path, root: Path, dry_run: bool) -> int:
    original = html_path.read_text(encoding='utf-8')
    changed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        url = match.group('url')
        asset = local_asset_path(html_path, url, root)
        if asset is None:
            return match.group(0)
        digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:HASH_LENGTH]
        updated = versioned_url(url, digest)
        if updated == url:
            return match.group(0)
        changed += 1
        return f"{match.group('prefix')}{updated}{match.group('suffix')}"

    updated = ATTRIBUTE_RE.sub(replace, original)
    if changed and not dry_run:
        html_path.write_text(updated, encoding='utf-8')
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    total = 0
    files = 0
    for html_path in sorted(root.rglob('*.html')):
        if any(part in {'.git', 'node_modules'} for part in html_path.parts):
            continue
        changed = process_file(html_path, root, args.dry_run)
        if changed:
            files += 1
            total += changed
            print(f"{'would update' if args.dry_run else 'updated'} {html_path.relative_to(root)}: {changed} asset URLs")
    print(f"Cache busting: {total} asset URLs across {files} HTML files")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
