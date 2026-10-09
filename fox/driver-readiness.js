(() => {
  'use strict';

  const section = document.querySelector('#linux-drivers');
  if (!section || document.querySelector('#driver-readiness')) return;

  const panel = document.createElement('section');
  panel.id = 'driver-readiness';
  panel.className = 'feature-card mt-6 p-6 sm:p-8';
  panel.setAttribute('aria-labelledby', 'driver-readiness-heading');
  panel.innerHTML = `
    <style>
      #driver-readiness .readiness-item {
        border: 1px solid var(--color-border);
        border-radius: calc(var(--radius) * 0.6);
        background: var(--color-bg);
      }

      #driver-readiness .readiness-item:has(input:checked) {
        border-color: var(--color-primary);
        background: var(--color-soft);
      }

      #driver-readiness pre {
        direction: ltr;
        overflow: auto;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        border-radius: calc(var(--radius) * 0.6);
        background: var(--color-dark);
        padding: 1rem;
        color: var(--color-primary-contrast);
        text-align: left;
      }
    </style>
    <p class="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-primary)]">مراجعة قبل الصيانة</p>
    <h2 id="driver-readiness-heading" class="mb-2 text-2xl font-black">تحقّق من الجاهزية قبل تغيير التعريفات</h2>
    <p class="mb-5 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">هذه القائمة تذكير محلي فقط؛ لا تفحص الخادم ولا تثبت توافق الحزم. لا تبدأ إذا لم يتوفر وصول إلى وحدة تحكم خارج النطاق وخطة رجوع مجرّبة.</p>
    <div id="driver-checklist" class="grid gap-3 sm:grid-cols-2">
      <label class="readiness-item flex items-start gap-3 p-4 text-sm leading-6">
        <input type="checkbox" class="mt-1 accent-[var(--color-primary)]">
        <span><strong>وصول بديل متاح</strong><br><span class="text-[var(--color-muted)]">تأكد من توفر وحدة تحكم خارج النطاق، لا جلسة SSH وحيدة.</span></span>
      </label>
      <label class="readiness-item flex items-start gap-3 p-4 text-sm leading-6">
        <input type="checkbox" class="mt-1 accent-[var(--color-primary)]">
        <span><strong>نافذة صيانة معتمدة</strong><br><span class="text-[var(--color-muted)]">نسّق انقطاع الشبكة وSAN مع الجهات المعنية.</span></span>
      </label>
      <label class="readiness-item flex items-start gap-3 p-4 text-sm leading-6">
        <input type="checkbox" class="mt-1 accent-[var(--color-primary)]">
        <span><strong>نسخة احتياطية وخطة رجوع</strong><br><span class="text-[var(--color-muted)]">تحقق من إمكانية الاستعادة قبل تغيير الوحدات.</span></span>
      </label>
      <label class="readiness-item flex items-start gap-3 p-4 text-sm leading-6">
        <input type="checkbox" class="mt-1 accent-[var(--color-primary)]">
        <span><strong>الحزم مطابقة للبيئة</strong><br><span class="text-[var(--color-muted)]">تحقق من إصدار RHEL والنواة ومصدر الحزم وتوقيعاتها.</span></span>
      </label>
    </div>
    <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p id="driver-checklist-status" class="mb-0 text-sm font-semibold text-[var(--color-muted)]" aria-live="polite">لم تُراجع أي خطوة بعد.</p>
      <button id="copy-driver-diagnostics" type="button" class="rounded-[calc(var(--radius)*0.55)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-bold">نسخ أوامر فحص غير تغييرية</button>
    </div>
    <pre id="driver-diagnostics">uname -r
lsmod | grep -E '^(lpfc|be2net|8021q)\\b'
modinfo lpfc
modinfo be2net</pre>
    <p id="driver-diagnostics-status" class="mb-0 text-xs leading-5 text-[var(--color-muted)]" aria-live="polite">الأوامر أعلاه تعرض معلومات النظام فقط؛ راجعها قبل تشغيلها. لا تنفّذ أوامر الإزالة أو التثبيت أو إعادة التشغيل من هذه الصفحة.</p>
  `;

  section.append(panel);

  const checks = [...panel.querySelectorAll('#driver-checklist input')];
  const checklistStatus = panel.querySelector('#driver-checklist-status');

  function updateChecklist() {
    const complete = checks.filter((checkbox) => checkbox.checked).length;
    checklistStatus.textContent = complete === checks.length ?
      'اكتملت قائمة المراجعة. هذا لا يغني عن التحقق الفني وموافقة التغيير.' :
      `أُنجزت ${complete} من ${checks.length} خطوات.`;
  }

  checks.forEach((checkbox) => checkbox.addEventListener('change', updateChecklist));

  panel.querySelector('#copy-driver-diagnostics').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const output = panel.querySelector('#driver-diagnostics');
    const status = panel.querySelector('#driver-diagnostics-status');
    try {
      await navigator.clipboard.writeText(output.textContent);
      status.textContent = 'نُسخت أوامر الفحص فقط. راجعها قبل تشغيلها على النظام المستهدف.';
      button.textContent = 'تم النسخ';
    } catch {
      status.textContent = 'تعذر النسخ تلقائيًا؛ حدّد أوامر الفحص وانسخها يدويًا.';
    }
    window.setTimeout(() => {
      button.textContent = 'نسخ أوامر فحص غير تغييرية';
    }, 1600);
  });
})();
