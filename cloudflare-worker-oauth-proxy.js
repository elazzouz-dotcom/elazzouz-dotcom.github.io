// ===== GitHub OAuth Proxy v4.0 — Ultimate Full-Featured =====
const ALLOWED_ORIGINS = [
  'https://elazzouz-dotcom.github.io',
  'https://onecompiler.com',
  'https://elazzouz4.workers.dev',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];
const GITHUB_CLIENT_ID = 'Ov23liCSQUsIFcULd37T';
const LEGACY_CLIENT_ID = 'Ov23li9xlu3kRKACL6Tz';
const GITHUB_CLIENT_IDS = [GITHUB_CLIENT_ID, LEGACY_CLIENT_ID];
const PROXY_VERSION = '4.1.0';
const DEFAULT_SCOPE = 'repo workflow admin:repo_hook read:user user:email';
const USER_AGENT = 'Practical-Tools-GitHub-Login';
const GITHUB_API = 'https://api.github.com';
const OTP_ADMIN_EMAIL = 'elazzouz4@gmail.com';
const OTP_TTL = 600;
const OTP_MAX_ATTEMPTS = 5;
function binding(name) { try { if (name === 'GMAIL_CLIENT_ID') return GMAIL_CLIENT_ID; } catch {} try { if (name === 'GMAIL_CLIENT_SECRET') return GMAIL_CLIENT_SECRET; } catch {} try { if (name === 'GMAIL_REFRESH_TOKEN') return GMAIL_REFRESH_TOKEN; } catch {} try { if (name === 'OTP_SIGNING_SECRET') return OTP_SIGNING_SECRET; } catch {} try { if (name === 'GMAIL_SENDER') return GMAIL_SENDER; } catch {} return ''; }
function b64url(bytes) { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function utf8b64url(text) { return b64url(new TextEncoder().encode(text)); }
async function otpSign(value) { const key=await crypto.subtle.importKey('raw', new TextEncoder().encode(binding('OTP_SIGNING_SECRET') || binding('GMAIL_CLIENT_SECRET')), {name:'HMAC',hash:'SHA-256'}, false, ['sign']); return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))); }
function getCookie(request,name) { const raw=request.headers.get('Cookie') || ''; const item=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'=')); return item ? decodeURIComponent(item.slice(name.length+1)) : ''; }
async function otpCookie(payload) { const value=utf8b64url(JSON.stringify(payload)); return value+'.'+await otpSign(value); }
async function otpRead(request,name) { const raw=getCookie(request,name); const i=raw.lastIndexOf('.'); if(i<1)return null; const value=raw.slice(0,i), sig=raw.slice(i+1); if(sig !== await otpSign(value))return null; try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'=='),c=>c.charCodeAt(0))))}catch{return null} }
function otpSet(name,value,maxAge) { return name+'='+encodeURIComponent(value)+'; Max-Age='+maxAge+'; Path=/otp; HttpOnly; Secure; SameSite=Strict'; }
async function gmailSendOtp(code) { const clientId=binding('GMAIL_CLIENT_ID'), secret=binding('GMAIL_CLIENT_SECRET'), refresh=binding('GMAIL_REFRESH_TOKEN'); if(!clientId || !secret || !refresh || !binding('OTP_SIGNING_SECRET')) throw new Error('gmail_otp_not_configured'); const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'})}); const token=await tokenRes.json(); if(!token.access_token) throw new Error('gmail_token_exchange_failed'); const text='رمز الدخول إلى Hosting Studio هو: '+code+'\n\nهذا الرمز صالح لمدة 10 دقائق ويُستخدم مرة واحدة.'; const raw=['From: '+(binding('GMAIL_SENDER') || OTP_ADMIN_EMAIL),'To: '+OTP_ADMIN_EMAIL,'Subject: Hosting Studio verification code','Content-Type: text/plain; charset=UTF-8','',text].join('\r\n'); const send=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({raw:utf8b64url(raw)})}); if(!send.ok) throw new Error('gmail_send_failed'); }


// ===== CORS & Security Headers =====
function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Api-Version, X-GitHub-Next-Global-ID',
    'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Used, X-RateLimit-Resource, Link, X-OAuth-Scopes, X-Accepted-OAuth-Scopes',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}
