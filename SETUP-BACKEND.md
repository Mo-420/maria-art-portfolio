# Setting Up Cloudflare Workers + KV for Data Storage

Currently, the admin portal uses localStorage which only works in the same browser. To make changes visible to all visitors, we need to set up Cloudflare Workers + KV storage.

## Quick Setup Steps

### 1. Create KV Namespace
1. Go to Cloudflare Dashboard → Workers & Pages → KV
2. Click "Create a namespace"
3. Name it `ART_DATA`
4. Note the namespace ID

### 2. Create Worker
1. Go to Workers & Pages → Create application → Create Worker
2. Name it `data-api` (or any name)
3. Copy the code from `cloudflare-worker.js` into the worker
4. Click "Save and deploy"

### 3. Bind KV Namespace to Worker
1. In your worker settings, go to "Variables and Secrets"
2. Under "KV Namespace Bindings", click "Add binding"
3. Variable name: `ART_DATA`
4. KV namespace: Select `ART_DATA`
5. Save

### 4. Update API URL
1. Get your worker URL (e.g., `data-api.your-username.workers.dev`)
2. Update `data-api.js` with your worker URL:
   ```javascript
   this.apiUrl = 'https://data-api.your-username.workers.dev';
   ```

### 5. Add to Your Site
1. Include `data-api.js` in both `admin.html` and `index.html`
2. Update `admin.js` to use `DataAPI` instead of direct localStorage
3. Update `script.js` to load from API instead of localStorage

## Alternative: Simple JSON File Approach

If you don't want to set up Workers, you can:
1. Store data in a `data.json` file in your repo
2. Have admin portal commit changes via GitHub API
3. Main site loads from `data.json`

This requires GitHub authentication but is simpler than Workers.

## Current Limitation

Right now, localStorage only works:
- ✅ On the same browser/device
- ✅ Between admin.html and index.html on the same domain
- ❌ NOT across different browsers/devices
- ❌ NOT for other visitors

