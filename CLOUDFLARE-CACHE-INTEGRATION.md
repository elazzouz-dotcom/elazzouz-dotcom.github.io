# تكامل Cloudflare مع GitHub Pages

يحتوي المشروع على مسارين متوافقين:

- [`_headers`](/_headers) يعمل عند نشر نفس الملفات عبر **Cloudflare Pages**.
- [`cloudflare-cache-worker.js`](/cloudflare-cache-worker.js) يعمل عند إبقاء GitHub Pages كمصدر Origin ووضع Worker أمامه.

## المسار الموصى به مع GitHub Pages الحالي

GitHub Pages لا يسمح للمستودع بتغيير `Cache-Control` الخاص به. لذلك استخدم Worker مستقلًا خلف نطاق مخصص تملكه في Cloudflare. لا يمكن اعتراض النطاق الافتراضي `elazzouz-dotcom.github.io` من داخل Zone لا تملكها؛ يجب أولًا استخدام نطاق أو نطاق فرعي تملكه، مثل `slaks.example.com`، ثم جعله Proxied في Cloudflare.

ينشر Worker من إعداد [`wrangler.cache.toml`](/wrangler.cache.toml):

```bash
npx wrangler deploy --config wrangler.cache.toml
```

بعد النشر، أضف Custom Domain أو Route في Cloudflare للنطاق المخصص، مثل:

```text
slaks.example.com/*
```

ثم اجعل `slaks.example.com` هو العنوان العام للموقع بدل رابط GitHub Pages المباشر. لا تربط هذا Worker بـ `github-oauth-proxy`؛ هما خدمتان منفصلتان.

## سياسة الكاش

الأصول التي تحتوي على معامل `v`، مثل روابط CSS وJavaScript التي يولدها [`scripts/cache_bust.py`](/scripts/cache_bust.py)، تحصل على:

```text
Cache-Control: public, max-age=31536000, immutable
```

الأصول التي لا تحمل بصمة تحصل على كاش قصير مع إعادة تحقق في الخلفية. أما HTML وJSON والتقارير و`provenance.json` فتحصل على:

```text
Cache-Control: public, max-age=0, must-revalidate
```

بهذا تُخزَّن الملفات الثابتة بسرعة، بينما تظهر تغييرات الصفحات والتقارير فورًا. يضيف Worker أيضًا الترويسة `X-Slaks-Cache-Policy` لتسهيل الفحص.

## اختبار بعد التفعيل

```bash
curl -sSI 'https://slaks.example.com/quran-analysis/app.js?v=HASH'
curl -sSI 'https://slaks.example.com/quran-analysis/'
curl -sSI 'https://slaks.example.com/provenance.json'
```

المتوقع أن يظهر للأصل المرقّم `max-age=31536000, immutable`، وأن يظهر للصفحة وملف Provenance `max-age=0, must-revalidate`.

لا تُضف أسرارًا إلى `wrangler.cache.toml`. هذا Worker لا يحتوي على مفاتيح خاصة ولا يفتح Proxy عامًا؛ فهو يمرر الطلبات دائمًا إلى Origin واحد ثابت من `ORIGIN_URL`.
