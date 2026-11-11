#!/usr/bin/env python3
"""زاحف مصادر مصرح به ومحدود.

الاستخدام الدفاعي/التدقيق على نطاق تملكه أو لديك إذن صريح لفحصه.
لا يتجاوز robots.txt، ولا يزور نطاقات خارج القائمة المسموح بها، ولا ينفذ المحتوى.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import re
import socket
import time
import urllib.parse
import urllib.robotparser
from collections import Counter, deque
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

USER_AGENT = "Azzouz-CycleLab-AuthorizedCrawler/1.0 (+local defensive audit)"
IGNORED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".zip", ".exe", ".mp4", ".mp3", ".woff", ".woff2")
TOKEN_RE = re.compile(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_-]{2,}|[\u0600-\u06FF]{2,}")
STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "are", "was", "www", "com",
    "من", "في", "على", "إلى", "الى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "هو", "هي",
}


def host_is_public(host: str) -> bool:
    """يمنع localhost وIP الخاص/المحجوز لتقليل مخاطر SSRF."""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
        return bool(addresses) and all(
            not (ipaddress.ip_address(addr).is_private or ipaddress.ip_address(addr).is_loopback
                 or ipaddress.ip_address(addr).is_link_local or ipaddress.ip_address(addr).is_reserved)
            for addr in addresses
        )
    except (OSError, ValueError):
        return False


def normalize(url: str) -> str | None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not host_is_public(parsed.hostname):
        return None
    if parsed.path.lower().endswith(IGNORED_EXTENSIONS):
        return None
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", parsed.query, ""))


def extract_keywords(soup: BeautifulSoup, limit: int = 15) -> list[dict]:
    """يستخرج كلمات متكررة من النص المرئي محليًا، دون إرسال النص لخدمة خارجية."""
    for node in soup(["script", "style", "noscript", "svg"]):
        node.decompose()
    words = [w for w in TOKEN_RE.findall(soup.get_text(" ", strip=True).lower()) if w not in STOPWORDS]
    counts = Counter(words)
    return [{"word": word, "count": count} for word, count in counts.most_common(limit)]


def safe_external_link(url: str, allowed_hosts: set[str]) -> bool:
    """يتحقق من الرابط الخارجي شكليًا وDNS فقط؛ لا يفتح الرابط ولا يرسل إليه طلبًا."""
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return (
        parsed.scheme == "https"
        and bool(host)
        and host not in allowed_hosts
        and host_is_public(host)
        and not parsed.path.lower().endswith(IGNORED_EXTENSIONS)
    )


class AuthorizedCrawler:
    def __init__(self, start_urls: list[str], allowed_hosts: set[str], max_depth: int = 1,
                 max_pages: int = 20, max_links_per_page: int = 5, delay: float = 2.0):
        self.allowed_hosts = {h.lower().split(":", 1)[0] for h in allowed_hosts}
        self.queue = deque((u, 0) for u in (normalize(x) for x in start_urls) if u)
        self.max_depth = min(max(int(max_depth), 0), 2)
        self.max_pages = min(max(int(max_pages), 1), 20)
        self.max_links = min(max(int(max_links_per_page), 1), 10)
        self.delay = max(float(delay), 2.0)
        self.visited: set[str] = set()
        self.robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})

    def allowed(self, url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        return parsed.hostname is not None and parsed.hostname.lower() in self.allowed_hosts

    def can_fetch(self, url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        if base not in self.robots:
            rp = urllib.robotparser.RobotFileParser(f"{base}/robots.txt")
            try:
                rp.read()
            except Exception:
                # عند تعذر قراءة robots نمتنع عن الزحف بدل التخمين.
                return False
            self.robots[base] = rp
        return self.robots[base].can_fetch(USER_AGENT, url)

    def crawl(self) -> dict:
        pages = []
        while self.queue and len(pages) < self.max_pages:
            url, depth = self.queue.popleft()
            if url in self.visited or depth > self.max_depth or not self.allowed(url):
                continue
            self.visited.add(url)
            if not self.can_fetch(url):
                pages.append({"url": url, "depth": depth, "status": "blocked_by_robots_or_unavailable"})
                continue
            if pages:
                time.sleep(self.delay)
            print(f"[عمق {depth}] فحص مصرح: {url}")
            item = {
                "url": url, "depth": depth, "title": "", "links": [],
                "external_links": [], "keywords": [], "status": "error"
            }
            try:
                response = self.session.get(url, timeout=12, allow_redirects=True)
                item["status_code"] = response.status_code
                content_type = response.headers.get("content-type", "").lower()
                if response.status_code == 200 and "text/html" in content_type:
                    soup = BeautifulSoup(response.text, "html.parser")
                    item["title"] = soup.title.get_text(" ", strip=True) if soup.title else ""
                    found = []
                    external = []
                    for a in soup.select("a[href]"):
                        raw = urllib.parse.urljoin(response.url, a["href"])
                        candidate = normalize(raw)
                        if not candidate:
                            continue
                        if self.allowed(candidate) and candidate not in found:
                            found.append(candidate)
                        elif safe_external_link(candidate, self.allowed_hosts) and candidate not in external:
                            external.append({
                                "url": candidate,
                                "anchor": a.get_text(" ", strip=True)[:120],
                            })
                        if len(found) >= self.max_links and len(external) >= self.max_links:
                            break
                    item["links"] = found
                    item["external_links"] = external[:self.max_links]
                    item["keywords"] = extract_keywords(soup)
                    item["status"] = "ok"
                    if depth < self.max_depth:
                        self.queue.extend((link, depth + 1) for link in found)
                else:
                    item["status"] = "skipped_non_html_or_non_200"
            except requests.RequestException as exc:
                item["error"] = str(exc)
            pages.append(item)
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "allowed_hosts": sorted(self.allowed_hosts),
            "analysis": {
                "pages_scanned": len(pages),
                "external_links_checked_locally": sum(len(p.get("external_links", [])) for p in pages),
                "note": "الروابط الخارجية تم التحقق منها شكليًا وDNS فقط ولم يتم فتحها.",
            },
            "pages": pages,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="زاحف مصرح به ومحدود لنطاق تملكه")
    parser.add_argument("start_url", help="رابط بداية على النطاق المصرح به")
    parser.add_argument("--host", required=True, help="النطاق المصرح به، مثل elazzouz-dotcom.github.io")
    parser.add_argument("-o", "--output", default="authorized_crawl_report.json")
    args = parser.parse_args()
    start = normalize(args.start_url)
    if not start or not AuthorizedCrawler([start], {args.host}).allowed(start):
        raise SystemExit("الرابط غير صالح أو لا ينتمي إلى النطاق المصرح به.")
    report = AuthorizedCrawler([start], {args.host}).crawl()
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"تم حفظ تقرير الفحص المصرح في {args.output} · الصفحات: {len(report['pages'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
