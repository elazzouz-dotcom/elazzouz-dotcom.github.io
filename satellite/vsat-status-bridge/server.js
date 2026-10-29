import express from 'express';
import 'dotenv/config';

const app = express();
const port = Number(process.env.PORT || 8787);
const cache = { value: null, expiresAt: 0 };

app.disable('x-powered-by');
app.use(express.json());

function requireAdmin(req, res, next) {
  const expected = process.env.STATUS_READ_TOKEN;
  if (!expected) return res.status(503).json({ error: 'STATUS_READ_TOKEN is not configured' });
  if (req.get('authorization') !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
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
  const raw = await response.json();

  // عدّل هذه الخريطة بعد استلام توثيق API الفعلي من المزود.
  return {
    connected: Boolean(raw.connected ?? raw.online ?? raw.status === 'online'),
    downloadMbps: Number(raw.downloadMbps ?? raw.download_mbps ?? raw.downlink_mbps ?? 0),
    uploadMbps: Number(raw.uploadMbps ?? raw.upload_mbps ?? raw.uplink_mbps ?? 0),
    usageBytes: Number(raw.usageBytes ?? raw.usage_bytes ?? raw.consumed_bytes ?? 0),
    usagePeriod: raw.usagePeriod ?? raw.usage_period ?? 'unknown',
    measuredAt: raw.measuredAt ?? raw.measured_at ?? new Date().toISOString()
  };
}

app.get('/health', (_req, res) => res.json({ ok: true }));

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
