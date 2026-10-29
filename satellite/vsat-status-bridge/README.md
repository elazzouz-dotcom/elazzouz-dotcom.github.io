# VSAT Status Bridge

خادم وسيط آمن لعرض حالة اتصال VSAT والسرعة والاستهلاك من خلال API رسمي للمزود.

## التشغيل

```bash
npm install
cp .env.example .env
# عدّل .env محليًا ولا ترفعه إلى GitHub
npm start
```

## المتطلبات غير المتوفرة بعد

هذا المشروع لا يتصل تلقائيًا باتصالات المغرب أو بأي مزود. يجب الحصول من المزود على:

- رابط API رسمي لحالة الاتصال.
- طريقة المصادقة.
- أسماء الحقول الخاصة بالحالة والسرعة والاستهلاك.
- إذن مكتوب أو حساب API مخصص للتكامل.

بعد استلام التوثيق، عدّل دالة `readProviderStatus()` في `server.js` لتطابق مخطط المزود، ثم ضع الأسرار في متغيرات البيئة على الخادم فقط.

## نقطة القراءة

```text
GET /api/status
Authorization: Bearer <STATUS_READ_TOKEN>
```

مثال الاستجابة:

```json
{
  "connected": true,
  "downloadMbps": 10,
  "uploadMbps": 2,
  "usageBytes": 123456789,
  "usagePeriod": "monthly",
  "measuredAt": "2026-10-28T22:00:00.000Z",
  "cached": false
}
```

لا تضع `PROVIDER_API_TOKEN` أو `STATUS_READ_TOKEN` داخل كود GitHub Pages؛ استخدم خادمًا وسيطًا أو وظيفة Serverless مع أسرار مُدارة.

## ربط مختبر شبكة Slaks

هذه الحزمة مرتبطة بالعقدة `N-600` في مختبر SemVer. صفحة GitHub Pages تفتح لوحة `/satellite/`، أما خادم Node هذا فيجب تشغيله على خادم خاص أو جهاز المحطة الأرضية. لا ترفع ملف `.env` ولا تشغّل الجسر على GitHub Pages؛ ما زال يلزم رابط API رسمي من مزود VSAT قبل استقبال بيانات حقيقية.
