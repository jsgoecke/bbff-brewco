/**
 * Gallery JavaScript for BBFF & HMB Brewing Co. Photo Gallery
 * Handles photo loading, display, and user interactions
 */

class PhotoGallery {
    constructor() {
        this.photos = [];
        this.currentView = 'grid';
        this.currentSort = 'newest';
        this.isLoading = false;
        this.hasMore = false;
        this.cursor = null;
        this.lastUpdated = null;
        
        // DOM elements
        this.elements = {
            gallery: document.getElementById('photo-gallery'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            empty: document.getElementById('empty'),
            photoCount: document.getElementById('photo-count'),
            lastUpdated: document.getElementById('last-updated'),
            refreshBtn: document.getElementById('refresh-btn'),
            retryBtn: document.getElementById('retry-btn'),
            sortSelect: document.getElementById('sort-select'),
            gridViewBtn: document.getElementById('grid-view'),
            listViewBtn: document.getElementById('list-view'),
            loadMoreContainer: document.getElementById('load-more-container'),
            loadMoreBtn: document.getElementById('load-more-btn'),
            errorText: document.getElementById('error-text')
        };
        
        this.init();
    }
    
    /**
     * Initialize the gallery
     */
    init() {
        this.bindEvents();
        this.loadPhotos();
        this.initializeFancybox();
        this.updateLastUpdated();
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (!this.isLoading) {
                this.refreshPhotos();
            }
        }, 30000);
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Refresh button
        this.elements.refreshBtn?.addEventListener('click', () => {
            this.refreshPhotos();
        });
        
        // Retry button
        this.elements.retryBtn?.addEventListener('click', () => {
            this.loadPhotos();
        });
        
