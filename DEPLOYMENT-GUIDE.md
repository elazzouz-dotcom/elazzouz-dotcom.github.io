# GitHub OAuth Proxy - Step-by-Step Deployment Guide

This guide will walk you through deploying the GitHub OAuth Proxy v4.0.0 to Cloudflare Workers.

## 📋 What You'll Need

- A GitHub account
- A Cloudflare account (free tier works)
- 10-15 minutes

## Step 1: Create GitHub OAuth App

### 1.1. Go to GitHub Developer Settings

1. Sign in to GitHub
2. Navigate to: https://github.com/settings/developers
3. Click **"OAuth Apps"** in the left sidebar
4. Click **"New OAuth App"**

### 1.2. Fill in Application Details

- **Application name:** `My GitHub OAuth Proxy` (or any name you prefer)
- **Homepage URL:** `https://your-domain.com` (your website URL)
- **Application description:** `OAuth proxy for secure GitHub API access`
- **Authorization callback URL:** `https://your-worker.workers.dev/callback`
  - ⚠️ You'll update this later with your actual worker URL

### 1.3. Register Application

1. Click **"Register application"**
2. **Copy your Client ID** - you'll need this later
3. Click **"Generate a new client secret"**
4. **Copy your Client Secret** immediately - it won't be shown again
   - ⚠️ Store this securely - never commit it to code!

✅ **Checkpoint:** You should now have:
- GitHub OAuth App created
- Client ID copied
- Client Secret copied and stored securely

---

## Step 2: Set Up Cloudflare Account

### 2.1. Create Cloudflare Account (if needed)

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with your email
3. Verify your email address

### 2.2. Access Workers Dashboard

1. Log in to https://dash.cloudflare.com/
2. Click **"Workers & Pages"** in the left sidebar
3. If prompted, complete the Workers setup

✅ **Checkpoint:** You're now in the Workers dashboard

---

## Step 3: Create Cloudflare Worker

### 3.1. Create New Worker

1. Click **"Create Application"**
2. Select **"Create Worker"**
3. Give it a name: `github-oauth-proxy` (or your preferred name)
   - This becomes part of your URL: `github-oauth-proxy.your-subdomain.workers.dev`
4. Click **"Deploy"**

### 3.2. Note Your Worker URL

After deployment, you'll see your worker URL:
```
https://github-oauth-proxy.your-subdomain.workers.dev
```

**Copy this URL** - you'll need it in the next steps.

✅ **Checkpoint:** Worker is created and you have the URL

---

## Step 4: Configure Worker Code

### 4.1. Edit Worker Code

1. In your worker's page, click **"Quick Edit"** or **"Edit Code"**
2. Delete all existing code in the editor
3. Open `cloudflare-worker-oauth-proxy.js` from this repository
4. Copy **all the code**
5. Paste it into the Cloudflare editor

### 4.2. Update Client ID (if different)

Find this line near the top of the code:
```javascript
const CLIENT_ID = 'Ov23li9xlu3kRKACL6Tz';
```

Replace with your Client ID if different:
```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
```

### 4.3. Save and Deploy

1. Click **"Save and Deploy"**
2. Wait for deployment to complete (usually a few seconds)

✅ **Checkpoint:** Worker code is deployed

---

## Step 5: Configure Client Secret

### 5.1. Add Environment Variable

1. Go back to your worker's main page
2. Click on **"Settings"** tab
3. Scroll down to **"Variables"**
4. Under "Environment Variables", click **"Add variable"**

### 5.2. Add CLIENT_SECRET

1. **Variable name:** `CLIENT_SECRET`
2. **Value:** Paste your GitHub OAuth App Client Secret
3. **Type:** Select **"Encrypt"** (this makes it a secret)
4. Click **"Save"**

⚠️ **Important:** Never put the Client Secret directly in your code!

✅ **Checkpoint:** CLIENT_SECRET is configured securely

---

## Step 6: Update GitHub OAuth App

### 6.1. Return to GitHub

1. Go back to https://github.com/settings/developers
2. Click on your OAuth App
3. Click **"Edit"** (if not already in edit mode)

### 6.2. Update Callback URL

1. Find **"Authorization callback URL"**
2. Replace with your actual worker URL:
   ```
   https://github-oauth-proxy.your-subdomain.workers.dev/callback
   ```
3. Click **"Update application"**

✅ **Checkpoint:** GitHub OAuth App is properly configured

---

## Step 7: Test Your Deployment

### 7.1. Test Root Endpoint

Open your browser and visit:
```
https://github-oauth-proxy.your-subdomain.workers.dev/
```

You should see JSON output like:
```json
{
  "name": "GitHub OAuth Proxy",
  "version": "4.0.0",
  "description": "Ultimate full-featured GitHub OAuth proxy with complete API coverage",
  ...
}
```

### 7.2. Test Device Flow (Optional)

You can test the device flow endpoint:
```bash
curl -X POST https://github-oauth-proxy.your-subdomain.workers.dev/device/code \
  -H "Content-Type: application/json" \
  -d '{"scope":"read:user"}'
```

You should receive a device code and verification URL.

✅ **Checkpoint:** Everything is working!

---

## 🎉 Deployment Complete!

Your GitHub OAuth Proxy is now live and ready to use. Check out `README-oauth-proxy.md` for full API documentation and usage examples.

### Next Steps

1. Update your frontend code to use the new proxy URL
2. Test authentication flows
3. Monitor usage in Cloudflare dashboard
4. Consider adding custom domain (optional)

### Need Help?

- Check the logs in Cloudflare Workers dashboard
- Review `README-oauth-proxy.md` for API reference
- Ensure CLIENT_SECRET is set correctly
- Verify callback URL matches exactly

## 🔒 Security Reminders

- ✅ CLIENT_SECRET is encrypted in Cloudflare
- ✅ Never commit CLIENT_SECRET to version control
- ✅ Use HTTPS for all communications
- ✅ Request minimal OAuth scopes needed
- ✅ Rotate secrets periodically
