# Maria's Art Portfolio

A beautiful, responsive art portfolio website with admin management capabilities.

## Features

- 🎨 **Art Gallery**: Showcase artwork with filtering and detailed views
- 📝 **Poetry Section**: Display poetry with themes and dates
- 🔐 **Admin Portal**: Secure content management system
- 📱 **Responsive Design**: Works on all devices
- ⚡ **Fast Loading**: Optimized for performance
- 🔒 **Secure**: Protected admin area with authentication

## Admin Access

- **URL**: `/admin.html`
- **Username**: `admin`
- **Password**: `mariaissocute`

## Deployment on Cloudflare Pages

### Method 1: Direct Upload
1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Click "Upload assets"
3. Upload all files from this directory
4. Your site will be live at `https://your-project.pages.dev`

### Method 2: Git Integration
1. Push this code to a GitHub repository
2. Connect your GitHub account to Cloudflare Pages
3. Select your repository
4. Build settings:
   - **Build command**: (leave empty)
   - **Build output directory**: `/`
   - **Root directory**: `/`

## File Structure

```
/
├── index.html          # Main portfolio page
├── admin.html          # Admin portal
├── styles.css          # Main styles
├── admin.css           # Admin styles
├── script.js           # Main JavaScript
├── admin.js            # Admin JavaScript
├── sample-data.js      # Sample data
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── _headers           # Cloudflare headers
├── _redirects         # URL redirects
├── robots.txt         # SEO robots file
├── sitemap.xml        # SEO sitemap
└── images/            # Image assets
```

## Customization

### Update Domain in Files
After deployment, update these files with your actual domain:
- `robots.txt` - Replace `your-domain.pages.dev`
- `sitemap.xml` - Replace `your-domain.pages.dev`

### Admin Security
- Change the admin password in `admin.js`
- Consider implementing proper backend authentication for production

## Performance Features

- **Service Worker**: Offline functionality
- **PWA Support**: Installable as an app
- **Optimized Images**: Responsive image loading
- **Caching**: Smart cache headers for fast loading

## Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers

## License

© 2024 Maria's Art Portfolio. All rights reserved.