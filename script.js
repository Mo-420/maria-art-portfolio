// Gallery Management
class ArtGallery {
    constructor() {
        this.dataAPI = new DataAPI();
        this.artworks = [];
        this.currentFilter = 'all';
        this.loadArtworksData();
    }

    async loadArtworksData() {
        this.artworks = await this.dataAPI.getArtworks();
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadArtworks();
        this.initMobileMenu();
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
                    // Close mobile menu if open
                    const navLinks = document.getElementById('navLinks');
                    const mobileToggle = document.getElementById('mobileMenuToggle');
                    if (navLinks.classList.contains('active')) {
                        navLinks.classList.remove('active');
                        mobileToggle.classList.remove('active');
                        mobileToggle.setAttribute('aria-expanded', 'false');
                        document.body.style.overflow = '';
                    }
                }
            });
        });

        // Add active class to navigation links based on scroll position
        window.addEventListener('scroll', () => {
            const sections = document.querySelectorAll('section[id]');
            const navLinks = document.querySelectorAll('.nav-links a');
            const header = document.querySelector('header');
            
            // Enhanced header on scroll
            if (window.scrollY > 100) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            
            // Dynamic header styling based on scroll position
            const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
            
            // Update text colors based on scroll position
            if (scrollPercent > 0.6) {
                // Dark sections - add class to body for white text
                document.body.classList.add('dark-scroll');
            } else {
                // Light sections - remove class for normal colors
                document.body.classList.remove('dark-scroll');
            }
            
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
            btn.setAttribute('aria-pressed', 'false');
        });
        const activeBtn = document.querySelector(`[data-filter="${filter}"]`);
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-pressed', 'true');
        
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
            <div class="artwork-image">
                ${this.getArtworkImageHTML(artwork)}
            </div>
            <div class="artwork-content">
                ${artwork.title ? `<h3>${artwork.title}</h3>` : ''}
                <div class="artwork-meta">
                    ${artwork.year ? `<span>${artwork.year}</span>` : ''}
                    ${artwork.medium ? `<span>${artwork.medium}</span>` : ''}
                    ${artwork.size ? `<span>${artwork.size}</span>` : ''}
                </div>
                <div class="artwork-description">
                    ${artwork.description}
                </div>
                ${artwork.price && artwork.price > 0 ? `<div class="artwork-price">$${artwork.price.toLocaleString()}</div>` : artwork.price === 0 ? `<div class="artwork-price">Not for sale</div>` : ''}
                <div class="artwork-actions">
                    <button class="btn-view" onclick="artGallery.viewArtwork('${artwork.id}')">View</button>
                    <button class="btn-inquire" onclick="artGallery.inquireAbout('${artwork.id}')">Inquire</button>
                </div>
            </div>
        `;
        // Add scroll event listener for manual scrolling
        setTimeout(() => {
            const carousel = div.querySelector('.image-scroll-container');
            if (carousel) {
                carousel.addEventListener('scroll', () => {
                    const indicators = div.querySelectorAll('.indicator');
                    const images = div.querySelectorAll('.carousel-image');
                    this.updateCarouselIndicators(carousel, indicators, images);
                });
            }
        }, 100);

        return div;
    }

    getArtworkImageHTML(artwork) {
        const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        
        // Handle multiple images with scrolling
        if (artwork.images && artwork.images.length > 0) {
            if (artwork.images.length === 1) {
                return this.createResponsiveImage(artwork.images[0], artwork.title, placeholderImage);
            } else {
                return `
                    <div class="image-carousel">
                        <div class="image-scroll-container">
                            ${artwork.images.map((img, index) => 
                                this.createResponsiveImage(img, `${artwork.title} - Image ${index + 1}`, placeholderImage, `carousel-image ${index === 0 ? 'active' : ''}`)
                            ).join('')}
                        </div>
                        <div class="carousel-indicators">
                            ${artwork.images.map((_, index) => 
                                `<span class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`
                            ).join('')}
                        </div>
                        <div class="carousel-nav">
                            <button class="carousel-prev" onclick="artGallery.scrollCarousel(this, -1)" aria-label="Previous image">‹</button>
                            <button class="carousel-next" onclick="artGallery.scrollCarousel(this, 1)" aria-label="Next image">›</button>
                        </div>
                    </div>
                `;
            }
        }
        // Handle legacy single image
        else if (artwork.imageUrl) {
            return this.createResponsiveImage(artwork.imageUrl, artwork.title, placeholderImage);
        }
        // No images
        else {
            return `
                <div class="no-image-placeholder">
                    <div class="placeholder-icon">🎨</div>
                    <div class="placeholder-text">No Image</div>
                </div>
            `;
        }
    }

    createResponsiveImage(src, alt, placeholder, className = '') {
        // For demo purposes, we'll use the same image for all sizes
        // In a real implementation, you would have different sized versions
        const sizes = '(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw';
        const srcset = `${src} 480w, ${src} 768w, ${src} 1200w`;
        
        return `<img 
            src="${src}" 
            srcset="${srcset}"
            sizes="${sizes}"
            alt="${alt}" 
            loading="lazy" 
            class="${className}"
            onerror="this.src='${placeholder}'"
            style="width: 100%; height: 100%; object-fit: cover;">`;
    }

    getModalImageHTML(artwork) {
        const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        
        // Handle multiple images in modal
        if (artwork.images && artwork.images.length > 0) {
            if (artwork.images.length === 1) {
                return this.createResponsiveImage(artwork.images[0], artwork.title, placeholderImage, 'artwork-modal-image');
            } else {
                return `
                    <div class="modal-image-carousel">
                        <div class="modal-image-scroll-container">
                            ${artwork.images.map((img, index) => 
                                this.createResponsiveImage(img, `${artwork.title} - Image ${index + 1}`, placeholderImage, `artwork-modal-image ${index === 0 ? 'active' : ''}`)
                            ).join('')}
                        </div>
                        <div class="modal-carousel-indicators">
                            ${artwork.images.map((_, index) => 
                                `<span class="modal-indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`
                            ).join('')}
                        </div>
                        <div class="modal-carousel-nav">
                            <button class="modal-carousel-prev" onclick="artGallery.scrollModalCarousel(this, -1)" aria-label="Previous image">‹</button>
                            <button class="modal-carousel-next" onclick="artGallery.scrollModalCarousel(this, 1)" aria-label="Next image">›</button>
                        </div>
                    </div>
                `;
            }
        }
        // Handle legacy single image
        else if (artwork.imageUrl) {
            return this.createResponsiveImage(artwork.imageUrl, artwork.title, placeholderImage, 'artwork-modal-image');
        }
        // No images
        else {
            return `
                <div class="modal-no-image-placeholder">
                    <div class="modal-placeholder-icon">🎨</div>
                    <div class="modal-placeholder-text">No Image</div>
                </div>
            `;
        }
    }

    scrollCarousel(button, direction) {
        const carousel = button.closest('.artwork').querySelector('.image-scroll-container');
        const indicators = button.closest('.artwork').querySelectorAll('.indicator');
        const images = button.closest('.artwork').querySelectorAll('.carousel-image');
        
        if (!carousel || !indicators.length || !images.length) return;
        
        const scrollAmount = carousel.offsetWidth;
        const currentScroll = carousel.scrollLeft;
        const maxScroll = carousel.scrollWidth - carousel.offsetWidth;
        
        let newScroll;
        if (direction === 1) {
            // Next
            newScroll = Math.min(currentScroll + scrollAmount, maxScroll);
        } else {
            // Previous
            newScroll = Math.max(currentScroll - scrollAmount, 0);
        }
        
        carousel.scrollTo({
            left: newScroll,
            behavior: 'smooth'
        });
        
        // Update indicators after scroll
        setTimeout(() => {
            this.updateCarouselIndicators(carousel, indicators, images);
        }, 300);
    }

    updateCarouselIndicators(carousel, indicators, images) {
        const scrollLeft = carousel.scrollLeft;
        const imageWidth = carousel.offsetWidth;
        const currentIndex = Math.round(scrollLeft / imageWidth);
        
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === currentIndex);
        });
    }

    scrollModalCarousel(button, direction) {
        const carousel = button.closest('.artwork-modal').querySelector('.modal-image-scroll-container');
        const indicators = button.closest('.artwork-modal').querySelectorAll('.modal-indicator');
        const images = button.closest('.artwork-modal').querySelectorAll('.artwork-modal-image');
        
        if (!carousel || !indicators.length || !images.length) return;
        
        const scrollAmount = carousel.offsetWidth;
        const currentScroll = carousel.scrollLeft;
        const maxScroll = carousel.scrollWidth - carousel.offsetWidth;
        
        let newScroll;
        if (direction === 1) {
            // Next
            newScroll = Math.min(currentScroll + scrollAmount, maxScroll);
        } else {
            // Previous
            newScroll = Math.max(currentScroll - scrollAmount, 0);
        }
        
        carousel.scrollTo({
            left: newScroll,
            behavior: 'smooth'
        });
        
        // Update indicators after scroll
        setTimeout(() => {
            this.updateModalCarouselIndicators(carousel, indicators, images);
        }, 300);
    }

    updateModalCarouselIndicators(carousel, indicators, images) {
        const scrollLeft = carousel.scrollLeft;
        const imageWidth = carousel.offsetWidth;
        const currentIndex = Math.round(scrollLeft / imageWidth);
        
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === currentIndex);
        });
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
        // Liquid glass modal implementation
        const modal = document.createElement('div');
        modal.className = 'artwork-modal-overlay';
        
        modal.innerHTML = `
            <div class="artwork-modal">
                <button class="modal-close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
                        <div class="artwork-modal-content">
                            <div class="artwork-image-container">
                                ${this.getModalImageHTML(artwork)}
                                <button class="expand-image-btn" onclick="artGallery.expandImage(this)" title="View full size">🔍</button>
                            </div>
                    <div class="artwork-details">
                        ${artwork.title ? `<h2 class="artwork-title">${artwork.title}</h2>` : ''}
                        <div class="artwork-meta">
                            ${artwork.year ? `<p><strong>Year:</strong> ${artwork.year}</p>` : ''}
                            ${artwork.medium ? `<p><strong>Medium:</strong> ${artwork.medium}</p>` : ''}
                            ${artwork.size ? `<p><strong>Size:</strong> ${artwork.size}</p>` : ''}
                            ${artwork.price && artwork.price > 0 ? `<p><strong>Price:</strong> $${artwork.price.toLocaleString()}</p>` : artwork.price === 0 ? `<p><strong>Status:</strong> Not for sale</p>` : ''}
                        </div>
                        ${artwork.description ? `
                        <div class="artwork-description">
                            <h3>Description</h3>
                            <p>${artwork.description}</p>
                        </div>
                        ` : ''}
                        <button class="inquire-btn" onclick="this.parentElement.parentElement.parentElement.parentElement.remove(); document.getElementById('contact').scrollIntoView({behavior: 'smooth'});">
                            Inquire About This Artwork
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Add scroll event listener for modal carousel
        setTimeout(() => {
            const modalCarousel = modal.querySelector('.modal-image-scroll-container');
            if (modalCarousel) {
                modalCarousel.addEventListener('scroll', () => {
                    const indicators = modal.querySelectorAll('.modal-indicator');
                    const images = modal.querySelectorAll('.artwork-modal-image');
                    this.updateModalCarouselIndicators(modalCarousel, indicators, images);
                });
            }
        }, 100);
    }

    expandImage(button) {
        const imageContainer = button.closest('.artwork-image-container');
        const currentImage = imageContainer.querySelector('.artwork-modal-image');
        const carousel = imageContainer.querySelector('.modal-image-carousel');
        
        if (!currentImage) return;
        
        // Create full-screen image viewer
        const fullscreenModal = document.createElement('div');
        fullscreenModal.className = 'fullscreen-image-overlay';
        
        // Get current image source
        let currentImageSrc = currentImage.src;
        let allImages = [];
        let currentIndex = 0;
        
        // If it's a carousel, get all images and current index
        if (carousel) {
            const images = carousel.querySelectorAll('.artwork-modal-image');
            allImages = Array.from(images).map(img => img.src);
            currentIndex = allImages.findIndex(src => src === currentImageSrc);
        } else {
            allImages = [currentImageSrc];
        }
        
        fullscreenModal.innerHTML = `
            <div class="fullscreen-image-container">
                <button class="fullscreen-close-btn" onclick="this.closest('.fullscreen-image-overlay').remove()">×</button>
                <div class="fullscreen-image-wrapper">
                    <img src="${currentImageSrc}" alt="Full size artwork" class="fullscreen-image">
                </div>
                ${allImages.length > 1 ? `
                    <div class="fullscreen-nav">
                        <button class="fullscreen-prev" onclick="artGallery.navigateFullscreenImage(this, -1)">‹</button>
                        <button class="fullscreen-next" onclick="artGallery.navigateFullscreenImage(this, 1)">›</button>
                    </div>
                    <div class="fullscreen-indicators">
                        ${allImages.map((_, index) => 
                            `<span class="fullscreen-indicator ${index === currentIndex ? 'active' : ''}" data-index="${index}"></span>`
                        ).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        
        document.body.appendChild(fullscreenModal);
        
        // Store current images and index for navigation
        fullscreenModal._images = allImages;
        fullscreenModal._currentIndex = currentIndex;
        
        // Close on overlay click
        fullscreenModal.addEventListener('click', (e) => {
            if (e.target === fullscreenModal) fullscreenModal.remove();
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', function handleKeydown(e) {
            if (!document.querySelector('.fullscreen-image-overlay')) {
                document.removeEventListener('keydown', handleKeydown);
                return;
            }
            
            if (e.key === 'Escape') {
                fullscreenModal.remove();
            } else if (e.key === 'ArrowLeft') {
                artGallery.navigateFullscreenImage(fullscreenModal, -1);
            } else if (e.key === 'ArrowRight') {
                artGallery.navigateFullscreenImage(fullscreenModal, 1);
            }
        });
    }

    navigateFullscreenImage(container, direction) {
        const images = container._images || [];
        let currentIndex = container._currentIndex || 0;
        
        if (images.length <= 1) return;
        
        currentIndex += direction;
        if (currentIndex < 0) currentIndex = images.length - 1;
        if (currentIndex >= images.length) currentIndex = 0;
        
        container._currentIndex = currentIndex;
        
        // Update image
        const img = container.querySelector('.fullscreen-image');
        img.src = images[currentIndex];
        
        // Update indicators
        const indicators = container.querySelectorAll('.fullscreen-indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === currentIndex);
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

    initMobileMenu() {
        const mobileToggle = document.getElementById('mobileMenuToggle');
        const navLinks = document.getElementById('navLinks');
        
        if (mobileToggle && navLinks) {
            mobileToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = navLinks.classList.contains('active');
                navLinks.classList.toggle('active');
                mobileToggle.classList.toggle('active');
                
                // Update aria-expanded
                mobileToggle.setAttribute('aria-expanded', !isOpen);
                
                // Prevent body scroll when menu is open
                if (!isOpen) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!mobileToggle.contains(e.target) && !navLinks.contains(e.target)) {
                    navLinks.classList.remove('active');
                    mobileToggle.classList.remove('active');
                    mobileToggle.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                }
            });
            
            // Close menu when clicking on nav links
            navLinks.addEventListener('click', (e) => {
                if (e.target.tagName === 'A') {
                    navLinks.classList.remove('active');
                    mobileToggle.classList.remove('active');
                    mobileToggle.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                }
            });
            
            // Close menu on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                    mobileToggle.classList.remove('active');
                    mobileToggle.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                }
            });
        }
    }

}

