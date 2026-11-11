#!/usr/bin/env python3
"""بحث مصادر محدود واستخراج روابط فقط.

لا يفتح الروابط المستخرجة ولا ينفّذ أي محتوى منها.
احترم شروط الخدمة وملف robots.txt وحدود المواقع قبل الاستخدام.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SEARCH_URL = "https://html.duckduckgo.com/html/"
USER_AGENT = "Azzouz-CycleLab-SourceResearch/1.0 (+local defensive research)"


def auto_search_and_extract(query: str, max_results: int = 10, delay: float = 2.0) -> list[str]:
    """يجلب روابط نتائج البحث دون زيارة صفحات النتائج نفسها."""
    query = query.strip()
    if not query:
        raise ValueError("يجب إدخال عبارة بحث.")
    max_results = max(1, min(int(max_results), 10))
    delay = max(1.0, float(delay))

    time.sleep(delay)
    response = requests.get(
        SEARCH_URL,
        params={"q": query},
        headers={"User-Agent": USER_AGENT},
        timeout=15,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    links: list[str] = []
    seen: set[str] = set()
    for anchor in soup.select("a.result__url"):
        href = anchor.get("href")
        if not href:
            continue
        parsed = urllib.parse.urlparse(href)
        params = urllib.parse.parse_qs(parsed.query)
        href = params.get("uddg", [href])[0]
        href = urllib.parse.unquote(href).strip()
        parsed = urllib.parse.urlparse(href)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        if href not in seen:
            seen.add(href)
            links.append(href)
        if len(links) >= max_results:
            break
    return links


def save_results(query: str, links: list[str], output: Path) -> None:
    payload = {
        "query": query,
        "count": len(links),
        "links": links,
        "note": "روابط مستخرجة فقط؛ لم يتم فتحها أو تنفيذ محتواها.",
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="بحث مصادر تلقائي محدود وآمن")
    parser.add_argument("query", help="عبارة البحث")
    parser.add_argument("-n", "--max-results", type=int, default=5, help="الحد الأقصى للنتائج (1-10)")
    parser.add_argument("-o", "--output", default="extracted_links.json", help="ملف JSON الناتج")
    parser.add_argument("--delay", type=float, default=2.0, help="تأخير الطلب بالثواني، والحد الأدنى ثانية واحدة")
    args = parser.parse_args()

    try:
        links = auto_search_and_extract(args.query, args.max_results, args.delay)
    except requests.RequestException as exc:
        print(f"تعذر الاتصال بمحرك البحث: {exc}")
        return 1
    except ValueError as exc:
        print(f"خطأ في المدخلات: {exc}")
        return 2

    output = Path(args.output)
    save_results(args.query, links, output)
    print(f"تم استخراج {len(links)} رابطًا وحفظها في: {output}")
    for index, link in enumerate(links, 1):
        print(f"{index}. {link}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
