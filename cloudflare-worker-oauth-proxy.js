/**
 * GitHub OAuth Proxy v4.0.0
 * Ultimate full-featured GitHub OAuth proxy with complete API coverage
 * 
 * Deployment: Cloudflare Workers
 * Required Environment Variables:
 *   - CLIENT_SECRET: Your GitHub OAuth App client secret
 * 
 * Configuration:
 *   - CLIENT_ID: Ov23liCSQUsIFcULd37T (can be public)
 *   - Default Scope: repo workflow admin:repo_hook read:user user:email
 */

const CLIENT_ID = 'Ov23liCSQUsIFcULd37T';
const LEGACY_CLIENT_ID = 'Ov23li9xlu3kRKACL6Tz';
const DEFAULT_SCOPE = 'repo workflow admin:repo_hook read:user user:email';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_AUTH_BASE = 'https://github.com';

/**
 * Main request handler
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * Handle incoming requests
 */
async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    if (new URL(request.url).pathname.startsWith('/auth/')) return handleAuthPreflight(request);
    return handleCORS();
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Browser sign-in API: returns encrypted short-lived sessions, never GitHub tokens.
    if (path.startsWith('/auth/')) {
      if (!isAllowedAuthOrigin(request)) return authJson(request, { error: 'origin_not_allowed' }, 403);
      if (path === '/auth/device/code' && method === 'POST') return handleAuthDeviceCode(request);
      if (path === '/auth/device/token' && method === 'POST') return handleAuthDeviceToken(request);
      if (path === '/auth/me' && method === 'GET') return handleAuthMe(request);
      if (path === '/auth/logout' && method === 'POST') return handleAuthLogout(request);
      return authJson(request, { error: 'not_found' }, 404);
    }

    // Route requests to appropriate handlers
    // Authentication endpoints
    if (path === '/device/code' && method === 'POST') {
      return handleDeviceCode(request);
    }
    
    if (path === '/token' && method === 'POST') {
      return handleToken(request);
    }
    
    if (path === '/token/refresh' && method === 'POST') {
      return handleTokenRefresh(request);
    }
    
    if (path === '/token/revoke' && method === 'POST') {
      return handleTokenRevoke(request);
    }
    
    if (path === '/token/check' && method === 'GET') {
      return handleTokenCheck(request);
    }

    if (path === '/analyze' && method === 'POST') {
      return handleAIAnalysis(request);
    }

    // Public external-site preview: fetch, sanitize, summarize, and return embeddable HTML.
    if (path === '/preview' && method === 'GET') {
      return handleExternalPreview(url);
    }

    // User endpoints
    if (path.startsWith('/user')) {
      return proxyToGitHub(request, path);
    }

    // Repository endpoints
    if (path === '/repos/create' && method === 'POST') {
      return proxyToGitHub(request, '/user/repos', method);
    }
    
    if (path.startsWith('/repos/')) {
      // Convert /repos/:owner/:repo/* to GitHub API format
      const apiPath = path.replace(/^\/repos/, '/repos');
      return proxyToGitHub(request, apiPath);
    }

    // Gists endpoints
    if (path.startsWith('/gists')) {
      return proxyToGitHub(request, path);
    }

    // Search endpoints
    if (path.startsWith('/search/')) {
      return proxyToGitHub(request, path);
    }

    // Notifications
    if (path.startsWith('/notifications')) {
      return proxyToGitHub(request, path);
    }

    // Meta endpoints
    if (['/meta', '/emojis', '/gitignore/templates', '/licenses', 
         '/rate-limit', '/zen', '/feeds', '/events'].includes(path)) {
      return proxyToGitHub(request, path);
    }

    // Markdown rendering
    if (path === '/markdown' || path === '/markdown/raw') {
      return proxyToGitHub(request, path);
    }

    // GraphQL
    if (path === '/graphql' && method === 'POST') {
      return proxyToGitHub(request, path);
    }

    // Generic proxy for any GitHub API request
    if (path.startsWith('/proxy/')) {
      const apiPath = path.replace(/^\/proxy/, '');
      return proxyToGitHub(request, apiPath);
    }

    // Organization endpoints
    if (path.startsWith('/orgs/')) {
      return proxyToGitHub(request, path);
    }

    // User endpoints (public)
    if (path.startsWith('/users/')) {
      return proxyToGitHub(request, path);
    }

    // Root endpoint - return API info
    if (path === '/' || path === '') {
      return new Response(JSON.stringify({
        name: 'GitHub OAuth Proxy',
        version: '4.0.0',
        description: 'Ultimate full-featured GitHub OAuth proxy with complete API coverage',
        client_id: CLIENT_ID,
        default_scope: DEFAULT_SCOPE,
        endpoints: {
          auth: {
            'POST /device/code': 'Initiate Device Flow',
            'POST /token': 'Exchange code for token',
            'POST /token/refresh': 'Refresh token',
            'POST /token/revoke': 'Revoke token',
            'GET /token/check': 'Check token validity',
            'POST /analyze': 'Analyze node data with Cloudflare Workers AI'
          },
          user: 'GET /user/*',
          repos: 'ANY /repos/*',
          gists: 'ANY /gists/*',
          search: 'GET /search/*',
          notifications: 'ANY /notifications/*',
          meta: 'GET /meta, /emojis, /markdown, etc.',
          graphql: 'POST /graphql',
          proxy: 'ANY /proxy/* - Forward any request to GitHub API',
          preview: 'GET /preview?url=https://example.com - Fetch and sanitize a public web page'
        }
      }), {
        status: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    // Not found
    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}


async function handleExternalPreview(requestUrl) {
  const raw = requestUrl.searchParams.get('url');
  let target;
  try {
    target = new URL(raw || '');
    if (!['http:', 'https:'].includes(target.protocol) || !isPublicHostname(target.hostname)) throw new Error('Only public HTTP/HTTPS URLs are allowed.');
  } catch (error) {
    return previewResponse({ error: error.message || 'Invalid public URL.' }, 400);
  }
  try {
    const upstream = await fetch(target.href, { redirect: 'follow', headers: { 'User-Agent': 'Slaks-Cloudflare-Preview/1.0', Accept: 'text/html,application/xhtml+xml' } });
    const finalUrl = new URL(upstream.url || target.href);
    if (!isPublicHostname(finalUrl.hostname)) throw new Error('The destination redirected to a private or local host.');
    const contentType = upstream.headers.get('content-type') || '';
    const rawBody = await upstream.text();
    const html = sanitizePreviewHtml(rawBody.slice(0, 1500000), finalUrl.href);
    const metadata = extractPreviewMetadata(rawBody, finalUrl.href);
    return previewResponse({ ok: upstream.ok, status: upstream.status, target: target.href, finalUrl: finalUrl.href, contentType, ...metadata, html, text: metadata.text.slice(0, 1200) }, upstream.ok ? 200 : 502);
  } catch (error) {
    return previewResponse({ error: 'Unable to fetch the public URL.', message: error.message, target: target.href }, 502);
  }
}

function isPublicHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (host === '::1' || host === '0.0.0.0' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
  const octets = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (octets) { const [a, b] = octets.slice(1, 3).map(Number); if (a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false; }
  return true;
}

function extractPreviewMetadata(html, sourceUrl) {
  const pick = pattern => (html.match(pattern)?.[1] || '').replace(/\s+/g, ' ').trim();
  const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || pick(/<title[^>]*>([\s\S]*?)<\/title>/i) || new URL(sourceUrl).hostname;
  const description = pick(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const links = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].slice(0, 100).map(match => match[1]);
  return { title, description, text, links };
}

function sanitizePreviewHtml(html, baseUrl) {
  let safe = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '').replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '').replace(/<embed\b[^>]*>/gi, '');
  safe = safe.replace(/\s+on[a-z]+\s*=\s*(["'])[^"']*\1/gi, '').replace(/\s+(?:href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '');
  const base = `<base href="${escapeHtml(baseUrl)}">`;
  return /<head[^>]*>/i.test(safe) ? safe.replace(/<head[^>]*>/i, match => `${match}${base}`) : `<!doctype html><html><head>${base}<meta charset="utf-8"></head><body>${safe}</body></html>`;
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function previewResponse(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: corsHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }) }); }

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

/**
 * Get CORS headers
 */
function corsHeaders(additionalHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-GitHub-Api-Version',
    'Access-Control-Max-Age': '86400',
    ...additionalHeaders
  };
}

