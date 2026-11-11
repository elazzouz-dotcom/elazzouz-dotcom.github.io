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
function localCommentAnswer(raw) {
  const comments = String(raw || '').split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 100);
  if (!comments.length) return 'الصق تعليقات البث أولًا، تعليقًا في كل سطر.';
  const question = comments.filter((item) => /[؟?]|كيف|متى|أين|واش|شنو|علاش|هل/.test(item));
  const positive = comments.filter((item) => /مبروك|جميل|رائع|زوين|شكرا|شكراً|احب|أحب|متابعة|تحية/.test(item));
  const complaint = comments.filter((item) => /مشكل|مشكلة|لا يعمل|ما خدام|سيئ|سيء|شكوى|غاضب/.test(item));
  const spam = comments.filter((item) => /(http\s?:|www\.|تابعني|ربح سريع|free money|crypto giveaway)/i.test(item));
  const other = comments.filter((item) => !question.includes(item) && !positive.includes(item) && !complaint.includes(item) && !spam.includes(item));
  const sample = (items) => items.slice(0, 3).map((item) => `  - ${item}`).join('\n') || '  - لا توجد';
  return `تحليل يدوي لـ ${comments.length.toLocaleString('ar-MA')} تعليق:\n\nأسئلة: ${question.length}\n${sample(question)}\n\nإيجابي ومدح: ${positive.length}\n${sample(positive)}\n\nشكاوى تحتاج انتباهًا: ${complaint.length}\n${sample(complaint)}\n\nسبام محتمل: ${spam.length}\n${sample(spam)}\n\nأخرى: ${other.length}\n\nرد مقترح للأسئلة: «شكرًا على سؤالك، سأراجعه وأجيبك يدويًا خلال البث.»\nرد مقترح للشكاوى: «وصلت ملاحظتك، شكرًا على التنبيه وسأتحقق منها.»\n\nانسخ الرد وأرسله بنفسك داخل TikTok.`;
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
  const askCloud = async (mode, question, comments = '') => {
    const session = await window.__azzouzSupabase?.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return null;
    const response = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ mode, question, comments: String(comments || '').slice(0, 12000), snapshot: snapshot() }) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.answer || null;
  };
  const run = async (mode) => {
    const question = $('aiQuestion').value.trim();
    const comments = $('aiComments').value.trim();
    $('aiAsk').disabled = true; setOutput('جارٍ التفكير...');
    try { const answer = mode === 'comments' ? ((await askCloud(mode, question, comments)) || localCommentAnswer(comments)) : ((await askCloud(mode, question, comments)) || localAnswer(mode, question)); setOutput(answer); } catch { setOutput(`${mode === 'comments' ? localCommentAnswer(comments) : localAnswer(mode, question)}\n\nملاحظة: تم استخدام التحليل المحلي لأن المساعد السحابي غير متاح حاليًا.`); } finally { $('aiAsk').disabled = false; }
  };
  $('aiToggle').onclick = () => { root.classList.toggle('hidden'); };
  $('aiAsk').onclick = () => run($('aiMode').value);
  $('aiQuestion').onkeydown = (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') run($('aiMode').value); };
  $('aiQuickAnalyze').onclick = () => { $('aiMode').value = 'analyze'; run('analyze'); };
  $('aiQuickShare').onclick = () => { $('aiMode').value = 'share'; run('share'); };
  $('aiQuickPrice').onclick = () => { $('aiMode').value = 'price'; run('price'); };
  $('aiAnalyzeComments').onclick = () => { $('aiMode').value = 'comments'; run('comments'); };
  const updateCommentCount = () => { const count = $('aiComments').value.split(/\n+/).map((item) => item.trim()).filter(Boolean).length; $('aiCommentCount').textContent = `${count.toLocaleString('ar-MA')} تعليق`; $('aiCommentStatus').textContent = count ? 'جاهز للتحليل اليدوي' : 'ألصق تعليقًا في كل سطر'; };
  $('aiComments').oninput = updateCommentCount;
  $('aiSampleComments').onclick = () => { $('aiComments').value = 'واش غادي يبدا البث؟\nمحتوى زوين، بالتوفيق\nما خدامش الرابط\nتابعني واربح سريع https://example.com'; updateCommentCount(); };
  $('aiClearComments').onclick = () => { $('aiComments').value = ''; updateCommentCount(); $('aiOutput').textContent = 'ألصق التعليقات ثم اضغط حلل الآن.'; };
  $('aiCopyOutput').onclick = async () => { const text = $('aiOutput').textContent.trim(); if (!text) return; try { await navigator.clipboard.writeText(text); $('aiCommentStatus').textContent = 'تم نسخ النتيجة'; } catch { $('aiCommentStatus').textContent = 'انسخ النتيجة يدويًا من الشاشة'; } };
  setOutput('اختر مهمة أو اكتب سؤالك. التحليل المحلي متاح فورًا.');
  updateCommentCount();
}
