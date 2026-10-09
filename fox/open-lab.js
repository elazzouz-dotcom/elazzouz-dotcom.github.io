(() => {
  'use strict';

  const get = (selector) => document.querySelector(selector);
  const form = get('#open-lab-form');
  if (!form) return;

  const output = get('#open-flags-output');
  const results = get('#open-review-list');
  const mode = get('#open-function');
  const pathInput = get('#open-path');
  const accessSelect = get('#open-access');
  const createToggle = get('#open-create');
  const truncToggle = get('#open-truncate');
  const exclusiveToggle = get('#open-exclusive');
      const createMode = get('#open-mode');
  const dirfdInput = get('#open-dirfd');
  const directoryToggle = get('#open-directory');
  const noFollowToggle = get('#open-nofollow');
  const appendToggle = get('#open-append');
  const nonblockToggle = get('#open-nonblock');
  const cloexecToggle = get('#open-cloexec');
  const status = get('#open-lab-status');

  function addReview(kind, heading, detail) {
    const item = document.createElement('li');
    item.className = 'rounded-[calc(var(--radius)*0.55)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4';
    const title = document.createElement('strong');
    title.className = 'mb-1 block';
    title.textContent = `${kind === 'warning' ? '⚠ ' : kind === 'error' ? '✕ ' : '✓ '}${heading}`;
    const description = document.createElement('p');
    description.className = 'mb-0 text-sm leading-6 text-[var(--color-muted)]';
    description.textContent = detail;
    item.append(title, description);
    results.append(item);
  }

  function selectedFlags() {
    const flags = [accessSelect.value];
    if (createToggle.checked) flags.push('O_CREAT');
    if (exclusiveToggle.checked) flags.push('O_EXCL');
    if (truncToggle.checked) flags.push('O_TRUNC');
    if (directoryToggle.checked) flags.push('O_DIRECTORY');
    if (noFollowToggle.checked) flags.push('O_NOFOLLOW');
    if (appendToggle.checked) flags.push('O_APPEND');
    if (nonblockToggle.checked) flags.push('O_NONBLOCK');
    if (cloexecToggle.checked) flags.push('O_CLOEXEC');
    return flags;
  }

  function review() {
    const path = pathInput.value.trim();
    const flags = selectedFlags();
    const isReadOnly = accessSelect.value === 'O_RDONLY' || accessSelect.value === 'O_SEARCH' || accessSelect.value === 'O_EXEC';
    const isDirectoryMode = accessSelect.value === 'O_SEARCH';
    const isWriteMode = accessSelect.value === 'O_WRONLY' || accessSelect.value === 'O_RDWR';
    const commandName = mode.value;
    const flagText = flags.join(' | ');
    const escapedPath = JSON.stringify(path || '/path/to/file');
        const modeArgument = createToggle.checked ? `, ${createMode.value.trim() || 'mode'}` : '';
    const relativeExpression = commandName === 'openat'
      ? `openat(${dirfdInput.value.trim() || 'dirfd'}, ${escapedPath}, ${flagText}${modeArgument})`
      : `open(${escapedPath}, ${flagText}${modeArgument})`;

    output.textContent = relativeExpression;
    get('#openat-dirfd-field').classList.toggle('hidden', commandName !== 'openat');
    get('#open-create-mode-field').classList.toggle('hidden', !createToggle.checked);
    results.replaceChildren();

    if (!path) addReview('warning', 'أدخل مسارًا للمراجعة', 'المسار الحالي مثال توضيحي فقط.');
    if (commandName === 'openat' && path && !path.startsWith('/') && !get('#open-dirfd').value.trim()) {
      addReview('error', 'يلزم واصف مجلد', 'openat() مع مسار نسبي يحتاج واصفًا صالحًا لمجلد.');
    }
    if (directoryToggle.checked && isWriteMode) {
      addReview('error', 'تركيبة غير صالحة غالبًا', 'O_DIRECTORY مع O_WRONLY أو O_RDWR لا يناسب فتح دليل؛ راجع قواعد التنفيذ ورسالة الخطأ.');
    }
    if (directoryToggle.checked && createToggle.checked && !isReadOnly) {
      addReview('warning', 'تركيبة غير محددة', 'مع O_CREAT وO_DIRECTORY، استخدم نمط وصول للقراءة أو البحث؛ التركيبات الأخرى قد تكون غير محددة.');
    }
    if (truncToggle.checked && isReadOnly) {
      addReview('error', 'O_TRUNC مع وصول للقراءة فقط', 'استخدام O_TRUNC دون O_WRONLY أو O_RDWR نتيجته غير محددة وقد يكون خطرًا.');
    }
    if (exclusiveToggle.checked && !createToggle.checked) {
      addReview('error', 'O_EXCL يتطلب O_CREAT', 'دلالة O_EXCL دون O_CREAT غير محددة؛ فعّل الإنشاء الحصري معًا.');
    }
    if (exclusiveToggle.checked && createToggle.checked) {
      addReview('info', 'إنشاء حصري', 'يفشل الفتح إذا كان الاسم موجودًا، بما في ذلك الرابط الرمزي، ما يساعد على تجنب سباقات الإنشاء.');
    }
    if (truncToggle.checked && createToggle.checked) {
      addReview('warning', 'الملف الموجود سيُصفّر', 'O_TRUNC يزيل محتوى الملف العادي الموجود عند فتحه بنجاح للكتابة. تحقّق من المسار قبل استخدام هذا النمط.');
    }
    if (noFollowToggle.checked) {
      addReview('info', 'رفض الرابط الرمزي النهائي', 'O_NOFOLLOW يطلب فشل الفتح إذا كان المكوّن الأخير رابطًا رمزيًا؛ لا يغني عن التحقق من بقية مكونات المسار.');
    }
    if (appendToggle.checked && truncToggle.checked) {
      addReview('warning', 'راجع الغرض من الجمع', 'O_APPEND يوجّه الكتابة إلى نهاية الملف، بينما O_TRUNC يفرغ الملف عند الفتح. غالبًا لا تحتاج الخيارين معًا.');
    }
    if (createToggle.checked) {
      addReview('info', 'أدخل mode عند الإنشاء', `الصيغة تحتاج قيمة mode_t مثل ${createMode.value || '0600'}؛ تُقيّد الصلاحيات بقناع umask.`);
    }
    if (isDirectoryMode && !directoryToggle.checked) {
      addReview('info', 'فتح للبحث في الدليل', 'O_SEARCH مخصص لصلاحية اجتياز/البحث في دليل، وليس لقراءة محتوى ملف عادي.');
    }
    if (nonblockToggle.checked) {
      addReview('info', 'فتح غير حاجب', 'تختلف الدلالة بحسب نوع الملف؛ مع FIFO للكتابة قد يفشل إذا لم يوجد قارئ.');
    }
    if (cloexecToggle.checked) {
      addReview('info', 'إغلاق عند exec', 'O_CLOEXEC يضبط FD_CLOEXEC ذريًا عند إنشاء واصف الملف، لتقليل تسرب الواصفات إلى البرامج المنفذة.');
    }
    if (commandName === 'openat' && path.startsWith('/')) {
      addReview('info', 'المسار مطلق', 'عند استخدام مسار مطلق، لا يغيّر dirfd قاعدة حل المسار.');
    } else if (commandName === 'openat') {
      addReview('info', 'المسار نسبي', 'يُحل المسار نسبةً إلى الدليل الذي يشير إليه dirfd، ما يساعد على تثبيت نقطة البداية عند تغيّر مجلد العمل.');
    }
    if (!results.children.length) {
      addReview('success', 'لا توجد ملاحظات أساسية', 'هذه مراجعة تعليمية للخيارات وليست تحققًا من صحة المسار أو صلاحياته.');
    }

    status.textContent = 'تم تحديث الصيغة والملاحظات محليًا. لم يُفتح ملف ولم يُنفّذ أي استدعاء نظام.';
  }

  form.addEventListener('input', review);
  form.addEventListener('change', review);
  get('#open-reset').addEventListener('click', () => {
    form.reset();
    get('#open-dirfd').value = 'dirfd';
    pathInput.value = 'reports/output.txt';
    review();
  });
  get('#open-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      status.textContent = 'نُسخت الصيغة. راجع الأعلام والمسار قبل استعمالها في برنامجك.';
    } catch {
      status.textContent = 'تعذّر النسخ تلقائيًا؛ حدّد الصيغة وانسخها يدويًا.';
    }
  });

  review();
})();
