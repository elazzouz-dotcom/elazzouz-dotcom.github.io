from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "stream" / "index.html"
html = PAGE.read_text(encoding="utf-8")

required = [
    '<html lang="ar" dir="rtl">',
    "YouTube",
    "TikTok LIVE",
    "Facebook Live",
    "Instagram Live",
    'href="https://app.restream.io/home"',
    "لا نطلب كلمة مرور المنصات أو مفاتيح البث",
    "اضغط Start Streaming داخل Restream",
    'rel="license"',
    "creativecommons.org/licenses/by-nc-nd/4.0/",
    "/stream/assets/trojan-horse-live-icon.webp",
    "/stream/stream.css",
]
missing = [item for item in required if item not in html]
if missing:
    raise SystemExit("Missing stream integration contract: " + ", ".join(missing))

if 'type="password"' in html.lower() or "stream key input" in html.lower():
    raise SystemExit("The static page must not collect passwords or stream keys.")

class ExternalLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        values = dict(attrs)
        href = values.get("href", "")
        if values.get("target") == "_blank" and href.startswith("https://"):
            rel = set(values.get("rel", "").split())
            if not {"noopener", "noreferrer"}.issubset(rel):
                self.errors.append(href)

parser = ExternalLinkParser()
parser.feed(html)
if parser.errors:
    raise SystemExit("External links missing noopener/noreferrer: " + ", ".join(parser.errors))

for relative in ("stream.css", "assets/trojan-horse-live-icon.webp"):
    if not (PAGE.parent / relative).is_file():
        raise SystemExit(f"Missing local stream asset: {relative}")

print("Stream tool contract passed.")
