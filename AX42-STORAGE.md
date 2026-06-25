# Maryilu AX42 Image Storage

The public store and portfolio can stay on Cloudflare Pages while image uploads
live on AX42. The Cloudflare Worker keeps the existing API contract:

- admin uploads still call `/uploads/images`
- public images still load from `/media/...`
- site settings and shop items still save image URLs returned by the Worker

## Server Layout

Recommended AX42 path:

```text
/opt/maryilu-storage
├── Dockerfile
├── ax42-image-storage.mjs
├── docker-compose.ax42.yml
├── .env
└── data/media/
```

The `.env` file is not committed. It should contain:

```env
MARYILU_STORAGE_TOKEN=replace-with-secret-token
PUBLIC_BASE_URL=https://media.maryilu.com
```

## Worker Settings

Set these on the `maria-art-data-api` Worker:

```bash
wrangler secret put MARYILU_IMAGE_STORAGE_URL
wrangler secret put MARYILU_IMAGE_STORAGE_TOKEN
```

Use `https://media.maryilu.com` for the URL. Use the same secret token as the
AX42 `.env` file for the token.

## Routing

Route `media.maryilu.com` to AX42 through the dedicated Cloudflare Tunnel
`maryilu-media-ax42`, pointed at the Compose service:

```yaml
- hostname: media.maryilu.com
  service: http://maryilu-image-storage:18142
```

Run the tunnel container with Compose's env file loaded so the token is expanded:

```bash
docker compose --env-file .tunnel.env \
  -f docker-compose.ax42.yml \
  -f docker-compose.tunnel.ax42.yml \
  up -d
```

## Verification

After deployment:

```bash
curl https://media.maryilu.com/health
curl https://maria-art-data-api.maros-pristas.workers.dev/automation-status \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Then use the admin Store Images panel to upload one test image. The response
should return a `/media/shop-items/...` URL, and the public page should render
that image without using R2.
