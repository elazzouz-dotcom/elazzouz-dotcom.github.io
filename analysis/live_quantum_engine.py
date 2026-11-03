#!/usr/bin/env python3
"""Generate and serve a local live preview for the reproducible Quran analysis.

The engine only reads the explicitly selected input and writes to the explicitly
selected output directory. It does not execute shell commands, expose the whole
filesystem, or modify the repository unless the caller chooses that directory.
"""
from __future__ import annotations

import argparse
import json
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from scientific_quran_analyzer import DEFAULT_SAMPLES, DEFAULT_SEED, ScientificQuranAnalyzer, SimulationConfig
from run_reproducible_pipeline import load_surahs

DEFAULT_OUTPUT = Path(".slaks-live-preview")


def load_json_dataset(path: Path) -> list[tuple[int, str, int]]:
    """Load a JSON array of [number, name, ayahs] or object records."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("Input JSON must contain an array")
    rows: list[tuple[int, str, int]] = []
    for index, item in enumerate(raw, start=1):
        if isinstance(item, (list, tuple)) and len(item) == 3:
            number, name, ayahs = item
        elif isinstance(item, dict):
            number = item.get("number", item.get("surah_number"))
            name = item.get("name", item.get("surah_name"))
            ayahs = item.get("ayahs", item.get("ayahs_count"))
        else:
            raise ValueError(f"Invalid record at index {index}")
        if number is None or name is None or ayahs is None:
            raise ValueError(f"Missing number/name/ayahs at index {index}")
        rows.append((int(number), str(name), int(ayahs)))
    return rows


def build_report(input_json: Path | None, samples: int, seed: int) -> dict[str, Any]:
    dataset = load_json_dataset(input_json) if input_json else load_surahs()
    if len(dataset) != 114:
        raise ValueError(f"Expected 114 surahs, received {len(dataset)}")
    analyzer = ScientificQuranAnalyzer(dataset)
    return analyzer.build_report(SimulationConfig(samples=samples, seed=seed))


def render_html(output_dir: Path) -> None:
    html = """<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slaks · المعاينة الحية للتحليل</title>
