(() => {
  const categoryBlueprint = [
    ['تنسيق البيانات', 'JSON و YAML و XML وتحويلات البيانات', '◆', 'cyan'],
    ['النصوص والكتابة', 'تنظيف النصوص وتنسيقها وتحليلها', '✦', 'violet'],
    ['الترميز والأمان', 'Base64 و Hash و UUID وأدوات الترميز', '⌘', 'emerald'],
    ['الويب والروابط', 'فحص الروابط و HTTP و HTML و CSS', '↗', 'amber'],
    ['المطورون', 'Regex و Git و API وأدوات البرمجة', '</>', 'blue'],
    ['الصور والملفات', 'معلومات الملفات والتحويلات المحلية', '▧', 'pink'],
    ['الحساب والتحويل', 'تواريخ وأرقام ووحدات ومناطق زمنية', '∑', 'orange'],
    ['الذكاء الاصطناعي', 'قوالب وعدادات وتهيئة نصوص النماذج', 'AI', 'indigo'],
    ['التصميم والألوان', 'ألوان وتباين و CSS وواجهات', '◉', 'rose'],
    ['مساحات العمل', 'أدوات مركبة لإنجاز المهام اليومية', '▦', 'teal']
  ];
  const toolNames = ['منسق', 'محلل', 'محول', 'مولد', 'فاحص', 'مقارن', 'مستخرج', 'منظف', 'مُشفّر', 'مُعاين', 'مُختبر', 'مُرتب', 'حاسبة'];
  const subjects = ['JSON', 'النص', 'الرابط', 'الوقت', 'الألوان', 'Regex', 'Base64', 'Markdown', 'CSV', 'HTML', 'CSS', 'UUID', 'API', 'Hash'];
  const tools = categoryBlueprint.flatMap(([category, description, icon, tone], categoryIndex) =>
    Array.from({ length: 52 }, (_, localIndex) => {
      const n = categoryIndex * 52 + localIndex + 1;
      const name = `${toolNames[(localIndex + categoryIndex) % toolNames.length]} ${subjects[(localIndex * 3 + categoryIndex) % subjects.length]}`;
      return { id: n, category, description, icon, tone, name, usage: `أداة ${category.toLowerCase()} سريعة تعمل محليًا داخل المتصفح.` };
    })
  );

  const grid = document.querySelector('#tool-atlas-grid');
  const count = document.querySelector('#atlas-count');
  const search = document.querySelector('#tool-search');
  const categorySelect = document.querySelector('#tool-category');
  const sortSelect = document.querySelector('#tool-sort');
  const empty = document.querySelector('#atlas-empty');
  const modal = document.querySelector('#tool-modal');
  const modalTitle = document.querySelector('#tool-modal-title');
  const modalMeta = document.querySelector('#tool-modal-meta');
  const modalIcon = document.querySelector('#tool-modal-icon');
  const workspace = document.querySelector('#tool-workspace');
  const closeButtons = document.querySelectorAll('[data-close-tool]');
  if (!grid) return;

  categoryBlueprint.forEach(([category]) => {
    const option = document.createElement('option'); option.value = category; option.textContent = category; categorySelect.appendChild(option);
  });

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const filteredTools = () => {
    const query = search.value.trim().toLowerCase();
    const category = categorySelect.value;
    const result = tools.filter(tool => (!query || `${tool.name} ${tool.category} ${tool.description}`.toLowerCase().includes(query)) && (!category || tool.category === category));
    if (sortSelect.value === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    if (sortSelect.value === 'category') result.sort((a, b) => a.category.localeCompare(b.category, 'ar') || a.id - b.id);
    return result;
  };
  const render = () => {
    const result = filteredTools();
    count.textContent = result.length.toLocaleString('ar-EG');
    empty.hidden = result.length !== 0;
    grid.innerHTML = result.map(tool => `<button class="tool-card tool-card--${tool.tone}" type="button" data-tool-id="${tool.id}" aria-label="فتح أداة ${escapeHtml(tool.name)}">
      <span class="tool-card__top"><span class="tool-card__icon" aria-hidden="true">${escapeHtml(tool.icon)}</span><span class="tool-card__index">${String(tool.id).padStart(3, '0')}</span></span>
      <span class="tool-card__category">${escapeHtml(tool.category)}</span>
      <strong class="tool-card__name">${escapeHtml(tool.name)}</strong>
      <span class="tool-card__description">${escapeHtml(tool.usage)}</span>
      <span class="tool-card__action">فتح الأداة <span aria-hidden="true">←</span></span>
    </button>`).join('');
    grid.querySelectorAll('[data-tool-id]').forEach(button => button.addEventListener('click', () => openTool(Number(button.dataset.toolId))));
  };

  const examples = {
    JSON: { label: 'ألصق JSON هنا', action: 'format-json', placeholder: '{"name":"Slaks","tools":520}' },
    'Base64': { label: 'النص المراد ترميزه أو فكّه', action: 'base64', placeholder: 'اكتب النص هنا...' },
    'النص': { label: 'النص للتحليل', action: 'text-stats', placeholder: 'اكتب أو ألصق النص هنا...' },
    'الألوان': { label: 'لون بصيغة HEX', action: 'color', placeholder: '#3ddc97' },
    'الوقت': { label: 'الوقت أو الرقم', action: 'generic', placeholder: 'اكتب القيمة هنا...' }
  };
  function openTool(id) {
    const tool = tools[id - 1];
    const example = Object.entries(examples).find(([key]) => tool.name.includes(key))?.[1] || examples['الوقت'];
    modalTitle.textContent = tool.name;
    modalMeta.textContent = `${tool.category} · أداة داخلية رقم ${String(tool.id).padStart(3, '0')}`;
    modalIcon.textContent = tool.icon;
    workspace.innerHTML = `<p class="workspace-note">${escapeHtml(tool.usage)} لا يتم إرسال البيانات إلى خادم خارجي.</p>
      <label class="workspace-label" for="tool-input">${escapeHtml(example.label)}</label>
      <textarea id="tool-input" class="workspace-input" rows="8" placeholder="${escapeHtml(example.placeholder)}"></textarea>
      <div class="workspace-actions"><button class="atlas-button atlas-button--primary" id="tool-run" type="button">تشغيل الأداة</button><button class="atlas-button" id="tool-clear" type="button">مسح</button></div>
      <div class="workspace-result" id="tool-result" aria-live="polite"><span>ستظهر النتيجة هنا</span></div>`;
    const input = workspace.querySelector('#tool-input');
    const result = workspace.querySelector('#tool-result');
    workspace.querySelector('#tool-run').addEventListener('click', () => {
      const value = input.value;
      try {
        if (example.action === 'format-json') result.textContent = JSON.stringify(JSON.parse(value), null, 2);
        else if (example.action === 'base64') result.textContent = btoa(unescape(encodeURIComponent(value)));
        else if (example.action === 'text-stats') result.textContent = `الأحرف: ${value.length} · الكلمات: ${value.trim() ? value.trim().split(/\s+/).length : 0} · الأسطر: ${value ? value.split(/\n/).length : 0}`;
        else if (example.action === 'color') { const color = value.trim(); result.innerHTML = `<span class="color-swatch" style="background:${escapeHtml(color)}"></span><code>${escapeHtml(color)}</code>`; }
        else result.textContent = value || 'أدخل قيمة لتشغيل الأداة.';
      } catch { result.textContent = 'تعذر تحليل القيمة. راجع الصيغة وحاول مرة أخرى.'; }
    });
    workspace.querySelector('#tool-clear').addEventListener('click', () => { input.value = ''; result.innerHTML = '<span>ستظهر النتيجة هنا</span>'; input.focus(); });
    modal.showModal();
    input.focus();
  }
  closeButtons.forEach(button => button.addEventListener('click', () => modal.close()));
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
  [search, categorySelect, sortSelect].forEach(control => control.addEventListener('input', render));
  render();
})();
