// ============================================================================
// GALLERY APPLICATION
// ============================================================================

// State Management
const state = {
    allItems: [],
    baseUrl: '',
    searchTimeout: null,
    lastRenderedKey: '',    // fingerprint of last render to skip no-op renders
    isAdminMode: false      // admin mode controls delete visibility
};

// Cached DOM references (set once on DOMContentLoaded)
const dom = {
    gallery: null,
    searchBar: null,
    clearBtn: null,
    itemCount: null,
    template: null
};

// Constants
const DEBOUNCE_DELAY = 150;
const ANIMATION_DELAY_STEP = 0.04;
const MAX_STAGGERED_CARDS = 12;  // only stagger first N cards; rest appear instantly

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const utils = {
    createVideoElement(src, options = {}) {
        const video = document.createElement('video');
        video.src = src;
        Object.assign(video, options);
        return video;
    },

    resetButton(button, text = 'Copy URL') {
        // Preserve the SVG icon inside the button
        const svg = button.querySelector('svg');
        button.textContent = '';
        if (svg) button.appendChild(svg);
        button.append(' ' + text);
        button.classList.remove('copied', 'failed');
    },

    debounce(func, delay) {
        return (...args) => {
            if (state.searchTimeout) clearTimeout(state.searchTimeout);
            state.searchTimeout = setTimeout(() => func(...args), delay);
        };
    },

    normalizeSrc(src) {
        return src.toLowerCase().trim();
    }
};

// ============================================================================
// DATA MANAGEMENT (uses server API to read/write gallery.json)
// ============================================================================

const dataManager = {
    deduplicateItems(items) {
        const seen = new Map();
        const uniqueItems = [];

        items.forEach(item => {
            const normalizedSrc = utils.normalizeSrc(item.src);
            if (!seen.has(normalizedSrc)) {
                seen.set(normalizedSrc, true);
                uniqueItems.push(item);
            }
        });

        return uniqueItems;
    },

    // Add a new item via server API (persists to gallery.json)
    async addItem(item) {
        const response = await fetch('/api/gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to add item');
        }

        return response.json();
    },

    // Delete an item via server API (removes from gallery.json)
    async deleteItem(src) {
        const response = await fetch('/api/gallery', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ src })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to delete item');
        }

        return response.json();
    },

    // Load gallery from server API (reads gallery.json)
    async loadGallery() {
        const gallery = dom.gallery;
        if (!gallery) return;

        try {
            const response = await fetch('/api/gallery');
            if (!response.ok) {
                throw new Error(`Failed to load gallery: ${response.status}`);
            }
            const data = await response.json();

            state.baseUrl = data.baseUrl;
            state.allItems = this.deduplicateItems(data.images || []);

            galleryRenderer.render();
        } catch (error) {
            console.error('Error loading gallery:', error);
            if (gallery) {
                gallery.innerHTML = '<p class="error">Error loading gallery data. Make sure you are running the server with <code>node server.js</code>.</p>';
            }
        }
    }
};

// ============================================================================
// FILTER & SEARCH
// ============================================================================

const filterManager = {
    getActiveFilter() {
        const activeTab = document.querySelector('.filter-tab.active');
        return activeTab?.dataset.filter || 'all';
    },

    getSearchTerm() {
        return dom.searchBar?.value.toLowerCase().trim() || '';
    },

    filterItems() {
        const activeFilter = this.getActiveFilter();
        const searchTerm = this.getSearchTerm();

        return state.allItems.filter(item => {
            const matchesFilter = activeFilter === 'all' || item.type === activeFilter;
            const matchesSearch = !searchTerm || item.title?.toLowerCase().includes(searchTerm);
            return matchesFilter && matchesSearch;
        });
    }
};

// ============================================================================
// GALLERY RENDERING
// ============================================================================

const galleryRenderer = {
    render() {
        if (!dom.gallery) return;

        const filteredItems = filterManager.filterItems();

        // Build a lightweight fingerprint to skip identical re-renders
        const key = filteredItems.map(i => i.src).join('|');
        if (key === state.lastRenderedKey) return;
        state.lastRenderedKey = key;

        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();

            if (filteredItems.length === 0) {
                fragment.appendChild(this.createNoResultsMessage());
            } else {
                filteredItems.forEach((item, index) => {
                    fragment.appendChild(cardBuilder.createCard(item, index));
                });
            }

            dom.gallery.replaceChildren(fragment);
            itemCounter.update(filteredItems.length);
        });
    },

    createNoResultsMessage() {
        const message = document.createElement('p');
        message.className = 'no-results';
        message.textContent = 'No items found matching your criteria.';
        return message;
    }
};

