# OneCompiler AI → GitHub Pages

هذا الدليل يربط مشروع OneCompiler بمستودع GitHub عبر Cloudflare Worker. بعد تسجيل الدخول إلى GitHub من **Hosting Studio**، يستطيع OneCompiler AI إرسال الملفات المعدلة إلى GitHub وإنشاء Commit مباشرةً؛ لا حاجة لنسخ الملفات يدويًا ولا لوضع Access Token داخل مشروع OneCompiler.

## الروابط

- **تسجيل الدخول إلى GitHub:** <https://elazzouz-dotcom.github.io/hosting-studio/>
- **مشروع OneCompiler:** <https://onecompiler.com/vibecode/4557bq5ht>
- **ملف الجسر الجاهز:** <https://elazzouz-dotcom.github.io/onecompiler-publish-bridge.js>
- **الموقع المنشور:** <https://elazzouz-dotcom.github.io/>

## الإعداد مرة واحدة

1. افتح Hosting Studio واضغط **ربط حساب GitHub** وأكمل Device Flow.
2. اترك Hosting Studio مفتوحًا في المتصفح نفسه؛ الجلسة المشتركة هي التي يقرأها Worker.
3. افتح مشروع OneCompiler وسجّل الدخول إلى OneCompiler إذا طلب ذلك.
4. أضف ملف الجسر إلى صفحة المشروع أو حمّله من الرابط أعلاه:

```html
<script src="https://elazzouz-dotcom.github.io/onecompiler-publish-bridge.js"></script>
```

> لا تضف `CLIENT_SECRET` أو `gho_...` أو أي Access Token إلى ملفات OneCompiler. المصادقة تتم من خلال جلسة GitHub في Worker.

## الاستدعاء الأساسي

بعد أن ينتهي OneCompiler AI من تعديل الملفات، استدعِ الدالة التالية من كود المشروع:

```js
await OneCompilerGitHub.publishToGitHub({
  owner: 'elazzouz-dotcom',
  repo: 'elazzouz-dotcom.github.io',
  branch: 'main',
  message: 'Update site from OneCompiler AI',
  files: {
    'index.html': document.documentElement.outerHTML,
    'theme.css': document.querySelector('link[href$="theme.css"]')
      ? await fetch('theme.css').then(response => response.text())
      : '',
  },
});
```

النتيجة الناجحة تكون كائنًا يحتوي على تفاصيل الـ Commit والملفات التي عالجها Worker، مثل:

```js
{
  ok: true,
  owner: 'elazzouz-dotcom',
  repo: 'elazzouz-dotcom.github.io',
  branch: 'main',
  commit: { sha: '...' },
  files: ['index.html', 'theme.css']
}
```

## تعليمات جاهزة لـ OneCompiler AI

يمكن لصاحب المشروع لصق النص التالي في OneCompiler AI:

> أضف ملف الجسر من `https://elazzouz-dotcom.github.io/onecompiler-publish-bridge.js` باستخدام script tag. بعد كل تعديل ناجح، اجمع الملفات النهائية المعدلة في كائن `files` بحيث يكون المفتاح هو المسار النسبي والقيـمة نص الملف، ثم استدعِ `await OneCompilerGitHub.publishToGitHub({ owner: 'elazzouz-dotcom', repo: 'elazzouz-dotcom.github.io', branch: 'main', message: 'Update site from OneCompiler AI', files })`. اعرض نتيجة الـ Commit للمستخدم. لا تنشئ Access Token ولا تضع أي سر داخل الكود. لا تستدعِ النشر قبل اكتمال التعديل والتحقق من الملفات.

## زر نشر اختياري

إذا كان المشروع يملك زرًا بمعرّف `publish-button`، يمكن تركيب الجسر بهذه الطريقة:

```js
OneCompilerGitHub.createPublishButton({
  button: '#publish-button',
  message: 'Publish reviewed OneCompiler changes',
  getFiles: async () => ({
    'index.html': document.documentElement.outerHTML,
  }),
});
```

الدالة تعطل الزر أثناء الطلب، وتعرض حالة النجاح أو الخطأ، ثم تعيد الزر إلى حالته الطبيعية.

## قواعد الملفات

- استخدم مسارات نسبية مثل `index.html` و`pages/about.html`.
- أرسل قيمة نصية لكل ملف.
- أرسل الملفات المعدلة فقط؛ لا حاجة لإرسال المستودع كاملًا.
- لا تستخدم مسارًا يبدأ بـ `/` أو يحتوي على `..`.
- اجعل رسالة الـ Commit قصيرة وواضحة.
- افحص المعاينة قبل النشر، ثم افتح الموقع المنشور بعد اكتمال GitHub Pages.

## استكشاف الأخطاء

| الرسالة | الإجراء |
|---|---|
| `GitHub session is not available` | افتح Hosting Studio وسجّل الدخول إلى GitHub في نفس المتصفح، ثم أعد المحاولة. |
| `owner, repo and at least one file are required` | تأكد من وجود `owner` و`repo` وكائن `files` غير فارغ. |
| `File paths must be relative` | احذف `/` من بداية المسار ولا تستخدم `..`. |
| `Publish failed (401)` | انتهت الجلسة أو لم تُرسل بيانات الجلسة؛ سجّل الدخول مجددًا واترك Hosting Studio مفتوحًا. |
| `Publish failed (403)` | الحساب لا يملك صلاحية الكتابة إلى المستودع أو يفتقد OAuth scope المطلوب. |
| نجح الـ Commit ولم يتغير الموقع | انتظر تشغيل GitHub Pages وافحص تبويب Actions. |

## ملاحظات أمنية

الجسر لا يخزن Access Token ولا يطلبه من المستخدم. يرسل فقط وصف الملفات إلى مسار `/publish` في Worker باستخدام جلسة المتصفح؛ لذلك يجب إبقاء Worker على HTTPS، وعدم إدراج أسرار أو بيانات مستخدمين داخل الملفات المنشورة.
