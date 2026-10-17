from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
worker = (ROOT / "cloudflare-worker-oauth-proxy.js").read_text(encoding="utf-8")
frontend = (ROOT / "data-flow.js").read_text(encoding="utf-8")
home = (ROOT / "index.html").read_text(encoding="utf-8")

checks = {
    "auth origin is pinned to the production GitHub Pages origin": "const AUTH_ORIGIN = 'https://elazzouz-dotcom.github.io'" in worker,
    "device-code session endpoints are routed": all(f"'/auth/{endpoint}'" in worker for endpoint in ("device/code", "device/token", "me", "logout")),
    "server-side AES-GCM session encryption is used": "AES-GCM" in worker and "SESSION_ENCRYPTION_KEY" in worker,
    "server-side session lifetime is bounded": "const AUTH_SESSION_SECONDS = 4 * 60 * 60" in worker,
    "GitHub login requests identity-only scopes": "scope: 'read:user user:email'" in worker,
    "raw access token is not returned by the session endpoint": "return authJson(request, { ...session, user: profile })" in worker and "access_token: result.access_token" not in worker,
    "frontend does not persist a GitHub token in localStorage": "localStorage" not in frontend and "session = result.session" in frontend,
    "user is warned that static pages remain public": "الموقع وصفحاته العامة تبقى متاحة للجميع" in home,
    "logout control exists": 'id="home-github-logout"' in home,
}
failed = [name for name, passed in checks.items() if not passed]
for name, passed in checks.items():
    print(f"{'OK' if passed else 'FAIL'}: {name}")
if failed:
    raise SystemExit(1)
