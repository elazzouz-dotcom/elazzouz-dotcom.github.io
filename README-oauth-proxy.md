# GitHub OAuth Proxy v4.0.0

**Ultimate full-featured GitHub OAuth proxy with complete API coverage**

A comprehensive Cloudflare Worker-based OAuth proxy that enables secure GitHub authentication and full API access from static sites without exposing client secrets.

## 🌟 Features

### Authentication
- ✅ Device Flow (for CLI and limited-input devices)
- ✅ OAuth Code Exchange
- ✅ Token Refresh
- ✅ Token Revocation
- ✅ Token Validation

### API Coverage

#### User Endpoints
- Profile, emails, organizations
- Repositories, followers, following
- Starred repos, subscriptions
- Installations, blocked users
- GPG keys, SSH keys, SSH signing keys
- Social accounts, packages, migrations

#### Repository Operations
- Create repositories
- Full repository API (branches, commits, issues, PRs)
- Releases, contents, languages, contributors
- README, stargazers, forks, tags, topics
- Traffic data, actions, webhooks, git-data

#### Gists
- List, create, update, delete
- Fork, star, comments

#### Search
- Repositories, code, users
- Issues/PRs, commits
- Labels, topics, discussions

#### Actions
- Workflows, runs, artifacts
- Dispatch, rerun, cancel, logs

#### Notifications
- List notifications
- Mark as read
- Thread operations

#### Interactions
- Star/unstar repositories
- Follow/unfollow users

#### Meta
- GitHub meta, emojis
- Markdown rendering
- Gitignore templates, licenses
- Rate limits, zen, feeds, events

#### Advanced
- GraphQL proxy
- Generic proxy for any GitHub API endpoint
- Organization API
- Public user API

## 📋 Prerequisites

1. **GitHub OAuth App**
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Create a new OAuth App
   - Note your Client ID and Client Secret

2. **Cloudflare Account**
   - Free tier is sufficient
   - Access to Cloudflare Workers

## 🚀 Deployment

### Step 1: Create Cloudflare Worker

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages**
3. Click **Create Application** → **Create Worker**
4. Name it (e.g., `github-oauth-proxy`)
5. Click **Deploy**

### Step 2: Configure Environment Variables

1. In your worker's dashboard, go to **Settings** → **Variables**
2. Add environment variable:
   - **Variable name:** `CLIENT_SECRET`
   - **Value:** Your GitHub OAuth App Client Secret
   - **Type:** Secret (encrypted)
3. Click **Save**

### Step 3: Deploy Worker Code

#### Option A: Via Dashboard
1. Go to your worker
2. Click **Quick Edit**
3. Copy the entire content of `cloudflare-worker-oauth-proxy.js`
4. Paste it into the editor
5. Click **Save and Deploy**

#### Option B: Via Wrangler CLI

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create wrangler.toml
cat > wrangler.toml << EOF
name = "github-oauth-proxy"
main = "cloudflare-worker-oauth-proxy.js"
compatibility_date = "2024-01-01"

[vars]
# CLIENT_ID is public and can be in the code
# CLIENT_SECRET must be set via dashboard or wrangler secret
EOF

# Set the secret
wrangler secret put CLIENT_SECRET
# Enter your GitHub OAuth App Client Secret when prompted

# Deploy
wrangler deploy
```

### Step 4: Update GitHub OAuth App

1. Go back to your [GitHub OAuth App settings](https://github.com/settings/developers)
2. Update **Authorization callback URL** to:
   ```
   https://your-worker-name.your-subdomain.workers.dev/callback
   ```
   (Replace with your actual worker URL)

### Step 5: Test Your Deployment

```bash
# Test the root endpoint
curl https://your-worker-name.your-subdomain.workers.dev/

# Should return API information
```

## 📖 API Reference

### Configuration

```json
{
  "name": "GitHub OAuth Proxy",
  "version": "4.0.0",
  "client_id": "Ov23li9xlu3kRKACL6Tz",
  "default_scope": "read:user user:email repo"
}
```

### Authentication Endpoints

#### Initiate Device Flow

```http
POST /device/code
Content-Type: application/json

{
  "scope": "read:user user:email repo"
}
```

**Response:**
```json
{
  "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://github.com/login/device",
  "expires_in": 900,
  "interval": 5
}
```

#### Exchange Code for Token

```http
POST /token
Content-Type: application/json