function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  };
}

// ===== Response Helpers =====
function json(data, status, origin) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: { ...corsHeaders(origin), ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function githubJson(url, init, origin) {
  init = init || {};
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: 'github_invalid_response', detail: text.slice(0, 500) }; }
  const hdrs = { ...corsHeaders(origin), ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8' };
  const h = response.headers;
  ['X-RateLimit-Limit','X-RateLimit-Remaining','X-RateLimit-Reset','X-RateLimit-Used','X-RateLimit-Resource','X-OAuth-Scopes','X-Accepted-OAuth-Scopes'].forEach(k => {
    const v = h.get(k); if (v) hdrs[k] = v;
  });
  const link = h.get('Link'); if (link) hdrs['Link'] = link;
  return new Response(JSON.stringify(data, null, 2), { status: response.status, headers: hdrs });
}

// ===== Auth Helpers =====
function sessionCookie(token, maxAge) { return 'gh_session='+encodeURIComponent(token)+'; Max-Age='+maxAge+'; Path=/; HttpOnly; Secure; SameSite=None'; }
function withSessionCookie(response, token, clear=false) { const headers=new Headers(response.headers); headers.append('Set-Cookie', sessionCookie(clear?'':token, clear?0:60*60*24*30)); return new Response(response.body, {status:response.status, statusText:response.statusText, headers}); }
function getBearer(request) {
  const auth = request.headers.get('Authorization');
  if (auth && /^Bearer\s+\S+$/i.test(auth)) return auth;
  const cookie = getCookie(request, 'gh_session');
  return cookie ? 'Bearer '+decodeURIComponent(cookie) : null;
}
function clientSecret() {
  try { return typeof D !== 'undefined' ? D : null; } catch { return null; }
}
function basicAuthHeader() {
  const secret = clientSecret();
  return 'Basic ' + btoa(GITHUB_CLIENT_ID + ':' + (secret || ''));
}

// ===== Pagination Helper =====
function buildUrl(baseUrl, searchParams) {
  const finalUrl = new URL(baseUrl);
  if (searchParams) {
    for (const [k, v] of searchParams.entries()) {
      if (['per_page','page','sort','direction','type','visibility','affiliation','since','before','state','labels','milestone','assignee','creator','environment','sha','ref','path','q','order','in','filter','base','head'].includes(k)) {
        finalUrl.searchParams.set(k, v);
      }
    }
  }
  return finalUrl.toString();
}


