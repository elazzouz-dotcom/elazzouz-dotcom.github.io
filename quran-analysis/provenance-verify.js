(() => {
  const RECORD_URL = '/provenance.json';
  const PUBLIC_KEY_URL = '/provenance-public-key.pem';
  const CANONICALIZATION = 'deterministic-json-v1 (UTF-8, sorted keys, compact separators, trailing LF)';

  const $ = (selector) => document.querySelector(selector);
  const status = $('#provenance-status');
  const detail = $('#provenance-detail');
  const fingerprint = $('#provenance-fingerprint');
  const commit = $('#provenance-commit');
  const checkedAt = $('#provenance-checked-at');

  function setState(state, message) {
    if (!status) return;
    status.dataset.state = state;
    status.textContent = message;
  }

  function sortedValue(value) {
    if (Array.isArray(value)) return value.map(sortedValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = sortedValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function canonicalUnsigned(record) {
    const unsigned = JSON.parse(JSON.stringify(record));
    const integrity = unsigned.integrity || (unsigned.integrity = {});
    integrity.record_sha256 = null;
    integrity.canonicalization = CANONICALIZATION;
    integrity.signed = false;
    integrity.signature = null;
    return `${JSON.stringify(sortedValue(unsigned))}\n`;
  }

  function decodeBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function decodePem(pem) {
    const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
    return decodeBase64(base64);
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function verify() {
    if (!status) return;
    setState('loading', 'جارٍ التحقق من التوقيع…');
    if (!window.crypto?.subtle) {
      setState('unsupported', 'المتصفح لا يدعم Web Crypto في هذه الصفحة.');
      return;
    }

    try {
      const [recordResponse, keyResponse] = await Promise.all([
        fetch(RECORD_URL, { cache: 'no-store', credentials: 'same-origin' }),
        fetch(PUBLIC_KEY_URL, { cache: 'no-store', credentials: 'same-origin' })
      ]);
      if (!recordResponse.ok || !keyResponse.ok) throw new Error('تعذر تحميل سجل Provenance أو المفتاح العام.');

      const record = await recordResponse.json();
      const publicKeyPem = await keyResponse.text();
      const signature = record?.integrity?.signature;
      if (record?.integrity?.signed !== true || signature?.algorithm !== 'Ed25519' || signature?.encoding !== 'base64') {
        throw new Error('السجل غير موقّع بخوارزمية Ed25519.');
      }
      if (record.integrity.canonicalization !== CANONICALIZATION) {
        throw new Error('صيغة التطبيع المسجلة غير متوافقة.');
      }

      const payload = new TextEncoder().encode(canonicalUnsigned(record));
      const digest = await sha256Hex(payload);
      if (digest !== record.integrity.record_sha256) throw new Error('فشل فحص التجزئة؛ ربما تم تعديل السجل.');

      const publicKeyBytes = decodePem(publicKeyPem);
      const key = await crypto.subtle.importKey('spki', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
      const valid = await crypto.subtle.verify(
        { name: 'Ed25519' },
        key,
        decodeBase64(signature.value),
        payload
      );
      if (!valid) throw new Error('التوقيع غير صالح لهذا السجل.');

      setState('valid', 'التوقيع صالح ولم يتغير السجل');
      if (detail) detail.textContent = `المصدر: ${record.source?.commit || 'غير محدد'} · البذرة: ${record.randomness?.seed ?? 'غير محددة'} · ${record.randomness?.bit_generator || 'مولد غير محدد'}`;
      if (fingerprint) fingerprint.textContent = signature.public_key_sha256 || 'غير متاح';
      if (commit) commit.textContent = record.source?.commit || 'غير متاح';
      if (checkedAt) checkedAt.textContent = new Date().toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (error) {
      const message = error?.message || 'تعذر إتمام التحقق.';
      const unsupported = /Ed25519|algorithm|not supported/i.test(message);
      setState(unsupported ? 'unsupported' : 'invalid', unsupported ? 'المتصفح لا يدعم تحقق Ed25519 حاليًا.' : 'فشل التحقق من توقيع Provenance');
      if (detail) detail.textContent = message;
      if (fingerprint) fingerprint.textContent = 'غير متاح';
      if (commit) commit.textContent = 'غير متاح';
      if (checkedAt) checkedAt.textContent = new Date().toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
    }
  }

  document.addEventListener('DOMContentLoaded', verify, { once: true });
})();
