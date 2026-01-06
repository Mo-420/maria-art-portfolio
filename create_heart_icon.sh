#!/bin/bash
# Create heart icon using ImageMagick or convert command

create_heart_svg() {
    local size=$1
    local output=$2
    
    cat > "$output" << EOF
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff1493;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ff69b4;stop-opacity:1" />
    </linearGradient>
  </defs>
  <path d="M ${size/2},${size*0.4}
           C ${size*0.3},${size*0.2} ${size*0.15},${size*0.3} ${size*0.15},${size*0.5}
           C ${size*0.15},${size*0.7} ${size*0.3},${size*0.85} ${size/2},${size*0.95}
           C ${size*0.7},${size*0.85} ${size*0.85},${size*0.7} ${size*0.85},${size*0.5}
           C ${size*0.85},${size*0.3} ${size*0.7},${size*0.2} ${size/2},${size*0.4}
           Z" 
        fill="url(#heartGrad)" 
        stroke="white" 
        stroke-width="${size/64}" 
        stroke-linejoin="round"/>
</svg>
EOF
}

# Create heart icons for different densities
sizes=("mdpi:48" "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192")

for size_info in "${sizes[@]}"; do
    IFS=':' read -r density size <<< "$size_info"
    dir="android/app/src/main/res/mipmap-${density}"
    mkdir -p "$dir"
    
    # Create SVG
    svg_file="${dir}/heart.svg"
    create_heart_svg "$size" "$svg_file"
    
    # Try to convert SVG to PNG if ImageMagick is available
    if command -v convert &> /dev/null; then
        convert -background none -size "${size}x${size}" "$svg_file" "${dir}/ic_launcher.png"
        convert -background none -size "${size}x${size}" "$svg_file" "${dir}/ic_launcher_round.png"
        convert -background none -size "${size}x${size}" "$svg_file" "${dir}/ic_launcher_foreground.png"
        echo "Created PNG icons for ${density}"
    else
        echo "ImageMagick not found. SVG created at ${svg_file}"
        echo "Please install ImageMagick or convert SVG to PNG manually"
    fi
done

