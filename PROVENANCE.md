# Provenance موحّد

الملف [`provenance.json`](./provenance.json) هو السجل المرجعي لكل تشغيل تحليلي قابل لإعادة الإنتاج. ويُتحقق من بنيته عبر [`schemas/provenance.schema.json`](./schemas/provenance.schema.json).

## قواعد الاستخدام

ينبغي أن ينشئ خط الأنابيب نسخة جديدة من السجل عند كل تشغيل، مع `run_id` فريد ووقت UTC. لا يُعاد استخدام سجل تشغيل سابق. يجب تسجيل Commit المصدر قبل بدء الحساب، ويُفضّل إيقاف التشغيل إذا كان `working_tree_dirty` يساوي `true` إلا إذا كان ذلك مقصودًا ومذكورًا صراحة.

يجب أن يحتوي قسم `randomness` على البذرة الفعلية ومولد الأرقام المستخدم. في التشغيل المرجعي الحالي تُحفظ القيم `seed=12345` و`bit_generator=PCG64`. إذا استخدم التحليل أكثر من stream عشوائي، تُضاف أسماؤها وسياسة اشتقاق بذورها داخل `analysis.parameters` أو توسعة لاحقة للمخطط.

يسجل قسم `analysis` عدد دورات Monte Carlo، الاختبارات الإحصائية، إعدادات التصحيح، ومستوى الثقة. أما `inputs` و`outputs` فيحتويان على مسارات نسبية و`sha256` وحجم الملفات حتى يمكن اكتشاف تبدل البيانات أو النتائج دون الاعتماد على أسماء الملفات وحدها.

يسجل `performance` زمن الجدار، زمن CPU، الذاكرة القصوى، وأوقات البداية والنهاية. يسجل `validation` نتائج اختبارات الروابط، اختبارات الانحدار الإحصائي، وفحص إعادة التشغيل. لا تُعتبر النتيجة مكتملة قبل تعيين `validation.all_passed` إلى `true`.

لا يوضع أي Secret أو Access Token أو محتوى خاص داخل هذا الملف. ويمكن حساب `integrity.record_sha256` بعد حذف قيمة الحقل نفسها، ثم تخزين التجزئة الناتجة في السجل النهائي. عند الحاجة إلى توقيع، تُستخدم آلية توقيع خارجية ولا يُحفظ المفتاح الخاص في المستودع.

## التحقق المحلي

```bash
python3 - <<'PY'
import json
from pathlib import Path

json.loads(Path('provenance.json').read_text())
json.loads(Path('schemas/provenance.schema.json').read_text())
print('Provenance JSON and schema are valid JSON.')
PY
```

عند توفر حزمة `jsonschema` يمكن إجراء تحقق بنيوي كامل:

```bash
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator

schema = json.loads(Path('schemas/provenance.schema.json').read_text())
record = json.loads(Path('provenance.json').read_text())
errors = sorted(Draft202012Validator(schema).iter_errors(record), key=lambda e: list(e.path))
if errors:
    raise SystemExit('\n'.join(f'{list(e.path)}: {e.message}' for e in errors))
print('Provenance record conforms to the schema.')
PY
```
