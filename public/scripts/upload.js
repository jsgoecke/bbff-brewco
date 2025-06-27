/**
 * Upload JavaScript for BBFF & HMB Brewing Co. Photo Gallery
 * Handles file uploads with drag-and-drop, progress tracking, and validation
 */

class PhotoUploader {
    constructor() {
        this.files = [];
        this.isUploading = false;
        this.uploadedCount = 0;
        this.failedCount = 0;
        
        // Configuration
        this.config = {
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxFiles: 10,
            allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
            uploadEndpoint: '/api/upload'
        };
        
        // DOM elements
        this.elements = {
            form: document.getElementById('upload-form'),
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('file-input'),
            progressContainer: document.getElementById('upload-progress'),
            progressList: document.getElementById('progress-list'),
            summary: document.getElementById('upload-summary'),
            summaryText: document.getElementById('summary-text'),
            viewGalleryBtn: document.getElementById('view-gallery-btn'),
            uploadMoreBtn: document.getElementById('upload-more-btn')
        };
        
        this.init();
    }
    
    /**
     * Initialize the uploader
     */
    init() {
        this.bindEvents();
        this.checkAuthentication();
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Drop zone events
        this.elements.dropZone?.addEventListener('click', () => {
            this.elements.fileInput?.click();
        });
        
        this.elements.dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('dragover');
        });
        
        this.elements.dropZone?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!this.elements.dropZone.contains(e.relatedTarget)) {
                this.elements.dropZone.classList.remove('dragover');
            }
        });
        
        this.elements.dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('dragover');
            
            const files = Array.from(e.dataTransfer.files);
            this.handleFiles(files);
        });
        
        // File input change
        this.elements.fileInput?.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFiles(files);
        });
        
        // Summary buttons
        this.elements.viewGalleryBtn?.addEventListener('click', () => {
            window.location.href = '/';
        });
        
        this.elements.uploadMoreBtn?.addEventListener('click', () => {
            this.resetUploader();
        });
        
        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                this.handlePaste(e);
            }
        });
        
        // Paste support
        document.addEventListener('paste', (e) => {
            this.handlePaste(e);
        });
    }
    
    /**
     * Handle file selection
     * @param {File[]} files - Selected files
     */
    handleFiles(files) {
        if (this.isUploading) {
            this.showNotification('Upload in progress. Please wait.', 'warning');
            return;
        }
        
        // Filter valid image files
        const imageFiles = files.filter(file => 
            this.config.allowedTypes.includes(file.type)
        );
        
        if (imageFiles.length === 0) {
            this.showNotification('No valid image files selected.', 'error');
            return;
        }
        
        if (imageFiles.length > this.config.maxFiles) {
            this.showNotification(`Maximum ${this.config.maxFiles} files allowed.`, 'error');
            return;
        }
        
        // Validate files
        const validationResults = this.validateFiles(imageFiles);
        const validFiles = validationResults.filter(result => result.valid);
        const invalidFiles = validationResults.filter(result => !result.valid);
        
        if (invalidFiles.length > 0) {
            const errors = invalidFiles.map(result => 
                `${result.file.name}: ${result.error}`
            ).join('\n');
            this.showNotification(`Invalid files:\n${errors}`, 'error');
        }
        
        if (validFiles.length === 0) {
            return;
        }
        
        this.files = validFiles.map(result => result.file);
        this.uploadFiles();
    }
    
    /**
     * Handle paste events for clipboard images
     * @param {ClipboardEvent} e - Paste event
     */
    handlePaste(e) {
        const items = Array.from(e.clipboardData?.items || []);
        const files = items
            .filter(item => item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter(Boolean);
        
        if (files.length > 0) {
            e.preventDefault();
            this.handleFiles(files);
        }
    }
    
    /**
     * Validate files before upload
     * @param {File[]} files - Files to validate
     * @returns {Array} Validation results
     */
    validateFiles(files) {
        return files.map(file => {
            // Check file size
            if (file.size > this.config.maxFileSize) {
                return {
                    file,
                    valid: false,
                    error: `File too large (${this.formatBytes(file.size)}). Maximum size is ${this.formatBytes(this.config.maxFileSize)}.`
                };
            }
            
            // Check file type
            if (!this.config.allowedTypes.includes(file.type)) {
                return {
                    file,
                    valid: false,
                    error: `Unsupported file type (${file.type}). Allowed types: JPEG, PNG, WebP.`
                };
            }
            
            return { file, valid: true };
        });
    }
    
    /**
     * Upload files to the server
     */
    async uploadFiles() {
        if (this.files.length === 0) return;
        
        this.isUploading = true;
        this.uploadedCount = 0;
        this.failedCount = 0;
        
        // Show progress container
        this.elements.progressContainer.style.display = 'block';
        this.elements.progressList.innerHTML = '';
        
        // Hide summary
        this.elements.summary.style.display = 'none';
        
        // Create progress items
        const progressItems = this.files.map(file => 
            this.createProgressItem(file)
        );
        
        try {
            // Create form data
            const formData = new FormData();
            this.files.forEach(file => {
                formData.append('photos', file);
            });
            
            // Get authentication token
            const token = await this.getAuthToken();
            
            // Upload with progress tracking
            const response = await this.uploadWithProgress(formData, token, progressItems);
            
            if (response.ok) {
                const result = await response.json();
                this.handleUploadSuccess(result, progressItems);
            } else {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            this.handleUploadError(error, progressItems);
        } finally {
            this.isUploading = false;
        }
    }
    
    /**
     * Create progress item for a file
     * @param {File} file - File to create progress for
     * @returns {HTMLElement} Progress item element
     */
    createProgressItem(file) {
        const item = document.createElement('div');
        item.className = 'progress-item';
        item.innerHTML = `
            <div class="progress-info">
                <div class="progress-filename">${this.escapeHtml(file.name)}</div>
                <div class="progress-status">Preparing...</div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-icon">⏳</div>
        `;
        
        this.elements.progressList.appendChild(item);
        return item;
    }
    
    /**
     * Upload with progress tracking
     * @param {FormData} formData - Form data to upload
     * @param {string} token - Authentication token
     * @param {HTMLElement[]} progressItems - Progress tracking elements
     * @returns {Promise<Response>} Upload response
     */
    async uploadWithProgress(formData, token, progressItems) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Track upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressItems.forEach(item => {
                        const progressBar = item.querySelector('.progress-fill');
                        const status = item.querySelector('.progress-status');
                        
                        if (progressBar) {
                            progressBar.style.width = `${percentComplete}%`;
                        }
                        
                        if (status) {
                            status.textContent = `Uploading... ${Math.round(percentComplete)}%`;
                        }
                    });
                }
            });
            
            // Handle completion
            xhr.addEventListener('load', () => {
                progressItems.forEach(item => {
                    const status = item.querySelector('.progress-status');
                    if (status) {
                        status.textContent = 'Processing...';
                    }
                });
                
                resolve(new Response(xhr.responseText, {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    headers: { 'Content-Type': 'application/json' }
                }));
            });
            
            // Handle errors
            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });
            
            xhr.addEventListener('abort', () => {
                reject(new Error('Upload cancelled'));
            });
            
            // Start upload
            xhr.open('POST', this.config.uploadEndpoint);
            
            // Add authentication header
            if (token) {
                xhr.setRequestHeader('X-Upload-Token', token);
            }
            
            xhr.send(formData);
        });
    }
    
    /**
     * Handle successful upload
     * @param {Object} result - Upload result
     * @param {HTMLElement[]} progressItems - Progress tracking elements
     */
    handleUploadSuccess(result, progressItems) {
        const successfulPhotos = result.photos || [];
        const errors = result.errors || [];
        
        // Update progress items
        progressItems.forEach((item, index) => {
            const filename = this.files[index].name;
            const success = successfulPhotos.find(photo => 
                photo.filename === filename
            );
            const error = errors.find(err => err.filename === filename);
            
            const status = item.querySelector('.progress-status');
            const icon = item.querySelector('.progress-icon');
            
            if (success) {
                item.classList.add('success');
                if (status) status.textContent = 'Upload complete';
                if (icon) icon.textContent = '✅';
                this.uploadedCount++;
            } else if (error) {
                item.classList.add('error');
                if (status) status.textContent = error.error || 'Upload failed';
                if (icon) icon.textContent = '❌';
                this.failedCount++;
            }
        });
        
        // Show summary
        this.showSummary();
        
        // Log analytics
        this.logAnalytics('upload_complete', {
            total: this.files.length,
            successful: this.uploadedCount,
            failed: this.failedCount
        });
    }
    
    /**
     * Handle upload error
     * @param {Error} error - Upload error
     * @param {HTMLElement[]} progressItems - Progress tracking elements
     */
    handleUploadError(error, progressItems) {
        progressItems.forEach(item => {
            item.classList.add('error');
            const status = item.querySelector('.progress-status');
            const icon = item.querySelector('.progress-icon');
            
            if (status) status.textContent = 'Upload failed';
            if (icon) icon.textContent = '❌';
        });
        
        this.failedCount = this.files.length;
        this.showSummary();
        this.showNotification(`Upload failed: ${error.message}`, 'error');
        
        this.logAnalytics('upload_error', { error: error.message });
    }
    
    /**
     * Show upload summary
     */
    showSummary() {
        let summaryText = '';
        
        if (this.uploadedCount > 0 && this.failedCount === 0) {
            summaryText = `Successfully uploaded ${this.uploadedCount} photo${this.uploadedCount !== 1 ? 's' : ''}! `;
            summaryText += 'Photos are now available in the gallery with watermarks applied.';
        } else if (this.uploadedCount > 0 && this.failedCount > 0) {
            summaryText = `Uploaded ${this.uploadedCount} photo${this.uploadedCount !== 1 ? 's' : ''} successfully. `;
            summaryText += `${this.failedCount} photo${this.failedCount !== 1 ? 's' : ''} failed to upload.`;
        } else {
            summaryText = 'All uploads failed. Please check the files and try again.';
        }
        
        this.elements.summaryText.textContent = summaryText;
        this.elements.summary.style.display = 'block';
    }
    
    /**
     * Reset the uploader for new uploads
     */
    resetUploader() {
        this.files = [];
        this.uploadedCount = 0;
        this.failedCount = 0;
        
        // Hide progress and summary
        this.elements.progressContainer.style.display = 'none';
        this.elements.summary.style.display = 'none';
        
        // Clear file input
        if (this.elements.fileInput) {
            this.elements.fileInput.value = '';
        }
        
        // Reset drop zone
        this.elements.dropZone?.classList.remove('dragover');
    }
    
    /**
     * Get authentication token
     * @returns {string|null} Authentication token
     */
    async getAuthToken() {
        // In development, use a simple token
        if (window.location.hostname === 'localhost') {
            return 'dev-upload-token';
        }
        
        // In production, Cloudflare Access handles authentication
        // The JWT is automatically included in requests
        return null;
    }
    
    /**
     * Check authentication status
     */
    async checkAuthentication() {
        try {
            const response = await fetch('/api/upload', {
                method: 'GET' // This should return method not allowed but confirm auth
            });
            
            if (response.status === 401) {
                this.showNotification('Authentication required. Please log in.', 'error');
                // Redirect to login if needed
                return false;
            }
            
            return true;
        } catch (error) {
            console.warn('Could not verify authentication:', error);
            return true; // Assume authenticated for now
        }
    }
    
    /**
     * Show notification message
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, error, warning)
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 1rem;
            right: 1rem;
            background: ${type === 'error' ? '#fed7d7' : type === 'warning' ? '#fef5e7' : '#ebf8ff'};
            color: ${type === 'error' ? '#c53030' : type === 'warning' ? '#c05621' : '#2c5282'};
            padding: 1rem;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            max-width: 400px;
            z-index: 1000;
            border: 1px solid ${type === 'error' ? '#feb2b2' : type === 'warning' ? '#f6d55c' : '#bee3f8'};
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Remove on click
        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
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
        if (typeof gtag !== 'undefined') {
            gtag('event', event, {
                event_category: 'upload',
                ...data
            });
        }
        
        if (window.location.hostname === 'localhost') {
            console.log('Analytics:', event, data);
        }
    }
}

// Initialize uploader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PhotoUploader();
});