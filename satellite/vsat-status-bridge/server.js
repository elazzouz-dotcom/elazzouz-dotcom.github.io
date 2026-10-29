import express from 'express';
import 'dotenv/config';

const app = express();
const port = Number(process.env.PORT || 8787);
const cache = { value: null, expiresAt: 0 };

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function requireAdmin(req, res, next) {
  const expected = process.env.STATUS_READ_TOKEN;
  if (!expected) return res.status(503).json({ error: 'STATUS_READ_TOKEN is not configured' });
  if (req.get('authorization') !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function firstValue(source, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function asNumber(value, fallback = 0) {
  if (typeof value === 'string') value = value.replace(/,/g, '').trim();
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return /^(1|true|online|up|connected|ready|operational|active)$/i.test(String(value ?? '').trim());
}

function asIsoDate(value) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const numeric = asNumber(value, NaN);
  const date = Number.isFinite(numeric) && numeric > 100000000000
    ? new Date(numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeStatus(raw) {
  const kind = String(process.env.PROVIDER_KIND || 'auto').toLowerCase();
  const common = {
    connected: firstValue(raw, ['connected', 'online', 'isOnline', 'status.connected', 'status.online', 'link.connected', 'link.status']),
    downloadMbps: firstValue(raw, ['downloadMbps', 'download_mbps', 'downlinkMbps', 'downlink_mbps', 'rxMbps', 'rx_mbps', 'rx_rate_mbps', 'statistics.downlink_mbps']),
    uploadMbps: firstValue(raw, ['uploadMbps', 'upload_mbps', 'uplinkMbps', 'uplink_mbps', 'txMbps', 'tx_mbps', 'tx_rate_mbps', 'statistics.uplink_mbps']),
    usageBytes: firstValue(raw, ['usageBytes', 'usage_bytes', 'consumed_bytes', 'dataUsageBytes', 'statistics.usage_bytes']),
    usagePeriod: firstValue(raw, ['usagePeriod', 'usage_period', 'billingPeriod', 'period', 'statistics.period']),
    measuredAt: firstValue(raw, ['measuredAt', 'measured_at', 'timestamp', 'updatedAt', 'updated_at', 'status.timestamp'])
  };

  // Starlink responses vary by device/API generation. These aliases cover common
  // REST/JSON exports but do not claim to be an official Starlink API schema.
  if (kind === 'starlink' || kind === 'auto') {
    common.connected ??= firstValue(raw, ['dishGetStatus.device_state', 'dishGetStatus.state', 'deviceInfo.online', 'deviceInfo.status']);
    common.downloadMbps ??= firstValue(raw, ['dishGetStatus.downlink_bps', 'dishGetStatus.downlinkMbps', 'statistics.downlink_bps']);
    common.uploadMbps ??= firstValue(raw, ['dishGetStatus.uplink_bps', 'dishGetStatus.uplinkMbps', 'statistics.uplink_bps']);
    common.measuredAt ??= firstValue(raw, ['dishGetStatus.utc_ns', 'deviceInfo.timestamp']);
  }

  // iDirect installations commonly expose link state and RX/TX rates through a
  // vendor gateway or SNMP-to-JSON adapter. Exact field names remain configurable.
  if (kind === 'idirect' || kind === 'auto') {
    common.connected ??= firstValue(raw, ['linkState', 'link_state', 'modem.linkState', 'modem.online', 'network.operational']);
    common.downloadMbps ??= firstValue(raw, ['rx_rate_mbps', 'rxRateMbps', 'modem.rx_mbps', 'modem.downlink_mbps']);
    common.uploadMbps ??= firstValue(raw, ['tx_rate_mbps', 'txRateMbps', 'modem.tx_mbps', 'modem.uplink_mbps']);
    common.usageBytes ??= firstValue(raw, ['monthly_consumption_bytes', 'modem.usage_bytes', 'accounting.usage_bytes']);
    common.measuredAt ??= firstValue(raw, ['poll_time', 'pollTime', 'modem.updated_at']);
  }

  const downlink = asNumber(common.downloadMbps);
  const uplink = asNumber(common.uploadMbps);
  return {
    provider: kind,
    connected: asBoolean(common.connected),
    downloadMbps: downlink > 100000 ? downlink / 1_000_000 : downlink,
    uploadMbps: uplink > 100000 ? uplink / 1_000_000 : uplink,
    usageBytes: asNumber(common.usageBytes),
    usagePeriod: String(common.usagePeriod ?? 'unknown').slice(0, 64),
    measuredAt: asIsoDate(common.measuredAt)
  };
}

async function readProviderStatus() {
  const url = process.env.PROVIDER_STATUS_URL;
  const token = process.env.PROVIDER_API_TOKEN;
  if (!url || !token) {
    const error = new Error('Provider API is not configured yet');
    error.code = 'PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Provider API returned HTTP ${response.status}`);
  return normalizeStatus(await response.json());
}

app.get('/health', (_req, res) => res.json({ ok: true, provider: process.env.PROVIDER_KIND || 'auto' }));

app.get('/api/status', requireAdmin, async (_req, res) => {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return res.json({ ...cache.value, cached: true });

  try {
    const value = await readProviderStatus();
    cache.value = value;
    cache.expiresAt = now + Number(process.env.CACHE_SECONDS || 30) * 1000;
    res.json({ ...value, cached: false });
  } catch (error) {
    const status = error.code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 502;
    res.status(status).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`VSAT status bridge listening on :${port}`));
