// --- ELEMENT SELECTORS ---
const passwordModal = document.getElementById('password-modal');
const passwordForm = document.getElementById('password-form');
const passwordInput = document.getElementById('password-input');
const passwordError = document.getElementById('password-error');
const mainContent = document.getElementById('main-content');
const serviceList = document.getElementById('serviceList');
const searchInput = document.getElementById('searchInput');
const categoryFilters = document.getElementById('categoryFilters');
const noResults = document.getElementById('noResults');
let activeCategory = 'All';

// --- FIREBASE INIT ---
// Expect window.firebaseConfig to be defined in firebase-config.js
let db;
try {
    if (window.firebaseConfig && firebase?.apps?.length === 0) {
        firebase.initializeApp(window.firebaseConfig);
    } else if (window.firebaseConfig && !firebase?.apps?.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
    // Enable offline persistence (best effort)
    if (firebase?.firestore) {
        firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
        db = firebase.firestore();
        // Try to load category group mapping from Firestore config early
        loadCategoryGroupsConfig();
    }
} catch (_) {
    // No-op if Firebase not available; page will still render but without data
}

// --- RUNTIME DATA (from Firestore) ---
let serviceData = [];

// Category groups for organizing the overflow menu
const defaultCategoryGroups = {
    "Home Services": ["Electrician", "Plumber", "Handyman", "Carpenter", "Painter", "Roofer", "Contractor"],
    "Outdoor & Property": ["Landscaper"],
    "Personal & Family": ["Dog Walker", "Tutor"],
    "Health & Wellness": ["Nutritionist"],
    "Technology & Security": ["IT Support", "Security"],
    "Organization & Lifestyle": ["Home Organizer"]
};
let categoryGroups = defaultCategoryGroups;
let categoriesList = [];

async function loadCategoryGroupsConfig() {
    if (!db) return;
    try {
        const doc = await db.collection('config').doc('categoryGroups').get();
        if (doc.exists) {
            const data = doc.data();
            if (data && data.groups && typeof data.groups === 'object') {
                categoryGroups = data.groups;
                renderCategoryButtons();
                filterAndRender();
            }
        }
    } catch (e) {
        console.warn('Could not load categoryGroups from Firestore; using fallback');
    }
}

async function loadCategoriesConfig() {
    if (!db) return;
    try {
        const doc = await db.collection('config').doc('categories').get();
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.list)) {
                categoriesList = data.list.slice().sort();
                renderCategoryButtons();
            }
        }
    } catch (e) {
        console.warn('Could not load categories list from Firestore; will derive from services');
    }
}

// Subscribe to Firestore and keep a warm in-memory cache for instant filtering
let unsubscribeServices = null;
const startServicesSubscription = () => {
    if (!db) return Promise.resolve();
    return new Promise((resolve) => {
        unsubscribeServices = db.collection('services')
            .onSnapshot((snapshot) => {
                serviceData = snapshot.docs.map(doc => {
                    const d = doc.data();
                    let last = d.lastRecommended;
                    if (last && typeof last.toDate === 'function') {
                        last = last.toDate();
                    } else if (typeof last === 'string') {
                        last = new Date(last);
                    }
                    const iso = last instanceof Date && !isNaN(last) ? last.toISOString().slice(0, 10) : '';
                    return { id: doc.id, ...d, lastRecommended: iso };
                });
                if (!passwordModal || passwordModal.classList.contains('hidden')) {
                    renderCategoryButtons();
                    filterAndRender();
                }
                resolve();
            }, (err) => {
            });
    });
};

// --- UTILITY FUNCTIONS ---

