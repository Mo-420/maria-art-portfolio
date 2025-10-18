// Admin Portal JavaScript
class ArtAdmin {
    constructor() {
        this.artworks = JSON.parse(localStorage.getItem('artworks')) || [];
        this.currentUser = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuth();
    }

    bindEvents() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Navigation
        document.getElementById('view-artworks').addEventListener('click', () => {
            this.showSection('artwork-management');
            this.updateActiveNav('view-artworks');
            this.loadArtworks();
        });

        document.getElementById('add-artwork').addEventListener('click', () => {
            this.showSection('add-artwork-section');
            this.updateActiveNav('add-artwork');
        });

        document.getElementById('logout').addEventListener('click', () => {
            this.logout();
        });

        // Artwork form
        document.getElementById('artworkForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleArtworkSubmit();
        });

        document.getElementById('cancelAdd').addEventListener('click', () => {
            this.showSection('artwork-management');
            this.updateActiveNav('view-artworks');
            document.getElementById('artworkForm').reset();
            document.getElementById('imagePreview').innerHTML = '';
        });

        // Image preview
        document.getElementById('artworkImage').addEventListener('change', (e) => {
            this.previewImage(e.target.files[0]);
        });
    }

    checkAuth() {
        const isLoggedIn = localStorage.getItem('adminLoggedIn') === 'true';
        if (isLoggedIn) {
            this.showDashboard();
        } else {
            this.showLogin();
        }
    }

    handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Simple authentication (in production, use proper backend authentication)
        if (username === 'admin' && password === 'maria2024') {
            this.currentUser = { username: 'admin' };
            localStorage.setItem('adminLoggedIn', 'true');
            this.showDashboard();
            this.loadArtworks();
        } else {
            alert('Invalid credentials. Please try again.');
        }
    }

    logout() {
        localStorage.removeItem('adminLoggedIn');
        this.currentUser = null;
        this.showLogin();
    }

    showLogin() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('admin-dashboard').style.display = 'none';
    }

    showDashboard() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
    }

    showSection(sectionId) {
        document.querySelectorAll('.management-section').forEach(section => {
            section.style.display = 'none';
        });
        document.getElementById(sectionId).style.display = 'block';
    }

    updateActiveNav(activeId) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(activeId).classList.add('active');
    }

    loadArtworks() {
        const artworkList = document.getElementById('artworkList');
        artworkList.innerHTML = '';

        if (this.artworks.length === 0) {
            artworkList.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">No artworks found. Add your first artwork!</p>';
            return;
        }

        this.artworks.forEach((artwork, index) => {
            const artworkElement = this.createArtworkElement(artwork, index);
            artworkList.appendChild(artworkElement);
        });
    }

    createArtworkElement(artwork, index) {
        const div = document.createElement('div');
        div.className = 'artwork-item';
        div.innerHTML = `
            <img src="${artwork.imageUrl}" alt="${artwork.title}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='">
            <h3>${artwork.title}</h3>
            <p><strong>Year:</strong> ${artwork.year}</p>
            <p><strong>Medium:</strong> ${artwork.medium}</p>
            <p><strong>Size:</strong> ${artwork.size}</p>
            ${artwork.price ? `<p><strong>Price:</strong> $${artwork.price}</p>` : ''}
            <p><strong>Description:</strong> ${artwork.description.substring(0, 100)}${artwork.description.length > 100 ? '...' : ''}</p>
            <div class="artwork-actions">
                <button class="btn-edit" onclick="artAdmin.editArtwork(${index})">Edit</button>
                <button class="btn-delete" onclick="artAdmin.deleteArtwork(${index})">Delete</button>
            </div>
        `;
        return div;
    }

    previewImage(file) {
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('imagePreview');
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        }
    }

    handleArtworkSubmit() {
        const formData = new FormData(document.getElementById('artworkForm'));
        const imageFile = document.getElementById('artworkImage').files[0];

        if (!imageFile) {
            alert('Please select an image file.');
            return;
        }

        // Convert image to base64 for storage
        const reader = new FileReader();
        reader.onload = (e) => {
            const artwork = {
                id: Date.now(),
                title: formData.get('title'),
                year: parseInt(formData.get('year')),
                medium: formData.get('medium'),
                size: formData.get('size'),
                description: formData.get('description'),
                price: formData.get('price') ? parseFloat(formData.get('price')) : null,
                imageUrl: e.target.result,
                createdAt: new Date().toISOString()
            };

            this.artworks.push(artwork);
            this.saveArtworks();
            this.loadArtworks();
            this.showSection('artwork-management');
            this.updateActiveNav('view-artworks');
            document.getElementById('artworkForm').reset();
            document.getElementById('imagePreview').innerHTML = '';
            
            alert('Artwork added successfully!');
        };
        reader.readAsDataURL(imageFile);
    }

    editArtwork(index) {
        const artwork = this.artworks[index];
        // For now, we'll just show an alert. In a full implementation, you'd open an edit form
        alert(`Edit functionality for "${artwork.title}" would open here. This would include pre-filling the form with existing data.`);
    }

    deleteArtwork(index) {
        const artwork = this.artworks[index];
        if (confirm(`Are you sure you want to delete "${artwork.title}"?`)) {
            this.artworks.splice(index, 1);
            this.saveArtworks();
            this.loadArtworks();
            alert('Artwork deleted successfully!');
        }
    }

    saveArtworks() {
        localStorage.setItem('artworks', JSON.stringify(this.artworks));
        // Also update the public gallery
        this.updatePublicGallery();
    }

    updatePublicGallery() {
        // This would typically be handled by a backend API
        // For now, we'll just store in localStorage and the public site will read from there
        console.log('Artworks updated:', this.artworks);
    }
}

// Initialize the admin portal when the page loads
let artAdmin;
document.addEventListener('DOMContentLoaded', () => {
    artAdmin = new ArtAdmin();
});