// ============================================================================
// ITEM COUNTER
// ============================================================================

const itemCounter = {
    update(count) {
        if (dom.itemCount) {
            dom.itemCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
        }
    }
};

// ============================================================================
// CARD BUILDER
// ============================================================================

const cardBuilder = {
    createCard(item, index = 0) {
        const card = dom.template.content.cloneNode(true);
        
        const elements = this.getCardElements(card);
        const fullUrl = `${state.baseUrl}${item.src}`;
        const title = item.title || 'Untitled';
        const type = item.type || 'image';

        // Stagger first N cards; rest appear instantly to avoid layout thrashing
        if (index < MAX_STAGGERED_CARDS) {
            elements.card.style.animationDelay = `${index * ANIMATION_DELAY_STEP}s`;
        } else {
            elements.card.style.animation = 'none';
            elements.card.style.opacity = '1';
        }

        // Setup media (image or video)
        this.setupMedia(elements, item, fullUrl, title, type);

        // Setup content
        elements.title.textContent = title;
        this.setupEventListeners(elements, fullUrl, title, type, item);

        return card;
    },

    getCardElements(card) {
        return {
            card: card.querySelector('.image-card'),
            wrapper: card.querySelector('.image-wrapper'),
            img: card.querySelector('img'),
            title: card.querySelector('h3'),
            copyBtn: card.querySelector('.copy-btn'),
            previewBtn: card.querySelector('.preview-btn'),
            deleteBtn: card.querySelector('.delete-btn')
        };
    },

    setupMedia(elements, item, fullUrl, title, type) {
        if (type === 'video') {
            elements.img.remove();
            const video = this.createVideoCard(fullUrl, elements.wrapper);
            video.addEventListener('click', () => modalManager.open(fullUrl, title, 'video'));
        } else {
            elements.img.src = fullUrl;
            elements.img.alt = title;
            elements.img.addEventListener('click', () => modalManager.open(fullUrl, title, 'image'));
        }
    },

    createVideoCard(src, wrapper) {
        const video = utils.createVideoElement(src, {
            controls: false,
            muted: true,
            loop: true,
            autoplay: true,
            playsInline: true
        });
        
        video.className = 'video-element';
        wrapper.appendChild(video);

        video.play().catch(() => {
            wrapper.addEventListener('mouseenter', () => video.play().catch(() => {}));
            wrapper.addEventListener('mouseleave', () => video.pause());
        });

        return video;
    },

    setupEventListeners(elements, fullUrl, title, type, item) {
        elements.previewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modalManager.open(fullUrl, title, type);
        });

        elements.copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clipboardManager.copy(fullUrl, elements.copyBtn);
        });

        elements.deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteManager.confirmAndDelete(item, elements.card);
        });

        // Only show delete button when admin mode is active
        elements.deleteBtn.classList.toggle('admin-visible', state.isAdminMode);
    }
};

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

const modalManager = {
    elements: null,

    init() {
        const modal = document.getElementById('imageModal');
        this.elements = {
            modal: modal,
            image: document.getElementById('modalImage'),
            video: null,
            title: document.getElementById('modalTitle'),
            copyBtn: document.querySelector('.modal-copy-btn'),
            backdrop: modal.querySelector('.modal-backdrop')
        };
    },

    open(mediaUrl, title, type = 'image') {
        if (!this.elements) this.init();

        this.elements.title.textContent = title;

        requestAnimationFrame(() => {
            if (type === 'video') {
                this.showVideo(mediaUrl);
            } else {
                this.showImage(mediaUrl, title);
            }

            utils.resetButton(this.elements.copyBtn);
            this.elements.copyBtn.onclick = () => clipboardManager.copy(mediaUrl, this.elements.copyBtn);
            
            this.elements.modal.classList.add('show');
            document.body.classList.add('modal-open');
        });
    },

    showVideo(url) {
        this.elements.image.classList.add('hidden');
        
        if (!this.elements.video) {
            this.elements.video = utils.createVideoElement('', {
                id: 'modalVideo',
                controls: true,
                autoplay: true,
                muted: false,
                loop: true
            });
            this.elements.video.className = 'modal-video';
            this.elements.title.parentNode.insertBefore(this.elements.video, this.elements.image);
        }

        this.elements.video.src = url;
        this.elements.video.classList.remove('hidden');
        this.elements.video.play().catch(() => {});
    },

    showImage(url, title) {
        if (this.elements.video) {
            this.elements.video.classList.add('hidden');
            this.elements.video.pause();
        }

        this.elements.image.classList.remove('hidden');
        this.elements.image.src = url;
        this.elements.image.alt = title;
    },

    close() {
        if (!this.elements) this.init();
        
        if (this.elements.video) {
            this.elements.video.pause();
        }

        requestAnimationFrame(() => {
            this.elements.modal.classList.remove('show');
            document.body.classList.remove('modal-open');
        });
    }
};