const generateGoogleSearchUrl = (service) => {
    let searchTerms = [];
    if (service.businessName) searchTerms.push(service.businessName);
    if (service.firstName || service.lastName) {
        const fullName = `${service.firstName || ''} ${service.lastName || ''}`.trim();
        if (fullName) searchTerms.push(fullName);
    }
    if (service.category) searchTerms.push(service.category);
    searchTerms.push('in Scarsdale NY');
    const query = searchTerms.join(' ');
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

const IndexNumber = (num) => {
    return `<span class="font-mono text-xs text-scandi-muted tracking-widest opacity-60">${(num + 1).toString().padStart(2, '0')}</span>`;
};

// --- RENDER FUNCTIONS ---
const renderServices = (services) => {
    serviceList.innerHTML = '';
    if (services.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    services.forEach((service, index) => {
        const card = document.createElement('div');
        // Scandi Card Style
        card.className = 'group bg-white p-8 rounded-sm shadow-card hover:shadow-hover transition-all duration-500 ease-out flex flex-col h-full relative fade-in border border-scandi-line/50';
        card.style.animationDelay = `${index * 0.05}s`;

        let title = service.businessName || `${service.firstName} ${service.lastName}`;
        let subtitle = '';
        if (service.businessName && service.firstName) {
            subtitle = `${service.firstName} ${service.lastName}`;
        }

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const isOldRec = new Date(service.lastRecommended) < oneYearAgo;

        // Icons
        const MapPinIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
        const ClockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        const ArrowRightIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

        let recStatusHTML = '';
        if (isOldRec) {
            recStatusHTML = `<span class="flex items-center gap-2 text-xs text-red-800/60 font-medium">⚠️ Needs Update</span>`;
        } else {
            recStatusHTML = `<span class="flex items-center gap-2 text-xs text-scandi-muted"><span class="w-1.5 h-1.5 rounded-full bg-scandi-sage"></span> Rec: ${new Date(service.lastRecommended).toLocaleDateString([], {month:'short', day:'numeric'})}</span>`;
        }

        const sunnyBadgeHTML = service.sunnyApproved ? 
            `<div class="absolute top-0 right-0 bg-scandi-bg text-scandi-clay text-[10px] uppercase tracking-widest font-bold px-3 py-2 border-l border-b border-scandi-line z-10">
                ☀️ Sunny Approved
            </div>` : '';

        // Contact Actions
        let actionHTML = '';
        if (service.phone) {
             actionHTML = `<a href="tel:${service.phone.replace(/[^\d+]/g, '')}" class="text-sm font-medium text-scandi-text border-b border-scandi-clay/50 hover:border-scandi-clay transition-colors">${service.phone}</a>`;
        } else if (service.email) {
             actionHTML = `<a href="mailto:${service.email}" class="text-sm font-medium text-scandi-text border-b border-scandi-clay/50 hover:border-scandi-clay transition-colors truncate max-w-full block">${service.email}</a>`;
        } else {
             actionHTML = `<a href="${generateGoogleSearchUrl(service)}" target="_blank" rel="noopener noreferrer" class="text-xs uppercase tracking-widest text-scandi-muted hover:text-scandi-text flex items-center gap-2 group-hover:gap-3 transition-all">
                Google Search ${ArrowRightIcon}
             </a>`;
        }

        card.innerHTML = `
            ${sunnyBadgeHTML}
            
            <div class="flex justify-between items-start mb-6 pb-6 border-b border-scandi-line/50">
                ${IndexNumber(index)}
                <span class="text-xs uppercase tracking-widest font-medium text-scandi-sage">${service.category}</span>
            </div>
            
            <div class="flex-grow mb-6">
                <h3 class="font-serif text-2xl text-scandi-text mb-2 group-hover:text-scandi-clay transition-colors duration-300">${title}</h3>
                ${subtitle ? `<p class="text-sm text-scandi-muted italic mb-4">${subtitle}</p>` : ''}
                
                <div class="flex items-center gap-3 mt-4">
                     <div class="w-8 h-8 rounded-full bg-scandi-bg flex flex-col items-center justify-center text-center border border-scandi-line">
                        <span class="text-sm font-serif font-bold text-scandi-text leading-none">${service.recommendations}</span>
                    </div>
                    <span class="text-[10px] uppercase tracking-widest text-scandi-muted">Recommendations</span>
                </div>
            </div>

            <div class="pt-4 flex justify-between items-end">
                <div class="flex flex-col gap-2">
                    ${recStatusHTML}
                    <div class="mt-1">
                        ${actionHTML}
                    </div>
                </div>
            </div>
        `;
        serviceList.appendChild(card);
    });
};

const renderCategoryButtons = () => {
    // Calculate total recommendations per category
    const categoryTotals = {};
    serviceData.forEach(service => {
        if (!categoryTotals[service.category]) categoryTotals[service.category] = 0;
        categoryTotals[service.category] += service.recommendations;
    });

    if (Array.isArray(categoriesList) && categoriesList.length) {
        categoriesList.forEach(cat => {
            if (cat && !(cat in categoryTotals)) categoryTotals[cat] = 0;
        });
    }

    const sortedCategories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
    const topCategories = ['All', ...sortedCategories.slice(0, 5)];
    const overflowCategories = sortedCategories.slice(5);
    const isActiveInOverflow = overflowCategories.includes(activeCategory);
    
    categoryFilters.innerHTML = '';
    
    topCategories.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.className = `relative transition-colors duration-300 pb-1 text-sm font-medium ${
            activeCategory === category 
            ? 'text-scandi-text border-b border-scandi-text' 
            : 'text-scandi-muted hover:text-scandi-text'
        }`;
        button.dataset.category = category;
        categoryFilters.appendChild(button);
    });
    
    // Overflow
    if (overflowCategories.length > 0) {
        const overflowBtn = document.createElement('button');
        if (isActiveInOverflow) {
            overflowBtn.innerHTML = `${activeCategory} <span class="text-xs ml-1">▼</span>`;
            overflowBtn.className = 'text-scandi-text border-b border-scandi-text pb-1 text-sm font-medium';
            overflowBtn.id = 'active-overflow-btn';
        } else {
            overflowBtn.textContent = `More (${overflowCategories.length})`;
            overflowBtn.className = 'text-scandi-muted hover:text-scandi-text pb-1 text-sm font-medium italic';
            overflowBtn.id = 'overflow-btn';
        }
        categoryFilters.appendChild(overflowBtn);
        
        overflowBtn.addEventListener('click', () => {
            showOverflowDialog(overflowCategories, categoryTotals);
        });
    }
};

