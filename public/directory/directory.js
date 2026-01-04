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

// Initialize activeCategory from URL parameter if present
const urlParams = new URLSearchParams(window.location.search);
let activeCategory = urlParams.get('category') || 'All';

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
let fuse;
let currentUser = null;
let userLikedServices = new Set();
let unsubscribeUser = null;
const userCache = new Map(); // uid -> { displayName, photoURL }

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

// --- USER DATA FETCHING ---
const fetchUser = async (uid) => {
    if (userCache.has(uid)) return userCache.get(uid);
    
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            const profile = {
                displayName: data.displayName || 'Neighbor',
                photoURL: data.photoURL || null
            };
            userCache.set(uid, profile);
            return profile;
        }
    } catch (e) {
        console.warn(`Failed to fetch user ${uid}`, e);
    }
    return { displayName: 'Neighbor', photoURL: null };
};

const hydrateAvatars = async () => {
    const avatars = document.querySelectorAll('.avatar-placeholder[data-uid]');
    const uidsToFetch = new Set();
    
    avatars.forEach(el => {
        if (!el.dataset.hydrated) uidsToFetch.add(el.dataset.uid);
    });

    if (uidsToFetch.size === 0) return;

    // Fetch all missing users
    const promises = Array.from(uidsToFetch).map(uid => fetchUser(uid));
    await Promise.all(promises);

    // Update DOM
    avatars.forEach(el => {
        if (el.dataset.hydrated) return;
        const uid = el.dataset.uid;
        const profile = userCache.get(uid);
        if (profile) {
            el.src = profile.photoURL || 'https://www.gravatar.com/avatar?d=mp';
            el.title = profile.displayName;
            el.alt = profile.displayName;
            el.dataset.hydrated = 'true';
            el.classList.remove('opacity-0');
        }
    });
};

const hydrateNames = async () => {
    const names = document.querySelectorAll('.avatar-name-placeholder[data-uid]');
    const uidsToFetch = new Set();
    
    names.forEach(el => {
        if (!el.dataset.hydrated) uidsToFetch.add(el.dataset.uid);
    });

    if (uidsToFetch.size === 0) return;

    // Fetch all missing users
    const promises = Array.from(uidsToFetch).map(uid => fetchUser(uid));
    await Promise.all(promises);

    // Update DOM
    names.forEach(el => {
        if (el.dataset.hydrated) return;
        const uid = el.dataset.uid;
        const profile = userCache.get(uid);
        if (profile) {
            el.textContent = profile.displayName;
            el.dataset.hydrated = 'true';
        }
    });
};

