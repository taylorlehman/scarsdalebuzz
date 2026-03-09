// --- FIREBASE INIT ---
let db;
let currentUser = null;

try {
    if (window.firebaseConfig && !firebase?.apps?.length) {
        firebase.initializeApp(window.firebaseConfig);
    } else if (window.firebaseConfig && !firebase?.apps?.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
    if (firebase?.firestore) {
        db = firebase.firestore();
    }
} catch (_) {
    console.error("Firebase init failed");
}

// --- ELEMENTS ---
const form = document.getElementById('suggestForm');
const categorySelect = document.getElementById('category');
const newCategoryContainer = document.getElementById('newCategoryContainer');
const newCategoryInput = document.getElementById('newCategory');
const authModal = document.getElementById('auth-prompt-modal');
const successMessage = document.getElementById('successMessage');
const submitBtn = document.getElementById('submitBtn');

// --- AUTH CHECK ---
firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    if (!user) {
        // Show auth modal if not logged in
        authModal.classList.remove('hidden');
        
        // Update login link with redirect
        const loginLink = document.getElementById('login-link');
        if (loginLink) {
            const currentUrl = encodeURIComponent(window.location.href);
            loginLink.href = `../login.html?redirect=${currentUrl}`;
        }
    } else {
        authModal.classList.add('hidden');
    }
});

// --- TAG INPUT LOGIC ---
const TagInput = {
    selected: new Set(),
    allCategories: [],
    container: null,
    input: null,
    dropdown: null,
    
    init(containerId, initialCategories = []) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.selected = new Set(initialCategories);
        this.render();
        
        // Global click to close dropdown
        document.addEventListener('click', (e) => {
            if (this.dropdown && !this.container.contains(e.target)) {
                this.closeDropdown();
            }
        });
    },
    
    setCategories(categories) {
        this.allCategories = categories;
    },
    
    render() {
        this.container.innerHTML = '';
        this.container.className = 'relative'; // Wrapper for positioning
        
        // 1. Input Area (Tags + Input)
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-wrap gap-2 p-3 border border-scandi-line rounded-sm bg-white min-h-[48px] focus-within:border-scandi-clay transition-colors';
        
        // Render Selected Tags
        this.selected.forEach(cat => {
            const tag = document.createElement('span');
            tag.className = 'bg-scandi-bg text-scandi-text text-xs font-medium px-2 py-1 rounded-sm flex items-center gap-1 border border-scandi-line/50';
            tag.innerHTML = `
                ${cat}
                <button type="button" class="hover:text-red-500 font-bold ml-1 px-1 text-scandi-muted hover:text-red-500" data-remove="${cat}">&times;</button>
            `;
            tag.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeCategory(cat);
            });
            wrapper.appendChild(tag);
        });
        
        // Input Field
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'flex-grow min-w-[120px] outline-none text-sm bg-transparent placeholder-scandi-muted/70';
        this.input.placeholder = this.selected.size === 0 ? 'Select or type category...' : '';
        
        // Input Events
        this.input.addEventListener('input', () => this.filterDropdown());
        this.input.addEventListener('focus', () => this.filterDropdown());
        this.input.addEventListener('click', () => {
            if (this.dropdown.classList.contains('hidden')) {
                this.filterDropdown();
            }
        });
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addCurrentInput();
            } else if (e.key === 'Backspace' && this.input.value === '' && this.selected.size > 0) {
                // Remove last tag on backspace if input empty
                const last = Array.from(this.selected).pop();
                this.removeCategory(last);
            }
        });
        
        wrapper.appendChild(this.input);
        this.container.appendChild(wrapper);
        
        // 2. Dropdown Menu
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'absolute top-full left-0 right-0 mt-1 bg-white border border-scandi-line rounded-sm shadow-lg max-h-60 overflow-y-auto z-50 hidden';
        this.container.appendChild(this.dropdown);
    },
    
    filterDropdown() {
        const query = this.input.value.toLowerCase().trim();
        this.dropdown.innerHTML = '';
        
        // Filter matches
        let matches = this.allCategories.filter(c => 
            c.toLowerCase().includes(query) && !this.selected.has(c)
        );
        
        // If query is empty, show all (or top) remaining options
        if (!query) {
            matches = this.allCategories.filter(c => !this.selected.has(c));
        }

        // "Add new" option if query exists and no exact match
        const exactMatch = matches.some(c => c.toLowerCase() === query);
        if (query && !exactMatch) {
            const addOption = document.createElement('div');
            addOption.className = 'p-3 text-sm text-scandi-clay font-medium hover:bg-scandi-bg cursor-pointer border-b border-scandi-line/30 flex items-center gap-2';
            addOption.innerHTML = `<span>+ Add "${this.input.value}"</span>`;
            addOption.addEventListener('click', () => this.addCurrentInput());
            this.dropdown.appendChild(addOption);
        }
        
        if (matches.length === 0 && !query) {
             this.closeDropdown();
             return;
        }
        
        matches.forEach(cat => {
            const option = document.createElement('div');
            option.className = 'p-3 text-sm text-scandi-text hover:bg-scandi-bg cursor-pointer';
            option.textContent = cat;
            option.addEventListener('click', () => {
                this.selectCategory(cat);
            });
            this.dropdown.appendChild(option);
        });
        
        if (this.dropdown.children.length > 0) {
            this.dropdown.classList.remove('hidden');
        } else {
            this.dropdown.classList.add('hidden');
        }
    },
    
    addCurrentInput() {
        const val = this.input.value.trim();
        if (val) {
            // Capitalize first letter for consistency
            const formatted = val.charAt(0).toUpperCase() + val.slice(1);
            this.selectCategory(formatted);
        }
    },
    
    selectCategory(cat) {
        this.selected.add(cat);
        this.input.value = '';
        this.render();
        this.input.focus(); // Keep focus
        this.closeDropdown();
    },
    
    removeCategory(cat) {
        this.selected.delete(cat);
        this.render();
    },
    
    closeDropdown() {
        if (this.dropdown) this.dropdown.classList.add('hidden');
    },
    
    getValues() {
        return Array.from(this.selected);
    }
};

