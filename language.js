(() => {
  const LANGUAGE_STORAGE_KEY = 'knowledgebase-language';
  const THEME_STORAGE_KEY = 'knowledgebase-theme';

  function getSavedTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function applyTheme(theme = getSavedTheme()) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;

    const themeButton = document.querySelector('.theme-toggle');
    if (themeButton) {
      const icon = themeButton.querySelector('.theme-toggle-icon');
      const label = themeButton.querySelector('span:last-child');
      if (icon) icon.textContent = nextTheme === 'dark' ? '☀' : '☾';
      if (label) label.textContent = nextTheme === 'dark' ? 'الوضع الفاتح' : 'الوضع المظلم';
    }
  }

  applyTheme();

  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
  });
  const SOURCE_LANGUAGE = document.documentElement.lang || 'en';
  const LANGUAGES = [
    ['ar', 'العربية'],
    ['en', 'English'],
    ['es', 'Español'],
    ['fr', 'Français'],
    ['de', 'Deutsch'],
    ['it', 'Italiano'],
    ['pt', 'Português'],
    ['ru', 'Русский'],
    ['zh-CN', '中文（简体）'],
    ['ja', '日本語'],
    ['ko', '한국어'],
    ['hi', 'हिन्दी'],
    ['tr', 'Türkçe'],
    ['nl', 'Nederlands'],
    ['pl', 'Polski'],
    ['uk', 'Українська'],
    ['id', 'Bahasa Indonesia'],
    ['vi', 'Tiếng Việt'],
    ['th', 'ไทย'],
    ['he', 'עברית']
  ];

  const labels = {
    en: {
      language: 'Language and translation',
      settings: 'Settings',
      back: 'Back'
    },
    ar: {
      language: 'اللغة والترجمة',
      settings: 'الإعدادات',
      back: 'رجوع'
    }
  };

  const SETTINGS_GROUPS = [
    {
      title: 'Studios',
      links: [
        ['💬 Chat Studio · this conversation', '/chat-studio'],
        ['🐺 Hosting Studio', '/hosting-studio'],
        ['🚀 GitHub Pages publishing guide', '/github-pages'],
        ['🐘 Project files', '/project-files'],
        ['GitHub Studios', '/github-studios'],
        ['📋 Project requests', '/project-requests'],
        ['◈ AIP Trading Company', '/aip'],
        ['✉ Contact', '/contact'],
        ['🔗 Integrations', '/integrations/']
      ]
    },
    {
      title: 'Build and test',
      links: [
        ['Developer toolkit', '/developer-tools'],
        ['SLaksi image vault', '/slaksi'],
        ['Vault cell architecture', '/cell-architecture'],
        ['One App Router playground', '/one-app-router'],
        ['Form automation builder', '/form-automation'],
        ['SQL query builder', '/sql-playground'],
        ['Git identity builder', '/git-config'],
        ['🦊 Fox Wiki Workspace', '/fox'],
        ['🦊 ThreatCluster entity lookup', '/fox/threatcluster'],
        ['🦊 CSS lab', '/fox/css-lab'],
        ['HTML lab', '/html-reference'],
        ['LaTeX conversion log analyzer', '/latex-log'],
        ['URI analyzer', '/uri-reference'],
        ['Clipboard lab', '/clipboard-reference'],
        ['List explorer', '/list-explorer'],
        ['CGAL CMake builder', '/cgal-cmake']
      ]
    },
    {
      title: 'Browser workflows',
      links: [
        ['Browser session planner', '/browser-session'],
        ['Browserbase Studio', '/browserbase-studio'],
        ['Browser performance planner', '/browser-performance'],
        ['Browser identity planner', '/browserbase-identity'],
        ['Browserbase Search builder', '/browserbase-search'],
        ['Browserbase onboarding', '/browserbase-onboarding'],
        ['Persistence planner', '/browserbase-persistence']
      ]
    },
    {
      title: 'API tools',
      links: [
        ['Security advisory archive', '/security-advisory'],
        ['PHPfileNavigator XSS advisory', '/phpfilenavigator-advisory'],
        ['OpenAI API overview', '/openai-api'],
        ['API workbench', '/api-tool'],
        ['Graph explorer', '/graph'],
        ['AgentMail planner', '/agentmail'],
        ['Marketplace search builder', '/marketplace-search'],
        ['Internet Archive JSON explorer', '/archive-json'],
      ]
    },
    {
      title: 'References and demos',
      links: [
        ['Action and loader demo', '/action-demo'],
        ['Custom link demo', '/custom-link'],
        ['Rust ResourcePattern reference', '/aip-resource-pattern'],
        ['Atomic pointer source viewer', '/atomic-pointer'],
        ['Go test-suite builder', '/go-test-suite-config'],
        ['Claude MCP setup', '/claude-mcp'],
        ['Firecrawl workflow builder', '/firecrawl']
      ]
    }
  ];

  function appendSettingsDirectory(container) {
    SETTINGS_GROUPS.forEach((group) => {
      const heading = document.createElement('p');
      heading.className = 'settings-language-heading';
      heading.textContent = group.title;
      container.append(heading);

      group.links.forEach(([label, href]) => {
        const link = document.createElement('a');
        link.href = href;
        link.className = 'block rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-bg)]';
        link.textContent = label;
        container.append(link);
      });
    });

    const directoryLink = document.createElement('a');
    directoryLink.href = '/tools';
    directoryLink.className = 'mt-2 block rounded-[calc(var(--radius)*0.5)] border-t border-[var(--color-border)] px-3 py-3 text-sm font-extrabold text-[var(--color-primary)]';
    directoryLink.textContent = 'Browse all tools';
    container.append(directoryLink);
  }

  function getSavedLanguage() {
    const requestedLanguage = new URLSearchParams(window.location.search).get('locale');
    if (requestedLanguage && LANGUAGES.some(([code]) => code === requestedLanguage)) {
      return requestedLanguage;
    }
    try {
      return localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en';
    } catch {
      return 'en';
    }
  }

  function setDirection(language) {
    const isArabic = language === 'ar';
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.body.classList.toggle('arabic-interface', isArabic);
  }

  function createBackButton() {
    if (location.pathname === '/' || document.querySelector('.site-back-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-back-button';
    button.textContent = '←';
    button.setAttribute('aria-label', 'Back');
    button.title = 'Back';
    button.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.assign('/');
    });
    document.body.insertBefore(button, document.body.firstChild);
  }

  function buildLanguageControl(language) {
    const section = document.createElement('div');
    section.className = 'settings-language-section';

    const label = document.createElement('label');
    label.className = 'settings-language-label';
    label.htmlFor = 'site-language';

    const select = document.createElement('select');
    select.id = 'site-language';
    select.className = 'settings-language-select';
    select.setAttribute('aria-label', labels[language]?.language || labels.en.language);

    LANGUAGES.forEach(([code, name]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      select.append(option);
    });

    select.value = language;
    label.textContent = labels[language]?.language || labels.en.language;
    section.append(label, select);

    select.addEventListener('change', () => {
      const selectedLanguage = select.value;
      setDirection(selectedLanguage);
      label.textContent = labels[selectedLanguage]?.language || labels.en.language;
      select.setAttribute('aria-label', label.textContent);
      const settingsText = labels[selectedLanguage]?.settings || labels.en.settings;
      const settingsSummary = document.querySelector('.site-settings-menu summary');
      const settingsHeading = document.querySelector('.settings-language-heading');
      if (settingsSummary) {
        settingsSummary.textContent = settingsText;
        settingsSummary.setAttribute('aria-label', settingsText);
      }
      if (settingsHeading) settingsHeading.textContent = settingsText;

      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
      } catch {
        // Keep the language selection for this page if storage is unavailable.
      }

      if (selectedLanguage === 'en' && SOURCE_LANGUAGE === 'en') {
        location.reload();
      } else if (window.google?.translate?.TranslateElement) {
        translatePage(selectedLanguage);
      } else {
        loadTranslator(selectedLanguage);
      }
    });

    return section;
  }

  function createSettings(language) {
    document.querySelectorAll('.language-widget, .site-settings-menu').forEach((element) => element.remove());

    const existingMenu = document.querySelector('.side-menu nav');
    const languageSection = buildLanguageControl(language);

    const hostingHeading = document.createElement('p');
    hostingHeading.className = 'settings-language-heading';
    hostingHeading.textContent = 'Studio';

    const hostingStudioLink = document.createElement('a');
    hostingStudioLink.href = '/hosting-studio';
    hostingStudioLink.className = 'block rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-bg)]';
    hostingStudioLink.textContent = '🐺 Hosting Studio';

    if (existingMenu) {
      const sectionHeading = document.createElement('p');
      sectionHeading.className = 'settings-language-heading';
      sectionHeading.textContent = labels[language]?.settings || labels.en.settings;

      existingMenu.prepend(languageSection);
      existingMenu.prepend(sectionHeading);
      appendSettingsDirectory(existingMenu);
      return;
    }

    const headerRow = document.querySelector('header')?.firstElementChild;
    if (!headerRow) return;

    const details = document.createElement('details');
    details.className = 'site-settings-menu';

    const summary = document.createElement('summary');
    summary.textContent = labels[language]?.settings || labels.en.settings;
    summary.setAttribute('aria-label', summary.textContent);

    const panel = document.createElement('div');
    panel.className = 'site-settings-panel';

    const exaHeading = document.createElement('p');
    exaHeading.className = 'settings-language-heading';
    exaHeading.textContent = 'Exa';

    const exaSearchLink = document.createElement('a');
    exaSearchLink.href = '/exa-search-api';
    exaSearchLink.className = 'block rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-bg)]';
    exaSearchLink.textContent = 'Exa Search';

    const exaWorkspaceLink = document.createElement('a');
    exaWorkspaceLink.href = '/exa';
    exaWorkspaceLink.className = 'block rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-bg)]';
    exaWorkspaceLink.textContent = 'Exa Workspace';

    const exaContentsLink = document.createElement('a');
    exaContentsLink.href = '/exa-contents';
    exaContentsLink.className = 'block rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-bg)]';
    exaContentsLink.textContent = 'Exa Contents';

    const exaEnrichmentLink = document.createElement('a');
    exaEnrichmentLink.href = '/exa-enrichment';
    exaEnrichmentLink.className = 'block rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-bg)]';
    exaEnrichmentLink.textContent = 'Exa Enrichment';

    const themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'theme-toggle mx-2 mb-2 w-[calc(100%-1rem)]';
    themeButton.innerHTML = '<span class="theme-toggle-icon" aria-hidden="true">☾</span><span>الوضع المظلم</span>';
    themeButton.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Keep the theme active for this page if storage is unavailable.
      }
      applyTheme(nextTheme);
    });

    panel.append(languageSection, themeButton);
    appendSettingsDirectory(panel);
    details.append(summary, panel);
    headerRow.append(details);
  }

  function loadTranslator(language) {
    window.googleTranslateElementInit = () => {
      new google.translate.TranslateElement({
        pageLanguage: SOURCE_LANGUAGE,
        includedLanguages: LANGUAGES.map(([code]) => code).join(','),
        autoDisplay: false
      }, 'google_translate_element');
      window.setTimeout(() => translatePage(language), 400);
    };

    if (!document.querySelector('#google-translate-script')) {
      const target = document.createElement('div');
      target.id = 'google_translate_element';
      target.setAttribute('aria-hidden', 'true');
      target.style.cssText = 'position:fixed;inset-inline-start:-10000px;top:-10000px;z-index:-1';
      document.body.append(target);

      const script = document.createElement('script');
      script.id = 'google-translate-script';
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.head.append(script);
    }
  }

  function translatePage(language, attempt = 0) {
    const combo = document.querySelector('.goog-te-combo');
    if (!combo) {
      if (attempt < 20) {
        window.setTimeout(() => translatePage(language, attempt + 1), 250);
      }
      return;
    }

    combo.value = language;
    combo.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }

  function hideEmailAddresses() {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const hiddenLabel = 'Email address hidden';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      emailPattern.lastIndex = 0;
      if (emailPattern.test(node.nodeValue)) {
        emailPattern.lastIndex = 0;
        node.nodeValue = node.nodeValue.replace(emailPattern, hiddenLabel);
      }
    });

    document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
      link.removeAttribute('href');
      link.textContent = hiddenLabel;
      link.setAttribute('aria-label', hiddenLabel);
    });

    document.querySelectorAll('[aria-label], [title], input[placeholder], textarea[placeholder]').forEach((element) => {
      ['aria-label', 'title', 'placeholder'].forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (!value) return;
        emailPattern.lastIndex = 0;
        if (emailPattern.test(value)) {
          emailPattern.lastIndex = 0;
          element.setAttribute(attribute, value.replace(emailPattern, hiddenLabel));
        }
      });
    });
  }

  function enhanceSiteLogo() {
    const logo = document.querySelector('header a.flex.items-center.gap-3 > span:first-child');
    if (!logo || logo.dataset.logoEnhanced === 'true') return;

    logo.dataset.logoEnhanced = 'true';
    logo.setAttribute('aria-hidden', 'true');

    const reset = () => {
      logo.style.transform = '';
    };

    logo.parentElement.addEventListener('pointermove', (event) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bounds = logo.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      logo.style.transform = `perspective(24rem) rotateX(${(-y * 14).toFixed(2)}deg) rotateY(${(x * 16).toFixed(2)}deg) translateY(-0.15rem) translateZ(0.5rem)`;
    });

    logo.parentElement.addEventListener('pointerleave', reset);
    logo.parentElement.addEventListener('blur', reset, true);
  }

  function createSkipLink() {
    if (document.querySelector('.skip-link')) return;

    const main = document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'main-content';

    const link = document.createElement('a');
    link.className = 'skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Skip to main content';
    document.body.insertBefore(link, document.body.firstChild);
  }

  function removeOrphanedCodeText() {
    const codeMarkers = [
      'document.querySelector(',
      'addEventListener(',
      'function transformJson',
      'function markdownToHtml',
      'function makeUuid',
      'TextEncoder().encode',
      'The Google Translate',
      'Developers community',
      'document.querySelector',
      'querySelector(',
      'function transformJson',
      'function bytesToBase64',
      'function base64ToText',
      'function markdownToHtml',
      'function makeUuid',
      'const workerCode',
      'self.onmessage',
      'textContent = `Converted locally',
      'UUID v4 was generated locally'
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA', 'PRE', 'CODE'].includes(parent.tagName)) return;
      const text = node.nodeValue || '';
      const looksLikeOrphanedCode = codeMarkers.some((marker) => text.includes(marker)) && text.length > 300;
      if (looksLikeOrphanedCode) node.remove();
    });
  }

  function initialize() {
    createSkipLink();
    enhanceSiteLogo();
    createBackButton();
    const language = getSavedLanguage();
    setDirection(language);
    createSettings(language);
    if (language !== SOURCE_LANGUAGE) loadTranslator(language);
    hideEmailAddresses();
    removeOrphanedCodeText();

    const observer = new MutationObserver(() => {
      hideEmailAddresses();
      removeOrphanedCodeText();
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });

    // Keep page startup independent of the external translator. A visitor can
    // still request translation explicitly from the language selector.
    // This avoids background translation failures surfacing as unhandled rejections.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
