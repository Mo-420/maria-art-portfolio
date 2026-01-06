# Quick GitHub Deployment Guide

Since your repository is connected to GitHub (`Mo-420/maria-art-portfolio`), here's the simplest workflow:

## One-Time Setup (if not done already)

1. **Push your code to GitHub**:
   ```bash
   git push origin main
   ```

2. **Connect Cloudflare to GitHub** (if not already connected):
   - Go to https://dash.cloudflare.com → Pages
   - Click your project or "Create a project"
   - Select "Connect to Git" → GitHub
   - Choose `Mo-420/maria-art-portfolio`
   - Build settings:
     - Build command: (leave empty)
     - Build output directory: `/`
   - Click "Save and Deploy"

## Daily Workflow (After Setup)

1. **Make changes** to your files locally
2. **Test locally**: `./start-local.sh`
3. **Commit and push**:
   ```bash
   git add .
   git commit -m "Update gallery with new artwork"
   git push origin main
   ```
4. **Wait 1-2 minutes** - Cloudflare automatically deploys!
5. **Check** https://maryilu.com - your changes are live!

## That's It!

No manual uploads needed. Just push to GitHub and Cloudflare handles the rest! 🚀

