#!/usr/bin/env python3
"""Strict structural quality gate for the SemVer 6600-node network."""
from __future__ import annotations

import json
import sys
from pathlib import Path

EXPECTED_NODES = 6600
EXPECTED_EDGES = EXPECTED_NODES - 1
EXPECTED_LEVELS = 114
EXPECTED_LEVEL_COUNTS = [*range(1, 114), 159]
DEFAULT_METRICS = Path("semver-node-metrics.json")


def fail(errors: list[str]) -> int:
    print("\n[فشل التدقيق البنيوي]")
    for error in errors:
        print(f"   - {error}")
    return 1


def validate_network_structure(json_path: str | Path = DEFAULT_METRICS) -> int:
    path = Path(json_path)
    print("[بدء التدقيق] فحص سلامة بنية شبكة SemVer وهرميتها...")
    if not path.exists():
        return fail([f"ملف البيانات غير موجود في المسار: {path}"])

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return fail([f"تعذر قراءة JSON: {error}"])

    errors: list[str] = []
    if not isinstance(data, dict):
        return fail(["جذر ملف metrics يجب أن يكون كائن JSON."])

    nodes = data.get("nodes")
    edges = data.get("edges")
    levels = data.get("levels")
    if not all(isinstance(value, list) for value in (nodes, edges, levels)):
        return fail(["المفاتيح nodes وedges وlevels يجب أن تكون مصفوفات."])

    print(f"   • عدد العقد المرصودة: {len(nodes)}")
    print(f"   • عدد العلاقات الهرمية: {len(edges)}")
    print(f"   • عدد المستويات: {len(levels)}")

    if len(nodes) != EXPECTED_NODES:
        errors.append(f"عدد العقد ({len(nodes)}) لا يطابق المعيار 6600.")
    if len(edges) != EXPECTED_EDGES:
        errors.append(f"عدد العلاقات ({len(edges)}) لا يطابق المعيار 6599.")
    if len(levels) != EXPECTED_LEVELS:
        errors.append(f"عدد المستويات ({len(levels)}) لا يطابق المعيار 114.")

    node_ids: list[int] = []
    node_levels: dict[int, int] = {}
    for index, node in enumerate(nodes):
        if not isinstance(node, dict) or not isinstance(node.get("id"), int):
            errors.append(f"العقدة في الموضع {index} تفتقد id صحيحًا.")
            continue
        node_id = node["id"]
        node_ids.append(node_id)
        level = node.get("level")
        if not isinstance(level, int) or level < 1 or level > EXPECTED_LEVELS:
            errors.append(f"العقدة N-{node_id} تحمل مستوى غير صالح: {level}.")
        else:
            node_levels[node_id] = level

    if len(set(node_ids)) != len(node_ids):
        errors.append("توجد عقد مكررة في ملف metrics.")
    if set(node_ids) != set(range(1, EXPECTED_NODES + 1)):
        errors.append("معرّفات العقد يجب أن تغطي المجال N-001 إلى N-6600 دون فجوات.")

    level_counts = [level.get("count") if isinstance(level, dict) else None for level in levels]
    if any(not isinstance(count, int) or count < 1 for count in level_counts):
        errors.append("كل مستوى يجب أن يحتوي count صحيحًا موجبًا.")
    elif level_counts != EXPECTED_LEVEL_COUNTS:
        errors.append("توزيع المستويات لا يطابق التدرج المتوقع 1..113 ثم 159.")

    if all(isinstance(level, dict) for level in levels):
        declared_levels = [level.get("level") for level in levels]
        if declared_levels != list(range(1, EXPECTED_LEVELS + 1)):
            errors.append("معرّفات المستويات يجب أن تكون متسلسلة من 1 إلى 114.")

    seen_edges: set[tuple[int, int]] = set()
    incoming: dict[int, int] = {}
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict) or not isinstance(edge.get("from"), int) or not isinstance(edge.get("to"), int):
            errors.append(f"العلاقة في الموضع {index} يجب أن تحتوي from وto صحيحين.")
            continue
        source, target = edge["from"], edge["to"]
        pair = (source, target)
        if pair in seen_edges:
            errors.append(f"العلاقة المكررة: N-{source} → N-{target}.")
        seen_edges.add(pair)
        incoming[target] = incoming.get(target, 0) + 1
        if source not in node_levels or target not in node_levels:
            errors.append(f"العلاقة N-{source} → N-{target} تشير إلى عقدة غير موجودة.")
        elif source >= target or node_levels[source] >= node_levels[target]:
            errors.append(f"العلاقة N-{source} → N-{target} تكسر اتجاه الهرم.")
        else:
            child_level = node_levels[target]
            parent_first = sum(EXPECTED_LEVEL_COUNTS[:child_level - 2]) + 1
            child_first = sum(EXPECTED_LEVEL_COUNTS[:child_level - 1]) + 1
            parent_count = EXPECTED_LEVEL_COUNTS[child_level - 2]
            child_count = EXPECTED_LEVEL_COUNTS[child_level - 1]
            child_index = target - child_first
            expected_parent = parent_first + min(parent_count - 1, child_index * parent_count // child_count)
            if source != expected_parent:
                errors.append(f"العلاقة N-{source} → N-{target} لا تطابق الأب المتوقع N-{expected_parent}.")

    if incoming.get(1, 0) != 0:
        errors.append("العقدة الجذرية N-001 يجب ألا تملك علاقة واردة.")
    for node_id in range(2, EXPECTED_NODES + 1):
        if incoming.get(node_id, 0) != 1:
            errors.append(f"العقدة N-{node_id:03d} يجب أن تملك علاقة واردة واحدة.")

    if errors:
        return fail(errors)

    print("\n[نجاح تام] البنية تطابق 6600 عقدة و6599 علاقة و114 مستوى، وكل عقدة غير جذرية لها أب واحد.")
    return 0


if __name__ == "__main__":
    sys.exit(validate_network_structure(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_METRICS))
