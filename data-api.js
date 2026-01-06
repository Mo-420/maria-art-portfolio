// Data API for syncing admin changes to the live site
// Uses Cloudflare Workers + KV storage

class DataAPI {
    constructor() {
        // Cloudflare Worker endpoint
        this.apiUrl = 'https://maria-art-data-api.maros-pristas.workers.dev';
        // Fallback to localStorage if API unavailable
        this.useLocalStorage = true;
    }

    async saveArtworks(artworks) {
        try {
            const response = await fetch(`${this.apiUrl}/artworks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(artworks)
            });
            if (response.ok) {
                this.useLocalStorage = false;
                return true;
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        // Fallback to localStorage
        if (this.useLocalStorage) {
            localStorage.setItem('artworks', JSON.stringify(artworks));
        }
        return false;
    }

    async getArtworks() {
        try {
            const response = await fetch(`${this.apiUrl}/artworks`);
            if (response.ok) {
                const data = await response.json();
                this.useLocalStorage = false;
                return data;
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        // Fallback to localStorage
        return JSON.parse(localStorage.getItem('artworks') || '[]');
    }

    async savePoetry(poetry) {
        try {
            const response = await fetch(`${this.apiUrl}/poetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(poetry)
            });
            if (response.ok) {
                return true;
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        localStorage.setItem('poetry', JSON.stringify(poetry));
        return false;
    }

    async getPoetry() {
        try {
            const response = await fetch(`${this.apiUrl}/poetry`);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        return JSON.parse(localStorage.getItem('poetry') || '[]');
    }

    async saveSiteContent(content) {
        try {
            const response = await fetch(`${this.apiUrl}/site-content`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(content)
            });
            if (response.ok) {
                return true;
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        localStorage.setItem('siteContent', JSON.stringify(content));
        return false;
    }

    async getSiteContent() {
        try {
            const response = await fetch(`${this.apiUrl}/site-content`);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        return JSON.parse(localStorage.getItem('siteContent') || '{}');
    }
}

