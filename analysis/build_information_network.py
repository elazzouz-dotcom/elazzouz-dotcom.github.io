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
:root{color-scheme:dark;--bg:#071014;--panel:#0d1b20;--line:#25423b;--text:#e8fff4;--muted:#99b8aa;--green:#59e0a3;--gold:#f4ce72;--blue:#55b8e8;--violet:#c39bff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#12312b,#071014 50%);color:var(--text);font:14px system-ui,sans-serif}header{position:sticky;top:0;z-index:5;padding:14px 18px;background:#081418ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}h1{margin:0 0 5px;font-size:clamp(1.1rem,3vw,1.7rem)}p{margin:.2rem 0;color:var(--muted)}main{padding:18px;max-width:1500px;margin:auto}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.toolbar input,.toolbar select,.toolbar button{min-height:40px;border:1px solid var(--line);border-radius:9px;background:#0b1a1e;color:var(--text);padding:7px 10px}.toolbar input{min-width:230px}.toolbar button{cursor:pointer}.toolbar button:hover{border-color:var(--green)}.stats{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.stat{padding:7px 10px;background:#0b1a1e;border:1px solid var(--line);border-radius:9px;color:var(--muted)}.stat b{color:var(--green);margin-inline-start:5px}.map{position:relative;height:min(72vh,780px);min-height:440px;overflow:auto;border:1px solid var(--line);border-radius:14px;background-image:radial-gradient(#21463a 1px,transparent 1px);background-size:22px 22px;touch-action:pan-x pan-y;direction:ltr}.stage{position:relative;transform-origin:top left}.network{position:absolute;inset:0;z-index:2}.edges{position:absolute;inset:0;z-index:1;pointer-events:none}.edge{fill:none;stroke:#59e0a344;stroke-width:2}.node{position:absolute;width:60px;height:60px;border:2px solid var(--green);border-radius:12px;background:#0a2119;display:grid;place-items:center;padding:3px;color:var(--text);cursor:pointer;direction:ltr;font-size:10px;font-weight:800}.node:hover,.node.active{border-color:var(--gold);box-shadow:0 0 18px #f4ce7244;z-index:3}.node[data-role=sites]{border-color:var(--blue);background:#092330}.node[data-role=scripts]{border-color:var(--violet);background:#1a1230}.node[data-role=labs]{border-color:var(--gold);background:#30250b}.node small{display:block;color:var(--muted);font-size:8px;text-align:center}.legend{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0;color:var(--muted)}.dot{display:inline-block;width:11px;height:11px;border-radius:3px;margin-inline-end:4px}.status{margin:8px 0;color:var(--green)}@media(max-width:650px){main{padding:10px}.toolbar input{width:100%;min-width:0}.map{min-height:390px}.node{width:54px;height:54px}}
</style></head>
<body>
<header><h1>Slaks · ناقل معلومات 6600 عقدة</h1><p>المواقع → النصوص البرمجية → عقد النقل → مختبرات التحليل</p></header>
<main><div class="toolbar"><input id="search" type="search" placeholder="ابحث: N-042 أو ناقل أو مختبر"><select id="role"><option value="all">كل الأدوار</option><option value="sites">المواقع</option><option value="scripts">النصوص البرمجية</option><option value="carrier">ناقل المعلومات</option><option value="labs">مختبرات التحليل</option></select><button id="minus">−</button><span id="zoom">100%</span><button id="plus">+</button><button id="reset">إعادة العرض</button><button id="root">إلى البداية</button></div>
<div class="stats"><div class="stat"><b>6600</b> عقدة</div><div class="stat"><b>6599</b> علاقة</div><div class="stat"><b>114</b> مستوى</div></div><div class="legend"><span><i class="dot" style="background:var(--blue)"></i>مواقع</span><span><i class="dot" style="background:var(--violet)"></i>نصوص برمجية</span><span><i class="dot" style="background:var(--green)"></i>ناقل معلومات</span><span><i class="dot" style="background:var(--gold)"></i>مختبر تحليل</span></div><div id="status" class="status">جارٍ تجهيز الشبكة…</div><div id="map" class="map"><div id="stage" class="stage"><svg id="edges" class="edges" aria-hidden="true"></svg><div id="network" class="network"></div></div></div></main>
<script>
const GRAPH=__GRAPH_JSON__;
const map=document.getElementById('map'),stage=document.getElementById('stage'),network=document.getElementById('network'),edges=document.getElementById('edges'),search=document.getElementById('search'),role=document.getElementById('role'),status=document.getElementById('status'),zoomLabel=document.getElementById('zoom');let zoom=1;const buttons=new Map();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function render(){network.replaceChildren();edges.replaceChildren();stage.style.width=GRAPH.width+'px';stage.style.height=GRAPH.height+'px';edges.setAttribute('viewBox',`0 0 ${GRAPH.width} ${GRAPH.height}`);edges.setAttribute('width',GRAPH.width);edges.setAttribute('height',GRAPH.height);for(const e of GRAPH.edges){const a=GRAPH.nodes[e.source-1],b=GRAPH.nodes[e.target-1],p=document.createElementNS('http://www.w3.org/2000/svg','path');p.className.baseVal='edge';const mid=(a.y+b.y)/2;p.setAttribute('d',`M${a.x} ${a.y} V${mid} H${b.x} V${b.y}`);edges.append(p)}for(const n of GRAPH.nodes){const b=document.createElement('button');b.className='node';b.dataset.role=n.role;b.dataset.id=n.id;b.style.left=(n.x-30)+'px';b.style.top=(n.y-30)+'px';b.innerHTML=`<span>+<small>N-${String(n.id).padStart(4,'0')}</small></span>`;b.title=`${n.label} · المستوى ${n.level}`;b.onclick=()=>{buttons.forEach(x=>x.classList.remove('active'));b.classList.add('active');status.textContent=`N-${String(n.id).padStart(4,'0')} · ${n.label} · المستوى ${n.level}`};network.append(b);buttons.set(n.id,b)}applyFilters()}
function applyFilters(){const q=search.value.trim().toLocaleLowerCase(),r=role.value;let visible=0;for(const n of GRAPH.nodes){const b=buttons.get(n.id);const hay=`n-${n.id} ${n.label} ${n.role} level ${n.level}`.toLocaleLowerCase();const show=(!q||hay.includes(q))&&(r==='all'||n.role===r);b.hidden=!show;if(show)visible++}status.textContent=`يعرض ${visible.toLocaleString('ar-EG')} من ${GRAPH.nodes.length.toLocaleString('ar-EG')} عقدة ناقلة للمعلومات.`}
function applyZoom(){stage.style.transform=`scale(${zoom})`;zoomLabel.textContent=Math.round(zoom*100)+'%'}function setZoom(next){const centerX=(map.scrollLeft+map.clientWidth/2)/zoom,centerY=(map.scrollTop+map.clientHeight/2)/zoom;zoom=Math.max(.35,Math.min(1.8,Math.round(next*20)/20));applyZoom();map.scrollLeft=Math.max(0,centerX*zoom-map.clientWidth/2);map.scrollTop=Math.max(0,centerY*zoom-map.clientHeight/2)}
search.oninput=applyFilters;role.onchange=applyFilters;document.getElementById('plus').onclick=()=>setZoom(zoom+.1);document.getElementById('minus').onclick=()=>setZoom(zoom-.1);document.getElementById('reset').onclick=()=>{zoom=1;applyZoom();map.scrollLeft=0;map.scrollTop=0;search.value='';role.value='all';applyFilters()};document.getElementById('root').onclick=()=>{map.scrollLeft=0;map.scrollTop=0};map.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.1:-.1))},{passive:false});let pinch=null;map.addEventListener('touchstart',e=>{if(e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),z:zoom};map.style.touchAction='none'},{passive:false});map.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);setZoom(pinch.z*d/pinch.d)},{passive:false});for(const t of ['touchend','touchcancel'])map.addEventListener(t,e=>{if(e.touches.length<2){pinch=null;map.style.touchAction='pan-x pan-y'}},{passive:true});render();map.scrollLeft=0;
</script></body></html>'''


def main() -> None:
    nodes, edges, width, height = build_graph()
    payload = json.dumps({"nodes": nodes, "edges": edges, "width": width, "height": height}, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(HTML.replace("__GRAPH_JSON__", payload), encoding="utf-8")
    print(f"Created {OUTPUT}")
    print(f"nodes={len(nodes)} edges={len(edges)} levels={LEVELS} canvas={width}x{height}")


if __name__ == "__main__":
    main()