        // Sort selection
        this.elements.sortSelect?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.refreshPhotos();
        });
        
        // View toggle buttons
        this.elements.gridViewBtn?.addEventListener('click', () => {
            this.setView('grid');
        });
        
        this.elements.listViewBtn?.addEventListener('click', () => {
            this.setView('list');
        });
        
        // Load more button
        this.elements.loadMoreBtn?.addEventListener('click', () => {
            this.loadMorePhotos();
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });
        
        // Handle visibility change for auto-refresh
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.isLoading) {
                this.refreshPhotos();
            }
        });
    }
    
    /**
     * Load photos from the API
     * @param {boolean} append - Whether to append to existing photos
     */
    async loadPhotos(append = false) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoadingState(append);
        
        try {
            const params = new URLSearchParams({
                limit: '20',
                sort: this.currentSort
            });
            
            if (append && this.cursor) {
                params.append('cursor', this.cursor);
            }
            
            const response = await fetch(`/api/list?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!append) {
                this.photos = data.photos || [];
            } else {
                this.photos.push(...(data.photos || []));
            }
            
            this.hasMore = data.hasMore || false;
            this.cursor = data.cursor || null;
            this.lastUpdated = new Date();
            
            this.renderPhotos();
            this.updateUI();
            this.logAnalytics('gallery_loaded', { count: this.photos.length });
            
        } catch (error) {
            console.error('Failed to load photos:', error);
            this.showErrorState(error.message);
            this.logAnalytics('gallery_error', { error: error.message });
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * Refresh photos (reload from beginning)
     */
    async refreshPhotos() {
        this.cursor = null;
        await this.loadPhotos(false);
    }
    
    /**
     * Load more photos (pagination)
     */
    async loadMorePhotos() {
        if (!this.hasMore || this.isLoading) return;
        await this.loadPhotos(true);
    }
    
    /**
     * Render photos in the gallery
     */
    renderPhotos() {
        if (!this.elements.gallery) return;
        
        if (this.photos.length === 0) {
            this.showEmptyState();
            return;
        }
        
        const photosHTML = this.photos.map(photo => this.createPhotoHTML(photo)).join('');
        this.elements.gallery.innerHTML = photosHTML;
        this.elements.gallery.style.display = 'grid';
        
        // Hide other states
        this.hideStates();
        
        // Update view class
        this.elements.gallery.className = `photo-gallery ${this.currentView === 'list' ? 'list-view' : ''}`;
        
        // Lazy load images
        this.initializeLazyLoading();
    }
    
    /**
     * Create HTML for a single photo
     * @param {Object} photo - Photo metadata
     * @returns {string} HTML string
     */
    createPhotoHTML(photo) {
        const thumbnailUrl = `/cdn-cgi/image/width=300,quality=85/api/images/${photo.key}`;
        const fullUrl = `/api/images/${photo.key}`;
        const formattedDate = this.formatDate(photo.uploadedAt);
        const formattedSize = this.formatBytes(photo.size);
        
        const listItemClass = this.currentView === 'list' ? ' list-item' : '';
        
        return `
            <div class="photo-item${listItemClass}">
                <a href="${fullUrl}" 
                   class="photo-link" 
                   data-fancybox="gallery" 
                   data-caption="${this.escapeHtml(photo.filename)}"
                   aria-label="View ${this.escapeHtml(photo.filename)}">
                    <img src="${thumbnailUrl}" 
                         alt="${this.escapeHtml(photo.filename)}" 
                         class="photo-image"
                         loading="lazy"
                         data-filename="${this.escapeHtml(photo.filename)}">
                    <div class="photo-info">
                        <div class="photo-details">
                            <div class="photo-filename" title="${this.escapeHtml(photo.filename)}">
                                ${this.escapeHtml(this.truncateFilename(photo.filename))}
                            </div>
                        </div>
                        <div class="photo-meta">
                            <span class="photo-size">${formattedSize}</span>
                            <span class="photo-date">${formattedDate}</span>
                        </div>
                    </div>
                </a>
            </div>
        `;
    }
    
    /**
     * Initialize Fancybox for lightbox functionality
     */
    initializeFancybox() {
        if (typeof Fancybox !== 'undefined') {
            Fancybox.bind('[data-fancybox="gallery"]', {
                Toolbar: {
                    display: {
                        left: ['infobar'],
                        middle: ['zoomIn', 'zoomOut', 'toggle1to1', 'rotateCCW', 'rotateCW', 'flipX', 'flipY'],
                        right: ['slideshow', 'thumbs', 'close']
                    }
                },
                Images: {
                    zoom: true,
                    protect: true
                },
                Thumbs: {
                    autoStart: true
                },
                on: {
                    ready: (fancybox, slide) => {
                        this.logAnalytics('photo_viewed', { 
                            filename: slide.caption || 'unknown' 
                        });
                    }
                }
            });
        }
    }
    
    /**
     * Initialize lazy loading for images
     */
    initializeLazyLoading() {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            imageObserver.unobserve(img);
                        }
                    }
                });
            });
            
            document.querySelectorAll('img[data-src]').forEach(img => {
                imageObserver.observe(img);
            });
        }
    }
    
    /**
     * Set the view mode (grid or list)
     * @param {string} view - View mode ('grid' or 'list')
     */
    setView(view) {
        this.currentView = view;
        
        // Update button states
        this.elements.gridViewBtn?.classList.toggle('active', view === 'grid');
        this.elements.listViewBtn?.classList.toggle('active', view === 'list');
        
        // Update ARIA states
        this.elements.gridViewBtn?.setAttribute('aria-pressed', view === 'grid');
        this.elements.listViewBtn?.setAttribute('aria-pressed', view === 'list');
        
        // Re-render photos with new view
        this.renderPhotos();
        
        // Store preference
        localStorage.setItem('gallery-view', view);
        
        this.logAnalytics('view_changed', { view });
    }
    
    /**
     * Show loading state
     * @param {boolean} append - Whether this is for load more
     */
    showLoadingState(append = false) {
        if (append) {
            // Show loading in load more button
            const btnText = this.elements.loadMoreBtn?.querySelector('.btn-text');
            const btnSpinner = this.elements.loadMoreBtn?.querySelector('.btn-spinner');
            
            if (btnText) btnText.style.display = 'none';
            if (btnSpinner) btnSpinner.style.display = 'block';
            if (this.elements.loadMoreBtn) this.elements.loadMoreBtn.disabled = true;
        } else {
            // Show main loading state
            this.elements.loading?.style.setProperty('display', 'block');
            this.hideStates(['loading']);
        }
    }
    
    /**
     * Show error state
     * @param {string} message - Error message
     */
    showErrorState(message) {
        if (this.elements.errorText) {
            this.elements.errorText.textContent = message;
        }
        this.elements.error?.style.setProperty('display', 'block');
        this.hideStates(['error']);
    }
    
    /**
     * Show empty state
     */
    showEmptyState() {
        this.elements.empty?.style.setProperty('display', 'block');
        this.hideStates(['empty']);
    }
    
    /**
     * Hide all states except specified ones
     * @param {string[]} except - States to keep visible
     */
    hideStates(except = []) {
        const states = ['loading', 'error', 'empty', 'gallery'];
        states.forEach(state => {
            if (!except.includes(state)) {
                const element = this.elements[state];
                if (element) element.style.display = 'none';
            }
        });
    }
    
    /**
     * Update UI elements
     */
    updateUI() {
        // Update photo count
        if (this.elements.photoCount) {
            this.elements.photoCount.textContent = this.photos.length;
        }
        
        // Update last updated time
        this.updateLastUpdated();
        
        // Update load more button
        if (this.elements.loadMoreContainer) {
            this.elements.loadMoreContainer.style.display = this.hasMore ? 'block' : 'none';
        }
        
        // Reset load more button state
        const btnText = this.elements.loadMoreBtn?.querySelector('.btn-text');
        const btnSpinner = this.elements.loadMoreBtn?.querySelector('.btn-spinner');
        
        if (btnText) btnText.style.display = 'inline';
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (this.elements.loadMoreBtn) this.elements.loadMoreBtn.disabled = false;
    }
    
    /**
     * Update last updated timestamp
     */
    updateLastUpdated() {
        if (this.elements.lastUpdated && this.lastUpdated) {
            this.elements.lastUpdated.textContent = this.formatDate(this.lastUpdated.toISOString());
        }
    }
    
    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyboardNavigation(e) {
        // R key for refresh
        if (e.key === 'r' || e.key === 'R') {
            if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.refreshPhotos();
            }
        }
        
        // G key for grid view
        if (e.key === 'g' || e.key === 'G') {
            e.preventDefault();
            this.setView('grid');
        }
        
        // L key for list view
        if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            this.setView('list');
        }
    }
    
    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
        
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
    
    /**
     * Format bytes for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }
    
    /**
     * Truncate filename for display
     * @param {string} filename - Original filename
     * @returns {string} Truncated filename
     */
    truncateFilename(filename) {
        if (filename.length <= 30) return filename;
        const ext = filename.split('.').pop();
        const name = filename.substring(0, filename.lastIndexOf('.'));
        return `${name.substring(0, 25)}...${ext}`;
    }
    
    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Log analytics events
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    logAnalytics(event, data = {}) {
        // Send to Google Analytics if available
        if (typeof gtag !== 'undefined') {
            gtag('event', event, {
                event_category: 'gallery',
                ...data
            });
        }
        
        // Log to console in development
        if (window.location.hostname === 'localhost') {
            console.log('Analytics:', event, data);
        }
    }
}

// Initialize gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PhotoGallery();
});

// Service Worker registration for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}