// --- OVERFLOW DIALOG ---
const showOverflowDialog = (overflowCategories, categoryTotals) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-scandi-dark/20 backdrop-blur-sm flex items-center justify-center z-[60] p-4';
    modal.id = 'overflow-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'bg-white rounded-sm shadow-hover border border-scandi-line max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col fade-in';
    
    const header = document.createElement('div');
    header.className = 'p-6 border-b border-scandi-line flex justify-between items-center bg-scandi-bg';
    header.innerHTML = `
        <h3 class="font-serif text-xl text-scandi-text">Categories</h3>
        <button id="close-overflow" class="text-scandi-muted hover:text-scandi-text">&times;</button>
    `;
    
    const body = document.createElement('div');
    body.className = 'p-6 overflow-y-auto bg-white';
    const list = document.createElement('div');
    list.className = 'space-y-6';

    const groupedCategories = {};
    const ungroupedCategories = [];
    
    overflowCategories.forEach(category => {
        let foundGroup = false;
        for (const [groupName, categories] of Object.entries(categoryGroups)) {
            if (categories.includes(category)) {
                if (!groupedCategories[groupName]) groupedCategories[groupName] = [];
                groupedCategories[groupName].push(category);
                foundGroup = true;
                break;
            }
        }
        if (!foundGroup) ungroupedCategories.push(category);
    });

    const renderGroup = (name, cats) => {
        const groupDiv = document.createElement('div');
        groupDiv.innerHTML = `<div class="text-xs font-mono text-scandi-muted uppercase tracking-widest mb-3">${name}</div>`;
        const itemContainer = document.createElement('div');
        itemContainer.className = 'grid grid-cols-1 gap-2';
        
        cats.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `w-full text-left p-3 rounded-sm hover:bg-scandi-bg transition flex justify-between items-center border ${activeCategory === cat ? 'border-scandi-clay bg-scandi-bg' : 'border-scandi-line'}`;
            btn.innerHTML = `
                <span class="font-serif text-scandi-text text-sm">${cat}</span>
                <span class="text-xs font-mono text-scandi-muted">${categoryTotals[cat]}</span>
            `;
            btn.addEventListener('click', () => {
                activeCategory = cat;
                renderCategoryButtons();
                filterAndRender();
                document.body.removeChild(modal);
            });
            itemContainer.appendChild(btn);
        });
        groupDiv.appendChild(itemContainer);
        list.appendChild(groupDiv);
    };

    Object.entries(groupedCategories).forEach(([name, cats]) => renderGroup(name, cats));
    if (ungroupedCategories.length > 0) renderGroup('Other', ungroupedCategories);

    body.appendChild(list);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);
    
    modal.querySelector('#close-overflow').addEventListener('click', () => document.body.removeChild(modal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) document.body.removeChild(modal);
    });
};