// ============================================================================
// CLIPBOARD MANAGEMENT
// ============================================================================

const clipboardManager = {
    async copy(text, button) {
        const svg = button.querySelector('svg');
        try {
            await navigator.clipboard.writeText(text);
            button.textContent = '';
            if (svg) button.appendChild(svg);
            button.append(' Copied!');
            button.classList.add('copied');
            setTimeout(() => utils.resetButton(button), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            button.textContent = '';
            if (svg) button.appendChild(svg);
            button.append(' Failed');
            button.classList.add('failed');
            setTimeout(() => utils.resetButton(button), 2000);
        }
    }
};

// ============================================================================
// ADMIN MODE MANAGEMENT
// ============================================================================

const adminManager = {
    modal: null,
    elements: null,

    init() {
        // Cache modal elements
        this.modal = document.getElementById('adminLoginModal');
        this.elements = {
            form: document.getElementById('adminLoginForm'),
            passwordInput: document.getElementById('adminPasswordInput'),
            errorMsg: document.getElementById('adminLoginError'),
            submitBtn: document.getElementById('adminLoginSubmit'),
            closeBtn: document.getElementById('adminLoginClose'),
            backdrop: this.modal?.querySelector('.modal-backdrop'),
            eyeBtn: document.getElementById('adminEyeBtn'),
            eyeOpen: document.getElementById('eyeOpen'),
            eyeClosed: document.getElementById('eyeClosed')
        };

        // Disable submit until there is at least one character
        if (this.elements.passwordInput && this.elements.submitBtn) {
            this.elements.submitBtn.disabled = true;
            this.elements.passwordInput.addEventListener('input', () => {
                const hasText = this.elements.passwordInput.value.trim().length > 0;
                this.elements.submitBtn.disabled = !hasText;
            });
        }

        // Check if admin mode was previously enabled in this browser session
        const saved = sessionStorage.getItem('gallery_admin_mode');
        if (saved === 'true') {
            state.isAdminMode = true;
            this.updateUI();
        }

        // Setup toggle button
        const toggleBtn = document.getElementById('adminToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }

        // Setup modal events
        this.bindModalEvents();
    },

    bindModalEvents() {
        if (!this.modal || !this.elements.form) return;

        // Form submit
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.verifyPassword();
        });

        // Close modal
        this.elements.closeBtn?.addEventListener('click', () => this.closeModal());
        this.elements.backdrop?.addEventListener('click', () => this.closeModal());

        // Toggle password visibility
        this.elements.eyeBtn?.addEventListener('click', () => {
            const input = this.elements.passwordInput;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            this.elements.eyeOpen?.classList.toggle('hidden', !isPassword);
            this.elements.eyeClosed?.classList.toggle('hidden', isPassword);
        });

        // Close on Escape
        this.modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });
    },

    toggle() {
        if (state.isAdminMode) {
            // Disable admin mode
            state.isAdminMode = false;
            sessionStorage.removeItem('gallery_admin_mode');
            this.updateUI();
        } else {
            // Open login modal
            this.openModal();
        }
    },

    openModal() {
        if (!this.modal) return;
        // Reset state
        this.elements.passwordInput.value = '';
        this.elements.errorMsg?.classList.add('hidden');
        this.elements.submitBtn.disabled = true;
        this.elements.submitBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Unlock Admin Mode
        `;

        // Reset password visibility
        this.elements.passwordInput.type = 'password';
        this.elements.eyeOpen?.classList.remove('hidden');
        this.elements.eyeClosed?.classList.add('hidden');

        this.modal.classList.add('show');
        document.body.classList.add('modal-open');
        setTimeout(() => this.elements.passwordInput.focus(), 200);
    },

    closeModal() {
        if (!this.modal) return;
        this.modal.classList.remove('show');
        document.body.classList.remove('modal-open');
    },

    async verifyPassword() {
        const password = this.elements.passwordInput.value;
        if (!password) {
            this.elements.errorMsg.textContent = 'Please enter a password.';
            this.elements.errorMsg.classList.remove('hidden');
            return;
        }

        // Show loading state
        this.elements.submitBtn.disabled = true;
        this.elements.submitBtn.innerHTML = '<div class="spinner"></div> Verifying...';
        this.elements.errorMsg?.classList.add('hidden');

        try {
            const response = await fetch('/api/admin/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success — close modal & enable admin
                state.isAdminMode = true;
                sessionStorage.setItem('gallery_admin_mode', 'true');
                this.elements.submitBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Access Granted!
                `;
                this.elements.submitBtn.style.background = 'linear-gradient(135deg, #34d399, #059669)';
                this.elements.submitBtn.style.boxShadow = '0 4px 20px rgba(52, 211, 153, 0.35)';

                setTimeout(() => {
                    this.closeModal();
                    this.updateUI();
                    // Reset button styles
                    this.elements.submitBtn.style.background = '';
                    this.elements.submitBtn.style.boxShadow = '';
                }, 1000);
            } else {
                // Wrong password
                this.elements.errorMsg.textContent = 'Incorrect password. Please try again.';
                this.elements.errorMsg.classList.remove('hidden');
                this.elements.submitBtn.disabled = true;
                this.elements.submitBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10 17 15 12 10 7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Unlock Admin Mode
                `;
                this.elements.passwordInput.value = '';
                this.elements.passwordInput.focus();
            }
        } catch (err) {
            console.error('Admin verify error:', err);
            this.elements.errorMsg.textContent = 'Could not verify. Make sure the server is running.';
            this.elements.errorMsg.classList.remove('hidden');
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Unlock Admin Mode
            `;
        }
    },

    updateUI() {
        const toggleBtn = document.getElementById('adminToggleBtn');
        const toggleText = document.getElementById('adminToggleText');

        if (state.isAdminMode) {
            toggleBtn?.classList.add('active');
            if (toggleText) toggleText.textContent = 'Admin ON';
        } else {
            toggleBtn?.classList.remove('active');
            if (toggleText) toggleText.textContent = 'Admin';
        }

        // Update all existing delete buttons visibility
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.classList.toggle('admin-visible', state.isAdminMode);
        });
    }
};

