# elazzouz-dotcom.github.io

المستودع الرسمي لموقع **Slaks** المنشور عبر GitHub Pages.

## المصدر الرئيسي

- المستودع: `elazzouz-dotcom/elazzouz-dotcom.github.io`
- الفرع المنشور: `main`
- الموقع: https://elazzouz-dotcom.github.io/
- لوحة الإدارة: https://elazzouz-dotcom.github.io/admin/

جميع ملفات HTML وCSS وJavaScript والصور وملفات الإعداد الخاصة بالموقع محفوظة هنا، ويدفع GitHub Pages التغييرات من الفرع `main` إلى الموقع المنشور.

## طريقة التعديل

1. عدّل الملفات مباشرة عبر GitHub أو من خلال [لوحة الإدارة](https://elazzouz-dotcom.github.io/admin/).
2. راجع التغيير.
3. أنشئ Commit واضحًا.
4. ينتظر GitHub Pages اكتمال البناء ثم ينشر النسخة الجديدة.

لوحة الإدارة مقيّدة بالمستودع والفرع أعلاه، ولا تحفظ Access Token في `localStorage`. لا تضع أي أسرار أو مفاتيح API داخل الملفات العامة.

## CSS محلي للصفحة الرئيسية والتطبيقات

تعتمد الصفحتان `/` و`/apps/` على ملف Tailwind ثابت ومحلي بدل تشغيل CDN وقت زيارة الصفحة. عند تعديل فئات Tailwind في هاتين الصفحتين، شغّل `pnpm install --frozen-lockfile` ثم `pnpm build:css` وضمّن تحديث `assets/css/site-tailwind.min.css`. تتحقق فحوص GitHub Actions من حداثة الملف قبل النشر.
