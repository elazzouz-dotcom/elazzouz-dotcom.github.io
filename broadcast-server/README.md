# خادم بث TikTok عبر RTMP وMediaMTX

هذه الحزمة تشغّل MediaMTX على خادم دائم، وتستقبل بث WebRTC أو RTMP على مسار `live` ثم تمرره إلى وجهة RTMPS التي يوفرها TikTok للحساب المؤهل. الموقع العام لا يخزن مفتاح البث.

## المتطلبات

- VPS أو Cloud Computer دائم يعمل بـ Ubuntu 24.04.
- نطاق HTTPS إذا أردت نشر WebRTC من صفحة الموقع.
- رابط RTMPS ومفتاح بث رسمي من TikTok. لا تضعهما في GitHub ولا ترسلهما داخل المحادثة.

## إعداد سريع من الهاتف

من طرفية Cloud Computer، نفّذ:

```bash
git clone https://github.com/elazzouz-dotcom/elazzouz-dotcom.github.io.git
cd elazzouz-dotcom.github.io/broadcast-server
sudo bash install-docker.sh
sudo bash setup-server.sh
```

إذا كان مجلد المشروع موجودًا، استخدم `cd broadcast-server` بدل أوامر `git clone`.

سيطلب `setup-server.sh` كلمة مرور ناشر MediaMTX ووجهة RTMPS الكاملة. تُحفظ القيم في ملف `.env` بصلاحية خاصة، ويُنشئ الملف الخاص `mediamtx.runtime.yml`. كلاهما مستثنى من Git عبر `.gitignore`.

لفحص الخدمة لاحقًا:

```bash
sudo bash check-server.sh
docker compose logs --tail=50 mediamtx
```

## إعداد الموقع للبث

بعد نجاح تشغيل الخادم، افتح صفحة الاستوديو من الهاتف:

```text
https://elazzouz-dotcom.github.io/coin-tracker/live-studio.html
```

في لوحة «ناشر WebRTC الحقيقي»، أدخل عنوان MediaMTX مثل:

```text
https://stream.example.com:8889
```

واستخدم المسار:

```text
live
```

ثم وافق على الكاميرا والميكروفون. سيصل المصدر إلى MediaMTX، ثم يمرره الخادم إلى TikTok.

## المنافذ

يفتح السكربت تلقائيًا:

```text
22/tcp    SSH
1935/tcp  RTMP ingest
8889/tcp  WebRTC HTTP
8189/udp  WebRTC ICE
8890/udp  WebRTC UDP
```

لا تفتح واجهة API أو Metrics للعامة. استخدم HTTPS صحيحًا لواجهة WebRTC؛ المتصفحات تمنع الكاميرا والميكروفون على HTTP العام.

## الأمان

- لا تُدخل مفتاح TikTok في صفحة الموقع.
- لا ترفع `.env` أو `mediamtx.runtime.yml` إلى GitHub.
- استخدم كلمة مرور ناشر طويلة لا تقل عن 16 حرفًا.
- غيّر مفتاح TikTok إذا انكشف.
- السكربت يرفض القيم غير الصالحة ولا يطبع الأسرار.
- لا تستخدم Selenium أو قراءة الشاشة أو بوتات التعليقات؛ التفاعل يبقى يدويًا.

## حدود الخدمة

GitHub Pages لا يشغّل MediaMTX أو FFmpeg. هذه الملفات تحتاج خادمًا دائمًا. كما أن TikTok يجب أن يمنح الحساب رابط RTMPS ومفتاح بث رسميين؛ لا يمكن إنشاءهما أو استخراجُهما من الموقع.

## المصادر الرسمية

- [MediaMTX Web browser publishing](https://mediamtx.org/docs/publish/web-browsers)
- [MediaMTX RTMP forwarding](https://mediamtx.org/docs/features/forward)
- [MediaMTX Docker installation](https://mediamtx.org/docs/kickoff/install)
- [MediaMTX configuration reference](https://mediamtx.org/docs/references/configuration-file)
