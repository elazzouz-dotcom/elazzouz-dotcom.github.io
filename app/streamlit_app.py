from __future__ import annotations

import json
from io import StringIO

import streamlit as st

from app.main.routes import (
    SearchAPIError,
    SearchConfigurationError,
    analyze_results,
    normalize_results,
    result_rows,
    search_browserbase,
)

st.set_page_config(page_title="Browserbase Search Analyzer", page_icon="🔎", layout="wide")

st.markdown(
    """
    <style>
    .block-container {direction: rtl; text-align: right; max-width: 1400px;}
    div[data-testid="stMetricValue"] {direction: ltr; text-align: right;}
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("محلل نتائج Browserbase Search")
st.caption("بحث آمن من الخادم مع تخزين مؤقت محلي داخل جلسة Streamlit وتحليل للنطاقات والكلمات.")

with st.sidebar:
    st.header("إعدادات البحث")
    provider = st.selectbox("مزود البحث", ["parallel"], index=0)
    mode = st.selectbox("الوضع", ["advanced", "standard"], index=0)
    num_results = st.slider("عدد النتائج", min_value=1, max_value=100, value=10)
    cache_ttl = st.slider("مدة التخزين المؤقت بالدقائق", 1, 60, 10)
    if st.button("مسح نتائج الجلسة", use_container_width=True):
        st.session_state.pop("search_cache", None)
        st.session_state.pop("last_payload", None)
        st.rerun()
    st.divider()
    st.info("يجب ضبط BROWSERBASE_API_KEY في بيئة التشغيل. لا تضع المفتاح داخل الكود أو GitHub.")

if "search_cache" not in st.session_state:
    st.session_state.search_cache = {}

with st.form("search_form"):
    query = st.text_input("عبارة البحث", placeholder="مثال: Canvas rendering performance")
    submitted = st.form_submit_button("بحث وتحليل", type="primary", use_container_width=True)


def cached_search(query_text: str, provider_name: str, mode_name: str, limit: int, ttl_minutes: int):
    import time

    key = json.dumps([query_text.strip(), provider_name, mode_name, limit], ensure_ascii=False)
    now = time.time()
    cached = st.session_state.search_cache.get(key)
    if cached and now - cached["created"] < ttl_minutes * 60:
        return cached["payload"], True
    payload = search_browserbase(
        query_text,
        num_results=limit,
        provider=provider_name,
        mode=mode_name,
    )
    st.session_state.search_cache[key] = {"created": now, "payload": payload}
    return payload, False


if submitted:
    try:
        with st.spinner("جارٍ تنفيذ البحث وتحليل النتائج…"):
            payload, from_cache = cached_search(query, provider, mode, num_results, cache_ttl)
        st.session_state.last_payload = payload
        st.session_state.last_query = query
        st.session_state.from_cache = from_cache
    except (SearchConfigurationError, SearchAPIError, ValueError) as exc:
        st.error(str(exc))
    except Exception as exc:  # Keep unexpected details out of the UI.
        st.error(f"حدث خطأ غير متوقع: {type(exc).__name__}")

payload = st.session_state.get("last_payload")
if not payload:
    st.info("اكتب عبارة بحث ثم اضغط «بحث وتحليل». ")
    st.stop()

results = normalize_results(payload)
analysis = analyze_results(results)

if st.session_state.get("from_cache"):
    st.success("تم عرض النتيجة من التخزين المؤقت للجلسة.")
else:
    st.success("تم جلب نتيجة جديدة وحفظها مؤقتًا للجلسة.")

m1, m2, m3, m4 = st.columns(4)
m1.metric("عدد النتائج", analysis["total"])
m2.metric("النطاقات الفريدة", analysis["unique_domains"])
m3.metric("متوسط الصلة", analysis["average_score"] if analysis["average_score"] is not None else "—")
m4.metric("الاستعلام", st.session_state.get("last_query", "—"))

left, right = st.columns([1, 1])
with left:
    st.subheader("أكثر النطاقات ظهورًا")
    if analysis["domains"]:
        st.bar_chart({"النطاق": dict(analysis["domains"])}, height=280)
    else:
        st.write("لا توجد نطاقات قابلة للاستخراج.")
with right:
    st.subheader("الكلمات الأكثر تكرارًا")
    if analysis["top_terms"]:
        st.dataframe(
            [{"الكلمة": word, "التكرار": count} for word, count in analysis["top_terms"]],
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.write("لا توجد كلمات كافية للتحليل.")

st.subheader("النتائج")
filter_text = st.text_input("فلترة النتائج", placeholder="النطاق أو العنوان أو الوصف")
rows = result_rows(results)
if filter_text.strip():
    needle = filter_text.casefold()
    rows = [
        row for row in rows
        if needle in " ".join(str(row.get(key, "")) for key in ("title", "url", "snippet", "domain")).casefold()
    ]

for index, row in enumerate(rows, 1):
    title = row["title"] or row["url"] or f"نتيجة {index}"
    with st.expander(f"{index}. {title}"):
        st.write(row["snippet"] or "لا يوجد وصف.")
        if row["url"]:
            st.markdown(f"**الرابط:** [{row['url']}]({row['url']})")
        st.caption(f"النطاق: {row['domain'] or 'غير معروف'} · الدرجة: {row['score'] if row['score'] is not None else '—'}")

st.subheader("تصدير")
json_bytes = json.dumps({"query": st.session_state.get("last_query", ""), "analysis": analysis, "results": rows}, ensure_ascii=False, indent=2).encode("utf-8")
st.download_button("تنزيل JSON", json_bytes, file_name="browserbase-search-results.json", mime="application/json")

csv_buffer = StringIO()
csv_buffer.write("title,url,snippet,domain,score\n")
for row in rows:
    values = [str(row.get(key, "")).replace('"', '""') for key in ("title", "url", "snippet", "domain", "score")]
    csv_buffer.write(",".join(f'"{value}"' for value in values) + "\n")
st.download_button("تنزيل CSV", csv_buffer.getvalue().encode("utf-8"), file_name="browserbase-search-results.csv", mime="text/csv")
