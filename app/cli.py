"""Command-line entry point for Browserbase Search."""
from __future__ import annotations

import argparse
import json
import sys

from app.main.routes import (
    SearchAPIError,
    SearchConfigurationError,
    analyze_results,
    normalize_results,
    result_rows,
    search_browserbase,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Search Browserbase and print analyzed JSON")
    parser.add_argument("query", help="Search query")
    parser.add_argument("-n", "--num-results", type=int, default=10, choices=range(1, 101))
    parser.add_argument("--provider", default="parallel")
    parser.add_argument("--mode", default="advanced", choices=("advanced", "standard"))
    args = parser.parse_args()
    try:
        payload = search_browserbase(
            args.query,
            num_results=args.num_results,
            provider=args.provider,
            mode=args.mode,
        )
        results = normalize_results(payload)
        output = {"query": args.query, "analysis": analyze_results(results), "results": result_rows(results)}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except (SearchConfigurationError, SearchAPIError, ValueError) as exc:
        print(f"خطأ: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
