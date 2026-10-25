export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const allowedOrigins = new Set(['https://elazzouz-dotcom.github.io']);
    const requestOrigin = request.headers.get('Origin');

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.has(requestOrigin) ? requestOrigin : 'https://elazzouz-dotcom.github.io',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const API_BASE = 'https://api.github.com';
    const GITHUB_AUTH = 'https://github.com/login/oauth';
    const allowedClientIds = new Set(['Ov23liCSQUsIFcULd37T', 'Ov23li9xlu3kRKACL6Tz']);

    // POST /device/code - Start device flow
    if (path === '/device/code' && method === 'POST') {
      try {
        const body = await request.json();
        const client_id = body.client_id;

        if (!client_id || !allowedClientIds.has(client_id)) {
          return new Response(
            JSON.stringify({ error: 'Invalid client_id' }),
            { 
              status: 400, 
              headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            }
          );
        }

        // GitHub expects form-urlencoded
        const params = new URLSearchParams();
        params.append('client_id', client_id);
        if (body.scope) params.append('scope', body.scope);

        const res = await fetch(`${GITHUB_AUTH}/device/code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'GitHub-OAuth-Proxy/1.0'
          },
          body: params.toString()
        });

        if (!res.ok) {
          const errorBody = await res.text();
          console.error('GitHub error:', res.status, errorBody);
          return new Response(
            JSON.stringify({ 
              error: 'Failed to get device code',
              details: errorBody 
            }),
            { 
              status: res.status, 
              headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            }
          );
        }

        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err) {
        console.error('Device code error:', err);
        return new Response(
          JSON.stringify({ error: err.message }),
          { 
            status: 500, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          }
        );
      }
    }

    // POST /token - Exchange device code for token
    if (path === '/token' && method === 'POST') {
      try {
        const body = await request.json();
        const { client_id, device_code } = body;

        if (!client_id || !allowedClientIds.has(client_id) || !device_code) {
          return new Response(
            JSON.stringify({ error: 'Invalid client_id or device_code' }),
            { 
              status: 400, 
              headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            }
          );
        }

        const params = new URLSearchParams();
        params.append('client_id', client_id);
        params.append('device_code', device_code);
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

        const res = await fetch(`${GITHUB_AUTH}/access_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'GitHub-OAuth-Proxy/1.0'
          },
          body: params.toString()
        });

        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err) {
        console.error('Token error:', err);
        return new Response(
          JSON.stringify({ error: err.message }),
          { 
            status: 500, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          }
        );
      }
    }

    // GET /user - Get authenticated user
    if (path === '/user' && method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
          return new Response(
            JSON.stringify({ error: 'Missing Authorization header' }),
            { 
              status: 401, 
              headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            }
          );
        }

        const res = await fetch(`${API_BASE}/user`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'GitHub-OAuth-Proxy/1.0'
          }
        });

        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err) {
        console.error('User error:', err);
        return new Response(
          JSON.stringify({ error: err.message }),
          { 
            status: 500, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          }
        );
      }
    }

    // GET /health
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // GET / - Root endpoint
    if (path === '/' && method === 'GET') {
      return new Response(
        JSON.stringify({
          name: 'GitHub OAuth Proxy',
          version: '1.0.0',
          endpoints: {
            'POST /device/code': 'Start device flow',
            'POST /token': 'Exchange device code for token',
            'GET /user': 'Get authenticated user',
            'GET /health': 'Health check'
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    return new Response('Not Found', { 
      status: 404, 
      headers: corsHeaders 
    });
  }
};