// ===== Slaks External Preview Relay =====
function previewPublicHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host === 'metadata' || host === 'metadata.google.internal') return false;
  if (host === '::1' || host === '0.0.0.0' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) { const a = Number(ip[1]); const b = Number(ip[2]); if (a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false; }
  return true;
}
function previewCleanHtml(html, baseUrl) {
  let safe = String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '').replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '').replace(/<embed\b[^>]*>/gi, '');
  safe = safe.replace(/\s+on[a-z]+\s*=\s*(["'])[^"']*\1/gi, '').replace(/\s+(?:href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '');
  const base = '<base href="' + String(baseUrl).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '">';
  return /<head[^>]*>/i.test(safe) ? safe.replace(/<head[^>]*>/i, match => match + base) : '<!doctype html><html><head>' + base + '<meta charset="utf-8"></head><body>' + safe + '</body></html>';
}
function previewMeta(html, sourceUrl) {
  const pick = pattern => (String(html || '').match(pattern)?.[1] || '').replace(/\s+/g, ' ').trim();
  const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || pick(/<title[^>]*>([\s\S]*?)<\/title>/i) || new URL(sourceUrl).hostname;
  const description = pick(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i);
  const text = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const links = [...String(html || '').matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].slice(0, 100).map(match => match[1]);
  return { title, description, text, links };
}
async function slaksPreview(searchParams, origin) {
  let target;
  try { target = new URL(searchParams.get('url') || ''); if (!['http:', 'https:'].includes(target.protocol) || !previewPublicHost(target.hostname)) throw new Error('Only public HTTP/HTTPS URLs are allowed.'); }
  catch (error) { return json({ error: error.message || 'Invalid public URL.' }, 400, origin); }
  try {
    const upstream = await fetch(target.href, { redirect: 'follow', headers: { 'User-Agent': 'Slaks-Cloudflare-Preview/1.0', Accept: 'text/html,application/xhtml+xml' } });
    const finalUrl = new URL(upstream.url || target.href);
    if (!previewPublicHost(finalUrl.hostname)) throw new Error('The destination redirected to a private or local host.');
    const raw = await upstream.text();
    const metadata = previewMeta(raw, finalUrl.href);
    return json({ ok: upstream.ok, status: upstream.status, target: target.href, finalUrl: finalUrl.href, contentType: upstream.headers.get('content-type') || '', ...metadata, html: previewCleanHtml(raw.slice(0, 1500000), finalUrl.href), text: metadata.text.slice(0, 1200) }, upstream.ok ? 200 : 502, origin);
  } catch (error) { return json({ error: 'Unable to fetch the public URL.', message: error.message, target: target.href }, 502, origin); }
}

// ===== Main Handler =====
async function handle(request) {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin_not_allowed' }, 403, origin);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const sp = url.searchParams;

  if (path === '/preview' && method === 'GET') return slaksPreview(sp, origin);

  try {
    // --- Health Check ---
    if (path === '/health' && method === 'GET')
      return json({ status: 'ok', version: PROXY_VERSION, timestamp: new Date().toISOString(), client_id: GITHUB_CLIENT_ID, client_ids: GITHUB_CLIENT_IDS, features: ['device-flow','token','refresh','revoke','check','user','repos','gists','search','actions','notifications','interactions','meta','graphql','proxy','orgs','users','events','feeds','migrations','webhooks','git-data'] }, 200, origin);

    // --- API Info ---
    if ((path === '' || path === '/') && method === 'GET')
      return json({
        name: 'GitHub OAuth Proxy', version: PROXY_VERSION,
        description: 'Ultimate full-featured GitHub OAuth proxy with complete API coverage',
        client_id: GITHUB_CLIENT_ID, client_ids: GITHUB_CLIENT_IDS, default_scope: DEFAULT_SCOPE,
        endpoints: {
          auth: { 'POST /device/code': 'Initiate Device Flow', 'POST /token': 'Exchange code for token', 'POST /token/refresh': 'Refresh token', 'POST /token/revoke': 'Revoke token', 'GET /token/check': 'Check token validity' },
          user: { 'GET /user': 'Profile', 'GET /user/emails': 'Emails', 'GET /user/orgs': 'Orgs', 'GET /user/repos': 'Repos', 'GET /user/followers': 'Followers', 'GET /user/following': 'Following', 'GET /user/starred': 'Starred', 'GET /user/subscriptions': 'Subscriptions', 'GET /user/installations': 'Installations', 'GET /user/blocks': 'Blocked users', 'GET /user/gpg_keys': 'GPG keys', 'GET /user/ssh_signing_keys': 'SSH signing keys', 'GET /user/keys': 'SSH keys', 'GET /user/social_accounts': 'Social accounts', 'GET /user/packages': 'Packages', 'GET /user/migrations': 'Migrations' },
          repos: { 'POST /repos/create': 'Create repo', 'ANY /repos/:owner/:repo/*': 'Full repo API (branches, commits, issues, pulls, releases, contents, languages, contributors, readme, stargazers, forks, tags, topics, traffic, actions, webhooks, git-data)' },
          gists: { 'GET /gists': 'List gists', 'POST /gists': 'Create gist', 'ANY /gists/:id/*': 'Gist operations (get/update/delete/fork/star/comments)' },
          search: { 'GET /search/repositories': 'Search repos', 'GET /search/code': 'Search code', 'GET /search/users': 'Search users', 'GET /search/issues': 'Search issues/PRs', 'GET /search/commits': 'Search commits', 'GET /search/labels': 'Search labels', 'GET /search/topics': 'Search topics', 'GET /search/discussions': 'Search discussions' },
          actions: { 'ANY /repos/:owner/:repo/actions/*': 'Workflows, runs, artifacts, dispatch, rerun, cancel, logs' },
          notifications: { 'GET /notifications': 'List notifications', 'PUT /notifications': 'Mark all read', 'ANY /notifications/threads/:id/*': 'Thread operations' },
          interactions: { 'PUT/DELETE /user/starred/:owner/:repo': 'Star/unstar', 'PUT/DELETE /user/following/:username': 'Follow/unfollow' },
          meta: { 'GET /meta': 'GitHub meta', 'GET /emojis': 'Emojis', 'POST /markdown': 'Render markdown', 'POST /markdown/raw': 'Raw markdown', 'GET /gitignore/templates': 'Gitignore templates', 'GET /licenses': 'Licenses', 'GET /rate-limit': 'Rate limit', 'GET /zen': 'Zen', 'GET /feeds': 'Feeds', 'GET /events': 'Public events' },
          graphql: { 'POST /graphql': 'Forward GraphQL query' },
          proxy: { 'ANY /proxy/*': 'Forward any request to GitHub API' },
          misc: { 'ANY /orgs/:org/*': 'Organization API', 'ANY /users/:username/*': 'Any user API' }
        }
      }, 200, origin);


    // ========== ADMIN EMAIL OTP ==========
    if (path === '/otp/session' && method === 'GET') { const state=await otpRead(request,'otp_state'); const admin=await otpRead(request,'admin_session'); const configured=Boolean(binding('GMAIL_CLIENT_ID') && binding('GMAIL_CLIENT_SECRET') && binding('GMAIL_REFRESH_TOKEN') && binding('OTP_SIGNING_SECRET')); return json({ configured, authenticated:Boolean(admin && admin.email===OTP_ADMIN_EMAIL && admin.exp>Date.now()/1000), email:OTP_ADMIN_EMAIL },200,origin); }
    if (path === '/otp/request' && method === 'POST') { const input=await request.json().catch(()=>({})); if(String(input.email||'').toLowerCase()!==OTP_ADMIN_EMAIL.toLowerCase()) return json({error:'email_not_allowed'},403,origin); if(!binding('GMAIL_CLIENT_ID') || !binding('GMAIL_CLIENT_SECRET') || !binding('GMAIL_REFRESH_TOKEN') || !binding('OTP_SIGNING_SECRET')) return json({error:'gmail_otp_not_configured'},503,origin); const code=String(Math.floor(Math.random()*1000000)).padStart(6,'0'); const state=await otpCookie({email:OTP_ADMIN_EMAIL,code,exp:Math.floor(Date.now()/1000)+OTP_TTL,attempts:0}); try { await gmailSendOtp(code); return new Response(JSON.stringify({ok:true,message:'otp_sent'}),{status:200,headers:{...corsHeaders(origin),...securityHeaders(),'Access-Control-Allow-Credentials':'true','Set-Cookie':otpSet('otp_state',state,OTP_TTL),'Content-Type':'application/json'}}); } catch(e) { return json({error:e.message==='gmail_otp_not_configured'?'gmail_otp_not_configured':'gmail_send_failed'},502,origin); } }
    if (path === '/otp/verify' && method === 'POST') { const input=await request.json().catch(()=>({})); const state=await otpRead(request,'otp_state'); if(!state || state.exp<Math.floor(Date.now()/1000)) return json({error:'otp_expired'},401,origin); if(state.attempts>=OTP_MAX_ATTEMPTS) return json({error:'otp_locked'},429,origin); if(String(input.code||'')!==String(state.code)) { state.attempts++; const next=await otpCookie(state); return new Response(JSON.stringify({error:'otp_invalid',attempts_left:Math.max(0,OTP_MAX_ATTEMPTS-state.attempts)}),{status:401,headers:{...corsHeaders(origin),...securityHeaders(),'Access-Control-Allow-Credentials':'true','Set-Cookie':otpSet('otp_state',next,Math.max(1,state.exp-Math.floor(Date.now()/1000))),'Content-Type':'application/json'}}); } const admin=await otpCookie({email:OTP_ADMIN_EMAIL,exp:Math.floor(Date.now()/1000)+86400}); return new Response(JSON.stringify({ok:true,authenticated:true}),{status:200,headers:{...corsHeaders(origin),...securityHeaders(),'Access-Control-Allow-Credentials':'true','Set-Cookie':[otpSet('admin_session',admin,86400),otpSet('otp_state','',0)].join(', '),'Content-Type':'application/json'}}); }
    if (path === '/otp/logout' && method === 'POST') return new Response(JSON.stringify({ok:true}),{status:200,headers:{...corsHeaders(origin),...securityHeaders(),'Access-Control-Allow-Credentials':'true','Set-Cookie':[otpSet('admin_session','',0),otpSet('otp_state','',0)].join(', '),'Content-Type':'application/json'}});

    // ========== AUTH ENDPOINTS ==========
    if (path === '/device/code' && method === 'POST') {
      const input = await request.json().catch(() => ({}));
      const clientId = input.client_id || input.clientId;
      if (!GITHUB_CLIENT_IDS.includes(clientId)) return json({ error: 'invalid_client_id' }, 400, origin);
      return githubJson('https://github.com/login/device/code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scope: input.scope || DEFAULT_SCOPE })
      }, origin);
    }

    if (path === '/token' && method === 'POST') {
      const input = await request.json().catch(() => ({}));
      const clientId = input.client_id || input.clientId;
      const deviceCode = input.device_code || input.deviceCode || input.code;
      if (![GITHUB_CLIENT_ID, LEGACY_CLIENT_ID].includes(clientId) || !deviceCode)
        return json({ error: 'invalid_request', message: 'client_id and device_code are required' }, 400, origin);
      const body = { client_id: clientId, device_code: deviceCode, grant_type: input.grant_type || 'urn:ietf:params:oauth:grant-type:device_code' };
      const secret = clientSecret(); if (secret) body.client_secret = secret;
      const response = await githubJson('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, origin);
      const data = await response.clone().json().catch(() => ({}));
      return data.access_token ? withSessionCookie(response, data.access_token) : response;
    }
    if (path === '/token/refresh' && method === 'POST') {
      const input = await request.json().catch(() => ({}));
      if (input.client_id !== GITHUB_CLIENT_ID || !input.refresh_token)
        return json({ error: 'invalid_request', message: 'client_id and refresh_token are required' }, 400, origin);
      const body = { client_id: GITHUB_CLIENT_ID, refresh_token: input.refresh_token, grant_type: 'refresh_token' };
      const secret = clientSecret(); if (secret) body.client_secret = secret;
      return githubJson('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, origin);
    }

    if (path === '/token/revoke' && method === 'POST') {
      const input = await request.json().catch(() => ({}));
      const revokeToken = input.token || input.access_token || (getCookie(request, 'gh_session') || '');
      if (!revokeToken) return withSessionCookie(json({ ok: true, logged_out: true }, 200, origin), '', true);
      const response = await githubJson(GITHUB_API + '/applications/' + GITHUB_CLIENT_ID + '/token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: basicAuthHeader(), 'User-Agent': USER_AGENT },
        body: JSON.stringify({ access_token: revokeToken })
      }, origin);
      return withSessionCookie(response, '', true);
    }

    if (path === '/token/check' && method === 'GET') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      return githubJson(GITHUB_API + '/applications/' + GITHUB_CLIENT_ID + '/token', {
        headers: { Authorization: basicAuthHeader(), 'User-Agent': USER_AGENT }
      }, origin);
    }

    // ========== GRAPHQL PROXY ==========
    if (path === '/graphql' && method === 'POST') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const body = await request.text();
      return githubJson(GITHUB_API + '/graphql', {
        method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body
      }, origin);
    }

    // ========== GENERIC PROXY ==========
    if (path.startsWith('/proxy/') || path === '/proxy') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const apiPath = path.replace(/^\/proxy/, '');
      const targetUrl = buildUrl(GITHUB_API + apiPath, sp);
      const headers = { Authorization: bearer, 'User-Agent': USER_AGENT };
      if (method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json';
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') init.body = await request.text();
      return githubJson(targetUrl, init, origin);
    }

    // ========== AUTHENTICATED USER ENDPOINTS ==========
    const authedRoutes = {
      '/user': GITHUB_API + '/user',
      '/user/emails': GITHUB_API + '/user/emails',
      '/user/orgs': GITHUB_API + '/user/orgs',
      '/user/repos': GITHUB_API + '/user/repos',
      '/user/followers': GITHUB_API + '/user/followers',
      '/user/following': GITHUB_API + '/user/following',
      '/user/starred': GITHUB_API + '/user/starred',
      '/user/subscriptions': GITHUB_API + '/user/subscriptions',
      '/user/installations': GITHUB_API + '/user/installations',
      '/user/blocks': GITHUB_API + '/user/blocks',
      '/user/gpg_keys': GITHUB_API + '/user/gpg_keys',
      '/user/ssh_signing_keys': GITHUB_API + '/user/ssh_signing_keys',
      '/user/keys': GITHUB_API + '/user/keys',
      '/user/social_accounts': GITHUB_API + '/user/social_accounts',
      '/user/packages': GITHUB_API + '/user/packages',
      '/user/migrations': GITHUB_API + '/user/migrations',
      '/rate-limit': GITHUB_API + '/rate_limit',
      '/notifications': GITHUB_API + '/notifications',
      '/gists': GITHUB_API + '/gists',
      '/gists/public': GITHUB_API + '/gists/public',
      '/gists/starred': GITHUB_API + '/gists/starred'
    };

    if (authedRoutes[path] && method === 'GET') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      return githubJson(buildUrl(authedRoutes[path], sp), { headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
    }

    if (path === '/notifications' && method === 'PUT') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      return githubJson(GITHUB_API + '/notifications', { method: 'PUT', headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
    }

    if (path === '/gists' && method === 'POST') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const body = await request.text();
      return githubJson(GITHUB_API + '/gists', { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body }, origin);
    }

    // ========== SEARCH ==========
    const searchRoutes = {
      '/search/repositories': GITHUB_API + '/search/repositories',
      '/search/code': GITHUB_API + '/search/code',
      '/search/users': GITHUB_API + '/search/users',
      '/search/issues': GITHUB_API + '/search/issues',
      '/search/commits': GITHUB_API + '/search/commits',
      '/search/labels': GITHUB_API + '/search/labels',
      '/search/topics': GITHUB_API + '/search/topics',
      '/search/discussions': GITHUB_API + '/search/discussions'
    };
    if (searchRoutes[path] && method === 'GET') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      if (!sp.get('q')) return json({ error: 'missing_query', message: 'q parameter is required' }, 400, origin);
      return githubJson(buildUrl(searchRoutes[path], sp), { headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
    }

    // ========== META ENDPOINTS ==========
    const metaRoutes = { '/meta': GITHUB_API + '/meta', '/emojis': GITHUB_API + '/emojis', '/zen': GITHUB_API + '/zen', '/gitignore/templates': GITHUB_API + '/gitignore/templates', '/licenses': GITHUB_API + '/licenses', '/feeds': GITHUB_API + '/feeds', '/events': GITHUB_API + '/events' };
    if (metaRoutes[path] && method === 'GET') {
      const bearer = getBearer(request);
      const headers = { 'User-Agent': USER_AGENT };
      if (bearer) headers.Authorization = bearer;
      return githubJson(metaRoutes[path], { headers }, origin);
    }

    if (path === '/markdown' && method === 'POST') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const body = await request.text();
      return githubJson(GITHUB_API + '/markdown', { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body }, origin);
    }
    if (path === '/markdown/raw' && method === 'POST') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const body = await request.text();
      return githubJson(GITHUB_API + '/markdown/raw', { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT }, body }, origin);
    }

    const gitignoreMatch = path.match(/^\/gitignore\/templates\/([\w.-]+)$/);
    if (gitignoreMatch && method === 'GET') {
      const bearer = getBearer(request);
      const headers = { 'User-Agent': USER_AGENT };
      if (bearer) headers.Authorization = bearer;
      return githubJson(GITHUB_API + '/gitignore/templates/' + gitignoreMatch[1], { headers }, origin);
    }

    const licenseMatch = path.match(/^\/licenses\/([\w.-]+)$/);
    if (licenseMatch && method === 'GET') {
      const bearer = getBearer(request);
      const headers = { 'User-Agent': USER_AGENT };
      if (bearer) headers.Authorization = bearer;
      return githubJson(GITHUB_API + '/licenses/' + licenseMatch[1], { headers }, origin);
    }

    // ========== REPOSITORY CREATION ==========
    if (path === '/repos/create' && method === 'POST') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const body = await request.text();
      const input = JSON.parse(body);
      const endpoint = input.org ? GITHUB_API + '/orgs/' + input.org + '/repos' : GITHUB_API + '/user/repos';
      return githubJson(endpoint, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body }, origin);
    }

    // ========== DYNAMIC ROUTES ==========

    // /repos/:owner/:repo/*
    const repoMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)(.*)$/);
    if (repoMatch) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = buildUrl(GITHUB_API + '/repos/' + repoMatch[1] + '/' + repoMatch[2] + (repoMatch[3] || ''), sp);
      const headers = { Authorization: bearer, 'User-Agent': USER_AGENT };
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') { headers['Content-Type'] = 'application/json'; init.body = await request.text(); }
      return githubJson(target, init, origin);
    }

    // /user/starred/:owner/:repo
    const starMatch = path.match(/^\/user\/starred\/([^/]+)\/([^/]+)$/);
    if (starMatch) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = GITHUB_API + '/user/starred/' + starMatch[1] + '/' + starMatch[2];
      if (method === 'PUT') return githubJson(target, { method: 'PUT', headers: { Authorization: bearer, 'User-Agent': USER_AGENT, 'Content-Length': '0' } }, origin);
      if (method === 'DELETE') return githubJson(target, { method: 'DELETE', headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
      if (method === 'GET') return githubJson(target, { headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
    }

    // /user/following/:username
    const followMatch = path.match(/^\/user\/following\/([^/]+)$/);
    if (followMatch) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = GITHUB_API + '/user/following/' + followMatch[1];
      if (method === 'PUT') return githubJson(target, { method: 'PUT', headers: { Authorization: bearer, 'User-Agent': USER_AGENT, 'Content-Length': '0' } }, origin);
      if (method === 'DELETE') return githubJson(target, { method: 'DELETE', headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
      if (method === 'GET') return githubJson(target, { headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
    }

    // /notifications/threads/:id/*
    const threadMatch = path.match(/^\/notifications\/threads\/([\w-]+)(.*)$/);
    if (threadMatch) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = GITHUB_API + '/notifications/threads/' + threadMatch[1] + (threadMatch[2] || '');
      const headers = { Authorization: bearer, 'User-Agent': USER_AGENT };
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') { headers['Content-Type'] = 'application/json'; init.body = await request.text(); }
      return githubJson(target, init, origin);
    }

    // /gists/:id/*
    const gistMatch = path.match(/^\/gists\/([a-f0-9]+)(.*)$/);
    if (gistMatch && !['public','starred'].includes(gistMatch[1])) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = GITHUB_API + '/gists/' + gistMatch[1] + (gistMatch[2] || '');
      const headers = { Authorization: bearer, 'User-Agent': USER_AGENT };
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') { headers['Content-Type'] = 'application/json'; init.body = await request.text(); }
      return githubJson(target, init, origin);
    }

    // /orgs/:org/*
    const orgMatch = path.match(/^\/orgs\/([^/]+)(.*)$/);
    if (orgMatch) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = buildUrl(GITHUB_API + '/orgs/' + orgMatch[1] + (orgMatch[2] || ''), sp);
      const headers = { Authorization: bearer, 'User-Agent': USER_AGENT };
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') { headers['Content-Type'] = 'application/json'; init.body = await request.text(); }
      return githubJson(target, init, origin);
    }

    // /users/:username/*
    const userMatch = path.match(/^\/users\/([^/]+)(.*)$/);
    if (userMatch) {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token' }, 401, origin);
      const target = buildUrl(GITHUB_API + '/users/' + userMatch[1] + (userMatch[2] || ''), sp);
      return githubJson(target, { headers: { Authorization: bearer, 'User-Agent': USER_AGENT } }, origin);
    }

    // ========== ONECOMPILER DIRECT PUBLISH ==========
    if (path === '/publish' && method === 'POST') {
      const bearer = getBearer(request);
      if (!bearer) return json({ error: 'missing_token', message: 'Sign in on Hosting Studio first.' }, 401, origin);
      const input = await request.json().catch(() => ({}));
      const owner = String(input.owner || '').trim();
      const repo = String(input.repo || '').trim();
      const branch = String(input.branch || 'main').trim();
      const message = String(input.message || 'Publish from OneCompiler').trim();
      const rawFiles = Array.isArray(input.files) ? input.files : Object.entries(input.files || {}).map(([path, content]) => ({path, content}));
      if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_.\/-]+$/.test(branch) || !rawFiles.length) return json({ error: 'invalid_publish_request', message: 'owner, repo, branch and files are required' }, 400, origin);
      const results=[];
      for (const file of rawFiles) {
        const filePath=String(file.path || '').replace(/^\/+/, '');
        if (!filePath || filePath.includes('..')) return json({error:'invalid_file_path',path:filePath},400,origin);
        const target=GITHUB_API+'/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/contents/'+filePath.split('/').map(encodeURIComponent).join('/');
        let sha;
        const existing=await fetch(target+'?ref='+encodeURIComponent(branch),{headers:{Accept:'application/vnd.github+json',Authorization:bearer,'User-Agent':USER_AGENT}});
        if(existing.ok){const old=await existing.json(); sha=old.sha;}
        const content=String(file.content ?? '');
        const bytes=new TextEncoder().encode(content); let binary=''; for(const b of bytes) binary+=String.fromCharCode(b);
        const payload={message,content:btoa(binary),branch}; if(sha) payload.sha=sha;
        const saved=await githubJson(target,{method:'PUT',headers:{Authorization:bearer,'User-Agent':USER_AGENT,'Content-Type':'application/json'},body:JSON.stringify(payload)},origin);
        if(!saved.ok) return saved;
        results.push({path:filePath,sha:(await saved.clone().json().catch(()=>({}))).content?.sha || null});
      }
      return json({ok:true,published:true,owner,repo,branch,files:results},200,origin);
    }

    // --- 404 ---
    return json({ error: 'not_found', message: 'Route ' + method + ' ' + path + ' not found', hint: 'GET / for full API listing, or use /proxy/* for any GitHub API endpoint', version: PROXY_VERSION }, 404, origin);

  } catch (error) {
    return json({ error: 'proxy_error', message: error.message, version: PROXY_VERSION }, 500, origin);
  }
}

addEventListener('fetch', event => event.respondWith(handle(event.request)));