// Cursor Reactive Glow
document.addEventListener('mousemove', (e) => {
    const glow = document.body;
    const glowX = e.clientX;
    const glowY = e.clientY;
    
    // Update CSS custom properties for glow position
    glow.style.setProperty('--cursor-x', glowX + 'px');
    glow.style.setProperty('--cursor-y', glowY + 'px');
});

// Add cursor glow effect to interactive elements
document.addEventListener('mouseenter', (e) => {
    if (e.target.closest('.artwork, .cta-button, .filter-btn, .nav-links a, .contact-item')) {
        e.target.closest('.artwork, .cta-button, .filter-btn, .nav-links a, .contact-item').style.cursor = 'pointer';
    }
}, true);

// Poetry Management
class PoetryManager {
    constructor() {
        this.dataAPI = new DataAPI();
        this.poetry = [];
        this.loadPoetryData();
    }

    async loadPoetryData() {
        this.poetry = await this.dataAPI.getPoetry();
        this.init();
    }

    init() {
        this.loadPoetry();
    }

    loadPoetry() {
        const poetryGrid = document.querySelector('.poetry-grid');
        if (!poetryGrid) return;

        // Clear existing poetry
        poetryGrid.innerHTML = '';

        if (this.poetry.length === 0) {
            poetryGrid.innerHTML = `
                <div class="no-poetry" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #666;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📝</div>
                    <h3 style="color: #2c3e50; margin-bottom: 1rem;">No poetry yet</h3>
                    <p>Check back soon for new poems!</p>
                </div>
            `;
            return;
        }

        this.poetry.forEach(poem => {
            const poemElement = this.createPoemElement(poem);
            poetryGrid.appendChild(poemElement);
        });
    }

    createPoemElement(poem) {
        const div = document.createElement('div');
        div.className = 'poem-card';
        div.innerHTML = `
            <h3>${poem.title}</h3>
            <div class="poem-content">
                <p>${poem.content}</p>
            </div>
            <div class="poem-meta">
                <span class="poem-date">${poem.date}</span>
                <span class="poem-theme">${poem.theme}</span>
            </div>
        `;
        return div;
    }
}

// Initialize the gallery and poetry when the page loads
let artGallery;
let poetryManager;
document.addEventListener('DOMContentLoaded', () => {
    artGallery = new ArtGallery();
    poetryManager = new PoetryManager();
});