const AUTH_ORIGIN = 'https://elazzouz-dotcom.github.io';
const AUTH_SESSION_SECONDS = 4 * 60 * 60;

function isAllowedAuthOrigin(request) {
  return request.headers.get('Origin') === AUTH_ORIGIN;
}

function authHeaders(request) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
  if (isAllowedAuthOrigin(request)) {
    headers['Access-Control-Allow-Origin'] = AUTH_ORIGIN;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, Accept';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function authJson(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: authHeaders(request) });
}

function handleAuthPreflight(request) {
  if (!isAllowedAuthOrigin(request)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: authHeaders(request) });
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function getSessionCryptoKey() {
  if (typeof SESSION_ENCRYPTION_KEY === 'undefined' || !SESSION_ENCRYPTION_KEY) throw new Error('Session encryption key is not configured.');
  const raw = Uint8Array.from(atob(SESSION_ENCRYPTION_KEY), character => character.charCodeAt(0));
  if (raw.byteLength !== 32) throw new Error('Session encryption key must be 32 bytes.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function createAuthSession(accessToken, profile) {
  const now = Math.floor(Date.now() / 1000);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify({
    v: 1,
    access_token: accessToken,
    sub: profile.id,
    login: profile.login,
    iat: now,
    exp: now + AUTH_SESSION_SECONDS
  }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getSessionCryptoKey(), payload);
  return { session: `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`, expires_at: new Date((now + AUTH_SESSION_SECONDS) * 1000).toISOString() };
}

async function readAuthSession(request) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer (v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const [, version, ivText, encryptedText] = match[1].match(/^(v1)\.([^.]+)\.([^.]+)$/);
    if (version !== 'v1') return null;
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(ivText) }, await getSessionCryptoKey(), base64UrlDecode(encryptedText));
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (payload.v !== 1 || !payload.access_token || !payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function githubProfile(accessToken) {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'elazzouz-dotcom-sign-in' }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return { id: user.id, login: user.login, name: user.name || user.login, avatar_url: user.avatar_url, html_url: user.html_url };
}