{
  "client_id": "Ov23li9xlu3kRKACL6Tz",
  "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}
```

**Response:**
```json
{
  "access_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a",
  "token_type": "bearer",
  "scope": "read:user,user:email,repo"
}
```

#### Refresh Token

```http
POST /token/refresh
Content-Type: application/json

{
  "refresh_token": "ghr_1B4a2e77838347a7E420ce178f2E7c6912E169246c34E1ccbF66C46812d16D5B1A9Dc86A1498"
}
```

#### Revoke Token

```http
POST /token/revoke
Content-Type: application/json

{
  "access_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a"
}
```

#### Check Token Validity

```http
GET /token/check
Authorization: Bearer gho_16C7e42F292c6912E7710c838347Ae178B4a
```

**Response:**
```json
{
  "valid": true,
  "user": "username",
  "scopes": "read:user,user:email,repo"
}
```

### User Endpoints

All standard GitHub user endpoints are supported:

```http
GET /user
GET /user/emails
GET /user/repos
GET /user/orgs
GET /user/followers
GET /user/following
GET /user/starred
GET /user/subscriptions
GET /user/installations
GET /user/blocks
GET /user/gpg_keys
GET /user/ssh_signing_keys
GET /user/keys
GET /user/social_accounts
GET /user/packages
GET /user/migrations

Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Repository Endpoints

```http
# Create repository
POST /repos/create
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "name": "my-new-repo",
  "description": "My repository description",
  "private": false
}

# Access any repository endpoint
GET /repos/:owner/:repo
GET /repos/:owner/:repo/branches
GET /repos/:owner/:repo/commits
GET /repos/:owner/:repo/issues
GET /repos/:owner/:repo/pulls
...
```

### Gists

```http
GET /gists
POST /gists
GET /gists/:id
PATCH /gists/:id
DELETE /gists/:id
POST /gists/:id/forks
PUT /gists/:id/star
DELETE /gists/:id/star
```

### Search

```http
GET /search/repositories?q=language:javascript
GET /search/code?q=addClass+user:mozilla
GET /search/users?q=tom+followers:>100
GET /search/issues?q=windows+state:open
GET /search/commits?q=css+repo:octocat/Spoon-Knife
GET /search/labels?q=bug+repo:nodejs/node
GET /search/topics?q=ruby
```

### Generic Proxy

Forward any GitHub API request:

```http
ANY /proxy/*

# Examples:
GET /proxy/rate_limit
GET /proxy/organizations
POST /proxy/repos/:owner/:repo/issues
```

## 🔒 Security Best Practices

### ✅ DO
- ✅ Store `CLIENT_SECRET` as an environment variable
- ✅ Use HTTPS for all communications
- ✅ Request minimal scopes needed
- ✅ Rotate tokens periodically
- ✅ Implement rate limiting if needed
- ✅ Monitor usage and logs

### ❌ DON'T
- ❌ Never expose `CLIENT_SECRET` in client-side code
- ❌ Don't store tokens in localStorage without encryption
- ❌ Don't request broader scopes than needed
- ❌ Don't share tokens across different apps
- ❌ Don't commit secrets to version control

## 💡 Usage Example (Frontend)

```javascript
const PROXY_URL = 'https://github-oauth-proxy.elazzouz4.workers.dev';
const CLIENT_ID = 'Ov23li9xlu3kRKACL6Tz';

// Step 1: Initiate Device Flow
const initResponse = await fetch(`${PROXY_URL}/device/code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scope: 'read:user user:email repo' })
});
const { device_code, user_code, verification_uri, interval } = await initResponse.json();

// Step 2: Show user_code to user and prompt to visit verification_uri
console.log(`Visit ${verification_uri} and enter code: ${user_code}`);

// Step 3: Poll for token
const pollInterval = setInterval(async () => {
  const tokenResponse = await fetch(`${PROXY_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  });
  
  const data = await tokenResponse.json();
  
  if (data.access_token) {
    clearInterval(pollInterval);
    console.log('Access token:', data.access_token);
    
    // Step 4: Use token to access GitHub API
    const userResponse = await fetch(`${PROXY_URL}/user`, {
      headers: { 'Authorization': `Bearer ${data.access_token}` }
    });
    const user = await userResponse.json();
    console.log('User:', user);
  }
}, interval * 1000);
```

## 📝 License

This implementation is provided as-is for use with GitHub's OAuth system. Ensure compliance with GitHub's Terms of Service and API usage guidelines.

## 🔗 Resources

- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
