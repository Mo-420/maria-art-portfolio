// Admin Portal JavaScript
class ArtAdmin {
    constructor() {
        this.artworks = JSON.parse(localStorage.getItem('artworks')) || [];
        this.poetry = JSON.parse(localStorage.getItem('poetry')) || [];
        this.currentUser = null;
        this.loadSampleData();
        this.init();
    }

    loadSampleData() {
        // Load sample data if no artworks exist
        if (this.artworks.length === 0) {
            const sampleArtworks = [
                {
                    id: 1,
                    title: "Sunset Dreams",
                    year: 2024,
                    medium: "Oil on Canvas",
                    size: "24x36 inches",
                    description: "A vibrant exploration of color and light, capturing the ethereal beauty of a sunset over rolling hills. This piece represents the artist's fascination with the interplay between natural light and emotional response.",
                    imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZjY2MDA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSI1MCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZmNjMDA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojNjY5OWZmO3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JhZCkiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlN1bnNldCBEcmVhbXM8L3RleHQ+PC9zdmc+",
                    createdAt: "2024-01-15T10:00:00Z"
                },
                {
                    id: 2,
                    title: "Urban Reflections",
                    year: 2024,
                    medium: "Acrylic on Canvas",
                    size: "30x40 inches",
                    description: "An abstract interpretation of city life, featuring bold geometric shapes and vibrant colors that reflect the energy and complexity of urban environments.",
                    imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHJlY3QgeD0iMjAlIiB5PSIxMCUiIHdpZHRoPSI2MCUiIGhlaWdodD0iODAlIiBmaWxsPSIjNjY2Ii8+PHJlY3QgeD0iMzAlIiB5PSIyMCUiIHdpZHRoPSI0MCUiIGhlaWdodD0iNjAlIiBmaWxsPSIjOTk5Ii8+PHJlY3QgeD0iNDAlIiB5PSIzMCUiIHdpZHRoPSIyMCUiIGhlaWdodD0iNDAlIiBmaWxsPSIjY2NjIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlVyYmFuIFJlZmxlY3Rpb25zPC90ZXh0Pjwvc3ZnPg==",
                    createdAt: "2024-02-20T14:30:00Z"
                }
            ];
            this.artworks = sampleArtworks;
            localStorage.setItem('artworks', JSON.stringify(this.artworks));
        }

        // Load sample poetry data if no poetry exists
        if (this.poetry.length === 0) {
            const samplePoetry = [
                {
                    id: 1,
                    title: "Urban Dreams",
                    content: "In the city's heartbeat,<br>Where shadows meet light,<br>I paint my dreams<br>In colors bold and bright.",
                    date: "March 2024",
                    theme: "Urban Life",
                    createdAt: "2024-03-15T10:00:00Z"
                },
                {
                    id: 2,
                    title: "Nature's Whisper",
                    content: "Through the trees,<br>A gentle breeze,<br>Nature speaks<br>In silent ease.",
                    date: "February 2024",
                    theme: "Nature",
                    createdAt: "2024-02-20T14:30:00Z"
                },
                {
                    id: 3,
                    title: "Creative Fire",
                    content: "In my studio,<br>Where magic flows,<br>Every brushstroke<br>A story grows.",
                    date: "January 2024",
                    theme: "Art & Creation",
                    createdAt: "2024-01-10T09:15:00Z"
                },
                {
                    id: 4,
                    title: "Evening Light",
                    content: "As day turns to night,<br>Golden hour's glow,<br>Captures the soul<br>Of all we know.",
                    date: "December 2023",
                    theme: "Time & Light",
                    createdAt: "2023-12-05T16:45:00Z"
                }
            ];
            this.poetry = samplePoetry;
            localStorage.setItem('poetry', JSON.stringify(this.poetry));
        }
    }

    init() {
        this.bindEvents();
        this.checkAuth();
    }

