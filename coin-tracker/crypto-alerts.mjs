const STORAGE_KEY = 'azzouz.crypto-alerts.v1';
const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const DEFAULT_COINS = [
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
  { id: 'binancecoin', name: 'BNB', symbol: 'BNB' },
  { id: 'solana', name: 'Solana', symbol: 'SOL' },
  { id: 'toncoin', name: 'Toncoin', symbol: 'TON' }
];
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const formatPrice = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: Number(value) < 1 ? 6 : 2 }) : '—';
const formatChange = (value) => `${Number(value) >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}%`;
const read = () => { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return { coins: Array.isArray(value.coins) ? value.coins : DEFAULT_COINS, alerts: Array.isArray(value.alerts) ? value.alerts : [], prices: value.prices && typeof value.prices === 'object' ? value.prices : {} }; } catch { return { coins: DEFAULT_COINS.slice(), alerts: [], prices: {} }; } };
const normalizeCoinId = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);

export function initCryptoAlerts() {
  const root = $('cryptoAlerts');
  if (!root) return;
  let state = read();
  let loading = false;
  let timer = null;
  const persist = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), coins: state.coins, alerts: state.alerts, prices: state.prices })); window.dispatchEvent(new CustomEvent('crypto-alerts-updated')); };
  const coinById = (id) => state.coins.find((coin) => coin.id === id) || { id, name: id, symbol: id.toUpperCase().slice(0, 8) };
  const notify = (title, body) => { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: `crypto-${Date.now()}` }); };
  const requestNotifications = async () => { if (!('Notification' in window)) return false; if (Notification.permission === 'default') await Notification.requestPermission(); return Notification.permission === 'granted'; };

  function renderCoins() {
    $('cryptoCoinList').innerHTML = state.coins.map((coin) => {
      const price = state.prices[coin.id];
      const change = Number(price?.usd_24h_change || 0);
      return `<button class="crypto-coin ${$('cryptoCoinId').value === coin.id ? 'on' : ''}" data-crypto-coin="${escapeHtml(coin.id)}"><b>${escapeHtml(coin.symbol)}</b><span>${escapeHtml(coin.name)}</span><strong>${price ? `$${formatPrice(price.usd)}` : '—'}</strong><em class="${change >= 0 ? 'up' : 'down'}">${price ? formatChange(change) : 'بدون سعر'}</em></button>`;
    }).join('');
    $('cryptoCoinList').querySelectorAll('[data-crypto-coin]').forEach((button) => button.onclick = () => { $('cryptoCoinId').value = button.dataset.cryptoCoin; renderCoins(); });
  }
  function renderAlerts() {
    const active = state.alerts.filter((alert) => !alert.triggered).length;
    $('cryptoAlertCount').textContent = `${active.toLocaleString('ar-MA')} نشط`;
    $('cryptoAlertsList').innerHTML = state.alerts.length ? state.alerts.slice().reverse().map((alert) => {
      const coin = coinById(alert.coinId); const current = state.prices[alert.coinId]?.usd; const condition = alert.direction === 'above' ? 'عند الصعود فوق' : 'عند الهبوط تحت';
      return `<article class="crypto-alert ${alert.triggered ? 'triggered' : ''}"><div><b>${escapeHtml(coin.symbol)} · ${condition} $${formatPrice(alert.target)}</b><span>${current ? `السعر الحالي $${formatPrice(current)}` : 'في انتظار تحديث السعر'} · ${alert.triggered ? 'تم إطلاقه' : 'مراقب'}</span></div><button type="button" data-delete-alert="${escapeHtml(alert.id)}" aria-label="حذف التنبيه">×</button></article>`;
    }).join('') : '<div class="crypto-empty">لم تضف أي تنبيهات بعد. اختر عملة وحدد السعر.</div>';
    $('cryptoAlertsList').querySelectorAll('[data-delete-alert]').forEach((button) => button.onclick = () => { state.alerts = state.alerts.filter((alert) => alert.id !== button.dataset.deleteAlert); persist(); renderAlerts(); });
  }
  function renderStatus(text, type = '') { $('cryptoStatus').textContent = text; $('cryptoStatus').className = `crypto-status ${type}`; }
  function render() { renderCoins(); renderAlerts(); $('cryptoNotify').checked = 'Notification' in window && Notification.permission === 'granted'; }

  async function refreshPrices(silent = false) {
    if (loading || !state.coins.length) return;
    loading = true; if (!silent) renderStatus('جارٍ تحديث الأسعار...');
    try {
      const ids = state.coins.map((coin) => encodeURIComponent(coin.id)).join(',');
      const response = await fetch(`${PRICE_URL}?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 429 ? 'تم تجاوز حد طلبات الأسعار مؤقتًا.' : `HTTP ${response.status}`);
      const prices = await response.json();
      const now = Date.now();
      state.coins.forEach((coin) => { if (prices[coin.id]) state.prices[coin.id] = { ...prices[coin.id], fetchedAt: now }; });
      let triggered = 0;
      state.alerts.forEach((alert) => {
        if (alert.triggered) return;
        const current = Number(state.prices[alert.coinId]?.usd); const target = Number(alert.target);
        const hit = alert.direction === 'above' ? current >= target : current <= target;
        if (Number.isFinite(current) && hit) { alert.triggered = true; alert.triggeredAt = new Date().toISOString(); triggered += 1; const coin = coinById(alert.coinId); notify(`تنبيه سعر ${coin.symbol}`, `وصل السعر إلى $${formatPrice(current)} (${alert.direction === 'above' ? 'فوق' : 'تحت'} $${formatPrice(target)}).`); }
      });
      persist(); render(); renderStatus(`آخر تحديث: ${new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })}${triggered ? ` · أُطلق ${triggered} تنبيه` : ''}`, triggered ? 'ok' : '');
    } catch (error) { renderStatus(`تعذر تحديث الأسعار: ${error.message || 'تحقق من الاتصال.'}`, 'error'); } finally { loading = false; }
  }
  function addCoin() {
    const id = normalizeCoinId($('cryptoCoinId').value); const name = $('cryptoCoinName').value.trim(); const symbol = $('cryptoCoinSymbol').value.trim().toUpperCase();
    if (!id) { $('cryptoCoinId').setCustomValidity('أدخل CoinGecko ID مثل bitcoin'); $('cryptoCoinId').reportValidity(); $('cryptoCoinId').setCustomValidity(''); return; }
    if (!state.coins.some((coin) => coin.id === id)) state.coins.push({ id, name: name || id, symbol: symbol || id.slice(0, 6).toUpperCase() });
    $('cryptoCoinName').value = ''; $('cryptoCoinSymbol').value = ''; persist(); render(); refreshPrices();
  }
  $('cryptoAddCoin').onclick = addCoin;
  $('cryptoRefresh').onclick = () => refreshPrices();
  $('cryptoAddAlert').onclick = async () => {
    const coinId = normalizeCoinId($('cryptoCoinId').value); const target = Number($('cryptoTarget').value); const direction = $('cryptoDirection').value;
    if (!coinId || !Number.isFinite(target) || target <= 0) { $('cryptoTarget').setCustomValidity('أدخل سعرًا صحيحًا أكبر من صفر'); $('cryptoTarget').reportValidity(); $('cryptoTarget').setCustomValidity(''); return; }
    state.alerts.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, coinId, target, direction, triggered: false, createdAt: new Date().toISOString() });
    if ($('cryptoNotify').checked) await requestNotifications(); $('cryptoTarget').value = ''; persist(); renderAlerts(); renderStatus('تمت إضافة التنبيه. سيعمل ما دامت الصفحة مفتوحة.', 'ok'); refreshPrices(true);
  };
  $('cryptoNotify').onchange = async () => { const granted = $('cryptoNotify').checked ? await requestNotifications() : false; $('cryptoNotify').checked = granted; renderStatus(granted ? 'تم تفعيل إشعارات الأسعار.' : 'لم يتم تفعيل إشعارات المتصفح.', granted ? 'ok' : 'error'); };
  $('cryptoExport').onclick = () => { const blob = new Blob([JSON.stringify({ app: 'azzouz-crypto-alerts', version: 1, exportedAt: new Date().toISOString(), coins: state.coins, alerts: state.alerts }, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'azzouz-crypto-alerts.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  $('cryptoImport').onclick = () => $('cryptoImportInput').click();
  $('cryptoImportInput').onchange = async (event) => { try { const data = JSON.parse(await event.target.files[0].text()); if (!Array.isArray(data.coins) || !Array.isArray(data.alerts) || data.alerts.length > 500) throw new Error('الملف غير صالح.'); if (!confirm('سيتم استبدال تنبيهات الأسعار الحالية. هل تريد المتابعة؟')) return; state.coins = data.coins.map((coin) => ({ id: normalizeCoinId(coin.id), name: String(coin.name || coin.id).slice(0, 60), symbol: String(coin.symbol || coin.id).slice(0, 10).toUpperCase() })).filter((coin) => coin.id); state.alerts = data.alerts.filter((alert) => alert && normalizeCoinId(alert.coinId) && Number(alert.target) > 0).map((alert) => ({ ...alert, coinId: normalizeCoinId(alert.coinId), target: Number(alert.target), direction: alert.direction === 'below' ? 'below' : 'above', triggered: Boolean(alert.triggered) })); state.prices = {}; persist(); render(); refreshPrices(); renderStatus('تم استيراد التنبيهات.', 'ok'); } catch (error) { alert(`تعذر استيراد الملف: ${error.message || 'ملف غير صالح'}`); } finally { event.target.value = ''; } };
  $('cryptoToggle').onclick = () => { root.classList.toggle('collapsed'); $('cryptoToggle').setAttribute('aria-expanded', String(!root.classList.contains('collapsed'))); };
  timer = setInterval(() => { if (document.visibilityState === 'visible') refreshPrices(true); }, 60000);
  window.addEventListener('crypto-alerts-updated', () => { state = read(); render(); });
  window.addEventListener('beforeunload', () => clearInterval(timer));
  render(); refreshPrices(true);
}
