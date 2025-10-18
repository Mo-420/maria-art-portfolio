// Gallery Management
class ArtGallery {
    constructor() {
        this.artworks = JSON.parse(localStorage.getItem('artworks')) || [];
        this.currentFilter = 'all';
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadArtworks();
    }

    bindEvents() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Add active class to navigation links based on scroll position
        window.addEventListener('scroll', () => {
            const sections = document.querySelectorAll('section[id]');
            const navLinks = document.querySelectorAll('.nav-links a');
            
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (scrollY >= (sectionTop - 200)) {
                    current = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${current}`) {
                    link.classList.add('active');
                }
            });
        });
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        this.loadArtworks();
    }

    loadArtworks() {
        const galleryGrid = document.getElementById('galleryGrid');
        let filteredArtworks = this.artworks;

        // Apply filters
        if (this.currentFilter !== 'all') {
            if (this.currentFilter === 'available') {
                filteredArtworks = this.artworks.filter(artwork => artwork.price && artwork.price > 0);
            } else {
                filteredArtworks = this.artworks.filter(artwork => artwork.year.toString() === this.currentFilter);
            }
        }

        if (filteredArtworks.length === 0) {
            galleryGrid.innerHTML = '<div class="no-artworks">No artworks found. Check back soon for new pieces!</div>';
            return;
        }

        galleryGrid.innerHTML = '';
        filteredArtworks.forEach(artwork => {
            const artworkElement = this.createArtworkElement(artwork);
            galleryGrid.appendChild(artworkElement);
        });

        // Add animations
        this.animateGalleryItems();
    }

    createArtworkElement(artwork) {
        const div = document.createElement('div');
        div.className = 'artwork';
        div.innerHTML = `
            <img src="${artwork.imageUrl}" alt="${artwork.title}" loading="lazy" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='">
            <div class="artwork-content">
                <h3>${artwork.title}</h3>
                <div class="artwork-meta">
                    <p><strong>Year:</strong> ${artwork.year}</p>
                    <p><strong>Medium:</strong> ${artwork.medium}</p>
                    <p><strong>Size:</strong> ${artwork.size}</p>
                </div>
                <div class="artwork-description">
                    ${artwork.description}
                </div>
                ${artwork.price ? `<div class="artwork-price">$${artwork.price.toLocaleString()}</div>` : ''}
                <div class="artwork-actions">
                    <button class="btn-view" onclick="artGallery.viewArtwork('${artwork.id}')">View Details</button>
                    ${artwork.price ? `<button class="btn-inquire" onclick="artGallery.inquireAbout('${artwork.id}')">Inquire</button>` : ''}
                </div>
            </div>
        `;
        return div;
    }

    viewArtwork(artworkId) {
        const artwork = this.artworks.find(a => a.id == artworkId);
        if (artwork) {
            // Create modal or detailed view
            this.showArtworkModal(artwork);
        }
    }

    inquireAbout(artworkId) {
        const artwork = this.artworks.find(a => a.id == artworkId);
        if (artwork) {
            // Open contact form or email
            const subject = `Inquiry about "${artwork.title}"`;
            const body = `Hello Maria,\n\nI'm interested in learning more about "${artwork.title}" (${artwork.year}).\n\nPlease provide more information about availability and pricing.\n\nThank you!`;
            window.location.href = `mailto:maria@art.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }
    }

    showArtworkModal(artwork) {
        // Simple modal implementation
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 10px; max-width: 600px; max-height: 80vh; overflow-y: auto; position: relative;">
                <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 1rem; right: 1rem; background: #e74c3c; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer;">×</button>
                <img src="${artwork.imageUrl}" alt="${artwork.title}" style="width: 100%; height: 300px; object-fit: cover; border-radius: 5px; margin-bottom: 1rem;">
                <h2>${artwork.title}</h2>
                <p><strong>Year:</strong> ${artwork.year}</p>
                <p><strong>Medium:</strong> ${artwork.medium}</p>
                <p><strong>Size:</strong> ${artwork.size}</p>
                ${artwork.price ? `<p><strong>Price:</strong> $${artwork.price.toLocaleString()}</p>` : ''}
                <p><strong>Description:</strong></p>
                <p>${artwork.description}</p>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    animateGalleryItems() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        const galleryItems = document.querySelectorAll('.artwork');
        galleryItems.forEach(item => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            item.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(item);
        });
    }
}

// Initialize the gallery when the page loads
let artGallery;
document.addEventListener('DOMContentLoaded', () => {
    artGallery = new ArtGallery();
});
