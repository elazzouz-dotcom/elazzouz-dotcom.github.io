# Browserbase Search Analyzer

تطبيق Streamlit عربي لبحث Browserbase وعرض النتائج وتحليلها حسب النطاقات والكلمات والدرجة، مع تصدير JSON وCSV.

## التشغيل

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-streamlit.txt
export BROWSERBASE_API_KEY="مفتاحك الحقيقي"
streamlit run app/streamlit_app.py
```

افتح العنوان الذي يعرضه Streamlit، غالبًا `http://localhost:8501`.

## استخدام CLI

```bash
export BROWSERBASE_API_KEY="مفتاحك الحقيقي"
python -m app.cli "Canvas rendering performance" --num-results 10
```

## ما الذي يقدمه التطبيق؟

- طلب POST آمن إلى `https://api.browserbase.com/v1/search`.
- عدم طباعة أو تضمين مفتاح API في الواجهة.
- تخزين مؤقت داخل جلسة Streamlit مع مدة قابلة للضبط.
- تطبيع صيغ النتائج الشائعة (`results` و`items` و`data.results`).
- تحليل عدد النتائج، النطاقات الفريدة، أكثر النطاقات ظهورًا، والكلمات المتكررة.
- فلترة فورية للنتائج.
- تصدير النتائج والتحليل إلى JSON أو CSV.
- رسائل أخطاء عربية لا تكشف أسرار الخادم.

## ملاحظات أمنية

ضع `BROWSERBASE_API_KEY` في Secret أو متغير بيئي على الخادم. لا تضع المفتاح في Streamlit client-side code، ولا ترفعه إلى GitHub. ملف `.env.example` يحتوي قيمة وهمية فقط.
