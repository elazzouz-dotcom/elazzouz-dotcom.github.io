"""Browserbase Search client and pure result-analysis helpers.

The module intentionally reads the API key only from BROWSERBASE_API_KEY.
It never logs or returns the secret.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlparse
import json
import os
import re

import requests

API_URL = "https://api.browserbase.com/v1/search"
DEFAULT_TIMEOUT = 30


class SearchConfigurationError(RuntimeError):
    """Raised when the server is not configured with an API key."""


class SearchAPIError(RuntimeError):
    """Raised when Browserbase returns an invalid or unsuccessful response."""


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    domain: str
    score: float | None = None


def _api_key() -> str:
    key = os.getenv("BROWSERBASE_API_KEY", "").strip()
    if not key or key == "<YOUR_API_KEY>":
        raise SearchConfigurationError(
            "BROWSERBASE_API_KEY غير مضبوط. أضفه كمتغير بيئي قبل تشغيل التطبيق."
        )
    return key


def search_browserbase(
    query: str,
    *,
    num_results: int = 10,
    provider: str = "parallel",
    mode: str = "advanced",
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """Call Browserbase Search and return the decoded JSON response."""
    query = query.strip()
    if not query:
        raise ValueError("اكتب عبارة بحث أولًا.")
    if not 1 <= num_results <= 100:
        raise ValueError("عدد النتائج يجب أن يكون بين 1 و100.")

    response = requests.post(
        API_URL,
        headers={
            "x-bb-api-key": _api_key(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={
            "query": query,
            "numResults": num_results,
            "provider": provider,
            "mode": mode,
        },
        timeout=timeout,
    )
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise SearchAPIError(f"فشل Browserbase ({response.status_code}): {detail}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise SearchAPIError("استجابة Browserbase ليست JSON صالحًا.") from exc
    if not isinstance(payload, dict):
        raise SearchAPIError("الاستجابة المتوقعة يجب أن تكون كائن JSON.")
    return payload


def _first(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value
    return ""


def _raw_results(payload: dict[str, Any]) -> list[Any]:
    candidates: list[Any] = [payload.get("results"), payload.get("items")]
    data = payload.get("data")
    if isinstance(data, dict):
        candidates.extend([data.get("results"), data.get("items")])
    elif isinstance(data, list):
        candidates.append(data)
    for candidate in candidates:
        if isinstance(candidate, list):
            return candidate
    return []


def normalize_results(payload: dict[str, Any]) -> list[SearchResult]:
    """Normalize common Browserbase/search-provider result shapes."""
    normalized: list[SearchResult] = []
    for raw in _raw_results(payload):
        if isinstance(raw, str):
            title, url, snippet, score = "", raw, "", None
        elif isinstance(raw, dict):
            title = str(_first(raw, "title", "name", "heading"))
            url = str(_first(raw, "url", "link", "href"))
            snippet = str(_first(raw, "snippet", "description", "text", "content"))
            raw_score = _first(raw, "score", "relevance")
            try:
                score = float(raw_score) if raw_score != "" else None
            except (TypeError, ValueError):
                score = None
        else:
            continue
        domain = urlparse(url).netloc.lower()
        normalized.append(SearchResult(title, url, snippet, domain, score))
    return normalized


def analyze_results(results: Iterable[SearchResult]) -> dict[str, Any]:
    items = list(results)
    domains = Counter(item.domain or "غير معروف" for item in items)
    words = Counter(
        word.lower()
        for item in items
        for word in re.findall(r"[\w\u0600-\u06ff]{4,}", f"{item.title} {item.snippet}")
        if word.lower() not in {"https", "http", "www"}
    )
    scored = [item.score for item in items if item.score is not None]
    return {
        "total": len(items),
        "unique_domains": len(domains),
        "domains": domains.most_common(10),
        "top_terms": words.most_common(15),
        "average_score": round(sum(scored) / len(scored), 4) if scored else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def result_rows(results: Iterable[SearchResult]) -> list[dict[str, Any]]:
    return [asdict(item) for item in results]


def analyze_keywords_with_ai(
    results: Iterable[SearchResult],
    *,
    query: str,
    model: str | None = None,
) -> dict[str, Any]:
    """Use an OpenAI-compatible model for structured keyword analysis.

    The call is opt-in from the UI. Only normalized search results are sent;
    the API key is read server-side and is never included in the prompt.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or api_key == "<YOUR_OPENAI_API_KEY>":
        raise SearchConfigurationError(
            "ضع OPENAI_API_KEY لتحليل الكلمات بالذكاء الاصطناعي، ثم اضغط الزر مرة أخرى."
        )
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise SearchConfigurationError("ثبّت مكتبة openai أولًا: pip install openai") from exc

    selected = list(results)[:50]
    context = [
        {"title": item.title, "url": item.url, "snippet": item.snippet, "domain": item.domain}
        for item in selected
    ]
    client_kwargs = {"api_key": api_key}
    base_url = os.getenv("OPENAI_API_BASE", "").strip()
    if base_url:
        client_kwargs["base_url"] = base_url
    client = OpenAI(**client_kwargs)
    chosen_model = model or os.getenv("OPENAI_MODEL", "gpt-6-luna")
    response = client.chat.completions.create(
        model=chosen_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "أنت محلل SEO وبحث دقيق. حلل النتائج فقط، لا تخترع بيانات أو أرقامًا. "
                    "أعد JSON مطابقًا للمخطط، باللغة العربية، مع كلمات مفتاحية عملية."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"query": query, "results": context}, ensure_ascii=False
                ),
            },
        ],
        max_completion_tokens=1800,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "keyword_analysis",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "summary": {"type": "string"},
                        "search_intent": {"type": "string"},
                        "clusters": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "topic": {"type": "string"},
                                    "keywords": {"type": "array", "items": {"type": "string"}},
                                    "rationale": {"type": "string"},
                                },
                                "required": ["topic", "keywords", "rationale"],
                            },
                        },
                        "opportunities": {"type": "array", "items": {"type": "string"}},
                        "negative_keywords": {"type": "array", "items": {"type": "string"}},
                        "recommended_queries": {"type": "array", "items": {"type": "string"}},
                        "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
                    },
                    "required": [
                        "summary", "search_intent", "clusters", "opportunities",
                        "negative_keywords", "recommended_queries", "confidence",
                    ],
                },
            },
        },
    )
    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise SearchAPIError("لم يُرجع نموذج الذكاء الاصطناعي تحليلًا.")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise SearchAPIError("استجابة تحليل الكلمات ليست JSON صالحًا.") from exc
    parsed["model"] = chosen_model
    parsed["source_results"] = len(selected)
    return parsed
