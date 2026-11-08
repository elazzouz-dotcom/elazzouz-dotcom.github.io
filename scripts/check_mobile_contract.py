from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"Mobile contract failed: {message}")

home = (ROOT / "index.html").read_text(encoding="utf-8")
apps = (ROOT / "apps/index.html").read_text(encoding="utf-8")
ai_tools = (ROOT / "ai-tools/index.html").read_text(encoding="utf-8")
data_css = (ROOT / "data-flow.css").read_text(encoding="utf-8")
data_js = (ROOT / "data-flow.js").read_text(encoding="utf-8")
local_css = ROOT / "assets/css/site-tailwind.min.css"

require("cdn.tailwindcss.com" not in home and "cdn.tailwindcss.com" not in apps,
        "home and apps must not load the Tailwind runtime CDN")
require(home.count('/assets/css/site-tailwind.min.css') == 1 and
        apps.count('/assets/css/site-tailwind.min.css') == 1,
        "both pages must load the shared local Tailwind bundle")
require('class="site-mobile-menu"' in home and 'aria-label="التنقل الرئيسي على الهاتف"' in home,
        "home page must expose its mobile navigation menu")
require('id="mobile-section-menu"' in apps and 'class="mobile-tabs-panel"' in apps,
        "apps page must expose its collapsible mobile section menu")
require('text-3xl font-black sm:text-4xl lg:text-5xl' in apps and
        'grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-5' in apps,
        "apps page must use mobile-scaled typography and compact two-column stats")
require('preload="none"' in home and 'loading="lazy"' in home,
        "homepage video and external preview must avoid eager loading")
require('<details class="note"' in ai_tools and
        'تنبيه: روابط خارجية؛ لا تُدخل معلومات حساسة.' in ai_tools,
        "AI directory privacy note must remain visible and collapsible")
require('.visit { display: inline-flex; align-items: center; justify-content: center; min-height: 44px;' in ai_tools and
        '.source { display: inline-flex; min-height: 44px;' in ai_tools,
        "AI directory action and source links must have 44px touch targets")
require('data-flow-widget[data-offscreen="true"] .data-flow-particle' in data_css and
        'IntersectionObserver' in data_js and 'widget.dataset.offscreen' in data_js,
        "data-flow motion must pause while the widget is offscreen")
require('direction:ltr' in data_css and 'direction:rtl;text-align:right' in data_css,
        "data-flow geometry must remain left-to-right while Arabic node content stays RTL")
require(home.count('data-link="') == home.count('data-node="') - 1,
        "data-flow markup must contain exactly one link between each adjacent node")
require("matchMedia('(prefers-reduced-motion: reduce)')" in data_js and
        'sleep(reducedMotion ? 0 : 500)' in data_js and '&& !reducedMotion' in data_js,
        "data-flow must skip animation delays when reduced motion is requested")
require('id="home-github-status" class="github-login-status" role="status" aria-live="polite" aria-atomic="true"' in home,
        "GitHub login status must be announced to assistive technology")
require(local_css.is_file() and local_css.stat().st_size > 1000,
        "generated local CSS bundle must exist")

print("Mobile UX and local CSS contract passed.")
