#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist

public_files=(
  index.html
  portfolio.html
  checkout-success.html
  admin.html
  styles.css
  store-warm.css
  store-final.css
  store-review-panel.css
  maryilu-pro-max.css
  portfolio.css
  portfolio-review-panel.css
  admin.css
  admin-store-images.css
  admin-review-panel.css
  script.js
  portfolio.js
  admin.js
  instagram-fixtures.js
  data-api.js
  site-data.js
  manifest.json
  sw.js
  robots.txt
  sitemap.xml
  _headers
  _worker.js
  heart-icon.png
)

for file in "${public_files[@]}"; do
  if [[ -f "$file" ]]; then
    cp "$file" "dist/$file"
  fi
done

if [[ -d assets ]]; then
  mkdir -p dist/assets
  cp -R assets/. dist/assets/
fi

if [[ -d images ]]; then
  mkdir -p dist/images
  cp -R images/. dist/images/
fi

if [[ -d vendor ]]; then
  mkdir -p dist/vendor
  cp -R vendor/. dist/vendor/
fi

echo "Public site built in dist/"