// --- AUTH LISTENER ---
const initAuthListener = () => {
    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        if (unsubscribeUser) {
            unsubscribeUser();
            unsubscribeUser = null;
        }
        
        if (user) {
            // Listen to real-time updates of user's liked services
            unsubscribeUser = db.collection('users').doc(user.uid)
                .onSnapshot((doc) => {
                    userLikedServices.clear();
                    if (doc.exists && doc.data().likedServices) {
                        doc.data().likedServices.forEach(id => userLikedServices.add(id));
                    }
                    filterAndRender({ keepOrder: true });
                });
        } else {
            userLikedServices.clear();
            filterAndRender({ keepOrder: true });
        }
    });
};

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

                // Initialize Fuse.js for robust search
                const fuseOptions = {
                    includeScore: true, // Agent: Enable scoring for debug
                    keys: [
                        { name: 'businessName', weight: 0.7 },
                        { name: 'category', weight: 0.6 },
                        { name: 'firstName', weight: 0.3 },
                        { name: 'lastName', weight: 0.3 }
                    ],
                    threshold: 0.3,
                    minMatchCharLength: 3,
                    ignoreLocation: true
                };
                if (window.Fuse) {
                    fuse = new Fuse(serviceData, fuseOptions);
                }

                if (!passwordModal || passwordModal.classList.contains('hidden')) {
                    renderCategoryButtons();
                    filterAndRender({ keepOrder: true });
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
    // Hide/Show No Results
    if (services.length === 0) {
        noResults.classList.remove('hidden');
        // Add "Suggest a Provider" button to No Results
        const existingBtn = noResults.querySelector('.suggest-btn-placeholder');
        if (!existingBtn) {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'suggest-btn-placeholder mt-6';
            btnContainer.innerHTML = `
                <a href="suggest.html" class="inline-block px-8 py-3 bg-scandi-text text-white font-mono text-xs uppercase tracking-widest rounded-sm hover:bg-scandi-clay transition-all duration-300 shadow-soft">
                    Suggest a Provider
                </a>
            `;
            noResults.appendChild(btnContainer);
        }
        serviceList.innerHTML = '';
        return;
    }
    noResults.classList.add('hidden');

    // Map existing cards for reconciliation
    const existingCards = new Map();
    Array.from(serviceList.children).forEach(card => {
        if (card.dataset.id) existingCards.set(card.dataset.id, card);
    });

    // Keep track of IDs processed in this render to handle removals later
    const processedIds = new Set();

    services.forEach((service, index) => {
        processedIds.add(service.id);
        const safeId = service.id.replace(/'/g, "\\'");
        
        let card = existingCards.get(service.id);
        const isNew = !card;

        if (isNew) {
            card = document.createElement('div');
            card.dataset.id = service.id;
            card.className = 'group bg-white p-8 rounded-sm shadow-card hover:shadow-hover transition-all duration-500 ease-out flex flex-col h-full relative fade-in border border-scandi-line/50';
            card.style.animationDelay = `${index * 0.05}s`;
        } else {
             // Reset animation for existing cards to prevent re-triggering
             card.style.animationDelay = '0s';
             card.classList.remove('fade-in');
        }

        const fullName = [service.firstName, service.lastName].filter(Boolean).join(' ');
        let title = service.businessName || fullName;
        let subtitle = '';
        if (service.businessName && fullName) {
            subtitle = fullName;
        }

        // Icons
        const ThumbsUpIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
        const ThumbsUpFilled = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
        const ArrowRightIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

        let recStatusHTML = '';
        if (service.lastRecommended) {
            recStatusHTML = `<span class="text-[10px] text-scandi-muted uppercase tracking-wider">Last Recommended: ${new Date(service.lastRecommended).toLocaleDateString([], {month:'short', day:'numeric', year: 'numeric'})}</span>`;
        }

        const sunnyBadgeHTML = ''; // Removed badge

        const bookingButtonHTML = service.sunnyApproved ? `
            <div class="mt-auto pt-2">
                <a href="../sunny/index.html" 
                   class="flex items-center justify-center gap-2 w-full bg-scandi-clay text-white text-xs font-bold uppercase tracking-wider py-2 px-3 rounded-sm hover:bg-scandi-text transition-all duration-300 shadow-sm hover:shadow-md group/btn">
                   <span>Ask Sunny to Book</span>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transform group-hover/btn:translate-x-1 transition-transform"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>` : '';

        // Contact Actions
        let actionHTML = '';
        if (service.phone) {
             actionHTML = `<a href="tel:${service.phone.replace(/[^\d+]/g, '')}" class="text-sm font-medium text-scandi-text border-b border-scandi-clay/50 hover:border-scandi-clay transition-colors">${service.phone}</a>`;
        } else if (service.email) {
             actionHTML = `<a href="mailto:${service.email}" class="text-sm font-medium text-scandi-text border-b border-scandi-clay/50 hover:border-scandi-clay transition-colors truncate max-w-full block">${service.email}</a>`;
        } else {
             actionHTML = `<a href="${generateGoogleSearchUrl(service)}" target="_blank" rel="noopener noreferrer" class="text-xs uppercase tracking-widest text-scandi-muted hover:text-scandi-text flex items-center gap-2 group-hover:gap-3 transition-all">
                Look Up Info on Google ${ArrowRightIcon}
             </a>`;
        }

        // Like Button State
        const isLiked = userLikedServices.has(service.id);
        const likeBtnClass = isLiked ? 'text-scandi-clay hover:text-scandi-text' : 'text-scandi-muted hover:text-scandi-clay';
        const likeIcon = isLiked ? ThumbsUpFilled : ThumbsUpIcon;

        // Recently Recommended Logic
        let recentlyRecommendedHTML = '';
        if (service.recentRecommenders && service.recentRecommenders.length > 0) {
            const avatars = service.recentRecommenders.map(rec => 
                `<img src="https://www.gravatar.com/avatar?d=mp" data-uid="${rec.uid}" class="avatar-placeholder opacity-0 w-6 h-6 rounded-full border border-white -ml-2 first:ml-0 object-cover bg-gray-100 transition-opacity duration-300">`
            ).join('');
            
            recentlyRecommendedHTML = `
                <div class="flex flex-col gap-1 cursor-pointer" onclick="openRecommendersModal('${safeId}')">
                    <span class="text-[10px] uppercase tracking-widest text-scandi-muted">Recommended By:</span>
                    <div class="flex items-center pl-2">
                        ${avatars}
                        ${service.recommendations > service.recentRecommenders.length ? `<span class="text-[10px] text-scandi-muted ml-2">+${service.recommendations - service.recentRecommenders.length} more</span>` : ''}
                    </div>
                </div>
            `;
        } else if (service.recommendations > 0) {
            recentlyRecommendedHTML = `
                <div class="flex flex-col gap-1 cursor-pointer" onclick="openLegacyModal()">
                    <span class="text-[10px] uppercase tracking-widest text-scandi-muted">Recommended By:</span>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-scandi-text font-medium underline decoration-scandi-muted/30">🐝 Scarsdale Buzz community</span>
                    </div>
                </div>
            `;
        }

        const newHTML = `
            <!-- 1. Header: Index & Category -->
            <div class="flex justify-between items-start mb-4 pb-2 border-b border-scandi-line/30 h-10">
                ${IndexNumber(index)}
                <span class="text-[10px] uppercase tracking-widest font-semibold text-scandi-sage truncate max-w-[150px] text-right" title="${service.category}">${service.category}</span>
            </div>
            
            <!-- 2. Contact Info -->
            <div class="mb-4 h-32 flex flex-col">
                <h3 class="font-serif text-2xl text-scandi-text leading-tight mb-1 group-hover:text-scandi-clay transition-colors duration-300 line-clamp-2" title="${title}">${title}</h3>
                ${subtitle ? `<p class="text-sm text-scandi-muted italic mb-3 line-clamp-1" title="${subtitle}">${subtitle}</p>` : ''}
                <div class="mt-auto">
                    ${actionHTML}
                </div>
            </div>

            <!-- 3. Recommendation Info -->
            <div class="bg-scandi-bg/40 p-4 rounded-sm border border-scandi-line/30 flex flex-col gap-3 mb-4 h-48 justify-between">
                <!-- Count & Like -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                         <div class="w-8 h-8 rounded-full bg-white flex flex-col items-center justify-center text-center border border-scandi-line shadow-sm">
                            <span class="text-sm font-serif font-bold text-scandi-text leading-none">${service.recommendations}</span>
                        </div>
                        <span class="text-[10px] uppercase tracking-widest text-scandi-muted">Recommendations</span>
                    </div>
                    <button onclick="toggleLike('${safeId}')" class="${likeBtnClass} transition-colors p-2 -mr-2 rounded-full hover:bg-white border border-transparent hover:border-scandi-line" title="${isLiked ? 'Undo Recommendation' : 'Recommend this provider'}">
                        ${likeIcon}
                    </button>
                </div>

                <!-- Recent Avatars -->
                <div class="flex-grow flex flex-col justify-center">
                    ${recentlyRecommendedHTML ? `
                    <div class="pt-2 border-t border-dashed border-scandi-line/30">
                        ${recentlyRecommendedHTML}
                    </div>` : ''}
                </div>
                
                <!-- Last Recommended Date -->
                <div class="pt-2 border-t border-dashed border-scandi-line/30 min-h-[25px] flex items-center">
                    ${recStatusHTML}
                </div>
            </div>

            <!-- 4. Booking Button -->
            ${bookingButtonHTML}
        `;
        
        // Only update innerHTML if it has changed to avoid unnecessary repaints/flickering
        if (card.innerHTML !== newHTML) {
            card.innerHTML = newHTML;
        }
        
        serviceList.appendChild(card);
    });

    // Remove cards that are no longer in the filtered list
    existingCards.forEach((card, id) => {
        if (!processedIds.has(id)) {
            card.remove();
        }
    });
    
    // Remove existing suggestion cards to prevent duplicates
    const existingSuggestCards = serviceList.querySelectorAll('.suggest-card-placeholder');
    existingSuggestCards.forEach(card => card.remove());

    // Hydrate avatars after render
    hydrateAvatars();

    // Append "Suggest a Provider" card
    const suggestCard = document.createElement('div');
    suggestCard.className = 'suggest-card-placeholder group bg-scandi-bg/50 p-8 rounded-sm border-2 border-dashed border-scandi-line hover:border-scandi-clay transition-all duration-300 flex flex-col items-center justify-center text-center h-full min-h-[400px] cursor-pointer';
    suggestCard.innerHTML = `
        <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <svg class="w-8 h-8 text-scandi-clay" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        </div>
        <h3 class="font-serif text-xl text-scandi-text mb-2">Know someone great?</h3>
        <p class="text-sm text-scandi-muted mb-6">Suggest a new provider to help your neighbors.</p>
        <a href="suggest.html" class="px-6 py-2 border border-scandi-text text-scandi-text font-mono text-xs uppercase tracking-widest rounded-sm hover:bg-scandi-text hover:text-white transition-colors relative z-10">
            Suggest Provider
        </a>
    `;
    suggestCard.addEventListener('click', (e) => {
         window.location.href = 'suggest.html';
    });
    serviceList.appendChild(suggestCard);
};

// --- INTERACTION HANDLERS ---
const toggleLike = async (serviceId) => {
    if (!currentUser) {
        openAuthModal();
        return;
    }

    const serviceRef = db.collection('services').doc(serviceId);
    const userRef = db.collection('users').doc(currentUser.uid);
    const likeRef = serviceRef.collection('recommendations').doc(currentUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const serviceDoc = await transaction.get(serviceRef);
            const likeDoc = await transaction.get(likeRef);

            if (!serviceDoc.exists) throw "Service does not exist!";
            
            const currentRecs = serviceDoc.data().recommendations || 0;
            const currentRecent = serviceDoc.data().recentRecommenders || [];

            if (!likeDoc.exists) {
                // ADD LIKE
                const newRec = {
                    uid: currentUser.uid,
                    timestamp: new Date()
                };

                // Add to recent list (keep max 3)
                const newRecent = [newRec, ...currentRecent].slice(0, 3);

                transaction.update(serviceRef, {
                    recommendations: currentRecs + 1,
                    lastRecommended: firebase.firestore.FieldValue.serverTimestamp(),
                    recentRecommenders: newRecent
                });

                transaction.set(likeRef, newRec);
                
                transaction.set(userRef, {
                    likedServices: firebase.firestore.FieldValue.arrayUnion(serviceId)
                }, { merge: true });

            } else {
                // REMOVE LIKE
                const newRecent = currentRecent.filter(r => r.uid !== currentUser.uid);

                transaction.update(serviceRef, {
                    recommendations: Math.max(0, currentRecs - 1),
                    recentRecommenders: newRecent
                });

                transaction.delete(likeRef);

                transaction.set(userRef, {
                    likedServices: firebase.firestore.FieldValue.arrayRemove(serviceId)
                }, { merge: true });
            }
        });
        // Optimistic update not needed as onSnapshot will fire
    } catch (e) {
        console.error("Transaction failed: ", e);
        alert("Could not update recommendation. Please try again.");
    }
};

