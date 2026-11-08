from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
errors = []

class PageParser(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        ident = attrs.get('id')
        if ident:
            if ident in self.ids:
                errors.append(f'{self.path}: duplicate id={ident}')
            self.ids.add(ident)
        for attr in ('href', 'src'):
            value = attrs.get(attr, '')
            if not value or value.startswith(('#', 'mailto:', 'tel:', 'javascript:', 'data:')):
                continue
            parsed = urlparse(value)
            if parsed.scheme or parsed.netloc:
                continue
            clean = parsed.path.split('?', 1)[0].lstrip('/')
            if not clean:
                target = ROOT / 'index.html'
            elif clean.endswith('/'):
                target = ROOT / clean / 'index.html'
            else:
                target = ROOT / clean
                if not target.suffix:
                    target = ROOT / clean / 'index.html'
            if not target.exists():
                errors.append(f'{self.path}: missing internal {value}')

for page in sorted(ROOT.rglob('*.html')):
    if '.git' in page.parts:
        continue
    parser = PageParser(page.relative_to(ROOT))
    parser.feed(page.read_text(encoding='utf-8'))

if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print(f'OK: checked {len(list(ROOT.rglob("*.html")))} HTML pages and internal links')
