const $ = (id) => document.getElementById(id);
const COIN_KEY = 'azzouz.coin-tracker.v1';
const BOX_KEY = 'azzouz.coin-tracker.boxes.v1';
const CRYPTO_KEY = 'azzouz.crypto-alerts.v1';
const AI_URL = 'https://tehzgquayhpnkkfcjjdz.supabase.co/functions/v1/ai-assistant';
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (value) => Number(value || 0).toLocaleString('ar-MA', { maximumFractionDigits: 2 });

function snapshot() {
  const coin = readJson(COIN_KEY, { sessions: [], target: 1133 });
  const boxes = readJson(BOX_KEY, []);
  const crypto = readJson(CRYPTO_KEY, { alerts: [], prices: {} });
  return { target: Number(coin.target || 1133), sessions: Array.isArray(coin.sessions) ? coin.sessions.slice(-30) : [], boxes: Array.isArray(boxes) ? boxes.slice(-30) : [], cryptoAlerts: Array.isArray(crypto.alerts) ? crypto.alerts.slice(-30) : [], prices: crypto.prices || {} };
}
function localAnswer(mode, question = '') {
  const data = snapshot();
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = data.sessions.filter((item) => item.day === today);
  const todayCoins = todayItems.reduce((sum, item) => sum + Number(item.coins || 0), 0);
  const weekCoins = data.sessions.reduce((sum, item) => sum + Number(item.coins || 0), 0);
  const activeAlerts = data.cryptoAlerts.filter((item) => !item.triggered).length;
  if (mode === 'share') return `متابعة TikTok LIVE للحساب @g_live8\nشاهد البث وشارك الرابط مع أصدقائك:\nhttps://www.tiktok.com/@g_live8`;
  if (mode === 'price') return `لديك ${activeAlerts.toLocaleString('ar-MA')} تنبيه سعر نشط. راجع الأسعار الحالية في قسم تنبيهات العملات الرقمية. لا أقدم توصية شراء أو بيع؛ أستطيع فقط تلخيص بياناتك المسجلة.`;
  if (mode === 'analyze') return `ملخصك الحالي:\n• عملات اليوم: ${todayCoins.toLocaleString('ar-MA')} من هدف ${data.target.toLocaleString('ar-MA')}\n• مجموع السجل المحمّل: ${weekCoins.toLocaleString('ar-MA')} عملة\n• سجلات الصناديق: ${data.boxes.length.toLocaleString('ar-MA')}\n• تنبيهات الأسعار النشطة: ${activeAlerts.toLocaleString('ar-MA')}\nاقتراح عملي: اجعل هدفك اليومي قريبًا من متوسطك بدل رفعه فجأة.`;
  if (/هدف|1133|عملات|سجل|أداء/.test(question)) return `حسب السجل المحلي: جمعت اليوم ${todayCoins.toLocaleString('ar-MA')} عملة من هدف ${data.target.toLocaleString('ar-MA')}. الحد 1133 محفوظ كهدف افتراضي ويمكن تغييره من الأداة العائمة.`;
  if (/سعر|تنبيه|بيتكوين|إيثريوم|عملة رقمية/.test(question)) return localAnswer('price');
  return 'أنا مساعدك العربي داخل الأداة. يمكنك أن تطلب: تحليل السجل، صياغة نص مشاركة، أو تلخيص تنبيهات الأسعار. هذا الوضع المحلي لا يتصل بتيك توك ولا ينفذ إجراءات نيابة عنك.';
}

export function initAiAssistant() {
  const root = $('floatingAi');
  if (!root) return;
  const output = $('aiOutput');
  const setOutput = (text, error = false) => { output.className = `ai-output${error ? ' error' : ''}`; output.textContent = text; };
  const askCloud = async (mode, question) => {
    const session = await window.__azzouzSupabase?.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return null;
    const response = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ mode, question, snapshot: snapshot() }) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.answer || null;
  };
  const run = async (mode) => {
    const question = $('aiQuestion').value.trim();
    $('aiAsk').disabled = true; setOutput('جارٍ التفكير...');
    try { const answer = await askCloud(mode, question) || localAnswer(mode, question); setOutput(answer); } catch { setOutput(`${localAnswer(mode, question)}\n\nملاحظة: تم استخدام التحليل المحلي لأن المساعد السحابي غير متاح حاليًا.`); } finally { $('aiAsk').disabled = false; }
  };
  $('aiToggle').onclick = () => { root.classList.toggle('hidden'); };
  $('aiAsk').onclick = () => run($('aiMode').value);
  $('aiQuestion').onkeydown = (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') run($('aiMode').value); };
  $('aiQuickAnalyze').onclick = () => { $('aiMode').value = 'analyze'; run('analyze'); };
  $('aiQuickShare').onclick = () => { $('aiMode').value = 'share'; run('share'); };
  $('aiQuickPrice').onclick = () => { $('aiMode').value = 'price'; run('price'); };
  setOutput('اختر مهمة أو اكتب سؤالك. التحليل المحلي متاح فورًا.');
}