// --- LOAD CATEGORIES ---
async function loadCategories() {
    if (!db) return;
    
    let categoriesList = [];
    
    // Try to load from config
    try {
        const doc = await db.collection('config').doc('categories').get();
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.list)) {
                categoriesList = data.list.slice().sort();
            }
        }
    } catch (e) {
        console.warn('Could not load categories list from Firestore');
    }
    
    // If config failed or empty, try to derive from services (fallback)
    if (categoriesList.length === 0) {
        try {
            const snap = await db.collection('services').limit(100).get(); // Limit to avoid reading too much
            const set = new Set();
            snap.forEach(doc => {
                const data = doc.data();
                if (data.categories) {
                    data.categories.forEach(c => set.add(c));
                } else if (data.category) {
                    set.add(data.category);
                }
            });
            categoriesList = Array.from(set).sort();
        } catch(e) {}
    }

    // Setup Tag Input
    // Hide original select
    categorySelect.classList.add('hidden');
    
    // Create container if missing
    let tagContainer = document.getElementById('tag-input-container');
    if (!tagContainer) {
        tagContainer = document.createElement('div');
        tagContainer.id = 'tag-input-container';
        categorySelect.parentNode.insertBefore(tagContainer, categorySelect);
    }
    
    // Init TagInput
    TagInput.init('tag-input-container');
    TagInput.setCategories(categoriesList);
}

// --- FORM SUBMISSION ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        authModal.classList.remove('hidden');
        return;
    }

    const selectedCategories = TagInput.getValues();
    
    const businessName = document.getElementById('businessName').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();

    if (selectedCategories.length === 0 || (!businessName && !firstName && !lastName)) {
        alert('Please provide at least one category and a business/contact name.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        await db.collection('suggested_services').add({
            categories: selectedCategories,
            category: selectedCategories[0], // Backward compatibility
            businessName,
            firstName,
            lastName,
            phone,
            email,
            suggestedBy: currentUser.uid,
            suggestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });

        // Show success
        form.classList.add('hidden');
        document.querySelector('.mb-8.text-center').classList.add('hidden'); // Hide header
        successMessage.classList.remove('hidden');

    } catch (e) {
        console.error('Error submitting suggestion:', e);
        alert('Something went wrong. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Suggestion';
    }
});

// Initialize
loadCategories();

