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
    return handleCORS();
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

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
            'GET /token/check': 'Check token validity'
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
