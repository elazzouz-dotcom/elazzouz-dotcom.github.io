# GitHub sign-in from GitHub Pages

The homepage uses GitHub's Device Flow through the Cloudflare Worker at `github-oauth-proxy.elazzouz4.workers.dev`. It requests only `read:user user:email`, so the sign-in session does not grant repository-write access.

The Worker encrypts the GitHub access token inside a short-lived (four-hour) AES-GCM session using the Worker secret `SESSION_ENCRYPTION_KEY`. The browser receives only the opaque encrypted session, keeps it in page memory, and never writes it to `localStorage`. The Worker exposes `/auth/device/code`, `/auth/device/token`, `/auth/me`, and `/auth/logout` only to the production origin `https://elazzouz-dotcom.github.io`. Logout clears the in-memory session and reports whether GitHub revocation actually succeeded; otherwise the encrypted session naturally expires within four hours.

Set `SESSION_ENCRYPTION_KEY` in the Cloudflare Worker as a 32-byte random key encoded in Base64. Never commit this secret. Existing `CLIENT_SECRET` must remain configured as a Worker secret for token exchange and revocation.

This is an identity/session flow for browser features that call the Worker. GitHub Pages is static: it cannot require sign-in before serving the HTML, JavaScript, or other public assets. Each sensitive API or operation must independently validate the encrypted session on the server. Existing legacy `/token` and GitHub proxy endpoints are retained for compatibility and are separate from this new session API; do not use them as an authorization check for new protected operations.
