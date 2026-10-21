from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "github-apps" / "index.html"

class PageAudit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.anchors = []
        self.source_items = 0
        self.launch_count = 0
        self.source_link_count = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set((attrs.get("class") or "").split())
        if tag == "a":
            self.anchors.append(attrs)
            if "launch" in classes:
                self.launch_count += 1
            if "source-link" in classes:
                self.source_link_count += 1
        if tag == "article" and "source-item" in classes:
            self.source_items += 1

html = PAGE.read_text(encoding="utf-8")
audit = PageAudit()
audit.feed(html)

if '<html lang="ar" dir="rtl">' not in html:
    sys.exit("GitHub Apps page must remain Arabic and RTL.")
if audit.launch_count != 2 or audit.source_link_count != 2:
    sys.exit("Only the two verified GitHub Pages apps should have launch buttons and secondary source links.")
if audit.source_items != 19:
    sys.exit("All 19 non-deployed repositories must remain in the clearly separate source-only section.")

launch_urls = {
    anchor.get("href")
    for anchor in audit.anchors
    if "launch" in set((anchor.get("class") or "").split())
}
if launch_urls != {"/?locale=ar", "https://elazzouz-dotcom.github.io/XM1/"}:
    sys.exit(f"Unexpected app launch destinations: {sorted(launch_urls)}")
if any("vercel.app" in (anchor.get("href") or "") for anchor in audit.anchors):
    sys.exit("Unverified Vercel deployments must not be offered as launch destinations.")
if any("github.com" in (anchor.get("href") or "") and "launch" in set((anchor.get("class") or "").split()) for anchor in audit.anchors):
    sys.exit("A GitHub source repository must never be presented as the runnable app.")

expected_repositories = [
    "AI-Platform", "azz", "azzouz", "c2", "cli", "docs", "forge", "Gobi",
    "marketplace-social-platform", "mohamed-azzouz", "mohamedazzouz", "nextjs",
    "nvmok", "ok1", "single-spa", "sooq-marketplace", "sooq-platform",
    "sooq-smart-marketplace", "symmetrical-space-couscous"
]
missing = [name for name in expected_repositories if f"<h3>{name}</h3>" not in html]
if missing:
    sys.exit(f"Missing source-only projects: {', '.join(missing)}")

print("GitHub Apps launch-directory contract passed.")