// ============================================================================
// DELETE MANAGEMENT
// ============================================================================

const deleteManager = {
    modal: null,
    elements: null,
    currentItem: null,
    currentCard: null,

    init() {
        this.modal = document.getElementById('deleteConfirmModal');
        if (!this.modal) return;

        this.elements = {
            titleSpan: document.getElementById('deleteItemTitle'),
            confirmBtn: document.getElementById('deleteConfirmBtn'),
            cancelBtn: document.getElementById('deleteCancelBtn'),
            backdrop: this.modal.querySelector('.modal-backdrop')
        };

        // Bind modal buttons
        this.elements.cancelBtn?.addEventListener('click', () => this.closeModal());
        this.elements.backdrop?.addEventListener('click', () => this.closeModal());

        this.elements.confirmBtn?.addEventListener('click', async () => {
            if (!this.currentItem || !this.currentCard) {
                this.closeModal();
                return;
            }
            await this.performDelete(this.currentItem, this.currentCard);
            this.closeModal();
        });
    },

    openModal(item, cardElement) {
        if (!this.modal || !this.elements) return;
        this.currentItem = item;
        this.currentCard = cardElement;

        const title = item.title || 'this asset';
        if (this.elements.titleSpan) {
            this.elements.titleSpan.textContent = `"${title}"`;
        }

        this.modal.classList.add('show');
        document.body.classList.add('modal-open');
    },

    closeModal() {
        if (!this.modal) return;
        this.modal.classList.remove('show');
        document.body.classList.remove('modal-open');
        this.currentItem = null;
        this.currentCard = null;
    },

    async confirmAndDelete(item, cardElement) {
        // Check if admin mode is enabled
        if (!state.isAdminMode) {
            alert('Admin mode must be enabled to delete items.\nClick the "Admin" button and enter the password.');
            return;
        }

        // Open styled confirmation modal
        if (!this.modal || !this.elements) {
            this.init();
        }
        this.openModal(item, cardElement);
    },

    async performDelete(item, cardElement) {
        try {
            // Delete from gallery.json via server API
            await dataManager.deleteItem(item.src);

            // Animate the card out
            if (cardElement) {
                cardElement.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                cardElement.style.transform = 'scale(0.85)';
                cardElement.style.opacity = '0';
            }

            // Remove from in-memory state after animation
            setTimeout(() => {
                const normalizedSrc = utils.normalizeSrc(item.src);
                state.allItems = state.allItems.filter(
                    i => utils.normalizeSrc(i.src) !== normalizedSrc
                );
                state.lastRenderedKey = '';   // invalidate render cache
                galleryRenderer.render();
            }, 300);
        } catch (err) {
            console.error('Delete error:', err);
            alert(err.message || 'Failed to delete item. Make sure the server is running.');
        }
    }
};

