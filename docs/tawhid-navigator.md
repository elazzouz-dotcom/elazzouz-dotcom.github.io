# Tawhid Navigator and Research Engine

الصفحة الموحّدة تحمل `tawhid-navigator.js` و`research-engine.js`، لكن لا يبدأ أي بحث خارجي تلقائيًا.

## تشغيل يدوي اختياري

بعد فتح صفحة Slaks، يمكن تشغيل بحث رسمي من وحدة تحكم المتصفح:

```js
const navigator = new TawhidNavigator();
const research = new ResearchEngine(navigator);
const report = await research.runOnce([
  'swarm intelligence algorithm',
  'balanced cybernetic system'
]);
console.log(report);
```

## الحدود

- مدار الموقع: يُسمح فقط بالمسارات النسبية أو الأصل الدقيق `https://elazzouz-dotcom.github.io`.
- مدار API: يُسمح فقط بـ `https://en.wikipedia.org` و`https://api.github.com` في هذه النسخة.
- لكل طلب مهلة 10 ثوانٍ وحد أقصى لحجم الاستجابة 1.5 MB.
- الاستعلامات محدودة بأربعة، وكل استعلام بطول 160 محرفًا.
- لا توجد `setInterval` للبحث، ولا بحث عند تحميل الصفحة.
- لا يوجد تجاوز لتسجيل الدخول، ولا CORS proxy، ولا تخمين مفاتيح API.
- بحث GitHub المستخدم هنا هو مستودعات عامة عبر REST API؛ بحث الكود المتطلب مصادقة غير مفعّل في الواجهة العامة.

أي ربط جديد بمزود يحتاج إضافة أصل موثوق إلى قائمة مسموحة ومراجعة شروطه قبل التفعيل.
