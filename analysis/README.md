# محاكاة الجذر المركب ونوع السورة

يحتاج السكريبت إلى ملف CSV يحتوي على عمودين:

```csv
combined_root,type
جذر-1,مكية
جذر-1,مدنية
جذر-2,مكية
```

## تثبيت البيئة

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-simulation.txt
```

## التشغيل

```bash
python quran_root_type_monte_carlo.py data.csv \
  --samples 200000 \
  --seed 12345 \
  --output-json results.json
```

يستخدم السكريبت `np.random.default_rng(42)` مرة واحدة قبل استدعاء `random_table.rvs`. ويحسب قيمة المحاكاة بالتصحيح التالي:

```text
p_MC = (عدد القيم المحاكاة التي >= chi2_observed + 1) / (B + 1)
SE_MC = sqrt(p_MC * (1 - p_MC) / (B + 1))
```

لإعادة النتيجة نفسها عمليًا، ثبّت إصدار Python وإصدارات NumPy وPandas وSciPy، واستخدم الملف نفسه، وتسلسل الاستدعاءات نفسه، والمنصة نفسها قدر الإمكان. لا يضمن `seed=12345` وحده تطابق النتائج عبر إصدارات أو بيئات مختلفة.

## محرك المعاينة الحية الآمن

يقرأ `live_quantum_engine.py` بيانات السور من `quran-analysis/data.js` افتراضيًا، ويكتب `report.json` وواجهة `index.html` إلى مجلد إخراج محدد. لا يفتح صلاحية عامة على ملفات الجهاز ولا يعدّل المستودع تلقائيًا.

لتوليد تقرير ومعاينة فقط:

```bash
python3 analysis/live_quantum_engine.py --output-dir /tmp/slaks-live-preview
```

لتشغيل خادم المعاينة على `localhost`:

```bash
python3 analysis/live_quantum_engine.py \
  --output-dir /tmp/slaks-live-preview \
  --serve --port 8767
```

ولمراقبة ملف JSON تختاره وإعادة توليد التقرير عند تغيّره:

```bash
python3 analysis/live_quantum_engine.py \
  --input-json /path/to/surahs.json \
  --output-dir /tmp/slaks-live-preview \
  --serve --watch --port 8767
```

الخادم يستمع إلى `127.0.0.1` فقط، ويعرض مجلد الإخراج فقط. استخدم `--open` لفتح المتصفح تلقائيًا إذا رغبت بذلك.
