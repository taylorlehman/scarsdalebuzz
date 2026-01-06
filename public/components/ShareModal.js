class ShareModal {
    constructor() {
        this.render();
        this.modal = document.getElementById('share-modal');
        this.urlInput = document.getElementById('share-url-input');
        this.copyBtn = document.getElementById('share-copy-btn');
        this.closeBtn = document.getElementById('share-close-btn');
        this.overlay = document.getElementById('share-overlay');
        this.title = document.getElementById('share-title');
        
        this.attachListeners();
    }

    render() {
        if (document.getElementById('share-modal')) return;

        const modalHTML = `
            <div id="share-overlay" class="fixed inset-0 bg-scandi-dark/20 backdrop-blur-sm z-[80] hidden flex items-center justify-center p-4 transition-opacity duration-300 opacity-0">
                <div id="share-modal" class="bg-white rounded-sm shadow-hover border border-scandi-line w-full max-w-md transform scale-95 transition-transform duration-300 relative overflow-hidden">
                    
                    <!-- Header -->
                    <div class="p-6 border-b border-scandi-line flex justify-between items-center bg-scandi-bg">
                        <h3 id="share-title" class="font-serif text-xl text-scandi-text">Share</h3>
                        <button id="share-close-btn" class="text-scandi-muted hover:text-scandi-text transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-8">
                        <p class="text-sm text-scandi-muted mb-4">Copy the link below to share with your neighbors.</p>
                        
                        <div class="flex items-center gap-2 bg-scandi-bg/30 p-2 rounded-sm border border-scandi-line focus-within:border-scandi-clay transition-colors">
                            <input type="text" id="share-url-input" readonly class="w-full bg-transparent border-none text-sm text-scandi-text font-mono focus:ring-0 p-2 outline-none" onclick="this.select()">
                            <button id="share-copy-btn" class="px-4 py-2 bg-white border border-scandi-line text-xs font-mono uppercase tracking-widest text-scandi-text hover:bg-scandi-text hover:text-white transition-all rounded-sm shadow-sm shrink-0">
                                Copy
                            </button>
                        </div>
                    </div>
                    
                    <!-- Decor -->
                    <div class="absolute top-0 right-0 w-16 h-16 bg-scandi-clay/5 rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    attachListeners() {
        this.closeBtn.addEventListener('click', () => this.hide());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        this.copyBtn.addEventListener('click', async () => {
            const url = this.urlInput.value;
            try {
                await navigator.clipboard.writeText(url);
                const originalText = this.copyBtn.textContent;
                this.copyBtn.textContent = 'Copied!';
                this.copyBtn.classList.add('bg-scandi-sage', 'text-white', 'border-scandi-sage');
                
                setTimeout(() => {
                    this.copyBtn.textContent = originalText;
                    this.copyBtn.classList.remove('bg-scandi-sage', 'text-white', 'border-scandi-sage');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        });
    }

    show(url, title = 'Share Link') {
        this.urlInput.value = url;
        this.title.textContent = title;
        this.overlay.classList.remove('hidden');
        
        // Small delay to allow display:block to apply before opacity transition
        requestAnimationFrame(() => {
            this.overlay.classList.remove('opacity-0');
            this.modal.classList.remove('scale-95');
            this.modal.classList.add('scale-100');
        });
        
        this.urlInput.select();
    }

    hide() {
        this.overlay.classList.add('opacity-0');
        this.modal.classList.remove('scale-100');
        this.modal.classList.add('scale-95');
        
        setTimeout(() => {
            this.overlay.classList.add('hidden');
        }, 300);
    }
}

// Expose globally
window.ShareModal = ShareModal;