// ============================================================================
// SEARCH UI MANAGEMENT
// ============================================================================

const searchUI = {
    toggleClearButton() {
        if (!dom.searchBar || !dom.clearBtn) return;

        const hasText = dom.searchBar.value.trim().length > 0;
        const isVisible = dom.clearBtn.classList.contains('visible');

        if (hasText && !isVisible) {
            dom.clearBtn.classList.add('visible');
        } else if (!hasText && isVisible) {
            dom.clearBtn.classList.remove('visible');
        }
    },

    clear() {
        if (dom.searchBar) {
            dom.searchBar.value = '';
            this.toggleClearButton();
            galleryRenderer.render();
        }
    }
};

// ============================================================================
// UPLOAD MANAGER
// ============================================================================

const uploadManager = {
    elements: null,
    selectedType: null,

    init() {
        this.elements = {
            modal: document.getElementById('uploadModal'),
            form: document.getElementById('uploadForm'),
            srcInput: document.getElementById('uploadSrc'),
            titleInput: document.getElementById('uploadTitle'),
            typeValue: document.getElementById('uploadTypeValue'),
            typeOptions: document.querySelectorAll('.type-option'),
            previewContainer: document.getElementById('uploadPreviewContainer'),
            previewImg: document.getElementById('uploadPreviewImg'),
            previewVid: document.getElementById('uploadPreviewVid'),
            previewPlaceholder: document.getElementById('uploadPreviewPlaceholder'),
            submitBtn: document.getElementById('uploadSubmitBtn'),
            cancelBtn: document.getElementById('uploadCancelBtn'),
            triggerBtn: document.getElementById('uploadTriggerBtn'),
            closeBtn: document.querySelector('.upload-close-btn'),
            status: document.getElementById('uploadStatus'),
            backdrop: document.querySelector('.upload-modal .modal-backdrop')
        };

        this.bindEvents();
    },

    bindEvents() {
        // Open modal
        this.elements.triggerBtn.addEventListener('click', () => this.open());

        // Close modal
        this.elements.cancelBtn.addEventListener('click', () => this.close());
        this.elements.closeBtn.addEventListener('click', () => this.close());
        this.elements.backdrop.addEventListener('click', () => this.close());
        this.elements.modal.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) this.close();
        });

        // Type selector
        this.elements.typeOptions.forEach(btn => {
            btn.addEventListener('click', () => this.selectType(btn));
        });

        // Live preview when src changes
        let previewTimeout;
        this.elements.srcInput.addEventListener('input', () => {
            clearTimeout(previewTimeout);
            previewTimeout = setTimeout(() => this.updatePreview(), 500);
        });

        // Form submit
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });
    },

    open() {
        this.reset();
        this.elements.modal.classList.add('show');
        document.body.classList.add('modal-open');
        // Focus the first input
        setTimeout(() => this.elements.srcInput.focus(), 200);
    },

    close() {
        this.elements.modal.classList.remove('show');
        document.body.classList.remove('modal-open');
        this.reset();
    },

    reset() {
        this.elements.form.reset();
        this.selectedType = null;
        this.elements.typeValue.value = '';
        this.elements.typeOptions.forEach(btn => btn.classList.remove('selected'));
        this.elements.previewContainer.classList.add('hidden');
        this.elements.previewImg.classList.add('hidden');
        this.elements.previewVid.classList.add('hidden');
        this.elements.previewPlaceholder.classList.add('hidden');
        this.elements.status.classList.add('hidden');
        this.elements.status.classList.remove('success', 'error');
        this.elements.submitBtn.disabled = false;
    },

    selectType(btn) {
        this.elements.typeOptions.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedType = btn.dataset.type;
        this.elements.typeValue.value = this.selectedType;
        this.updatePreview();
    },

    updatePreview() {
        const src = this.elements.srcInput.value.trim();
        if (!src) {
            this.elements.previewContainer.classList.add('hidden');
            return;
        }

        const fullUrl = `${state.baseUrl}${src}`;
        const isVideo = this.selectedType === 'video' || /\.(mp4|webm|ogg)$/i.test(src);

        this.elements.previewContainer.classList.remove('hidden');
        this.elements.previewImg.classList.add('hidden');
        this.elements.previewVid.classList.add('hidden');
        this.elements.previewPlaceholder.classList.add('hidden');

        if (isVideo) {
            this.elements.previewVid.src = fullUrl;
            this.elements.previewVid.classList.remove('hidden');
            this.elements.previewVid.onerror = () => {
                this.elements.previewVid.classList.add('hidden');
                this.elements.previewPlaceholder.classList.remove('hidden');
            };
        } else {
            this.elements.previewImg.src = fullUrl;
            this.elements.previewImg.classList.remove('hidden');
            this.elements.previewImg.onerror = () => {
                this.elements.previewImg.classList.add('hidden');
                this.elements.previewPlaceholder.classList.remove('hidden');
            };
        }
    },

    showStatus(message, isError = false) {
        this.elements.status.textContent = message;
        this.elements.status.classList.remove('hidden', 'success', 'error');
        this.elements.status.classList.add(isError ? 'error' : 'success');
    },

    async submit() {
        const src = this.elements.srcInput.value.trim();
        const title = this.elements.titleInput.value.trim();
        const type = this.selectedType;

        // Validate
        if (!src) {
            this.showStatus('Please enter a URL path.', true);
            return;
        }
        if (!title) {
            this.showStatus('Please enter a title.', true);
            return;
        }
        if (!type) {
            this.showStatus('Please select a type.', true);
            return;
        }

        this.elements.submitBtn.disabled = true;

        try {
            const newItem = { src, title, type };

            // Save to gallery.json via server API
            await dataManager.addItem(newItem);

            // Also add to in-memory state and re-render (prepend to beginning)
            state.allItems.unshift(newItem);
            state.lastRenderedKey = '';   // invalidate render cache
            galleryRenderer.render();

            this.showStatus('Asset added to gallery successfully!');

            // Close modal after a short delay
            setTimeout(() => this.close(), 1200);
        } catch (err) {
            console.error('Upload error:', err);
            this.showStatus(err.message || 'Failed to add item.', true);
            this.elements.submitBtn.disabled = false;
        }
    }
};

