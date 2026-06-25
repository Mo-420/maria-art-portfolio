// Data API for syncing admin changes to the live site
// Uses Cloudflare Workers + KV storage

class DataAPI {
    constructor() {
        const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const configuredApiUrl = window.MARYILU_API_URL
            || document.querySelector('meta[name="maryilu-api-url"]')?.content
            || localStorage.getItem('maryiluApiUrl')
            || '';
        this.apiUrl = (configuredApiUrl || (isLocalPreview
            ? 'http://127.0.0.1:8788'
            : 'https://maria-art-data-api.maros-pristas.workers.dev')).replace(/\/+$/, '');
        // Fallback to localStorage if API unavailable
        this.useLocalStorage = true;
    }

    getAdminToken() {
        try {
            return localStorage.getItem('maryiluAdminToken') || '';
        } catch (e) {
            return '';
        }
    }

    adminHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAdminToken()}`
        };
    }

    isLocalApiUrl() {
        try {
            const parsed = new URL(this.apiUrl, window.location.href);
            return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
        } catch (e) {
            return false;
        }
    }

    async saveArtworks(artworks) {
        try {
            const response = await fetch(`${this.apiUrl}/artworks`, {
                method: 'POST',
                headers: this.adminHeaders(),
                body: JSON.stringify(artworks)
            });
            if (response.ok) {
                this.useLocalStorage = false;
                return true;
            }
            if (response.status === 401 || response.status === 503) {
                return false;
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
            // Add cache-busting parameter to ensure fresh data
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/artworks${cacheBuster}`, {
                cache: 'no-store'
            });
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
                headers: this.adminHeaders(),
                body: JSON.stringify(poetry)
            });
            if (response.ok) {
                return true;
            }
            if (response.status === 401 || response.status === 503) {
                return false;
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        localStorage.setItem('poetry', JSON.stringify(poetry));
        return false;
    }

    async getPoetry() {
        try {
            // Add cache-busting parameter to ensure fresh data
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/poetry${cacheBuster}`, {
                cache: 'no-store'
            });
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
                headers: this.adminHeaders(),
                body: JSON.stringify(content)
            });
            if (response.ok) {
                return true;
            }
            if (response.status === 401 || response.status === 503) {
                return false;
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        localStorage.setItem('siteContent', JSON.stringify(content));
        return false;
    }

    async getSiteContent() {
        try {
            // Add cache-busting parameter to ensure fresh data
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/site-content${cacheBuster}`, {
                cache: 'no-store'
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.warn('API unavailable, using localStorage:', e);
        }
        
        return JSON.parse(localStorage.getItem('siteContent') || '{}');
    }

    defaultSiteSettings() {
        const data = window.MARYILU_DATA || {};
        const en = data.copy?.en || {};
        const es = data.copy?.es || {};
        const instagram = Array.isArray(data.socialLinks)
            ? data.socialLinks.find((link) => link.id === 'instagram')
            : null;

        return {
            version: 1,
            brand: en.brand || es.brand || 'Maryilu',
            defaultLanguage: 'en',
            supportedLanguages: ['en', 'es'],
            urls: {
                publicSite: 'https://maryilu.com',
                portfolio: 'https://portfolio.maryilu.com',
                instagram: instagram?.href || 'https://www.instagram.com/marialuisas_arttt/'
            },
            social: {
                instagram: {
                    label: instagram?.label?.en || 'Instagram',
                    handle: instagram?.handle || '@marialuisas_arttt',
                    href: instagram?.href || 'https://www.instagram.com/marialuisas_arttt/'
                }
            },
            contact: {
                location: 'Mallorca',
                email: '',
                phone: '',
                whatsapp: '',
                instagram: instagram?.handle || '@marialuisas_arttt'
            },
            commerce: {
                currency: 'eur',
                customOrdersOpen: true,
                checkoutMode: 'quote-led',
                directCheckoutRequiresReview: true
            },
            copy: {
                en: {
                    metaTitle: en.metaTitle || 'Maryilu | Custom Handmade Gifts & Art',
                    metaDescription: en.metaDescription || '',
                    heroTitle: en.heroTitle || 'Custom Art Gifts Worth Keeping',
                    heroSubtitle: en.heroSubtitle || '',
                    heroPrimary: en.heroPrimary || 'Shop Available Art',
                    heroSecondary: en.heroSecondary || 'Start a Custom Gift',
                    heroNote: en.heroNote || 'Handmade gift workshop in Mallorca'
                },
                es: {
                    metaTitle: es.metaTitle || 'Maryilu | Regalos y arte handmade personalizados',
                    metaDescription: es.metaDescription || '',
                    heroTitle: es.heroTitle || 'Regalos artisticos para guardar',
                    heroSubtitle: es.heroSubtitle || '',
                    heroPrimary: es.heroPrimary || 'Comprar arte disponible',
                    heroSecondary: es.heroSecondary || 'Empezar regalo personalizado',
                    heroNote: es.heroNote || 'Taller hecho a mano en Mallorca'
                }
            },
            assets: {
                storeHero: {
                    mediaUrl: '',
                    alt: 'Maryilu handmade gift preview',
                    placeholderLabel: 'Photo placeholder: Hero product'
                },
                categories: {
                    'gift-boxes': {
                        mediaUrl: '',
                        alt: 'Painted Maryilu chest',
                        placeholderLabel: 'Photo placeholder: Painted chest'
                    },
                    flowers: {
                        mediaUrl: '',
                        alt: 'Handmade ribbon bouquet',
                        placeholderLabel: 'Photo placeholder: Ribbon bouquet'
                    },
                    canvases: {
                        mediaUrl: '',
                        alt: 'Custom Maryilu canvas',
                        placeholderLabel: 'Photo placeholder: Custom canvas'
                    },
                    'baby-shower': {
                        mediaUrl: '',
                        alt: 'Baby shower gift',
                        placeholderLabel: 'Photo placeholder: Baby gift'
                    }
                },
                about: {
                    mediaUrl: '',
                    alt: 'Maria Luisa in the Maryilu studio',
                    placeholderLabel: 'Photo placeholder: Maria in the studio'
                },
                heroImage: '',
                editorialImage: '',
                portfolioImage: ''
            },
            updatedAt: ''
        };
    }

    async getSiteSettings() {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/site-settings${cacheBuster}`, {
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data.settings || data;
            }
        } catch (e) {
            console.warn('Site settings API unavailable, using localStorage:', e);
        }

        return JSON.parse(localStorage.getItem('siteSettings') || 'null') || this.defaultSiteSettings();
    }

    async saveSiteSettings(settings) {
        try {
            const response = await fetch(`${this.apiUrl}/site-settings`, {
                method: 'PUT',
                headers: this.adminHeaders(),
                body: JSON.stringify(settings)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                localStorage.setItem('siteSettings', JSON.stringify(data.settings || settings));
                return true;
            }
            if (response.status === 401 || response.status === 503) {
                return false;
            }
        } catch (e) {
            console.warn('Site settings API unavailable, using localStorage:', e);
        }

        localStorage.setItem('siteSettings', JSON.stringify(settings));
        return false;
    }

    async getInstagramMedia() {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/instagram-media${cacheBuster}`, {
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return Array.isArray(data) ? data : data.media || [];
            }
        } catch (e) {
            console.warn('Instagram media API unavailable:', e);
        }

        return [];
    }

    async getShopItems(options = {}) {
        try {
            const params = new URLSearchParams({ t: String(Date.now()) });
            if (options.includeHidden) params.set('includeHidden', '1');
            if (options.target) params.set('target', String(options.target));
            const headers = options.adminToken ? { 'Authorization': `Bearer ${options.adminToken}` } : {};
            const response = await fetch(`${this.apiUrl}/shop-items?${params.toString()}`, {
                cache: 'no-store',
                headers
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return Array.isArray(data) ? data : data.items || [];
            }
            throw new Error(data.error || 'Shop items could not be loaded.');
        } catch (e) {
            console.warn('Shop items API unavailable:', e);
            if (options.includeHidden) throw e;
        }

        return [];
    }

    async updateShopItem(itemId, updates, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/shop-items/${encodeURIComponent(itemId)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify(updates)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Unable to update shop item.' };
        } catch (e) {
            console.warn('Shop item update API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async approveDirectCheckoutItem(itemId, updates, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/shop-items/${encodeURIComponent(itemId)}/approve-direct-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify(updates || {})
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Unable to approve direct checkout.' };
        } catch (e) {
            console.warn('Direct checkout approval API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async archiveShopItem(itemId, reason, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/shop-items/${encodeURIComponent(itemId)}/archive`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify({ reason: reason || 'Archived from admin' })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Unable to archive shop item.' };
        } catch (e) {
            console.warn('Shop item archive API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async uploadImage(file, adminToken) {
        try {
            const form = new FormData();
            form.append('image', file);
            const response = await fetch(`${this.apiUrl}/uploads/images`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: form
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return {
                success: false,
                status: response.status,
                error: data.error || 'Image upload failed.',
                fallback: data.fallback || ''
            };
        } catch (e) {
            console.warn('Image upload API unavailable:', e);
            return { success: false, error: e.message, fallback: 'compressed-data-url' };
        }
    }

    async createShopItem(item, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/shop-items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify(item)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Unable to create shop item.' };
        } catch (e) {
            console.warn('Shop item create API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async analyzeCaption(caption, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/analyze-caption`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify({ caption })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Caption could not be analyzed.' };
        } catch (e) {
            console.warn('Caption analysis API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async checkoutArtwork(itemId) {
        try {
            const response = await fetch(`${this.apiUrl}/checkout/artwork`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Checkout could not be started.' };
        } catch (e) {
            console.warn('Artwork checkout API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async syncInstagramMedia(adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/sync-instagram`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify({})
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Instagram sync could not be completed.' };
        } catch (e) {
            console.warn('Instagram sync API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async simulateInstagramSync(media, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/simulate-instagram-sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                },
                body: JSON.stringify({ media })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Local Instagram test import could not be completed.' };
        } catch (e) {
            console.warn('Local Instagram test import unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async getAutomationStatus(adminToken) {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/automation-status${cacheBuster}`, {
                cache: 'no-store',
                headers: {
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Automation status could not be loaded.' };
        } catch (e) {
            console.warn('Automation status API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async getAgentBrief(adminToken) {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/agent-brief${cacheBuster}`, {
                cache: 'no-store',
                headers: {
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Morning brief could not be loaded.' };
        } catch (e) {
            console.warn('Morning brief API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async getPublicAutomationStatus() {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/automation-public-status${cacheBuster}`, {
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Public automation status could not be loaded.' };
        } catch (e) {
            console.warn('Public automation status API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async getAutomationEvents(adminToken) {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/automation-events${cacheBuster}`, {
                cache: 'no-store',
                headers: {
                    'Authorization': `Bearer ${adminToken || this.getAdminToken()}`
                }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Automation events could not be loaded.' };
        } catch (e) {
            console.warn('Automation events API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async submitOrderRequest(orderRequest) {
        try {
            const response = await fetch(`${this.apiUrl}/order-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderRequest)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Order request could not be submitted.' };
        } catch (e) {
            console.warn('Order request API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async getOrderRequests(adminToken) {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(`${this.apiUrl}/order-requests${cacheBuster}`, {
                cache: 'no-store',
                headers: {
                    'Authorization': `Bearer ${adminToken || ''}`
                }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return Array.isArray(data) ? data : data.requests || [];
            }
            throw new Error(data.error || 'Unable to load order requests.');
        } catch (e) {
            console.warn('Order requests API unavailable:', e);
            throw e;
        }
    }

    async updateOrderRequestStatus(requestId, status, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/order-requests/${encodeURIComponent(requestId)}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || ''}`
                },
                body: JSON.stringify({ status })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Unable to update request status.' };
        } catch (e) {
            console.warn('Order status API unavailable:', e);
            return { success: false, error: e.message };
        }
    }

    async createOrderPaymentLink(requestId, payload, adminToken) {
        try {
            const response = await fetch(`${this.apiUrl}/order-requests/${encodeURIComponent(requestId)}/payment-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken || ''}`
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data;
            }
            return { success: false, error: data.error || 'Unable to create Stripe payment link.' };
        } catch (e) {
            console.warn('Payment link API unavailable:', e);
            return { success: false, error: e.message };
        }
    }
}
