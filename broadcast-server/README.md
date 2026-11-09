# خادم بث TikTok عبر RTMP وMediaMTX

هذه الحزمة تجهز خادمًا دائمًا يستقبل بثًا على مسار `live` ثم يمرره إلى عنوان RTMP/RTMPS الذي يوفره TikTok للحساب المؤهل. الموقع العام لا يخزن مفتاح البث.

## المتطلبات

- خادم VPS أو Cloud Computer دائم يعمل بـ Ubuntu 24.04.
- Docker وDocker Compose.
- نطاق HTTPS إذا أردت استخدام نشر WebRTC من المتصفح.
- رابط RTMP ومفتاح بث يوفرهما TikTok للحساب. لا تضعهما في GitHub ولا ترسلهما داخل المحادثة.

## الإعداد

## إعداد سريع من الهاتف

بعد فتح طرفية Cloud Computer من الهاتف ورفع مجلد `broadcast-server`، نفّذ:

```bash
cd broadcast-server
chmod +x setup-server.sh
# غيّر كلمة المرور وبيانات RTMP في mediamtx.yml قبل التشغيل
sudo ./setup-server.sh
```

السكربت يفتح المنافذ المطلوبة، يفعّل UFW بعد فتح SSH، يتحقق من Docker، ثم يشغّل MediaMTX ويعرض الحالة. إذا ظهرت رسالة تفيد بوجود قيم تجريبية، عدّلها أولًا ولا تتجاوز الفحص.

1. انسخ `mediamtx.yml` إلى الخادم.
2. افتح الملف على الخادم فقط، غيّر كلمة مرور `CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD` إلى قيمة عشوائية طويلة، ثم استبدل:
   - `TIKTOK_RTMP_HOST`
   - `TIKTOK_RTMP_APP`
   - `TIKTOK_STREAM_KEY`
3. شغّل الخدمة:

```bash
docker compose up -d
```

4. راقب السجلات:

```bash
docker compose logs -f mediamtx
```

5. اجعل برنامج الإرسال ينشر إلى:

```text
rtmp://YOUR_SERVER_IP:1935/live
```

في صفحة الاستوديو، أدخل عنوان MediaMTX مثل `https://stream.example.com:8889` واضغط «فتح الناشر»، ثم أدخل بيانات المستخدم عند طلبها. بعد وصول فيديو وصوت إلى مسار `live`، سيحاول MediaMTX تمريره إلى وجهة RTMPS المحددة في الإعداد.

## المنافذ

افتح في الجدار الناري فقط ما تحتاجه:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 1935/tcp
sudo ufw allow 8889/tcp
sudo ufw allow 8189/udp
sudo ufw enable
```

لا تفتح واجهة API أو Metrics للعامة. إذا كان الخادم خلف Reverse Proxy، استخدم HTTPS وشهادة صحيحة لواجهة WebRTC.

## ملاحظات مهمة

- GitHub Pages لا يشغّل MediaMTX أو FFmpeg؛ هذه الملفات تحتاج خادمًا دائمًا.
- مفتاح TikTok حساس ويمكنه تمكين البث على الحساب. خزّنه في الخادم بصلاحيات مقيدة، وغيّره فورًا إذا انكشف.
- انتهاء أهلية LIVE أو تغيير عنوان RTMP من TikTok يتطلب تحديث الإعداد.
- ملفات الموقع الحالية توفر تجهيزًا ومعاينة، لكنها لا تبدأ TikTok LIVE تلقائيًا.
- لا تستخدم Selenium أو قراءة الشاشة أو بوتات للتعليقات؛ تفاعل التعليقات يبقى يدويًا.

## اختيار المصدر

يمكن لـ OBS أو TikTok LIVE Studio إرسال المصدر إلى عنوان الخادم. أما بث الكاميرا من المتصفح مباشرة فيحتاج صفحة WebRTC publisher متوافقة مع WHIP وشهادة HTTPS؛ هذه الحزمة تجهز MediaMTX لكنها لا تمنح صلاحية TikTok ولا تنشئ مفتاح RTMP.

## المصادر الرسمية

- MediaMTX يدعم تحويل البث إلى RTMP عبر إعداد `forward`: https://mediamtx.org/docs/features/forward
- التثبيت الرسمي عبر Docker والمنافذ: https://mediamtx.org/docs/kickoff/install
- مرجع إعداد MediaMTX: https://mediamtx.org/docs/references/configuration-file
