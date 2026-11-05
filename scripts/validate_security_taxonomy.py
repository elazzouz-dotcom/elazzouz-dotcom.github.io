#!/usr/bin/env python3
"""Validate the security finding taxonomy used by local audit tooling."""
from __future__ import annotations

import json
import sys
from pathlib import Path

TAXONOMY_PATH = Path("security-taxonomy.json")
EXPECTED_IDS = {
    19, 133, 136, 137, 189, 199, 255, 265, 275, 310, 320, 355, 371, 387,
    389, 399, 411, 417, 429, 438, 452, 465, 557, 569, 840, 1006, 1210,
    1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1225, 1226, 1227,
    1228,
}


def fail(message: str) -> int:
    print(f"[فشل قاموس التصنيف] {message}")
    return 1


def main() -> int:
    try:
        entries = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return fail(f"تعذر قراءة {TAXONOMY_PATH}: {error}")
    if not isinstance(entries, list):
        return fail("جذر القاموس يجب أن يكون مصفوفة.")

    ids = []
    slugs = []
    errors = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"العنصر {index} ليس كائنًا.")
            continue
        if not isinstance(entry.get("id"), int) or entry["id"] < 1:
            errors.append(f"العنصر {index} يحمل id غير صالح.")
        else:
            ids.append(entry["id"])
        if not isinstance(entry.get("label"), str) or not entry["label"].strip():
            errors.append(f"العنصر {index} يفتقد label صالحًا.")
        if not isinstance(entry.get("slug"), str) or not entry["slug"].strip():
            errors.append(f"العنصر {index} يفتقد slug صالحًا.")
        else:
            slugs.append(entry["slug"])

    if len(ids) != len(set(ids)):
        errors.append("توجد معرفات CWE مكررة.")
    if len(slugs) != len(set(slugs)):
        errors.append("توجد slugs مكررة.")
    if set(ids) != EXPECTED_IDS:
        errors.append(f"مجموعة المعرفات لا تطابق القائمة المطلوبة: المتوقع {len(EXPECTED_IDS)}، الموجود {len(set(ids))}.")
    if errors:
        for error in errors:
            print(f"   - {error}")
        return 1

    print(f"[نجاح قاموس التصنيف] تم التحقق من {len(entries)} تصنيفًا أمنيًا فريدًا.")
    print("   • المعرفات محفوظة دون تكرار أو نقص")
    print("   • لا يمثل القاموس نتائج ثغرات؛ هو مخطط لتوسيم نتائج الفحص المثبتة فقط")
    return 0


if __name__ == "__main__":
    sys.exit(main())