const openRecommendersModal = async (serviceId) => {
    const modal = document.getElementById('recommenders-modal');
    const list = document.getElementById('recommenders-list');
    list.innerHTML = '<div class="text-center py-8 text-scandi-muted">Loading...</div>';
    modal.classList.remove('hidden');

    try {
        const snapshot = await db.collection('services').doc(serviceId).collection('recommendations').orderBy('timestamp', 'desc').limit(50).get();
        
        if (snapshot.empty) {
            list.innerHTML = '<div class="text-center py-8 text-scandi-muted italic">No specific user recommendations yet.</div>';
            return;
        }

        list.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : '';
            return `
                <div class="flex items-center gap-4 p-2 border-b border-scandi-line/50 last:border-0">
                    <img src="https://www.gravatar.com/avatar?d=mp" data-uid="${data.uid}" class="avatar-placeholder opacity-0 w-10 h-10 rounded-full object-cover bg-gray-100 transition-opacity duration-300">
                    <div>
                        <div class="font-medium text-scandi-text avatar-name-placeholder" data-uid="${data.uid}">Loading...</div>
                        <div class="text-xs text-scandi-muted">Recommended on ${date}</div>
                    </div>
                </div>
            `;
        }).join('');

        hydrateAvatars();
        hydrateNames(); // Helper to update names in modal

    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-center py-8 text-red-600">Error loading recommendations.</div>';
    }
};

