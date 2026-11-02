# Slaks Knowledge API

هذه خدمة Worker مستقلة عن `github-oauth-proxy`. هدفها تحويل شبكة 6600 عقدة من تخزين محلي في المتصفح إلى قاعدة معرفة مركزية قابلة للبحث.

## الواجهات

- `GET /health` — حالة الخدمة وعدد العقد.
- `GET /api/nodes?limit=20&offset=0` — قائمة العقد النشطة.
- `GET /api/nodes/:id` — قراءة عقدة واحدة.
- `GET /api/search?q=...&limit=10` — بحث FTS5 داخل العنوان والوصف والمحتوى والرابط والمجال.
- `POST /api/nodes` — إضافة أو تحديث عقدة؛ محمي بـ `ADMIN_TOKEN`.
- `POST /api/conversations` — حفظ سؤال وإجابة ومصادرها.
- `GET /api/conversations?sessionId=...` — قراءة تاريخ جلسة.

## الإعداد والنشر

```bash
cd knowledge-api
python3 seed_nodes.py
wrangler d1 create slaks-knowledge
# ضع database_id الناتج في wrangler.toml بدل القيمة الوهمية
wrangler d1 migrations apply slaks-knowledge --remote
wrangler d1 execute slaks-knowledge --remote --file=0002_seed_nodes.sql
wrangler secret put ADMIN_TOKEN
wrangler deploy
```

لا تضع `ADMIN_TOKEN` أو أي مفتاح نموذج ذكاء اصطناعي في GitHub. قبل النشر، حدّث `ALLOWED_ORIGINS` إلى النطاقات المطلوبة فقط.

## مثال إضافة عقدة

```bash
curl -X POST https://YOUR_WORKER.workers.dev/api/nodes \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"id":42,"title":"مصدر عربي","description":"وصف مختصر","content":"نص المصدر الكامل","url":"https://example.com","domain":"technology","trustScore":0.9}'
```

هذه المرحلة لا تولّد إجابة بالذكاء الاصطناعي بعد. هي تؤسس التخزين المركزي، البحث، المصادر، وسجل المحادثة. المرحلة التالية ستضيف واجهة `POST /api/answer` التي تختار المصادر ثم تمررها إلى مزود نموذج آمن من الخادم.