// ============================================================================
// FILTER TABS HANDLER
// ============================================================================

const filterTabs = {
    init() {
        const tabs = document.querySelectorAll('.filter-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                galleryRenderer.render();
            });
        });
    }
};

// ============================================================================
// EVENT HANDLERS SETUP
// ============================================================================

const eventHandlers = {
    setupModal() {
        modalManager.init();
        
        const modal = modalManager.elements.modal;
        const closeBtn = modal.querySelector('.close-btn');
        const backdrop = modalManager.elements.backdrop;

        closeBtn.addEventListener('click', () => modalManager.close());
        
        // Close on backdrop click
        backdrop.addEventListener('click', () => modalManager.close());

        // Also close if clicking modal outside content
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modalManager.close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (modal.classList.contains('show')) modalManager.close();
                if (document.getElementById('uploadModal').classList.contains('show')) uploadManager.close();
                if (document.getElementById('adminLoginModal')?.classList.contains('show')) adminManager.closeModal();
            }
        });
    },

    setupSearch() {
        if (dom.searchBar) {
            const debouncedRender = utils.debounce(() => {
                searchUI.toggleClearButton();
                galleryRenderer.render();
            }, DEBOUNCE_DELAY);

            dom.searchBar.addEventListener('input', () => {
                searchUI.toggleClearButton();
                debouncedRender();
            });

            searchUI.toggleClearButton();
        }

        if (dom.clearBtn) {
            dom.clearBtn.addEventListener('click', () => searchUI.clear());
        }
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM references once — avoids repeated getElementById calls
    dom.gallery   = document.getElementById('imageGallery');
    dom.searchBar = document.getElementById('searchBar');
    dom.clearBtn  = document.getElementById('clearSearchBtn');
    dom.itemCount = document.getElementById('itemCount');
    dom.template  = document.getElementById('imageCardTemplate');

    eventHandlers.setupModal();
    eventHandlers.setupSearch();
    filterTabs.init();
    uploadManager.init();
    deleteManager.init();
    adminManager.init();
    dataManager.loadGallery();
});
