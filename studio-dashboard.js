(() => {
  const panels = [...document.querySelectorAll('[data-studio-panel]')];
  const links = [...document.querySelectorAll('[data-studio-page]')];
  const show = (page, scroll = false) => {
    panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.studioPanel === page));
    links.forEach(link => link.classList.toggle('is-active', link.dataset.studioPage === page));
    if (scroll) document.querySelector('.studio-app-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  links.forEach(link => link.addEventListener('click', () => show(link.dataset.studioPage)));
  document.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => show(button.dataset.jump, true)));
  document.querySelectorAll('[data-scroll-target]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  document.getElementById('studio-top-connect')?.addEventListener('click', () => document.getElementById('ghw-connect')?.click());
  document.getElementById('studio-connection-github')?.addEventListener('click', () => document.getElementById('studio-top-connect')?.click());
  const status = document.getElementById('ghw-status'), topStatus = document.getElementById('studio-top-status'), topButton = document.getElementById('studio-top-connect');
  if (status && topStatus) {
    const sync = () => { topStatus.textContent = status.textContent || 'غير متصل'; if (/متصل|تم ربط|connected/i.test(status.textContent)) { topStatus.style.color = '#6ee7a5'; if (topButton) topButton.textContent = 'حساب GitHub متصل'; } };
    new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true }); sync();
  }
})();
