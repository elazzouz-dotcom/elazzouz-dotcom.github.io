# Quran Statistical FastAPI

خدمة JSON للقراءة فقط تعرض التقرير الناتج من خط التحليل القابل لإعادة الإنتاج. لا تعيد تشغيل Monte Carlo عند كل طلب؛ بل تقرأ `analysis/quran_analysis_report.json` الذي يولده CI بالبذرة `12345` و`B=200000`.

## التشغيل

من جذر المستودع:

```bash
python3 -m pip install -r api/requirements.txt
uvicorn api.fastapi_app:app --reload --port 8000
```

للسماح للوحة منشورة بالوصول عبر CORS، حدّد الأصول صراحة:

```bash
QURAN_API_CORS_ORIGINS=https://elazzouz-dotcom.github.io \
uvicorn api.fastapi_app:app --host 0.0.0.0 --port 8000
```

## نقاط النهاية

- `GET /api/v1/health` — صحة الخدمة ووقت التقرير.
- `GET /api/v1/kruskal-wallis` — نتائج الاختبارات الأربعة مع القيم الخام، Holm، Benjamini–Hochberg، وقرارات الرفض.
- `GET /api/v1/kruskal-wallis/combined_value` — نتيجة متغير واحد.
- `GET /api/v1/report` — بيانات الوصف وإصدارات البيئة وخصائص التقرير دون صفوف البيانات الخام.

يمكن تغيير مستوى الدلالة لقرار الرفض فقط دون تغيير قيم p المصححة:

```bash
curl 'http://127.0.0.1:8000/api/v1/kruskal-wallis?alpha=0.01'
curl 'http://127.0.0.1:8000/api/v1/kruskal-wallis/combined_value'
```

القيم المصححة نفسها محفوظة في التقرير، بينما يعاد حساب `reject_*` وفق `alpha` المرسل. GitHub Pages لا يشغّل FastAPI؛ يجب تشغيل هذه الخدمة على استضافة Python مستقلة، ثم استخدام رابطها من تطبيق أو لوحة الويب.
