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
          proxy: 'ANY /proxy/* - Forward any request to GitHub API'
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
