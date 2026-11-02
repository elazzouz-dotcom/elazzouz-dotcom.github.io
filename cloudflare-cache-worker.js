const IMMUTABLE_ASSETS = /\.(?:css|js|mjs|png|jpe?g|webp|svg|ico|woff2?)(?:$|\?)/i;
const JSON_DATA = /\.(?:json|xml|txt)(?:$|\?)/i;

function cachePolicy(url) {
  const hasVersion = url.searchParams.has('v');
  if (IMMUTABLE_ASSETS.test(url.pathname) && hasVersion) {
    return 'public, max-age=31536000, immutable';
  }
  if (IMMUTABLE_ASSETS.test(url.pathname)) {
    return 'public, max-age=86400, stale-while-revalidate=604800';
  }
  if (JSON_DATA.test(url.pathname)) {
    return 'public, max-age=0, must-revalidate';
  }
  return 'public, max-age=0, must-revalidate';
}

function isHtml(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const requestUrl = new URL(request.url);
    const origin = new URL(env.ORIGIN_URL || 'https://elazzouz-dotcom.github.io');
    const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, origin);
    const upstreamRequest = new Request(upstreamUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow'
    });
    const upstream = await fetch(upstreamRequest);
    const headers = new Headers(upstream.headers);
    const policy = cachePolicy(upstreamUrl);
    headers.set('Cache-Control', isHtml(upstream) ? 'public, max-age=0, must-revalidate' : policy);
    headers.set('X-Slaks-Cache-Policy', isHtml(upstream) ? 'html-revalidate' : policy);
    headers.delete('Set-Cookie');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  }
};