const openLegacyModal = () => {
    document.getElementById('legacy-modal').classList.remove('hidden');
};

const openAuthModal = () => {
    const modal = document.getElementById('auth-prompt-modal');
    if (modal) {
        const loginBtn = modal.querySelector('a[href*="login.html"]');
        if (loginBtn) {
            const currentUrl = encodeURIComponent(window.location.href);
            loginBtn.href = `../login.html?redirect=${currentUrl}`;
        }
        modal.classList.remove('hidden');
    }
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
    
    // Normalize activeCategory casing if needed (e.g. url param 'plumber' -> 'Plumber')
    if (activeCategory !== 'All') {
        const canonical = sortedCategories.find(c => c.toLowerCase() === activeCategory.toLowerCase());
        if (canonical && canonical !== activeCategory) {
            activeCategory = canonical;
        }
    }

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
                
                // Update URL
                const url = new URL(window.location);
                url.searchParams.set('category', cat);
                window.history.replaceState({}, '', url);

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
const filterAndRender = (options = { keepOrder: false }) => {
    const searchTerm = searchInput.value.trim();
    let filteredServices = [];

    // 1. Search Logic (Fuse.js)
    if (searchTerm && fuse) {
        const results = fuse.search(searchTerm);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a53a61ef-db23-43ee-a58e-5e2131912298',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'directory.js:filterAndRender',message:'Fuse search results',data:{term:searchTerm, top3Results: results.slice(0,3).map(r => ({id: r.item.id, name: r.item.businessName, score: r.score, matches: r.matches}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A/B'})}).catch(()=>{});
        // #endregion

        filteredServices = results.map(result => result.item);
    } else {
        filteredServices = [...serviceData];
    }

    // 2. Category Filter
    if (activeCategory !== 'All') {
        filteredServices = filteredServices.filter(service => service.category === activeCategory);
    }

    // 3. Sort (Recommendations > Date) or Keep Order
    if (options.keepOrder && serviceList.children.length > 0) {
        // Preserve DOM order for existing items to prevent jumping
        const currentOrder = new Map();
        Array.from(serviceList.children).forEach((el, index) => {
            if (el.dataset.id) currentOrder.set(el.dataset.id, index);
        });

        filteredServices.sort((a, b) => {
            const idxA = currentOrder.has(a.id) ? currentOrder.get(a.id) : -1;
            const idxB = currentOrder.has(b.id) ? currentOrder.get(b.id) : -1;

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1; // Existing items first
            if (idxB !== -1) return 1;

            // Default sort for new items
            if (b.recommendations !== a.recommendations) return b.recommendations - a.recommendations;
            return new Date(b.lastRecommended) - new Date(a.lastRecommended);
        });
    } else {
        filteredServices.sort((a, b) => {
            if (b.recommendations !== a.recommendations) return b.recommendations - a.recommendations;
            return new Date(b.lastRecommended) - new Date(a.lastRecommended);
        });
    }

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

    // Update URL
    const url = new URL(window.location);
    if (newCategory === 'All') {
        url.searchParams.delete('category');
    } else {
        url.searchParams.set('category', newCategory);
    }
    window.history.replaceState({}, '', url);

    renderCategoryButtons();
    filterAndRender();
});

// --- PASSWORD PROTECTION ---
const checkPassword = () => {
    if (localStorage.getItem('scarsdale_access') === 'true') {
        passwordModal.classList.add('hidden');
        mainContent.classList.remove('hidden');
        Promise.all([
            loadCategoryGroupsConfig(),
            loadCategoriesConfig(),
            startServicesSubscription(),
        ]).then(() => {
            initAuthListener();
            renderCategoryButtons();
            filterAndRender();
        });
        return true;
    }
    return false;
};

// Check immediately on load
checkPassword();

passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPassword = passwordInput.value;
    const correctPassword = 'raiders';

    if (enteredPassword === correctPassword) {
        localStorage.setItem('scarsdale_access', 'true');
        passwordError.classList.add('hidden');
        passwordModal.style.opacity = '0';
        setTimeout(() => {
            checkPassword();
        }, 500);
    } else {
        passwordError.classList.remove('hidden');
        passwordInput.value = '';
        passwordInput.focus();
        passwordForm.parentElement.classList.add('animate-shake');
        setTimeout(() => passwordForm.parentElement.classList.remove('animate-shake'), 600);
    }
});
