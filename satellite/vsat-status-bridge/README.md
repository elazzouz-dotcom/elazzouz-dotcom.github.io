# VSAT Status Bridge

خادم وسيط آمن لعرض حالة اتصال VSAT والسرعة والاستهلاك من خلال API رسمي للمزود.

## التشغيل

```bash
npm install
cp .env.example .env
# عدّل .env محليًا ولا ترفعه إلى GitHub
npm start
```

## خريطة البيانات متعددة المزودين

يدعم `server.js` طبقة تطبيع مشتركة مع ثلاثة أوضاع:

```env
PROVIDER_KIND=auto
```

- `auto`: يبحث في الحقول العامة ثم في أسماء شائعة من Starlink وiDirect.
- `starlink`: يستخدم الحقول العامة مع حقول مثل `dishGetStatus.device_state` و`dishGetStatus.downlink_bps`.
- `idirect`: يستخدم الحقول العامة مع حقول مثل `link_state` و`rx_rate_mbps` و`tx_rate_mbps`.

هذه ليست واجهات رسمية موحّدة؛ تختلف الاستجابة حسب موديل الجهاز، إصدار البرنامج، وبوابة المزود. لذلك يجب تثبيت `PROVIDER_STATUS_URL` على API رسمي أو محول موثّق من المزود، ثم اختبار عينة JSON قبل الاعتماد على البيانات.

النتيجة الموحدة دائمًا هي:

```json
{
  "provider": "starlink",
  "connected": true,
  "downloadMbps": 10,
  "uploadMbps": 2,
  "usageBytes": 123456789,
  "usagePeriod": "monthly",
  "measuredAt": "2026-10-28T22:00:00.000Z",
  "cached": false
}
```

تُحوّل القيم الكبيرة بالبت/ثانية إلى Mbps تلقائيًا، وتُقبل الطوابع الزمنية الرقمية أو النصية. إذا كانت أسماء حقول مزودك مختلفة، أضفها إلى قوائم `firstValue()` في المحول المناسب بدل وضعها في واجهة الموقع.

## المتطلبات غير المتوفرة بعد

هذا المشروع لا يتصل تلقائيًا بـStarlink أو iDirect أو أي مزود. يجب الحصول من المزود على:

- رابط API رسمي لحالة الاتصال.
- طريقة المصادقة.
- أسماء الحقول الخاصة بالحالة والسرعة والاستهلاك.
- إذن مكتوب أو حساب API مخصص للتكامل.

ضع الأسرار في متغيرات البيئة على الخادم فقط:

```env
PROVIDER_KIND=auto
PROVIDER_STATUS_URL=https://provider.example/api/status
PROVIDER_API_TOKEN=replace-with-provider-token
STATUS_READ_TOKEN=replace-with-a-long-random-secret
```

## نقطة القراءة

```text
GET /api/status
Authorization: Bearer <STATUS_READ_TOKEN>
```

واختبار الصحة:

```text
GET /health
```

لا تضع `PROVIDER_API_TOKEN` أو `STATUS_READ_TOKEN` داخل كود GitHub Pages؛ استخدم خادمًا وسيطًا أو وظيفة Serverless مع أسرار مُدارة.

## ربط مختبر شبكة Slaks

هذه الحزمة مرتبطة بالعقدة `N-600` في مختبر SemVer. صفحة GitHub Pages تفتح لوحة `/satellite/`، أما خادم Node هذا فيجب تشغيله على خادم خاص أو جهاز المحطة الأرضية. لا ترفع ملف `.env` ولا تشغّل الجسر على GitHub Pages؛ ما زال يلزم رابط API رسمي من مزود VSAT قبل استقبال بيانات حقيقية.
