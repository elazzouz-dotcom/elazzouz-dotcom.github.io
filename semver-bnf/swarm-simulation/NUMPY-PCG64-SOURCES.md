# مراجع توافق NumPy PCG64

هذا الملف يوثق الأساس الحسابي لمولّد JavaScript المحلي في `numpy-pcg64.js`.

- يعرّف توثيق NumPy مولّد PCG64 المستخدم بأنه PCG XSL-RR 128/64، بحالة وزيادة من 128 بت، ويذكر أن البذرة تمر عبر `SeedSequence` وأن التدفق الصحيح ثابت لبذرة ثابتة: [توثيق PCG64](https://numpy.org/doc/stable/reference/random/bit_generators/pcg64.html).
- يشرح توثيق `SeedSequence` تجميع entropy وخلطها بصورة حتمية: [توثيق SeedSequence](https://numpy.org/doc/stable/reference/random/bit_generators/generated/numpy.random.SeedSequence.html).
- مصدر NumPy يحدد ثوابت `SeedSequence`، وحجم التجميع الافتراضي 4 كلمات `uint32`، وخوارزميتي `hashmix` و`mix` و`generate_state`: [bit_generator.pyx](https://github.com/numpy/numpy/blob/main/numpy/random/bit_generator.pyx).
- يطلب مُهيئ PCG64 أربع كلمات `uint64` من `SeedSequence.generate_state(4, np.uint64)` ثم يمرر أول زوج للحالة والثاني للزيادة: [_pcg64.pyx](https://github.com/numpy/numpy/blob/main/numpy/random/_pcg64.pyx) و[pcg64.c](https://github.com/numpy/numpy/blob/main/numpy/random/src/pcg64/pcg64.c).
- يحدد مصدر PCG64 مضاعف LCG، خطوة الحالة، ودالة إخراج XSL-RR: [pcg64.h](https://github.com/numpy/numpy/blob/main/numpy/random/src/pcg64/pcg64.h). تحويل الكلمة إلى عدد عائم يقتطع أعلى 53 بتًا: [_common.pxd](https://github.com/numpy/numpy/blob/main/numpy/random/_common.pxd).

## دليل المقارنة

تمت مقارنة التنفيذ مع NumPy 2.5.4 للبذرة `12345`: تطابقت الحالة الابتدائية والزيادة، و12 قيمة اختبار ثابتة، ثم طابقت مقارنة مباشرة 4096 قيمة خام `uint64` و4096 تمثيلًا ثنائيًا لقيم `float64` ناتجة عن `Generator.random()`.

يحمّل الموقع المولّد محليًا بلا اتصال خارجي؛ وإعادة ضبط المحاكاة تنشئ مولدًا جديدًا بالبذرة نفسها.
