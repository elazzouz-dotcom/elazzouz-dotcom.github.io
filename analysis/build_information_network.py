#!/usr/bin/env python3
"""Generate a standalone interactive 6600-node information-transfer network."""
from __future__ import annotations

import json
from pathlib import Path

TOTAL_NODES = 6_600
LEVELS = 114
COLUMNS = 60
CELL = 112
PADDING = 60
OUTPUT = Path(__file__).with_name("information-network-6600.html")


def build_levels() -> list[int]:
    levels = list(range(1, LEVELS))
    levels.append(TOTAL_NODES - sum(levels))
    assert len(levels) == LEVELS and sum(levels) == TOTAL_NODES
    return levels


def build_graph() -> tuple[list[dict], list[dict], int, int]:
    level_counts = build_levels()
    nodes: list[dict] = []
    edges: list[dict] = []
    level_starts: list[int] = []
    node_id = 1
    y = PADDING

    for level_index, count in enumerate(level_counts, start=1):
        level_starts.append(node_id)
        for position in range(count):
            column = position % COLUMNS
            row = position // COLUMNS
            if level_index == 1:
                role = "sites"
                label = "مصدر مواقع"
            elif level_index <= 4:
                role = "scripts"
                label = "نص برمجي / JSON"
            elif level_index <= 110:
                role = "carrier"
                label = "ناقل معلومات"
            else:
                role = "labs"
                label = "مختبر تحليل"
            nodes.append({
                "id": node_id,
                "level": level_index,
                "role": role,
                "label": label,
                "x": PADDING + column * CELL,
                "y": y + row * CELL,
            })
            if node_id > 1:
                parent = node_id - 1 if level_index == 1 else level_starts[level_index - 2] + (position % level_counts[level_index - 2])
                edges.append({"source": parent, "target": node_id})
            node_id += 1
        y += (max(1, (count + COLUMNS - 1) // COLUMNS) + 1) * CELL

    # The generated graph is a rooted tree. Compute subtree sizes bottom-up,
    # then derive exact undirected degree and betweenness centrality in O(V).
    children: list[list[int]] = [[] for _ in range(TOTAL_NODES + 1)]
    parents = [0] * (TOTAL_NODES + 1)
    for edge in edges:
        parent, child = edge["source"], edge["target"]
        children[parent].append(child)
        parents[child] = parent

    subtree = [1] * (TOTAL_NODES + 1)
    for current in range(TOTAL_NODES, 1, -1):
        subtree[parents[current]] += subtree[current]

    normalization = (TOTAL_NODES - 1) * (TOTAL_NODES - 2) / 2
    for node in nodes:
        node_id = node["id"]
        component_sizes = [subtree[child] for child in children[node_id]]
        if parents[node_id]:
            component_sizes.append(TOTAL_NODES - subtree[node_id])
        pair_count = (TOTAL_NODES**2 - sum(size * size for size in component_sizes)) / 2
        node["degree"] = len(children[node_id]) + int(bool(parents[node_id]))
        node["betweenness"] = pair_count / normalization if normalization else 0.0
        node["subtree_size"] = subtree[node_id]

    width = PADDING * 2 + COLUMNS * CELL
    height = y + PADDING
    assert len(nodes) == TOTAL_NODES and len(edges) == TOTAL_NODES - 1
    return nodes, edges, width, height


HTML = r'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Slaks · ناقل معلومات 6600 عقدة</title>
<style>
:root{color-scheme:dark;--bg:#071014;--panel:#0d1b20;--line:#25423b;--text:#e8fff4;--muted:#99b8aa;--green:#59e0a3;--gold:#f4ce72;--blue:#55b8e8;--violet:#c39bff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#12312b,#071014 50%);color:var(--text);font:14px system-ui,sans-serif}header{position:sticky;top:0;z-index:5;padding:14px 18px;background:#081418ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}h1{margin:0 0 5px;font-size:clamp(1.1rem,3vw,1.7rem)}p{margin:.2rem 0;color:var(--muted)}main{padding:18px;max-width:1500px;margin:auto}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.toolbar input,.toolbar select,.toolbar button{min-height:40px;border:1px solid var(--line);border-radius:9px;background:#0b1a1e;color:var(--text);padding:7px 10px}.toolbar input{min-width:230px}.toolbar button{cursor:pointer}.toolbar button:hover{border-color:var(--green)}.stats{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.stat{padding:7px 10px;background:#0b1a1e;border:1px solid var(--line);border-radius:9px;color:var(--muted)}.stat b{color:var(--green);margin-inline-start:5px}.map{position:relative;height:min(72vh,780px);min-height:440px;overflow:auto;border:1px solid var(--line);border-radius:14px;background-image:radial-gradient(#21463a 1px,transparent 1px);background-size:22px 22px;touch-action:pan-x pan-y;direction:ltr}.stage{position:relative;transform-origin:top left}.network{position:absolute;inset:0;z-index:2}.edges{position:absolute;inset:0;z-index:1;pointer-events:none}.edge{fill:none;stroke:#59e0a344;stroke-width:2}.node{position:absolute;width:60px;height:60px;border:2px solid var(--green);border-radius:12px;background:#0a2119;display:grid;place-items:center;padding:3px;color:var(--text);cursor:pointer;direction:ltr;font-size:10px;font-weight:800}.node:hover,.node.active{border-color:var(--gold);box-shadow:0 0 18px #f4ce7244;z-index:3}.node[data-role=sites]{border-color:var(--blue);background:#092330}.node[data-role=scripts]{border-color:var(--violet);background:#1a1230}.node[data-role=labs]{border-color:var(--gold);background:#30250b}.node small{display:block;color:var(--muted);font-size:8px;text-align:center}.legend{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0;color:var(--muted)}.dot{display:inline-block;width:11px;height:11px;border-radius:3px;margin-inline-end:4px}.status{margin:8px 0;color:var(--green)}.analysis-dashboard{margin:12px 0;padding:14px;border:1px solid #315b4e;border-radius:12px;background:linear-gradient(145deg,#0b1a1e,#102825)}.analysis-dashboard h2{margin:0 0 4px;color:var(--green);font-size:1rem}.analysis-dashboard p{font-size:.82rem}.analysis-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.analysis-metric{padding:9px;border:1px solid #25423b;border-radius:8px;background:#091619}.analysis-metric strong{display:block;color:var(--gold);font-size:1.05rem}.analysis-metric small{color:var(--muted)}.analysis-table{width:100%;border-collapse:collapse;font-size:.78rem}.analysis-table th,.analysis-table td{padding:5px;border-bottom:1px solid #25423b;text-align:center;color:var(--muted)}.analysis-table th{color:var(--text)}.analysis-note{margin-top:8px;color:var(--muted);font-size:.72rem}.centrality{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:#0b1a1e}.centrality h2{margin:0 0 4px;font-size:1rem}.centrality h3{margin:.2rem 0;color:var(--green);font-size:.85rem}.centrality-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.centrality ol{display:grid;gap:5px;margin:5px 0 0;padding-inline-start:24px}.centrality li{color:var(--muted)}.centrality button{width:100%;border:1px solid var(--line);border-radius:7px;background:#0d2224;color:var(--text);padding:6px;text-align:start;cursor:pointer}.centrality button:hover{border-color:var(--gold);color:var(--gold)}@media(max-width:650px){main{padding:10px}.toolbar input{width:100%;min-width:0}.map{min-height:390px}.node{width:54px;height:54px}.centrality-grid{grid-template-columns:1fr}}
</style></head>
<body>
<header><h1>Slaks · ناقل معلومات 6600 عقدة</h1><p>المواقع → النصوص البرمجية → عقد النقل → مختبرات التحليل</p></header>
<main><div class="toolbar"><input id="search" type="search" placeholder="ابحث: N-042 أو ناقل أو مختبر"><select id="role"><option value="all">كل الأدوار</option><option value="sites">المواقع</option><option value="scripts">النصوص البرمجية</option><option value="carrier">ناقل المعلومات</option><option value="labs">مختبرات التحليل</option></select><button id="minus">−</button><span id="zoom">100%</span><button id="plus">+</button><button id="reset">إعادة العرض</button><button id="root">إلى البداية</button></div>
<div class="stats"><div class="stat"><b>6600</b> عقدة</div><div class="stat"><b>6599</b> علاقة</div><div class="stat"><b>114</b> مستوى</div></div>__ANALYSIS_DASHBOARD__<div class="legend"><span><i class="dot" style="background:var(--blue)"></i>مواقع</span><span><i class="dot" style="background:var(--violet)"></i>نصوص برمجية</span><span><i class="dot" style="background:var(--green)"></i>ناقل معلومات</span><span><i class="dot" style="background:var(--gold)"></i>مختبر تحليل</span></div><section class="centrality" aria-labelledby="centrality-title"><h2 id="centrality-title">العقد الأكثر تأثيرًا</h2><p>الدرجة تقيس عدد الروابط المباشرة، والوساطة تقيس مرور المسارات بين أجزاء الشبكة عبر العقدة.</p><div class="centrality-grid"><div><h3>أعلى درجة</h3><ol id="degree-top"></ol></div><div><h3>أعلى وساطة</h3><ol id="betweenness-top"></ol></div></div></section><div id="status" class="status">جارٍ تجهيز الشبكة…</div><div id="map" class="map"><div id="stage" class="stage"><svg id="edges" class="edges" aria-hidden="true"></svg><div id="network" class="network"></div></div></div></main>
<script>
const GRAPH=__GRAPH_JSON__;
const map=document.getElementById('map'),stage=document.getElementById('stage'),network=document.getElementById('network'),edges=document.getElementById('edges'),search=document.getElementById('search'),role=document.getElementById('role'),status=document.getElementById('status'),zoomLabel=document.getElementById('zoom');let zoom=1;const buttons=new Map();
function metricLabel(n){return `N-${String(n.id).padStart(4,'0')} · درجة ${n.degree} · وساطة ${n.betweenness.toFixed(4)}`}
function renderCentrality(){for(const [target,metric] of [['degree-top','degree'],['betweenness-top','betweenness']]){const list=document.getElementById(target);list.replaceChildren();const ranked=[...GRAPH.nodes].sort((a,b)=>b[metric]-a[metric]||a.id-b.id).slice(0,8);for(const n of ranked){const li=document.createElement('li');const button=document.createElement('button');button.type='button';button.textContent=`${metricLabel(n)} · ${n.label}`;button.onclick=()=>{const node=buttons.get(n.id);if(!node)return;buttons.forEach(x=>x.classList.remove('active'));node.classList.add('active');map.scrollLeft=Math.max(0,n.x-map.clientWidth/2);map.scrollTop=Math.max(0,n.y-map.clientHeight/2);status.textContent=`تم تحديد ${metricLabel(n)} · ${n.label}`};li.append(button);list.append(li)}}}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function render(){network.replaceChildren();edges.replaceChildren();stage.style.width=GRAPH.width+'px';stage.style.height=GRAPH.height+'px';edges.setAttribute('viewBox',`0 0 ${GRAPH.width} ${GRAPH.height}`);edges.setAttribute('width',GRAPH.width);edges.setAttribute('height',GRAPH.height);for(const e of GRAPH.edges){const a=GRAPH.nodes[e.source-1],b=GRAPH.nodes[e.target-1],p=document.createElementNS('http://www.w3.org/2000/svg','path');p.className.baseVal='edge';const mid=(a.y+b.y)/2;p.setAttribute('d',`M${a.x} ${a.y} V${mid} H${b.x} V${b.y}`);edges.append(p)}for(const n of GRAPH.nodes){const b=document.createElement('button');b.className='node';b.dataset.role=n.role;b.dataset.id=n.id;b.style.left=(n.x-30)+'px';b.style.top=(n.y-30)+'px';b.innerHTML=`<span>+<small>N-${String(n.id).padStart(4,'0')}</small></span>`;b.title=`${n.label} · المستوى ${n.level} · الدرجة ${n.degree} · الوساطة ${n.betweenness.toFixed(4)}`;b.onclick=()=>{buttons.forEach(x=>x.classList.remove('active'));b.classList.add('active');status.textContent=`N-${String(n.id).padStart(4,'0')} · ${n.label} · المستوى ${n.level}`};network.append(b);buttons.set(n.id,b)}renderCentrality();applyFilters()}
function applyFilters(){const q=search.value.trim().toLocaleLowerCase(),r=role.value;let visible=0;for(const n of GRAPH.nodes){const b=buttons.get(n.id);const hay=`n-${n.id} ${n.label} ${n.role} level ${n.level}`.toLocaleLowerCase();const show=(!q||hay.includes(q))&&(r==='all'||n.role===r);b.hidden=!show;if(show)visible++}status.textContent=`يعرض ${visible.toLocaleString('ar-EG')} من ${GRAPH.nodes.length.toLocaleString('ar-EG')} عقدة ناقلة للمعلومات.`}
function applyZoom(){stage.style.transform=`scale(${zoom})`;zoomLabel.textContent=Math.round(zoom*100)+'%'}function setZoom(next){const centerX=(map.scrollLeft+map.clientWidth/2)/zoom,centerY=(map.scrollTop+map.clientHeight/2)/zoom;zoom=Math.max(.35,Math.min(1.8,Math.round(next*20)/20));applyZoom();map.scrollLeft=Math.max(0,centerX*zoom-map.clientWidth/2);map.scrollTop=Math.max(0,centerY*zoom-map.clientHeight/2)}
search.oninput=applyFilters;role.onchange=applyFilters;document.getElementById('plus').onclick=()=>setZoom(zoom+.1);document.getElementById('minus').onclick=()=>setZoom(zoom-.1);document.getElementById('reset').onclick=()=>{zoom=1;applyZoom();map.scrollLeft=0;map.scrollTop=0;search.value='';role.value='all';applyFilters()};document.getElementById('root').onclick=()=>{map.scrollLeft=0;map.scrollTop=0};map.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.1:-.1))},{passive:false});let pinch=null;map.addEventListener('touchstart',e=>{if(e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),z:zoom};map.style.touchAction='none'},{passive:false});map.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);setZoom(pinch.z*d/pinch.d)},{passive:false});for(const t of ['touchend','touchcancel'])map.addEventListener(t,e=>{if(e.touches.length<2){pinch=null;map.style.touchAction='pan-x pan-y'}},{passive:true});render();map.scrollLeft=0;
</script></body></html>'''


def build_analysis_dashboard(report: dict) -> str:
    metrics = report["statistical_metrics"]
    meta = report["metadata"]
    rows = []
    for root in sorted(report["contingency_table"], key=int):
        values = report["contingency_table"][root]
        madani = values.get("مدنية", 0)
        makki = values.get("مكية", 0)
        rows.append(f"<tr><th>الجذر {root}</th><td>{madani}</td><td>{makki}</td><td>{madani + makki}</td></tr>")
    return f'''<section class="analysis-dashboard" aria-labelledby="analysis-title"><h2 id="analysis-title">مختبر التحليل الإحصائي</h2><p>اختبار استقلال الجذر الرقمي المركب ونوع السورة بمحاكاة Monte Carlo ذات الهوامش الثابتة.</p><div class="analysis-metrics"><div class="analysis-metric"><strong>{metrics["chi2_observed"]:.4f}</strong><small>χ² المرصود</small></div><div class="analysis-metric"><strong>{metrics["p_value_monte_carlo"]:.5f}</strong><small>p_MC</small></div><div class="analysis-metric"><strong>{metrics["standard_error_se"]:.5f}</strong><small>SE_MC</small></div><div class="analysis-metric"><strong>{metrics["cramers_v"]:.4f}</strong><small>Cramér's V</small></div></div><table class="analysis-table"><thead><tr><th>الجذر</th><th>مدنية</th><th>مكية</th><th>الإجمالي</th></tr></thead><tbody>{''.join(rows)}</tbody></table><p class="analysis-note">B={meta["simulations_B"]:,} · seed={meta["random_seed"]} · تجاوزات MC={metrics["exceedances"]:,} · df={metrics["degrees_of_freedom"]}</p></section>'''


def main() -> None:
    nodes, edges, width, height = build_graph()
    report_path = Path(__file__).with_name("quran_analysis_report.json")
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else None
    dashboard = build_analysis_dashboard(report) if report else ""
    payload = json.dumps({"nodes": nodes, "edges": edges, "width": width, "height": height}, ensure_ascii=False, separators=(",", ":"))
    rendered = HTML.replace("__GRAPH_JSON__", payload).replace("__ANALYSIS_DASHBOARD__", dashboard)
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"Created {OUTPUT}")
    print(f"nodes={len(nodes)} edges={len(edges)} levels={LEVELS} canvas={width}x{height}")


if __name__ == "__main__":
    main()