<style>
:root{color-scheme:dark;--bg:#030712;--panel:#0b1220;--line:#263449;--cyan:#22d3ee;--green:#34d399;--muted:#9ca3af}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#12314a 0,#030712 42%);color:#f8fafc;font-family:Tahoma,"Segoe UI",sans-serif}.wrap{max-width:1100px;margin:auto;padding:24px}.hero,.box{background:#0b1220e8;border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 40px #0004}.hero{padding:26px;margin-bottom:16px}.hero h1{margin:0;color:var(--cyan);font-size:clamp(24px,4vw,40px)}.hero p{color:var(--muted);margin:8px 0 0}.grid{display:grid;grid-template-columns:2fr 1fr;gap:16px}.box{padding:20px}.box h2{font-size:16px;color:var(--green);margin:0 0 14px;border-bottom:1px solid var(--line);padding-bottom:9px}.code{background:#010409;border:1px solid var(--line);border-radius:10px;padding:15px;min-height:190px;font:12px/2.1 monospace;color:var(--cyan)}.code div{opacity:.42}.code div.active{opacity:1;color:#fff;background:#164e6355}.radar{min-height:190px;display:grid;place-items:center;text-align:center;background:#010409;border:1px solid var(--line);border-radius:10px}.radar strong{display:block;color:var(--cyan);font-size:22px}.radar span{color:var(--muted);font-size:12px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}.stat{background:#101b2b;border:1px solid var(--line);border-right:3px solid var(--green);border-radius:10px;padding:15px}.stat small{display:block;color:var(--muted);font-size:11px}.stat b{display:block;font-size:19px;margin-top:5px}.status{margin-top:16px;color:var(--muted);font-size:12px}.status.ok{color:var(--green)}@media(max-width:760px){.grid,.stats{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.stats .stat{min-height:80px}}@media(max-width:430px){.stats{grid-template-columns:1fr 1fr}.wrap{padding:14px}}
</style></head><body><main class="wrap">
<header class="hero"><h1>منظومة المعاينة الحية</h1><p>تقرأ التقرير من القرص المحدد، وتحدّث البطاقة تلقائيًا عند تغيّر البيانات.</p><div id="status" class="status">جارٍ تحميل التقرير…</div></header>
<section class="grid"><article class="box"><h2>مصفوفة التنفيذ</h2><div class="code"><div id="l1">01. قراءة ملف البيانات المحدد</div><div id="l2">02. بناء DataFrame وتحليل الجذور</div><div id="l3">03. تشغيل محاكاة Monte Carlo</div><div id="l4">04. حساب χ² و p-value</div><div id="l5">05. كتابة التقرير إلى مجلد الإخراج</div><div id="l6">06. مزامنة المعاينة عبر API</div></div></article><article class="box"><h2>رادار السور</h2><div class="radar"><div><strong id="surah">—</strong><span id="info">—</span></div></div></article></section>
<section class="stats"><div class="stat"><small>χ² المرصود</small><b id="chi">—</b></div><div class="stat"><small>Monte Carlo p</small><b id="p">—</b></div><div class="stat"><small>الخطأ المعياري</small><b id="se">—</b></div><div class="stat"><small>عدد السور</small><b id="count">—</b></div></section>
</main><script>
const ids=['l1','l2','l3','l4','l5','l6'];let line=0,row=0,report=null;
function animate(){ids.forEach(id=>document.getElementById(id).classList.remove('active'));document.getElementById(ids[line%ids.length]).classList.add('active');line+=1}
async function refresh(){try{const response=await fetch('/api/report?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);report=await response.json();const m=report.metadata;const x=report.tests.combined_root.statistical_metrics;document.getElementById('chi').textContent=x.chi2_observed.toFixed(5);document.getElementById('p').textContent=x.p_value_monte_carlo.toFixed(6);document.getElementById('se').textContent=x.standard_error_se.toFixed(6);document.getElementById('count').textContent=m.total_surahs;document.getElementById('status').textContent='متصل · آخر تحديث: '+new Date().toLocaleTimeString('ar');document.getElementById('status').className='status ok';}catch(error){document.getElementById('status').textContent='تعذر تحميل التقرير: '+error.message;document.getElementById('status').className='status'}}
function rotate(){if(!report?.rows?.length)return;const s=report.rows[row%report.rows.length];document.getElementById('surah').textContent='سورة '+s.surah_name+' ('+s.surah_number+')';document.getElementById('info').innerHTML='الآيات: '+s.ayahs_count+' · النوع: '+s.type+'<br>الجذر المركب: '+s.combined_root+' · الجمل: '+s.abjad_value;row+=1}
animate();refresh();rotate();setInterval(animate,1000);setInterval(rotate,1800);setInterval(refresh,2500);
</script></body></html>"""
    (output_dir / "index.html").write_text(html, encoding="utf-8")


class LiveHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, report_path: Path, directory: str, **kwargs: Any) -> None:
        self.report_path = report_path
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/api/report":
            payload = self.report_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[live-server] {format % args}")


def write_report(output_dir: Path, report: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    render_html(output_dir)


def serve(output_dir: Path, port: int, input_json: Path | None, samples: int, seed: int, watch: bool) -> None:
    report_path = output_dir / "report.json"
    server = ThreadingHTTPServer(("127.0.0.1", port), lambda *args, **kwargs: LiveHandler(*args, report_path=report_path, directory=str(output_dir), **kwargs))
    print(f"[معاينة حية] http://127.0.0.1:{port}/")
    if watch and input_json:
        last_mtime = input_json.stat().st_mtime_ns
        def watcher() -> None:
            nonlocal last_mtime
            while True:
                time.sleep(2)
                try:
                    current = input_json.stat().st_mtime_ns
                    if current != last_mtime:
                        write_report(output_dir, build_report(input_json, samples, seed))
                        last_mtime = current
                        print("[مزامنة] تم تحديث التقرير والمعاينة")
                except (FileNotFoundError, ValueError, OSError) as error:
                    print(f"[تحذير] تعذر تحديث المعاينة: {error}")
        threading.Thread(target=watcher, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[المعاينة] تم الإيقاف")
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", type=Path, help="Optional JSON dataset; otherwise use quran-analysis/data.js")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--serve", action="store_true", help="Serve the generated preview on localhost")
    parser.add_argument("--watch", action="store_true", help="Rebuild when --input-json changes")
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--open", action="store_true", help="Open the localhost preview in the default browser")
    args = parser.parse_args()
    if args.samples < 1 or args.seed < 0:
        parser.error("--samples must be positive and --seed must be non-negative")
    if args.watch and not args.input_json:
        parser.error("--watch requires --input-json")
    report = build_report(args.input_json, args.samples, args.seed)
    write_report(args.output_dir, report)
    print(f"[كتابة] {args.output_dir / 'report.json'}")
    print(f"[كتابة] {args.output_dir / 'index.html'}")
    if args.serve:
        if args.open:
            threading.Timer(0.6, lambda: webbrowser.open(f"http://127.0.0.1:{args.port}/")).start()
        serve(args.output_dir, args.port, args.input_json, args.samples, args.seed, args.watch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