// --- EVENT HANDLERS ---
const filterAndRender = () => {
    const searchTerm = searchInput.value.toLowerCase();
    let filteredServices = serviceData;
    if (activeCategory !== 'All') {
        filteredServices = filteredServices.filter(service => service.category === activeCategory);
    }
    if (searchTerm) {
        filteredServices = filteredServices.filter(service => 
            (service.businessName && service.businessName.toLowerCase().includes(searchTerm)) ||
            (service.firstName && service.firstName.toLowerCase().includes(searchTerm)) ||
            (service.lastName && service.lastName.toLowerCase().includes(searchTerm)) ||
            (service.phone && service.phone.toLowerCase().includes(searchTerm)) ||
            (service.email && service.email.toLowerCase().includes(searchTerm)) ||
            (service.category && service.category.toLowerCase().includes(searchTerm))
        );
    }
    filteredServices.sort((a, b) => {
        if (b.recommendations !== a.recommendations) return b.recommendations - a.recommendations;
        return new Date(b.lastRecommended) - new Date(a.lastRecommended);
    });
    renderServices(filteredServices);
};

let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    serviceList.style.opacity = '0.5';
    searchTimeout = setTimeout(() => {
        filterAndRender();
        serviceList.style.opacity = '1';
    }, 250);
});

categoryFilters.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    if (e.target.id === 'overflow-btn' || e.target.id === 'active-overflow-btn') return;
    
    const newCategory = e.target.dataset.category;
    if (newCategory === activeCategory) return;

    activeCategory = newCategory;
    renderCategoryButtons();
    filterAndRender();
});

// --- PASSWORD PROTECTION ---
passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPassword = passwordInput.value;
    const correctPassword = 'raiders';

    if (enteredPassword === correctPassword) {
        passwordError.classList.add('hidden');
        passwordModal.style.opacity = '0';
        setTimeout(() => {
            passwordModal.classList.add('hidden');
            mainContent.classList.remove('hidden');
            Promise.all([
                loadCategoryGroupsConfig(),
                loadCategoriesConfig(),
                startServicesSubscription(),
            ]).then(() => {
                renderCategoryButtons();
                filterAndRender();
            });
        }, 500);
    } else {
        passwordError.classList.remove('hidden');
        passwordInput.value = '';
        passwordInput.focus();
        passwordForm.parentElement.classList.add('animate-shake');
        setTimeout(() => passwordForm.parentElement.classList.remove('animate-shake'), 600);
    }
});