    bindEvents() {
        // Camera functionality
        document.getElementById('cameraBtn').addEventListener('click', () => {
            this.openCamera();
        });
        
        document.getElementById('galleryBtn').addEventListener('click', () => {
            document.getElementById('artworkImage').click();
        });
        
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

        document.getElementById('view-poetry').addEventListener('click', () => {
            this.showSection('poetry-management');
            this.updateActiveNav('view-poetry');
            this.loadPoetry();
        });

        document.getElementById('add-poetry').addEventListener('click', () => {
            this.showSection('add-poetry-section');
            this.updateActiveNav('add-poetry');
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

        // Poetry form
        document.getElementById('poetryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePoetrySubmit();
        });

        document.getElementById('cancelPoetryAdd').addEventListener('click', () => {
            this.showSection('poetry-management');
            this.updateActiveNav('view-poetry');
            document.getElementById('poetryForm').reset();
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
        if (username === 'admin' && password === 'mariaissocute') {
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
            artworkList.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">🎨</div>
                    <h3 style="color: #2c3e50; margin-bottom: 1rem;">No artworks yet</h3>
                    <p style="color: #666; margin-bottom: 2rem;">Start building your portfolio by adding your first artwork!</p>
                    <button onclick="document.getElementById('add-artwork').click()" style="background: #667eea; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background 0.3s ease;" onmouseover="this.style.background='#5a6fd8'" onmouseout="this.style.background='#667eea'">
                        Add Your First Artwork
                    </button>
                </div>
            `;
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
            <p>${artwork.year} • ${artwork.medium}</p>
            <p>${artwork.size}</p>
            <div class="artwork-buttons">
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

    // Camera functionality
    openCamera() {
        // Check if camera is available
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment' // Use back camera on mobile
                } 
            })
            .then(stream => {
                this.showCameraModal(stream);
            })
            .catch(err => {
                console.error('Camera access denied:', err);
                alert('Camera access is required to take photos. Please allow camera access and try again.');
            });
        } else {
            alert('Camera not supported on this device. Please use the gallery option instead.');
        }
    }

    showCameraModal(stream) {
        // Create camera modal
        const modal = document.createElement('div');
        modal.className = 'camera-modal';
        modal.innerHTML = `
            <div class="camera-container">
                <div class="camera-header">
                    <h3>Take Photo</h3>
                    <button class="close-camera">✕</button>
                </div>
                <div class="camera-preview">
                    <video id="cameraVideo" autoplay playsinline></video>
                </div>
                <div class="camera-controls">
                    <button id="captureBtn" class="capture-btn">📷 Capture</button>
                    <button id="cancelCamera" class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const video = modal.querySelector('#cameraVideo');
        video.srcObject = stream;
        
        // Capture photo
        modal.querySelector('#captureBtn').addEventListener('click', () => {
            this.capturePhoto(video, stream);
        });
        
        // Close modal
        modal.querySelector('.close-camera').addEventListener('click', () => {
            this.closeCameraModal(modal, stream);
        });
        
        modal.querySelector('#cancelCamera').addEventListener('click', () => {
            this.closeCameraModal(modal, stream);
        });
    }

    capturePhoto(video, stream) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        context.drawImage(video, 0, 0);
        
        canvas.toBlob(blob => {
            const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
            this.handleImageFile(file);
            this.closeCameraModal(document.querySelector('.camera-modal'), stream);
        }, 'image/jpeg', 0.8);
    }

    closeCameraModal(modal, stream) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        modal.remove();
    }

    handleImageFile(file) {
        const input = document.getElementById('artworkImage');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        
        // Trigger file change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Poetry Management Functions
    loadPoetry() {
        const poetryList = document.getElementById('poetryList');
        poetryList.innerHTML = '';

        if (this.poetry.length === 0) {
            poetryList.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">📝</div>
                    <h3 style="color: #2c3e50; margin-bottom: 1rem;">No poetry yet</h3>
                    <p style="color: #666; margin-bottom: 2rem;">Start sharing your words by adding your first poem!</p>
                    <button onclick="document.getElementById('add-poetry').click()" style="background: #667eea; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background 0.3s ease;" onmouseover="this.style.background='#5a6fd8'" onmouseout="this.style.background='#667eea'">
                        Add Your First Poem
                    </button>
                </div>
            `;
            return;
        }

        this.poetry.forEach((poem, index) => {
            const poemElement = this.createPoemElement(poem, index);
            poetryList.appendChild(poemElement);
        });
    }

    createPoemElement(poem, index) {
        const div = document.createElement('div');
        div.className = 'poem-item';
        div.innerHTML = `
            <h3>${poem.title}</h3>
            <div class="poem-content">${poem.content}</div>
            <div class="poem-meta">
                <span class="poem-date">${poem.date}</span>
                <span class="poem-theme">${poem.theme}</span>
            </div>
            <div class="poem-actions">
                <button class="btn-edit" onclick="artAdmin.editPoem(${index})">Edit</button>
                <button class="btn-delete" onclick="artAdmin.deletePoem(${index})">Delete</button>
            </div>
        `;
        return div;
    }

    handlePoetrySubmit() {
        const formData = new FormData(document.getElementById('poetryForm'));
        
        const poem = {
            id: Date.now(),
            title: formData.get('title'),
            content: formData.get('content'),
            date: formData.get('date'),
            theme: formData.get('theme'),
            createdAt: new Date().toISOString()
        };

        this.poetry.push(poem);
        this.savePoetry();
        this.loadPoetry();
        this.showSection('poetry-management');
        this.updateActiveNav('view-poetry');
        document.getElementById('poetryForm').reset();
        
        alert('Poetry added successfully!');
    }

    editPoem(index) {
        const poem = this.poetry[index];
        // For now, we'll just show an alert. In a full implementation, you'd open an edit form
        alert(`Edit functionality for "${poem.title}" would open here. This would include pre-filling the form with existing data.`);
    }

    deletePoem(index) {
        const poem = this.poetry[index];
        if (confirm(`Are you sure you want to delete "${poem.title}"?`)) {
            this.poetry.splice(index, 1);
            this.savePoetry();
            this.loadPoetry();
            alert('Poetry deleted successfully!');
        }
    }

    savePoetry() {
        localStorage.setItem('poetry', JSON.stringify(this.poetry));
        // Also update the public gallery
        this.updatePublicPoetry();
    }

    updatePublicPoetry() {
        // This would typically be handled by a backend API
        // For now, we'll just store in localStorage and the public site will read from there
        console.log('Poetry updated:', this.poetry);
    }
}

// Initialize the admin portal when the page loads
let artAdmin;
document.addEventListener('DOMContentLoaded', () => {
    artAdmin = new ArtAdmin();
});
