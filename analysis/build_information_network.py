#!/usr/bin/env python3
"""Generate a standalone interactive 6600-node information-transfer network."""
from __future__ import annotations

import html
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
:root{color-scheme:dark;--bg:#071014;--panel:#0d1b20;--line:#25423b;--text:#e8fff4;--muted:#99b8aa;--green:#59e0a3;--gold:#f4ce72;--blue:#55b8e8;--violet:#c39bff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#12312b,#071014 50%);color:var(--text);font:14px system-ui,sans-serif}header{position:sticky;top:0;z-index:5;padding:14px 18px;background:#081418ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}h1{margin:0 0 5px;font-size:clamp(1.1rem,3vw,1.7rem)}p{margin:.2rem 0;color:var(--muted)}main{padding:18px;max-width:1500px;margin:auto}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.toolbar input,.toolbar select,.toolbar button{min-height:40px;border:1px solid var(--line);border-radius:9px;background:#0b1a1e;color:var(--text);padding:7px 10px}.toolbar input{min-width:230px}.toolbar button{cursor:pointer}.toolbar button:hover{border-color:var(--green)}.cosmic-swarm{margin:12px 0;padding:12px;border:1px solid #315b4e;border-radius:12px;background:radial-gradient(circle at 50% 0,#102d28,#081619)}.cosmic-swarm h2{margin:0 0 4px;color:var(--green);font-size:1rem}.swarm-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.swarm-toolbar button{min-height:34px;border:1px solid var(--line);border-radius:8px;background:#0d2224;color:var(--text);padding:6px 10px;cursor:pointer}.swarm-toolbar button:hover{border-color:var(--gold)}.swarm-stats{display:flex;flex-wrap:wrap;gap:7px;color:var(--muted);font-size:.78rem}.swarm-stats b{color:var(--gold)}#cosmic-swarm-canvas{display:block;width:100%;height:210px;border:1px solid #25423b;border-radius:9px;background:#020b0b}.node.swarm-active{outline:2px solid var(--gold);outline-offset:3px;animation:swarmPulse 1.2s ease-in-out infinite}@keyframes swarmPulse{50%{box-shadow:0 0 0 7px #f4ce7222,0 0 22px #f4ce7288}}.stats{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.stat{padding:7px 10px;background:#0b1a1e;border:1px solid var(--line);border-radius:9px;color:var(--muted)}.stat b{color:var(--green);margin-inline-start:5px}.map{position:relative;height:min(72vh,780px);min-height:440px;overflow:auto;border:1px solid var(--line);border-radius:14px;background-image:radial-gradient(#21463a 1px,transparent 1px);background-size:22px 22px;touch-action:pan-x pan-y;direction:ltr}.stage{position:relative;transform-origin:top left}.network{position:absolute;inset:0;z-index:2}.edges{position:absolute;inset:0;z-index:1;pointer-events:none}.edge{fill:none;stroke:#59e0a344;stroke-width:2}.node{position:absolute;width:60px;height:60px;border:2px solid var(--green);border-radius:12px;background:#0a2119;display:grid;place-items:center;padding:3px;color:var(--text);cursor:pointer;direction:ltr;font-size:10px;font-weight:800}.node:hover,.node.active{border-color:var(--gold);box-shadow:0 0 18px #f4ce7244;z-index:3}.node[data-role=sites]{border-color:var(--blue);background:#092330}.node[data-role=scripts]{border-color:var(--violet);background:#1a1230}.node[data-role=labs]{border-color:var(--gold);background:#30250b}.node small{display:block;color:var(--muted);font-size:8px;text-align:center}.node-storage{position:absolute;left:4px;right:4px;bottom:4px;height:4px;border-radius:4px;background:#13252a;overflow:hidden;border:1px solid #ffffff22}.node-storage-fill{display:block;height:100%;width:0;background:#59e0a3;transition:width .2s ease,background .2s ease}.node-storage-label{position:absolute;left:4px;top:3px;font-size:7px;line-height:1;color:#dfffee;background:#061014cc;border-radius:3px;padding:2px 3px;direction:ltr}.node.storage-warn .node-storage-fill{background:#f4ce72}.node.storage-full .node-storage-fill{background:#ff6b6b}.node.storage-full{box-shadow:0 0 10px #ff6b6b66}.legend{ display:flex;gap:14px;flex-wrap:wrap;margin:10px 0;color:var(--muted)}.dot{display:inline-block;width:11px;height:11px;border-radius:3px;margin-inline-end:4px}.status{margin:8px 0;color:var(--green)}.analysis-dashboard{margin:12px 0;padding:14px;border:1px solid #315b4e;border-radius:12px;background:linear-gradient(145deg,#0b1a1e,#102825)}.analysis-dashboard h2{margin:0 0 4px;color:var(--green);font-size:1rem}.analysis-dashboard p{font-size:.82rem}.analysis-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.analysis-metric{padding:9px;border:1px solid #25423b;border-radius:8px;background:#091619}.analysis-metric strong{display:block;color:var(--gold);font-size:1.05rem}.analysis-metric small{color:var(--muted)}.analysis-table{width:100%;border-collapse:collapse;font-size:.78rem}.analysis-table th,.analysis-table td{padding:5px;border-bottom:1px solid #25423b;text-align:center;color:var(--muted)}.analysis-table th{color:var(--text)}.analysis-note{margin-top:8px;color:var(--muted);font-size:.72rem}.analysis-code{margin-top:10px;border-top:1px solid #25423b;padding-top:8px}.analysis-code summary{cursor:pointer;color:var(--gold);font-weight:700}.analysis-code p{font-size:.76rem}.analysis-code pre{max-height:320px;overflow:auto;direction:ltr;text-align:left;white-space:pre-wrap;background:#061014;border:1px solid #25423b;border-radius:8px;padding:10px;color:#b9f5d5;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.research-panel{margin:12px 0;padding:14px;border:1px solid #315b4e;border-radius:12px;background:#0b1a1e}.research-panel h2{margin:0 0 4px;color:var(--green);font-size:1rem}.research-panel p{font-size:.8rem}.research-controls{display:flex;flex-wrap:wrap;gap:8px;margin:9px 0}.research-controls select,.research-controls input,.research-controls button{min-height:38px;border:1px solid var(--line);border-radius:8px;background:#081619;color:var(--text);padding:7px 9px}.research-controls input{flex:1;min-width:220px}.research-controls button{cursor:pointer}.research-controls button:hover{border-color:var(--gold)}.research-card{display:grid;gap:6px;padding:10px;border:1px solid #25423b;border-radius:9px;background:#081619}.research-card strong{color:var(--gold)}.research-card output{color:var(--text);font-family:ui-monospace,monospace}.research-card a{color:var(--blue);overflow-wrap:anywhere}.research-status{color:var(--green);font-size:.78rem}.research-preview{margin-top:10px;border:1px solid #315b4e;border-radius:9px;overflow:hidden;background:#061014}.research-preview-head{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #25423b;color:var(--muted);font-size:.78rem}.research-preview iframe{display:block;width:100%;height:360px;border:0;background:#fff}.research-transfer{display:grid;gap:7px;margin-top:10px}.research-transfer textarea{width:100%;min-height:70px;resize:vertical;border:1px solid var(--line);border-radius:8px;background:#061014;color:var(--text);padding:8px}.research-transfer button{justify-self:start;min-height:36px;border:1px solid var(--line);border-radius:8px;background:#0d2224;color:var(--text);padding:7px 10px;cursor:pointer}.research-transfer button:hover{border-color:var(--gold)}.node-buffer{display:grid;gap:7px;margin-top:10px;padding:10px;border:1px dashed #4b7663;border-radius:9px;background:#071719}.node-buffer strong{color:var(--gold)}.node-buffer span{color:var(--muted);font-size:.76rem}.node-buffer textarea{width:100%;min-height:100px;resize:vertical;border:1px solid var(--line);border-radius:8px;background:#061014;color:var(--text);padding:8px}.node-buffer button{justify-self:start;min-height:36px;border:1px solid var(--line);border-radius:8px;background:#0d2224;color:var(--text);padding:7px 10px;cursor:pointer}.node-buffer button:hover{border-color:var(--gold)}.centrality{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:#0b1a1e}.centrality h2{margin:0 0 4px;font-size:1rem}.centrality h3{margin:.2rem 0;color:var(--green);font-size:.85rem}.centrality-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.centrality ol{display:grid;gap:5px;margin:5px 0 0;padding-inline-start:24px}.centrality li{color:var(--muted)}.centrality button{width:100%;border:1px solid var(--line);border-radius:7px;background:#0d2224;color:var(--text);padding:6px;text-align:start;cursor:pointer}.centrality button:hover{border-color:var(--gold);color:var(--gold)}@media(max-width:650px){main{padding:10px}.toolbar input{width:100%;min-width:0}.map{min-height:390px}.node{width:54px;height:54px}.centrality-grid{grid-template-columns:1fr}}
</style></head>
<body>
<header><h1>Slaks · ناقل معلومات 6600 عقدة</h1><p>المواقع → النصوص البرمجية → عقد النقل → مختبرات التحليل</p></header>
<main><div class="toolbar"><input id="search" type="search" placeholder="ابحث: N-042 أو ناقل أو مختبر"><select id="role"><option value="all">كل الأدوار</option><option value="sites">المواقع</option><option value="scripts">النصوص البرمجية</option><option value="carrier">ناقل المعلومات</option><option value="labs">مختبرات التحليل</option></select><button id="minus">−</button><span id="zoom">100%</span><button id="plus">+</button><button id="reset">إعادة العرض</button><button id="root">إلى البداية</button></div>
<section class="research-panel" aria-labelledby="research-title"><h2 id="research-title">بحث مستقل لكل عقدة</h2><p>لكل عقدة مصدر واستعلام مستقلان. عند الضغط على العقدة تُحمّل معاينتها تلقائيًا داخل الإطار. يمكن حفظ ملاحظاتك محليًا؛ لا تُرسل كلمات المرور ولا تُقرأ صفحات تمنع التضمين.</p><div class="research-controls"><select id="research-engine" aria-label="محرك البحث"><option value="google">Google</option><option value="bing">Bing</option><option value="duckduckgo">DuckDuckGo</option><option value="brave">Brave Search</option><option value="startpage">Startpage</option></select><input id="research-url" type="url" placeholder="اختياري: ألصق رابط المصدر للعقدة الحالية"><button id="research-open" type="button">فتح بحث العقدة</button><button id="research-next" type="button">العقدة التالية</button></div><div class="research-card"><strong id="research-node">N-0001</strong><output id="research-query">جارٍ تجهيز الاستعلام…</output><a id="research-source" href="#" target="_blank" rel="noopener noreferrer" hidden>فتح المصدر المحفوظ ↗</a><span id="research-status" class="research-status" role="status" aria-live="polite">لم يُفتح بحث لهذه العقدة بعد.</span></div><div class="research-preview"><div class="research-preview-head"><span>معاينة المصدر داخل العقدة</span><span><span id="research-preview-state">لم تُحمّل معاينة</span> <button id="research-preview-load" type="button">تحميل الرابط</button></span></div><iframe id="research-preview-frame" title="معاينة مصدر العقدة" loading="lazy" referrerpolicy="no-referrer"></iframe></div><div class="research-transfer"><textarea id="research-note" placeholder="ملاحظة أو معلومات تريد نقلها إلى سجل هذه العقدة…"></textarea><button id="research-transfer" type="button">نقل المعلومات إلى سجل العقدة</button></div><div class="node-buffer"><strong>مساحة تخزين العقدة المؤقتة</strong><span id="node-buffer-state">فارغة — لم تُرسل إلى المسار النهائي.</span><textarea id="node-buffer-input" placeholder="تُملأ هنا المعلومات التي تجمعها من معاينة المصدر قبل دفعها لاحقًا…"></textarea><button id="node-buffer-save" type="button">حفظ داخل مساحة العقدة</button></div></section>
<section class="cosmic-swarm" aria-labelledby="cosmic-swarm-title"><h2 id="cosmic-swarm-title">السرب الكوني الموحّد</h2><p>هذه المحاكاة مرتبطة بالعقد نفسها: كل وكيل يزور عقدة حقيقية، ويقرأ حالة مساحة التخزين الخاصة بها، وتظهر العقدة النشطة داخل الشبكة.</p><div class="swarm-toolbar"><button id="cosmic-swarm-toggle" type="button">إيقاف السرب</button><button id="cosmic-swarm-rebalance" type="button">موازنة السرب</button><span id="cosmic-swarm-status" class="status">السرب يعمل على شبكة العقد</span></div><canvas id="cosmic-swarm-canvas" aria-label="محاكاة السرب الكوني المرتبط بالعقد"></canvas><div class="swarm-stats"><span>الوكلاء: <b id="cosmic-swarm-count">57</b></span><span>الزيارات: <b id="cosmic-swarm-scans">0</b></span><span>العقد ذات البيانات: <b id="cosmic-swarm-filled">0</b></span><span>التوسع: <b id="cosmic-swarm-expansion">1.00x</b></span></div></section>
<div class="stats"><div class="stat"><b>6600</b> عقدة</div><div class="stat"><b>6599</b> علاقة</div><div class="stat"><b>114</b> مستوى</div></div>__ANALYSIS_DASHBOARD__<div class="legend"><span><i class="dot" style="background:var(--blue)"></i>مواقع</span><span><i class="dot" style="background:var(--violet)"></i>نصوص برمجية</span><span><i class="dot" style="background:var(--green)"></i>ناقل معلومات</span><span><i class="dot" style="background:var(--gold)"></i>مختبر تحليل</span></div><section class="centrality" aria-labelledby="centrality-title"><h2 id="centrality-title">العقد الأكثر تأثيرًا</h2><p>الدرجة تقيس عدد الروابط المباشرة، والوساطة تقيس مرور المسارات بين أجزاء الشبكة عبر العقدة.</p><div class="centrality-grid"><div><h3>أعلى درجة</h3><ol id="degree-top"></ol></div><div><h3>أعلى وساطة</h3><ol id="betweenness-top"></ol></div></div></section><div id="status" class="status">جارٍ تجهيز الشبكة…</div><div id="map" class="map"><div id="stage" class="stage"><svg id="edges" class="edges" aria-hidden="true"></svg><div id="network" class="network"></div></div></div></main>
<script>
const GRAPH=__GRAPH_JSON__;
const map=document.getElementById('map'),stage=document.getElementById('stage'),network=document.getElementById('network'),edges=document.getElementById('edges'),search=document.getElementById('search'),role=document.getElementById('role'),status=document.getElementById('status'),zoomLabel=document.getElementById('zoom');const researchEngine=document.getElementById('research-engine'),researchUrl=document.getElementById('research-url'),researchOpen=document.getElementById('research-open'),researchNext=document.getElementById('research-next'),researchNode=document.getElementById('research-node'),researchQuery=document.getElementById('research-query'),researchSource=document.getElementById('research-source'),researchStatus=document.getElementById('research-status'),researchFrame=document.getElementById('research-preview-frame'),researchPreviewState=document.getElementById('research-preview-state'),researchNote=document.getElementById('research-note'),researchTransfer=document.getElementById('research-transfer'),nodeBufferInput=document.getElementById('node-buffer-input'),nodeBufferState=document.getElementById('node-buffer-state'),nodeBufferSave=document.getElementById('node-buffer-save');let zoom=1;let researchId=1;const buttons=new Map();const researchState=JSON.parse(localStorage.getItem('slaks-node-research-v1')||'{}');const researchRecords=JSON.parse(localStorage.getItem('slaks-node-records-v1')||'{}');const nodeBuffers=JSON.parse(localStorage.getItem('slaks-node-buffers-v1')||'{}');const cosmicCanvas=document.getElementById('cosmic-swarm-canvas'),cosmicCtx=cosmicCanvas?.getContext('2d'),cosmicToggle=document.getElementById('cosmic-swarm-toggle'),cosmicRebalance=document.getElementById('cosmic-swarm-rebalance'),cosmicStatus=document.getElementById('cosmic-swarm-status');let cosmicRunning=true,cosmicScans=0,cosmicTick=0,cosmicExpansion=1;let swarmAgents=[];
const researchTerms={sites:'open source websites documentation',scripts:'open source code JSON scripts',carrier:'open source information transfer tools',labs:'open source analysis laboratory'};
function nodeQuery(n){return `Slaks ${researchTerms[n.role]||'open source resources'} node ${String(n.id).padStart(4,'0')}`}
function searchUrl(engine,query){const q=encodeURIComponent(query);return ({google:`https://www.google.com/search?q=${q}`,bing:`https://www.bing.com/search?q=${q}`,duckduckgo:`https://duckduckgo.com/?q=${q}`,brave:`https://search.brave.com/search?q=${q}`,startpage:`https://www.startpage.com/sp/search?query=${q}`})[engine]}
function validHttpUrl(value){try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}
const NODE_BUFFER_LIMIT=10000;function storageInfo(id){const size=(nodeBuffers[id]?.content||'').length;return {size,pct:Math.min(100,Math.round(size/NODE_BUFFER_LIMIT*100))}}function updateNodeIndicator(id){const b=buttons.get(id);if(!b)return;const info=storageInfo(id),fill=b.querySelector('.node-storage-fill'),label=b.querySelector('.node-storage-label');if(fill)fill.style.width=info.pct+'%';if(label)label.textContent=info.pct+'%';b.classList.toggle('storage-warn',info.pct>=70&&info.pct<100);b.classList.toggle('storage-full',info.pct>=100);b.title=`${b.dataset.baseTitle||''} · التخزين ${info.size.toLocaleString('ar-EG')}/${NODE_BUFFER_LIMIT.toLocaleString('ar-EG')} حرف (${info.pct}%)`}
const swarmRoles=[['استكشاف','#59e0a3'],['فحص','#f4ce72'],['حماية','#55b8e8']];function resizeCosmicCanvas(){if(!cosmicCanvas)return;const dpr=Math.min(2,window.devicePixelRatio||1),rect=cosmicCanvas.getBoundingClientRect();cosmicCanvas.width=Math.max(1,Math.round(rect.width*dpr));cosmicCanvas.height=Math.max(1,Math.round(rect.height*dpr));cosmicCtx.setTransform(dpr,0,0,dpr,0,0)}function initCosmicSwarm(){if(!cosmicCanvas)return;resizeCosmicCanvas();swarmAgents=Array.from({length:57},(_,i)=>({id:i+1,nodeId:(i*113)%GRAPH.nodes.length+1,role:i%3,x:Math.random(),y:Math.random(),vx:(Math.random()-.5)*.004,vy:(Math.random()-.5)*.004,energy:70+Math.random()*30}));window.addEventListener('resize',resizeCosmicCanvas);cosmicToggle.onclick=()=>{cosmicRunning=!cosmicRunning;cosmicToggle.textContent=cosmicRunning?'إيقاف السرب':'تشغيل السرب';cosmicStatus.textContent=cosmicRunning?'السرب يعمل على شبكة العقد':'السرب متوقف مؤقتًا'};cosmicRebalance.onclick=()=>{swarmAgents.forEach((a,i)=>{a.role=i%3;a.energy=85});cosmicStatus.textContent='تمت موازنة أدوار السرب حول العقد'};requestAnimationFrame(drawCosmicSwarm)}function focusSwarmNode(id){const agent=swarmAgents[(id-1)%Math.max(1,swarmAgents.length)];if(agent){agent.nodeId=id;agent.x=.5;agent.y=.5;agent.energy=100}}function swarmStep(){if(!cosmicRunning)return;cosmicTick++;cosmicExpansion=1+Math.min(.8,cosmicTick/10000);swarmAgents.forEach((a,i)=>{a.x+=a.vx;a.y+=a.vy;if(a.x<.02||a.x>.98)a.vx*=-1;if(a.y<.02||a.y>.98)a.vy*=-1;a.energy=Math.max(25,a.energy-.012);if(cosmicTick%18===i%18){a.nodeId=(a.nodeId+57+i*3)%GRAPH.nodes.length+1;a.energy=Math.min(100,a.energy+4);cosmicScans++;const node=buttons.get(a.nodeId);if(node){node.classList.add('swarm-active');node.dataset.swarmRole=swarmRoles[a.role][0];setTimeout(()=>node.classList.remove('swarm-active'),700)}}})}function drawCosmicSwarm(){if(!cosmicCanvas)return;const w=cosmicCanvas.clientWidth,h=cosmicCanvas.clientHeight;cosmicCtx.fillStyle='rgba(2,11,11,.28)';cosmicCtx.fillRect(0,0,w,h);cosmicCtx.strokeStyle='rgba(89,224,163,.12)';cosmicCtx.lineWidth=1;const step=42*cosmicExpansion;for(let x=(w/2)%step;x<w;x+=step){cosmicCtx.beginPath();cosmicCtx.moveTo(x,0);cosmicCtx.lineTo(x,h);cosmicCtx.stroke()}for(let y=(h/2)%step;y<h;y+=step){cosmicCtx.beginPath();cosmicCtx.moveTo(0,y);cosmicCtx.lineTo(w,y);cosmicCtx.stroke()}swarmStep();swarmAgents.forEach(a=>{const info=storageInfo(a.nodeId),color=swarmRoles[a.role][1],r=3+info.pct/35+a.energy/100;cosmicCtx.fillStyle=color;cosmicCtx.shadowColor=color;cosmicCtx.shadowBlur=8;cosmicCtx.beginPath();cosmicCtx.arc(a.x*w,a.y*h,r,0,Math.PI*2);cosmicCtx.fill();cosmicCtx.shadowBlur=0});const filled=Object.values(nodeBuffers).filter(x=>x?.content).length;document.getElementById('cosmic-swarm-count').textContent=swarmAgents.length;document.getElementById('cosmic-swarm-scans').textContent=cosmicScans;document.getElementById('cosmic-swarm-filled').textContent=filled;document.getElementById('cosmic-swarm-expansion').textContent=cosmicExpansion.toFixed(2)+'x';requestAnimationFrame(drawCosmicSwarm)}
function selectResearchNode(n){researchId=n.id;const saved=researchState[n.id]||{},record=researchRecords[n.id]||{},defaultUrl=searchUrl(researchEngine.value,nodeQuery(n)),sourceUrl=saved.url||record.url||defaultUrl;researchNode.textContent=`N-${String(n.id).padStart(4,'0')} · ${n.label} · المستوى ${n.level}`;researchQuery.textContent=`المصدر الافتراضي: ${sourceUrl}`;researchUrl.value=sourceUrl;researchSource.hidden=false;researchSource.href=sourceUrl;researchNote.value=record.note||'';const buffer=nodeBuffers[n.id]||{};nodeBufferInput.value=buffer.content||'';const bufferInfo=storageInfo(n.id);nodeBufferState.textContent=buffer.content?`تحتوي على ${bufferInfo.size.toLocaleString('ar-EG')} حرفًا (${bufferInfo.pct}%) — لم تُرسل إلى المسار النهائي.`:'فارغة (0%) — لم تُرسل إلى المسار النهائي.';updateNodeIndicator(n.id);focusSwarmNode(n.id);researchFrame.src=sourceUrl;researchPreviewState.textContent='جاري تحميل مصدر العقدة تلقائيًا…';researchFrame.onload=()=>{researchPreviewState.textContent='تم تحميل المصدر أو منع الموقع التضمين داخل الإطار.'};researchStatus.textContent=saved.url||record.url?`تم تحميل المصدر المحفوظ لهذه العقدة.`:`تم تعيين مصدر مستقل تلقائيًا للعقدة N-${String(n.id).padStart(4,'0')}.`}
function currentResearchNode(){return GRAPH.nodes[researchId-1]||GRAPH.nodes[0]}
function loadPreview(){const n=currentResearchNode(),url=researchUrl.value.trim();if(!validHttpUrl(url)){researchStatus.textContent='أدخل رابطًا يبدأ بـ http:// أو https:// لمعاينته داخل العقدة.';return}researchFrame.src=url;researchPreviewState.textContent='جاري تحميل المعاينة…';researchFrame.onload=()=>{researchPreviewState.textContent='تم تحميل المعاينة أو أرسل الموقع محتوى محظورًا للإطار.'};researchState[n.id]={...(researchState[n.id]||{}),url,visits:(researchState[n.id]?.visits||0)+1,updatedAt:new Date().toISOString()};localStorage.setItem('slaks-node-research-v1',JSON.stringify(researchState));researchSource.hidden=false;researchSource.href=url;researchStatus.textContent=`تم فتح معاينة مستقلة للعقدة N-${String(n.id).padStart(4,'0')}.`}
function saveNodeBuffer(){const n=currentResearchNode(),content=nodeBufferInput.value;nodeBuffers[n.id]={nodeId:n.id,nodeLabel:n.label,sourceUrl:researchUrl.value.trim(),content,updatedAt:new Date().toISOString(),pendingStorage:true};localStorage.setItem('slaks-node-buffers-v1',JSON.stringify(nodeBuffers));const info=storageInfo(n.id);nodeBufferState.textContent=`تحتوي على ${info.size.toLocaleString('ar-EG')} حرفًا (${info.pct}%) — جاهزة لمسار التخزين لاحقًا.`;updateNodeIndicator(n.id);researchStatus.textContent=`تم حفظ المعلومات داخل مساحة العقدة N-${String(n.id).padStart(4,'0')} فقط.`}
function transferResearch(){const n=currentResearchNode(),url=researchUrl.value.trim();if(!validHttpUrl(url)){researchStatus.textContent='أدخل رابط المصدر أولًا قبل نقل المعلومات.';return}researchRecords[n.id]={nodeId:n.id,nodeLabel:n.label,url,note:researchNote.value.trim(),query:nodeQuery(n),capturedAt:new Date().toISOString()};localStorage.setItem('slaks-node-records-v1',JSON.stringify(researchRecords));researchStatus.textContent=`تم نقل سجل المصدر والملاحظة إلى العقدة N-${String(n.id).padStart(4,'0')} محليًا.`}
function openResearch(){const n=currentResearchNode(),custom=researchUrl.value.trim(),target=custom&&validHttpUrl(custom)?custom:searchUrl(researchEngine.value,nodeQuery(n));if(!target){researchStatus.textContent='الرابط يجب أن يبدأ بـ http:// أو https://.';return}const w=window.open(target,'_blank','noopener,noreferrer');if(!w){researchStatus.textContent='حظر المتصفح النافذة الجديدة؛ اسمح بالنوافذ المنبثقة لهذا الموقع.';return}researchState[n.id]={url:custom||target,engine:researchEngine.value,visits:(researchState[n.id]?.visits||0)+1,updatedAt:new Date().toISOString()};localStorage.setItem('slaks-node-research-v1',JSON.stringify(researchState));selectResearchNode(n);researchFrame.src=target;researchPreviewState.textContent='جاري تحميل المعاينة…';researchStatus.textContent=`فُتح مصدر مستقل للعقدة N-${String(n.id).padStart(4,'0')}. يمكنك تسجيل الدخول يدويًا في النافذة إذا طلب الموقع ذلك.`}
function nextResearch(){const next=researchId>=GRAPH.nodes.length?1:researchId+1;selectResearchNode(GRAPH.nodes[next-1]);const node=buttons.get(next);if(node){buttons.forEach(x=>x.classList.remove('active'));node.classList.add('active')}status.textContent=`انتقلت إلى مهمة البحث المستقلة للعقدة N-${String(next).padStart(4,'0')}.`}
researchOpen.onclick=openResearch;researchNext.onclick=nextResearch;document.getElementById('research-preview-load').onclick=loadPreview;researchTransfer.onclick=transferResearch;nodeBufferSave.onclick=saveNodeBuffer;
function metricLabel(n){return `N-${String(n.id).padStart(4,'0')} · درجة ${n.degree} · وساطة ${n.betweenness.toFixed(4)}`}
function renderCentrality(){for(const [target,metric] of [['degree-top','degree'],['betweenness-top','betweenness']]){const list=document.getElementById(target);list.replaceChildren();const ranked=[...GRAPH.nodes].sort((a,b)=>b[metric]-a[metric]||a.id-b.id).slice(0,8);for(const n of ranked){const li=document.createElement('li');const button=document.createElement('button');button.type='button';button.textContent=`${metricLabel(n)} · ${n.label}`;button.onclick=()=>{const node=buttons.get(n.id);if(!node)return;buttons.forEach(x=>x.classList.remove('active'));node.classList.add('active');map.scrollLeft=Math.max(0,n.x-map.clientWidth/2);map.scrollTop=Math.max(0,n.y-map.clientHeight/2);status.textContent=`تم تحديد ${metricLabel(n)} · ${n.label}`};li.append(button);list.append(li)}}}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function render(){network.replaceChildren();edges.replaceChildren();stage.style.width=GRAPH.width+'px';stage.style.height=GRAPH.height+'px';edges.setAttribute('viewBox',`0 0 ${GRAPH.width} ${GRAPH.height}`);edges.setAttribute('width',GRAPH.width);edges.setAttribute('height',GRAPH.height);for(const e of GRAPH.edges){const a=GRAPH.nodes[e.source-1],b=GRAPH.nodes[e.target-1],p=document.createElementNS('http://www.w3.org/2000/svg','path');p.className.baseVal='edge';const mid=(a.y+b.y)/2;p.setAttribute('d',`M${a.x} ${a.y} V${mid} H${b.x} V${b.y}`);edges.append(p)}for(const n of GRAPH.nodes){const b=document.createElement('button');b.className='node';b.dataset.role=n.role;b.dataset.id=n.id;b.style.left=(n.x-30)+'px';b.style.top=(n.y-30)+'px';const baseTitle=`${n.label} · المستوى ${n.level} · الدرجة ${n.degree} · الوساطة ${n.betweenness.toFixed(4)}`;b.dataset.baseTitle=baseTitle;b.innerHTML=`<span>+<small>N-${String(n.id).padStart(4,'0')}</small></span><span class="node-storage-label">0%</span><span class="node-storage"><i class="node-storage-fill"></i></span>`;b.title=baseTitle;b.onclick=()=>{buttons.forEach(x=>x.classList.remove('active'));b.classList.add('active');selectResearchNode(n);status.textContent=`N-${String(n.id).padStart(4,'0')} · ${n.label} · المستوى ${n.level}`};network.append(b);buttons.set(n.id,b);updateNodeIndicator(n.id)}renderCentrality();applyFilters();selectResearchNode(GRAPH.nodes[0]);initCosmicSwarm()}
function applyFilters(){const q=search.value.trim().toLocaleLowerCase(),r=role.value;let visible=0;for(const n of GRAPH.nodes){const b=buttons.get(n.id);const hay=`n-${n.id} ${n.label} ${n.role} level ${n.level}`.toLocaleLowerCase();const show=(!q||hay.includes(q))&&(r==='all'||n.role===r);b.hidden=!show;if(show)visible++}status.textContent=`يعرض ${visible.toLocaleString('ar-EG')} من ${GRAPH.nodes.length.toLocaleString('ar-EG')} عقدة ناقلة للمعلومات.`}
function applyZoom(){stage.style.transform=`scale(${zoom})`;zoomLabel.textContent=Math.round(zoom*100)+'%'}function setZoom(next){const centerX=(map.scrollLeft+map.clientWidth/2)/zoom,centerY=(map.scrollTop+map.clientHeight/2)/zoom;zoom=Math.max(.35,Math.min(1.8,Math.round(next*20)/20));applyZoom();map.scrollLeft=Math.max(0,centerX*zoom-map.clientWidth/2);map.scrollTop=Math.max(0,centerY*zoom-map.clientHeight/2)}
search.oninput=applyFilters;role.onchange=applyFilters;document.getElementById('plus').onclick=()=>setZoom(zoom+.1);document.getElementById('minus').onclick=()=>setZoom(zoom-.1);document.getElementById('reset').onclick=()=>{zoom=1;applyZoom();map.scrollLeft=0;map.scrollTop=0;search.value='';role.value='all';applyFilters()};document.getElementById('root').onclick=()=>{map.scrollLeft=0;map.scrollTop=0};map.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.1:-.1))},{passive:false});let pinch=null;map.addEventListener('touchstart',e=>{if(e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),z:zoom};map.style.touchAction='none'},{passive:false});map.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);setZoom(pinch.z*d/pinch.d)},{passive:false});for(const t of ['touchend','touchcancel'])map.addEventListener(t,e=>{if(e.touches.length<2){pinch=null;map.style.touchAction='pan-x pan-y'}},{passive:true});render();map.scrollLeft=0;
</script></body></html>'''


def build_analysis_dashboard(report: dict) -> str:
    if "statistical_metrics" in report:
        test = report
    else:
        test = report["tests"]["combined_root"]
    metrics = test["statistical_metrics"]
    meta = {**report.get("metadata", {}), **test.get("metadata", {})}
    rows = []
    for root in sorted(test["contingency_table"], key=int):
        values = test["contingency_table"][root]
        madani = values.get("مدنية", 0)
        makki = values.get("مكية", 0)
        rows.append(f"<tr><th>الجذر {root}</th><td>{madani}</td><td>{makki}</td><td>{madani + makki}</td></tr>")
    simulation_code = f'''# تحليل ثابت قابل لإعادة الإنتاج
