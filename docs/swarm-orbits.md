# Slaks Swarm Access Orbits

## Orbit 1: first-party site

`elazzouz-dotcom.github.io` is the unrestricted first-party orbit. The simulation can use its own DOM, Canvas, Service Worker, IndexedDB and localStorage within normal browser permissions.

## Orbit 2: official APIs

Google, Bing, GitHub and similar services belong to the consented API orbit. Slaks must use the provider’s documented API, an authorized credential, the provider’s rate limits and its terms. The static site does not scrape these services, bypass login, proxy CORS, or guess credentials.

## Orbit 3: isolated sandbox

Third-party previews belong in a sandboxed iframe or equivalent isolated context. The default policy is no same-origin access and no unrestricted script access. Data crosses the boundary only through an explicit, validated `postMessage` protocol with a fixed origin allowlist.

These are architectural boundaries, not a guarantee that any external site can be accessed. Browser security, provider permissions and user consent still apply.
