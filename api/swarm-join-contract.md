# Optional Swarm Join Contract

هذا العقد اختياري ولا يعمل من GitHub Pages وحده. يحتاج إلى Worker أو خادم يملكه صاحب المشروع، مع سياسة خصوصية وموافقة واضحة.

## Endpoint

```text
POST /api/swarm/join
Content-Type: application/json
```

## Request

```json
{
  "site": "example.com",
  "count": 57,
  "role": "explore"
}
```

## Rules

- الموقع المنضم يرسل الطلب بنفسه؛ لا يوجد فحص تلقائي للمواقع الخارجية.
- لا تُرسل HTML أو نصوص أو ملفات أو رموز دخول.
- يقتصر `site` على 100 محرف، ويُتحقق من `count` ضمن 1–300.
- يجب استخدام CORS محدد، ومعدل طلبات، وسجل حذف واضح.
- لا يُفعّل هذا العقد تلقائيًا في الواجهة الحالية.

## Example response

```json
{
  "ok": true,
  "message": "انضمام اختياري للسرب",
  "total": 1
}
```