async function handleAuthDeviceCode(request) {
  try {
    const response = await fetch(`${GITHUB_AUTH_BASE}/login/device/code`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: 'read:user user:email' })
    });
    const data = await response.json();
    return authJson(request, data, response.status);
  } catch {
    return authJson(request, { error: 'device_flow_unavailable' }, 502);
  }
}

async function handleAuthDeviceToken(request) {
  try {
    const body = await request.json();
    if (typeof body.device_code !== 'string' || body.device_code.length < 8 || body.device_code.length > 256) return authJson(request, { error: 'invalid_device_code' }, 400);
    const tokenBody = { client_id: CLIENT_ID, device_code: body.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' };
    if (typeof CLIENT_SECRET !== 'undefined' && CLIENT_SECRET) tokenBody.client_secret = CLIENT_SECRET;
    const response = await fetch(`${GITHUB_AUTH_BASE}/login/oauth/access_token`, {
      method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(tokenBody)
    });
    const result = await response.json();
    if (result.error) return authJson(request, { error: result.error, error_description: result.error_description }, response.ok ? 200 : response.status);
    if (!result.access_token) return authJson(request, { error: 'token_exchange_failed' }, 502);
    const profile = await githubProfile(result.access_token);
    if (!profile) return authJson(request, { error: 'github_identity_unavailable' }, 502);
    const session = await createAuthSession(result.access_token, profile);
    return authJson(request, { ...session, user: profile });
  } catch {
    return authJson(request, { error: 'session_creation_failed' }, 500);
  }
}

async function handleAuthMe(request) {
  const session = await readAuthSession(request);
  if (!session) return authJson(request, { error: 'unauthorized' }, 401);
  const user = await githubProfile(session.access_token);
  if (!user) return authJson(request, { error: 'github_session_invalid' }, 401);
  return authJson(request, { user, expires_at: new Date(session.exp * 1000).toISOString() });
}

async function handleAuthLogout(request) {
  const session = await readAuthSession(request);
  let revoked = false;
  if (session && typeof CLIENT_SECRET !== 'undefined' && CLIENT_SECRET) {
    try {
      const response = await fetch(`${GITHUB_AUTH_BASE}/applications/${CLIENT_ID}/token`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}` },
        body: JSON.stringify({ access_token: session.access_token })
      });
      revoked = response.status === 204 || response.ok;
    } catch { /* Clear the browser session even if GitHub revocation is temporarily unavailable. */ }
  }
  return authJson(request, { success: true, revoked });
}

/**
 * Handle Device Code request (Device Flow step 1)
 * POST /device/code
 */
async function handleDeviceCode(request) {
  try {
    const body = await request.json();
    const scope = body.scope || DEFAULT_SCOPE;

    const response = await fetch(`${GITHUB_AUTH_BASE}/login/device/code`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        scope: scope
      })
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to initiate device flow',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

/**
 * Handle Token request (Device Flow step 2 or OAuth code exchange)
 * POST /token
 */
async function handleToken(request) {
  try {
    const body = await request.json();
    const clientSecret = CLIENT_SECRET || '';

    // Prepare the request body for GitHub
    const tokenRequest = {
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      ...body
    };

    const response = await fetch(`${GITHUB_AUTH_BASE}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tokenRequest)
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to exchange token',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

/**
 * Handle Token Refresh
 * POST /token/refresh
 */
async function handleTokenRefresh(request) {
  try {
    const body = await request.json();
    const clientSecret = CLIENT_SECRET || '';

    const response = await fetch(`${GITHUB_AUTH_BASE}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        refresh_token: body.refresh_token,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to refresh token',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

/**
 * Handle Token Revocation
 * POST /token/revoke
 */
async function handleTokenRevoke(request) {
  try {
    const body = await request.json();
    const clientSecret = CLIENT_SECRET || '';

    const response = await fetch(`${GITHUB_AUTH_BASE}/applications/${CLIENT_ID}/token`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${CLIENT_ID}:${clientSecret}`)}`
      },
      body: JSON.stringify({
        access_token: body.access_token
      })
    });

    if (response.status === 204) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const data = await response.json().catch(() => ({}));
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to revoke token',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

/**
 * Handle Token Check
 * GET /token/check
 */
async function handleTokenCheck(request) {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'No authorization header provided' 
      }), {
        status: 401,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    // Check token by calling GitHub user API
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitHub-OAuth-Proxy/4.0.0'
      }
    });

    if (response.ok) {
      const userData = await response.json();
      return new Response(JSON.stringify({ 
        valid: true,
        user: userData.login,
        scopes: response.headers.get('X-OAuth-Scopes')
      }), {
        status: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    return new Response(JSON.stringify({ valid: false }), {
      status: 401,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to check token',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

/**
 * Analyze a node using a Cloudflare Workers AI binding named AI.
 * The binding is attached at deploy time; no model key is exposed to the site.
 */
async function handleAIAnalysis(request) {
  try {
    const body = await request.json();
    const nodeId = Number(body.nodeId || 0);
    const source = String(body.text || body.html || '').slice(0, 12000);
    if (!nodeId || !source) return new Response(JSON.stringify({ error: 'nodeId and content are required' }), { status: 400, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
    if (typeof AI === 'undefined' || !AI || typeof AI.run !== 'function') return new Response(JSON.stringify({ error: 'AI binding is not configured', hint: 'Deploy this Worker with an AI binding named AI.' }), { status: 503, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
    const prompt = `Analyze this SemVer Hub node and return JSON only. Fields: nodeId, status, title, summary, keywords, technologies, relations, riskFlags, confidence. Do not invent facts. Node ID: ${nodeId}. URL: ${String(body.url || '').slice(0, 500)}. Content: ${source}`;
    const result = await AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: 'You are a careful technical data analyst. Return valid JSON only.' }, { role: 'user', content: prompt }] });
    const raw = typeof result?.response === 'string' ? result.response : JSON.stringify(result);
    let analysis; try { analysis = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim()); } catch { analysis = { summary: raw.slice(0, 2000), keywords: [], technologies: [], relations: [], riskFlags: ['model_returned_non_json'], confidence: 0.5 }; }
    return new Response(JSON.stringify({ nodeId, status: 'analyzed', ...analysis, analyzedAt: new Date().toISOString() }), { status: 200, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  } catch (error) { return new Response(JSON.stringify({ error: 'AI analysis failed', message: error.message }), { status: 500, headers: corsHeaders({ 'Content-Type': 'application/json' }) }); }
}

/**
 * Proxy request to GitHub API
 */
async function proxyToGitHub(request, path, methodOverride = null) {
  try {
    const url = new URL(request.url);
    const method = methodOverride || request.method;
    
    // Build GitHub API URL
    const githubUrl = `${GITHUB_API_BASE}${path}${url.search}`;

    // Prepare headers
    const headers = {
      'Accept': request.headers.get('Accept') || 'application/vnd.github+json',
      'User-Agent': 'GitHub-OAuth-Proxy/4.0.0',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    // Forward authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Forward content type for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const contentType = request.headers.get('Content-Type');
      if (contentType) {
        headers['Content-Type'] = contentType;
      }
    }

    // Prepare request options
    const requestOptions = {
      method: method,
      headers: headers
    };

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method) && request.body) {
      requestOptions.body = await request.text();
    }

    // Make request to GitHub
    const response = await fetch(githubUrl, requestOptions);

    // Get response body
    const responseBody = await response.text();

    // Return proxied response with CORS headers
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders({
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'X-RateLimit-Limit': response.headers.get('X-RateLimit-Limit') || '',
        'X-RateLimit-Remaining': response.headers.get('X-RateLimit-Remaining') || '',
        'X-RateLimit-Reset': response.headers.get('X-RateLimit-Reset') || ''
      })
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to proxy request to GitHub',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}