table = pd.crosstab(self.df["combined_root"], self.df["type"])
table = table.sort_index(axis=0).sort_index(axis=1)
observed = table.to_numpy(dtype=np.int64)
expected = np.outer(observed.sum(axis=1), observed.sum(axis=0)) / observed.sum()

rng = np.random.default_rng(seed={meta.get("random_seed", 42)})
simulated = random_table.rvs(
    observed.sum(axis=1), observed.sum(axis=0),
    size={meta.get("simulations_B", 200_000):,}, random_state=rng
)
chi2_sim = ((simulated - expected) ** 2 / expected).sum(axis=(1, 2))
exceedances = np.count_nonzero(chi2_sim >= chi2_observed)
p_mc = (exceedances + 1) / ({meta.get("simulations_B", 200_000)} + 1)'''
    integration_code = f'''# توليد التقرير ثم دمجه في صفحة GitHub Pages
report = analyzer.run_monte_carlo_independence_test(
    SimulationConfig(samples={meta.get("simulations_B", 200_000)}, seed={meta.get("random_seed", 42)})
)
Path("analysis/quran_analysis_report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8"
)
dashboard = build_analysis_dashboard(report)
rendered = HTML.replace("__ANALYSIS_DASHBOARD__", dashboard)
Path("analysis/information-network-6600.html").write_text(
    rendered, encoding="utf-8"
)'''
    code_panel = f'''<details class="analysis-code"><summary>عرض كود المحاكاة المصحح</summary><p>هذا هو الجزء الذي يبني جدول التوافق ويشغّل المحاكاة ذات البذرة الثابتة.</p><pre><code>{html.escape(simulation_code)}</code></pre></details><details class="analysis-code"><summary>عرض كود دمج اللوحة في الصفحة</summary><p>يُنشأ التقرير مسبقًا ثم يُضمّن داخل HTML، لذلك لا يحتاج GitHub Pages إلى تشغيل Python.</p><pre><code>{html.escape(integration_code)}</code></pre></details>'''
    return f'''<section class="analysis-dashboard" aria-labelledby="analysis-title"><h2 id="analysis-title">مختبر التحليل الإحصائي</h2><p>اختبار استقلال الجذر الرقمي المركب ونوع السورة بمحاكاة Monte Carlo ذات الهوامش الثابتة.</p><div class="analysis-metrics"><div class="analysis-metric"><strong>{metrics["chi2_observed"]:.4f}</strong><small>χ² المرصود</small></div><div class="analysis-metric"><strong>{metrics["p_value_monte_carlo"]:.5f}</strong><small>p_MC</small></div><div class="analysis-metric"><strong>{metrics["standard_error_se"]:.5f}</strong><small>SE_MC</small></div><div class="analysis-metric"><strong>{metrics["cramers_v"]:.4f}</strong><small>Cramér's V</small></div></div><table class="analysis-table"><thead><tr><th>الجذر</th><th>مدنية</th><th>مكية</th><th>الإجمالي</th></tr></thead><tbody>{''.join(rows)}</tbody></table><p class="analysis-note">B={meta["simulations_B"]:,} · seed={meta["random_seed"]} · تجاوزات MC={metrics["exceedances"]:,} · df={metrics["degrees_of_freedom"]}</p>{code_panel}</section>'''


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
