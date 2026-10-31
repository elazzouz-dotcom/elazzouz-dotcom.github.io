export const NODE_LEVELS = Object.freeze([1, 3, 9, 27, 81, 243, 729, 2187, 3320]);
export const NODE_TOTAL = NODE_LEVELS.reduce((sum, count) => sum + count, 0);

export function getNodeLevelInfo(id) {
  if (!Number.isInteger(id) || id < 1 || id > NODE_TOTAL) return null;
  let first = 1;
  for (let level = 0; level < NODE_LEVELS.length; level += 1) {
    const last = first + NODE_LEVELS[level] - 1;
    if (id <= last) return { level, first, index: id - first, count: NODE_LEVELS[level] };
    first = last + 1;
  }
  return null;
}

export function getNodeParent(id) {
  const child = getNodeLevelInfo(id);
  if (!child || child.level === 0) return null;
  const parentFirst = child.first - NODE_LEVELS[child.level - 1];
  return parentFirst + Math.floor(child.index / 3);
}

export function getNodeChildren(id) {
  const parent = getNodeLevelInfo(id);
  if (!parent || parent.level >= NODE_LEVELS.length - 1) return [];
  const childFirst = parent.first + NODE_LEVELS[parent.level];
  const firstChild = childFirst + parent.index * 3;
  return [firstChild, firstChild + 1, firstChild + 2]
    .filter((childId) => childId <= NODE_TOTAL);
}

function isPrivateIpv4(host) {
  const match = String(host).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b, c, d] = match.slice(1).map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return false;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) || a === 240;
}

export function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isPrivateIpv4(host)) return true;
  if (host.includes(':')) {
    if (host === '::' || host === '::1' || host.startsWith('::ffff:') || host.startsWith('2001:db8:')) return true;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
  }
  return false;
}

export function parseNodeLink(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('أدخل رابطًا أولًا.');
  if (raw.length > 8192) throw new Error('طول الرابط يتجاوز الحد المحلي المسموح به (8192 محرفًا).');
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error('يحتوي الرابط على محارف تحكم غير مسموح بها.');
  const schemeMatch = raw.match(/^([a-z][a-z\d+.-]*):/i);
  const scheme = schemeMatch?.[1]?.toLowerCase() || '';

  const appSchemes = new Set(['mailto', 'tel', 'sms', 'whatsapp', 'tg', 'spotify', 'itms-apps', 'comgooglemaps', 'geo']);

  if (scheme === 'mailto') {
    let link;
    try { link = new URL(raw); } catch { throw new Error('صيغة بريد إلكتروني غير صالحة.'); }
    let recipient;
    try { recipient = decodeURIComponent(link.pathname || ''); } catch { throw new Error('صيغة بريد إلكتروني غير صالحة.'); }
    if (!recipient.includes('@') || /[\s<>]/.test(recipient)) throw new Error('أدخل عنوان بريد صالحًا بعد mailto:.');
    return { kind: 'mailto', url: link.href, host: 'mailto', display: 'بريد إلكتروني' };
  }

  if (scheme === 'tel') {
    const number = raw.slice(raw.indexOf(':') + 1).split('?')[0].trim();
    if (!/^[+\d().\s-]+$/.test(number) || number.replace(/\D/g, '').length < 3) throw new Error('صيغة رقم الهاتف غير صالحة.');
    return { kind: 'tel', url: `tel:${number.replace(/\s+/g, '')}`, host: 'tel', display: 'اتصال هاتفي' };
  }

  if (appSchemes.has(scheme)) {
    if (/[\u0000-\u001f\u007f\s]/.test(raw)) throw new Error('رابط التطبيق يحتوي على محارف غير صالحة.');
    let appLink;
    try { appLink = new URL(raw); } catch { throw new Error('صيغة رابط التطبيق غير صالحة.'); }
    if (appLink.username || appLink.password) throw new Error('احذف بيانات الدخول من رابط التطبيق.');
    return { kind: 'app', url: appLink.href, host: scheme, display: `تطبيق خارجي (${scheme})` };
  }

  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new Error('لأمان المعاينة، الروابط المدعومة هي HTTP/HTTPS، أو mailto:/tel: للفتح الخارجي فقط.');
  }

  let link;
  try { link = new URL(scheme ? raw : `https://${raw}`); }
  catch { throw new Error('صيغة رابط الويب غير صالحة.'); }
  if (!['http:', 'https:'].includes(link.protocol) || !link.hostname) throw new Error('استخدم رابط ويب يبدأ بـ HTTP أو HTTPS.');
  if (link.username || link.password) throw new Error('احذف اسم المستخدم وكلمة المرور من الرابط قبل المتابعة.');
  if (isPrivateHost(link.hostname)) throw new Error('لأسباب السلامة، لا تفتح عناوين الشبكات المحلية أو الخاصة من هذه الأداة.');
  return { kind: 'web', url: link.href, host: link.hostname, display: link.hostname };
}

export async function mapConcurrent(items, concurrency, mapper, onProgress = () => {}) {
  const results = new Array(items.length);
  if (!items.length) return results;
  const limit = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
  let nextIndex = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { results[index] = { error: error?.message || 'تعذر إكمال الطلب.' }; }
      completed += 1;
      onProgress(completed, items.length, items[index], results[index]);
    }
  }));
  return results;
}
