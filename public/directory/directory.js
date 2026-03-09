// --- ELEMENT SELECTORS ---
const pendingModal = document.getElementById('pending-modal');
const pendingSignOutBtn = document.getElementById('pending-signout-btn');
const mainContent = document.getElementById('main-content');
const serviceList = document.getElementById('serviceList');
const searchInput = document.getElementById('searchInput');
const categoryFilters = document.getElementById('categoryFilters');
const noResults = document.getElementById('noResults');

// Initialize activeCategory from URL parameter or Path
const urlParams = new URLSearchParams(window.location.search);
let activeCategory = urlParams.get('category') || 'All';

// Check for path-based category (/directory/category/Name)
const pathParts = window.location.pathname.split('/');
const categoryIndex = pathParts.indexOf('category');
if (categoryIndex !== -1 && categoryIndex < pathParts.length - 1) {
    const catFromPath = pathParts[categoryIndex + 1];
    if (catFromPath) {
        activeCategory = decodeURIComponent(catFromPath);
    }
}

let recommendedByUid = urlParams.get('recommendedBy');
let recommendedServiceIds = null; // Set<string> | null
let recommendedByUserProfile = null;

// --- FIREBASE INIT ---
// Expect window.firebaseConfig to be defined in firebase-config.js
let db;
let analytics = null; // Analytics loaded lazily for performance


// --- RUNTIME DATA (from Firestore) ---
let serviceData = [];
let fuse;
let currentUser = null;
let currentIsAdmin = false;
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
        // Try fetching from public_profiles first (faster, safer)
        let doc = await db.collection('public_profiles').doc(uid).get();

        if (!doc.exists) {
            // Fallback to 'users' collection IF the user is authenticated and rules allow it (or for legacy)
            // But for public view, public_profiles should be the source.
            // keeping this for backward compatibility if migration isn't instant
            doc = await db.collection('users').doc(uid).get();
        }

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

// --- AUTH LISTENER & ACCESS CONTROL ---
function initAuthListener() {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            // Not logged in -> Redirect to Login
            const returnUrl = encodeURIComponent(window.location.href);
            window.location.href = `../login.html?redirect=${returnUrl}`;
            return;
        }

        currentUser = user;
        currentIsAdmin = false;

        // 1. Check/Create User Document & Directory Status
        const userRef = db.collection('users').doc(user.uid);

        try {
            const userDoc = await userRef.get();
            let status = 'pending';

            if (userDoc.exists) {
                const userData = userDoc.data();
                status = userData.directoryStatus || 'pending';

                // Sync latest profile info
                const profileUpdate = {
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    email: user.email,
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Only update if changes to avoid write costs/loops? 
                // For now, simple merge is fine.
                await userRef.set(profileUpdate, { merge: true });

            } else {
                // New User: Create doc with pending status
                await userRef.set({
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                    directoryStatus: 'pending',
                    roles: ['user']
                });
                status = 'pending';
            }

            // Sync public profile
            db.collection('public_profiles').doc(user.uid).set({
                displayName: user.displayName,
                photoURL: user.photoURL
            }, { merge: true }).catch(console.error);

            // 2. Handle Status
            if (status === 'approved') {
                // ACCESS GRANTED
                if (pendingModal) pendingModal.classList.add('hidden');
                if (mainContent) mainContent.classList.remove('hidden');

                // Start Data Subscriptions
                startServicesSubscription();

                if (unsubscribeUser) {
                    unsubscribeUser();
                    unsubscribeUser = null;
                }

                // Listen to Recommendations
                unsubscribeUser = db.collectionGroup('recommendations')
                    .where('uid', '==', user.uid)
                    .onSnapshot((snapshot) => {
                        userLikedServices.clear();
                        snapshot.forEach(doc => {
                            if (doc.ref.parent && doc.ref.parent.parent) {
                                userLikedServices.add(doc.ref.parent.parent.id);
                            }
                        });
                        filterAndRender({ keepOrder: true });
                    }, error => {
                        console.error("Error listening to likes:", error);
                    });

                // Check Admin Claim (for UI features)
                try {
                    const tokenResult = await user.getIdTokenResult();
                    currentIsAdmin = !!tokenResult.claims.admin;
                    if (currentIsAdmin) filterAndRender({ keepOrder: true });
                } catch (e) {
                    console.warn("Error fetching admin claim", e);
                }

            } else {
                // ACCESS DENIED / PENDING
                if (mainContent) mainContent.classList.add('hidden');
                if (pendingModal) pendingModal.classList.remove('hidden');
                // Don't load services to prevent data leak
            }

        } catch (e) {
            console.error("Error checking user status:", e);
            alert("An error occurred while checking your access status. Please try refreshing.");
        }
    });
};

if (pendingSignOutBtn) {
    pendingSignOutBtn.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = '../login.html';
        });
    });
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
                    
                    // Normalize categories: ensure array
                    const categories = d.categories || (d.category ? [d.category] : []);
                    
                    return { id: doc.id, ...d, categories, lastRecommended: iso };
                });

                // Initialize Fuse.js for robust search
                const fuseOptions = {
                    includeScore: true, // Agent: Enable scoring for debug
                    keys: [
                        { name: 'businessName', weight: 0.7 },
                        { name: 'categories', weight: 0.6 },
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

                renderCategoryButtons();
                filterAndRender({ keepOrder: true });
                if (recommendedByUid) {
                    renderRolodexBanner();
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
    if (service.categories && service.categories.length > 0) {
        searchTerms.push(service.categories.join(' '));
    } else if (service.category) {
        searchTerms.push(service.category);
    }
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
            card.className = 'service-card group bg-white rounded-sm shadow-card hover:shadow-hover transition-all duration-500 ease-out flex flex-col h-full relative fade-in border border-scandi-line/40 overflow-hidden';
            card.style.animationDelay = `${index * 0.05}s`;
        } else {
            card.style.animationDelay = '0s';
            card.classList.remove('fade-in');
        }

        const fullName = [service.firstName, service.lastName].filter(Boolean).join(' ');
        let title = service.businessName || fullName;
        let subtitle = '';
        if (service.businessName && fullName) {
            subtitle = fullName;
        }

        // Icons - New larger versions
        const ThumbsUpIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
        const ThumbsUpFilled = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;

        const isLiked = userLikedServices.has(service.id);
        const likeBtnClass = isLiked ? 'text-scandi-clay' : 'text-scandi-muted';
        const likeIcon = isLiked ? ThumbsUpFilled : ThumbsUpIcon;

        const bookingButtonHTML = service.sunnyApproved ? `
            <div class="mt-8">
                <a href="../sunny/index.html" 
                   class="flex items-center justify-center gap-2 w-full bg-scandi-clay text-white text-[10px] font-bold uppercase tracking-widest py-3 px-4 rounded-sm hover:bg-scandi-text transition-all duration-300 shadow-sm hover:shadow-md group/btn">
                   <span>Ask Sunny to Book</span>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transform group-hover/btn:translate-x-1 transition-transform"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>` : '';

        const formatRecommenders = (recommenders) => {
            if (!recommenders || recommenders.length === 0) return '';
            const displayCount = 3;
            const displayed = recommenders.slice(0, displayCount);
            const remaining = recommenders.length - displayCount;

            return `
                <div class="flex -space-x-2 overflow-hidden">
                    ${displayed.map(r => `
                        <img class="avatar-placeholder inline-block h-6 w-6 rounded-full ring-2 ring-white transition-opacity duration-300 opacity-0" 
                             data-uid="${r.uid}"
                             src="https://www.gravatar.com/avatar?d=mp" 
                             alt="User avatar">
                    `).join('')}
                    ${remaining > 0 ? `
                        <div class="flex items-center justify-center h-6 w-6 rounded-full bg-scandi-bg border-2 border-white text-[8px] font-bold text-scandi-muted">
                            +${remaining}
                        </div>
                    ` : ''}
                </div>
            `;
        };

        // Render categories as tags
        const cats = service.categories || (service.category ? [service.category] : []);
        const categoriesHTML = cats.map(c => 
            `<span class="text-[9px] uppercase tracking-[0.1em] font-bold text-scandi-sage bg-scandi-bg/80 px-2 py-1 rounded-sm truncate" title="${c}">${c}</span>`
        ).join('');

        const newHTML = `
            <!-- DESKTOP LAYOUT (Hidden on Mobile) -->
            <div class="hidden md:flex flex-row h-full min-h-[380px]">
                <!-- Left Panel: Info -->
                <div class="flex-1 p-10 flex flex-col justify-between bg-white relative">
                    <div class="flex justify-between items-start mb-6">
                        <span class="text-[10px] font-mono text-scandi-muted tracking-[0.2em] opacity-60">${(index + 1).toString().padStart(2, '0')}</span>
                        <div class="flex flex-wrap gap-1 ml-4 justify-end max-w-[70%]">
                            ${categoriesHTML}
                        </div>
                    </div>
                    
                    <div class="flex-grow flex flex-col justify-start py-2">
                        <h3 class="service-title font-serif text-4xl text-scandi-text leading-[1.3] pb-2 mb-1 line-clamp-3 hover:text-scandi-clay transition-colors cursor-pointer" title="${title}">${title}</h3>
                    </div>

                    <div class="mt-auto">
                        <div class="text-[9px] uppercase tracking-[0.2em] text-scandi-muted mb-4 font-bold opacity-60">Contact Detail</div>
                        <div class="font-serif text-2xl text-scandi-text italic mb-4 line-clamp-1 opacity-90">${subtitle || title}</div>
                        <div class="inline-block border-b-2 border-scandi-sage pb-1 hover:border-scandi-clay transition-colors">
                            ${service.phone ? `
                                <a href="tel:${service.phone.replace(/[^\d+]/g, '')}" class="font-serif text-2xl font-bold text-scandi-sage tracking-tight hover:text-scandi-clay transition-colors tabular-nums">${service.phone}</a>
                            ` : `
                                <a href="${generateGoogleSearchUrl(service)}" target="_blank" class="font-serif text-2xl font-bold text-scandi-sage tracking-tight hover:text-scandi-clay transition-colors tabular-nums">Look up info</a>
                            `}
                        </div>
                        ${bookingButtonHTML}
                    </div>
                </div>

                <!-- Right Panel: Stats/Recommendations -->
                <div class="w-[38%] bg-[#FDFCFB] p-10 flex flex-col justify-between border-l border-scandi-line/25">
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <span class="text-6xl font-serif text-scandi-clay leading-none tracking-tighter tabular-nums">${service.recommendations}</span>
                            <span class="text-[9px] uppercase tracking-[0.15em] text-scandi-muted mt-2 font-bold opacity-70">Recommendations</span>
                        </div>
                        <button onclick="toggleLike('${safeId}', this)" class="like-btn w-14 h-14 rounded-full border border-scandi-line/50 flex items-center justify-center bg-white shadow-soft ${likeBtnClass} hover:scale-105 hover:border-scandi-clay transition-all duration-300 group/like flex-shrink-0" title="${isLiked ? 'Undo Recommendation' : 'Recommend this provider'}">
                            <span class="group-hover/like:scale-110 transition-transform">${likeIcon}</span>
                        </button>
                    </div>

                    <div class="space-y-8 mt-12">
                        <div class="pl-4 border-l-[1.5px] border-scandi-clay/30">
                            <div class="text-[9px] uppercase tracking-[0.2em] text-scandi-clay mb-3 font-bold opacity-70">Recommended By</div>
                            <div class="flex flex-col gap-2">
                                <div class="flex items-center gap-3 cursor-pointer group/rec" onclick="${service.recentRecommenders?.length > 0 ? `openRecommendersModal('${safeId}')` : 'openLegacyModal()'}">
                                    ${formatRecommenders(service.recentRecommenders)}
                                    <span class="text-[12px] font-bold text-scandi-text tracking-tight group-hover/rec:text-scandi-clay transition-colors">${service.recentRecommenders?.length > 0 ? '' : 'Scarsdale Buzz'}</span>
                                </div>
                            </div>
                        </div>

                        <div class="pl-4 border-l-[1.5px] border-scandi-sage/30">
                            <div class="text-[9px] uppercase tracking-[0.2em] text-scandi-sage mb-3 font-bold opacity-70">Latest Update</div>
                            <div class="text-[12px] text-scandi-muted font-medium tabular-nums">
                                ${service.lastRecommended ? new Date(service.lastRecommended).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'May 17, 2025'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MOBILE LAYOUT (Visible on Mobile) -->
            <div class="flex flex-col md:hidden h-full bg-white relative justify-between">
                 <div class="p-6">
                    <div class="flex justify-between items-start mb-3">
                        <span class="text-[10px] font-mono text-scandi-muted tracking-[0.2em] opacity-60">${(index + 1).toString().padStart(2, '0')}</span>
                        <div class="flex flex-wrap gap-1 ml-4 justify-end max-w-[70%]">
                            ${categoriesHTML}
                        </div>
                    </div>

                    <h3 class="service-title font-serif text-2xl text-scandi-text leading-tight mb-3 hover:text-scandi-clay transition-colors cursor-pointer" title="${title}">${title}</h3>

                    <!-- Compact Contact Info -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        ${subtitle ? `<span class="font-serif text-sm text-scandi-text italic opacity-90">${subtitle}</span>` : ''}
                        ${subtitle ? `<span class="text-scandi-line text-xs">|</span>` : ''}
                        ${service.phone ? `
                            <a href="tel:${service.phone.replace(/[^\d+]/g, '')}" class="font-serif text-sm font-bold text-scandi-sage tracking-tight hover:text-scandi-clay transition-colors tabular-nums">${service.phone}</a>
                        ` : `
                            <a href="${generateGoogleSearchUrl(service)}" target="_blank" class="font-serif text-sm font-bold text-scandi-sage tracking-tight hover:text-scandi-clay transition-colors tabular-nums">Look up info</a>
                        `}
                    </div>
                </div>

                <div class="bg-[#FDFCFB] p-6 border-t border-scandi-line/25">
                    <div class="flex justify-between items-end">
                        <div class="flex items-start gap-5">
                            <!-- Big Number -->
                            <div class="flex flex-col">
                                <span class="text-4xl font-serif text-scandi-clay leading-none tracking-tighter tabular-nums cursor-pointer hover:text-scandi-text transition-colors" onclick="${service.recentRecommenders?.length > 0 ? `openRecommendersModal('${safeId}')` : 'openLegacyModal()'}">${service.recommendations}</span>
                                <span class="text-[8px] uppercase tracking-[0.15em] text-scandi-muted mt-1 font-bold opacity-70">Recs</span>
                            </div>
                            
                            <!-- Middle Column: Recommended By + Date -->
                            <div class="flex flex-col pl-5 border-l border-scandi-line/30 h-full justify-between py-0.5">
                                <!-- Recommended By -->
                                <div class="mb-2">
                                    <div class="text-[8px] uppercase tracking-[0.15em] text-scandi-clay mb-1 font-bold opacity-70">Recommended By</div>
                                    <div class="flex items-center gap-2 cursor-pointer group/rec" onclick="${service.recentRecommenders?.length > 0 ? `openRecommendersModal('${safeId}')` : 'openLegacyModal()'}">
                                        ${formatRecommenders(service.recentRecommenders)}
                                        <span class="text-[10px] font-bold text-scandi-text tracking-tight group-hover/rec:text-scandi-clay transition-colors">${service.recentRecommenders?.length > 0 ? '' : 'Scarsdale Buzz'}</span>
                                    </div>
                                </div>

                                <!-- Date -->
                                <div class="flex items-baseline gap-2">
                                    <span class="text-[8px] uppercase tracking-[0.15em] text-scandi-sage font-bold opacity-70">Updated</span>
                                    <span class="text-[10px] text-scandi-muted font-medium tabular-nums">
                                        ${service.lastRecommended ? new Date(service.lastRecommended).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : 'May 17, 25'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Like Button -->
                        <button onclick="toggleLike('${safeId}', this)" class="like-btn w-12 h-12 rounded-full border border-scandi-line/50 flex items-center justify-center bg-white shadow-soft ${likeBtnClass} hover:scale-105 hover:border-scandi-clay transition-all duration-300 group/like flex-shrink-0 mb-1" title="${isLiked ? 'Undo Recommendation' : 'Recommend this provider'}">
                            <span class="transform scale-90 group-hover/like:scale-100 transition-transform">${likeIcon}</span>
                        </button>
                    </div>
                    ${bookingButtonHTML ? `<div class="mt-4 transform scale-95 origin-left">${bookingButtonHTML}</div>` : ''}
                </div>
            </div>
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
    suggestCard.className = 'suggest-card-placeholder group bg-scandi-bg/30 rounded-sm border-2 border-dashed border-scandi-line/40 hover:border-scandi-clay hover:bg-white transition-all duration-500 flex flex-col items-center justify-center text-center h-full min-h-[200px] md:min-h-[380px] cursor-pointer p-6 md:p-8';
    suggestCard.innerHTML = `
        <div class="w-20 h-20 rounded-full bg-white border border-scandi-line/50 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:border-scandi-clay transition-all duration-500 shadow-sm">
            <svg class="w-10 h-10 text-scandi-clay" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
        </div>
        <h3 class="font-serif text-3xl text-scandi-text mb-4">Know someone great?</h3>
        <p class="text-sm text-scandi-muted mb-8 max-w-xs leading-relaxed">Help your neighbors by suggesting a trusted local provider to the directory.</p>
        <a href="suggest.html" class="px-8 py-3 bg-scandi-text text-white font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-scandi-clay transition-all duration-300 relative z-10 shadow-soft">
            Suggest Provider
        </a>
    `;
    suggestCard.addEventListener('click', (e) => {
        window.location.href = 'suggest.html';
    });
    serviceList.appendChild(suggestCard);
};

// --- ONBOARDING ANIMATION ---
const runRolodexAnimation = (startEl) => {
    const targetEl = document.getElementById('user-menu-btn') || document.getElementById('mobile-menu-btn');
    if (!targetEl) return;

    const startRect = startEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    // Create flying thumbs up
    const flyer = document.createElement('div');
    flyer.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="text-scandi-clay"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
    flyer.style.position = 'fixed';
    flyer.style.left = `${startRect.left + startRect.width / 2 - 12}px`;
    flyer.style.top = `${startRect.top + startRect.height / 2 - 12}px`;
    flyer.style.zIndex = '9999';
    flyer.style.pointerEvents = 'none';
    flyer.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.appendChild(flyer);

    // Trigger animation
    requestAnimationFrame(() => {
        flyer.style.left = `${targetRect.left + targetRect.width / 2 - 12}px`;
        flyer.style.top = `${targetRect.top + targetRect.height / 2 - 12}px`;
        flyer.style.opacity = '0';
        flyer.style.transform = 'scale(0.5)';
    });

    // Cleanup and Show Tooltip
    setTimeout(() => {
        flyer.remove();
        showRolodexTooltip(targetEl);
    }, 800);
};

const showRolodexTooltip = (targetEl) => {
    const tooltip = document.createElement('div');
    tooltip.className = 'fixed z-[100] bg-scandi-text text-white p-4 rounded-sm shadow-xl max-w-xs text-sm font-light text-center fade-in cursor-pointer';
    tooltip.innerHTML = `
        <div class="font-serif text-lg mb-1">Saved to your Recommendations!</div>
        <p class="text-xs opacity-90">Find and share all your recommended providers here.</p>
        <div class="absolute -top-1 right-6 w-3 h-3 bg-scandi-text transform rotate-45"></div>
    `;

    const rect = targetEl.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + 12}px`;
    tooltip.style.right = '20px'; // Align roughly with right edge

    document.body.appendChild(tooltip);

    const close = () => {
        tooltip.style.opacity = '0';
        setTimeout(() => tooltip.remove(), 300);
    };

    tooltip.addEventListener('click', close);
    setTimeout(close, 6000); // Auto close after 6s
};

// --- INTERACTION HANDLERS ---
const toggleLike = async (serviceId, btnElement) => {
    if (!currentUser) {
        openAuthModal();
        return;
    }

    // Onboarding Check
    if (btnElement && !userLikedServices.has(serviceId)) {
        const hasSeen = localStorage.getItem('recommendations_onboarded');
        if (!hasSeen) {
            runRolodexAnimation(btnElement);
            localStorage.setItem('recommendations_onboarded', 'true');
        }
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
                    displayName: currentUser.displayName,
                    photoURL: currentUser.photoURL,
                    email: currentUser.email,
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
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
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
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
    const providerCounts = {};

    serviceData.forEach(service => {
        const cats = service.categories || [];
        cats.forEach(cat => {
            if (!categoryTotals[cat]) categoryTotals[cat] = 0;
            categoryTotals[cat] += service.recommendations;

            if (!providerCounts[cat]) providerCounts[cat] = 0;
            providerCounts[cat] += 1;
        });
    });

    if (Array.isArray(categoriesList) && categoriesList.length) {
        categoriesList.forEach(cat => {
            if (cat && !(cat in categoryTotals)) categoryTotals[cat] = 0;
            if (cat && !(cat in providerCounts)) providerCounts[cat] = 0;
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

    const pinnedCategories = ['Plumbing', 'HVAC', 'Electrician', 'Body Shop', 'Landscaper'];
    const topCategories = ['All', ...pinnedCategories];

    // Overflow now contains ALL categories as requested
    const overflowCategories = sortedCategories;

    // Active in overflow if it's NOT in the top pinned list
    const isActiveInOverflow = !topCategories.includes(activeCategory) && activeCategory !== 'All';

    categoryFilters.innerHTML = '';

    topCategories.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.className = `relative transition-colors duration-300 pb-1 text-sm font-medium ${activeCategory === category
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
            showOverflowDialog(overflowCategories, providerCounts);
        });
    }
};

// --- OVERFLOW DIALOG ---
const showOverflowDialog = (overflowCategories, providerCounts) => {
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

    // Sort alphabetically within groups
    Object.keys(groupedCategories).forEach(group => {
        groupedCategories[group].sort((a, b) => a.localeCompare(b));
    });
    ungroupedCategories.sort((a, b) => a.localeCompare(b));

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
                <span class="text-xs font-mono text-scandi-muted">${providerCounts[cat] || 0}</span>
            `;
            btn.addEventListener('click', () => {
                activeCategory = cat;

                // Clear any active search when selecting a category
                searchInput.value = '';

                // Update URL
                if (cat === 'All') {
                    const url = new URL(window.location.origin + '/directory/index.html');
                    if (recommendedByUid) url.searchParams.set('recommendedBy', recommendedByUid);
                    window.history.pushState({}, '', url);
                } else {
                    const newPath = `/directory/category/${encodeURIComponent(cat)}`;
                    const url = new URL(window.location.origin + newPath);
                    if (recommendedByUid) url.searchParams.set('recommendedBy', recommendedByUid);
                    window.history.pushState({}, '', url);
                }

                renderCategoryButtons();
                filterAndRender();
                if (recommendedByUid) {
                    renderRolodexBanner();
                }
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
const filterAndRender = (options = { keepOrder: false, render: true }) => {
    const searchTerm = searchInput.value.trim();
    let filteredServices = [];

    // 1. Search Logic (Fuse.js)
    if (searchTerm && fuse) {
        const results = fuse.search(searchTerm);
        filteredServices = results.map(result => result.item);
    } else {
        filteredServices = [...serviceData];
    }

    // 1b. Test Provider Filter (Security/Visibility)
    if (!currentIsAdmin) {
        filteredServices = filteredServices.filter(s => !s.isTestProvider);
    }

    // 2. Category Filter
    if (activeCategory !== 'All') {
        filteredServices = filteredServices.filter(service => {
            const cats = service.categories || (service.category ? [service.category] : []);
            return cats.includes(activeCategory);
        });
    }

    // 2b. Recommended By Filter (Recommendations)
    if (recommendedByUid) {
        if (recommendedServiceIds) {
            filteredServices = filteredServices.filter(service => recommendedServiceIds.has(service.id));
        } else {
            // Still loading or empty, show nothing to prevent leak of other services
            filteredServices = [];
        }
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

    if (options.render !== false) {
        renderServices(filteredServices);
    }
    return filteredServices;
};

let searchTimeout;
let analyticsTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    serviceList.style.opacity = '0.5';
    searchTimeout = setTimeout(() => {
        const searchTerm = searchInput.value.trim();

        const filteredResults = filterAndRender();

        serviceList.style.opacity = '1';
    }, 250);

    // Debounce analytics to capture completed strings
    clearTimeout(analyticsTimeout);
    analyticsTimeout = setTimeout(() => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm && analytics) {
            // Re-run filter to get stats without rendering
            const results = filterAndRender({ render: false });

            analytics.logEvent('directory_search', {
                search_term: searchTerm
            });

            if (results.length === 0) {
                analytics.logEvent('directory_search_no_results', {
                    search_term: searchTerm
                });
            } else {
                const resultsWithoutContact = results.filter(
                    s => !s.phone && !s.email
                ).length;

                analytics.logEvent('directory_search_results', {
                    search_term: searchTerm,
                    total_results: results.length,
                    results_without_contact: resultsWithoutContact
                });
            }
        }
    }, 1500);
});

categoryFilters.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    if (e.target.id === 'overflow-btn' || e.target.id === 'active-overflow-btn') return;

    const newCategory = e.target.dataset.category;
    if (newCategory === activeCategory) return;

    activeCategory = newCategory;

    // Clear any active search when selecting a category
    searchInput.value = '';

    // Update URL
    if (newCategory === 'All') {
        const url = new URL(window.location.origin + '/directory/index.html');
        // Preserve other params like recommendedBy
        if (recommendedByUid) url.searchParams.set('recommendedBy', recommendedByUid);
        window.history.pushState({}, '', url);
    } else {
        // Use new path format
        const newPath = `/directory/category/${encodeURIComponent(newCategory)}`;
        const url = new URL(window.location.origin + newPath);
        if (recommendedByUid) url.searchParams.set('recommendedBy', recommendedByUid);
        window.history.pushState({}, '', url);
    }

    renderCategoryButtons();
    filterAndRender();
    if (recommendedByUid) {
        renderRolodexBanner();
    }
});

// --- PASSWORD PROTECTION ---
const checkPassword = () => {
    // Password protection removed in favor of Google Auth + Admin Approval
    return true;
};

// --- RECOMMENDATIONS LOGIC ---
async function loadRolodex(uid) {
    if (!db) return;
    try {
        // 1. Fetch user profile
        recommendedByUserProfile = await fetchUser(uid);

        // 2. Fetch recommendations
        const snapshot = await db.collectionGroup('recommendations')
            .where('uid', '==', uid)
            .get();

        recommendedServiceIds = new Set();
        snapshot.docs.forEach(doc => {
            // doc.ref.parent is CollectionReference
            // doc.ref.parent.parent is DocumentReference (the service)
            if (doc.ref.parent && doc.ref.parent.parent) {
                recommendedServiceIds.add(doc.ref.parent.parent.id);
            }
        });

        renderRolodexBanner();
        filterAndRender();

    } catch (e) {
        console.error("Error loading rolodex", e);
    }
}

function renderRolodexBanner() {
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;

    // Remove existing if any
    const existing = document.getElementById('rolodex-banner');
    if (existing) existing.remove();

    const name = recommendedByUserProfile ? recommendedByUserProfile.displayName : 'A Neighbor';
    const photo = recommendedByUserProfile && recommendedByUserProfile.photoURL
        ? recommendedByUserProfile.photoURL
        : 'https://www.gravatar.com/avatar?d=mp';

    // Calculate count based on activeCategory
    let count = 0;
    if (recommendedServiceIds) {
        if (activeCategory === 'All') {
            count = recommendedServiceIds.size;
        } else {
            count = serviceData.filter(s => {
                const cats = s.categories || (s.category ? [s.category] : []);
                return cats.includes(activeCategory) && recommendedServiceIds.has(s.id);
            }).length;
        }
    }

    const banner = document.createElement('div');
    banner.id = 'rolodex-banner';
    banner.className = 'mb-8 bg-white border border-scandi-clay/30 rounded-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-soft relative overflow-hidden fade-in';

    // Background flair
    banner.innerHTML = `
        <div class="absolute top-0 right-0 w-32 h-32 bg-scandi-clay/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
        
        <div class="flex items-center gap-4 relative z-10">
            <img src="${photo}" class="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm bg-scandi-bg">
            <div>
                <div class="text-[10px] uppercase tracking-widest text-scandi-clay font-bold mb-1">Viewing Recommendations</div>
                <h2 class="font-serif text-2xl text-scandi-text">${name}'s Top Picks</h2>
                <p class="text-sm text-scandi-muted">Browsing ${count} recommended providers</p>
            </div>
        </div>
        
        <a href="index.html" class="relative z-10 px-6 py-3 border border-scandi-line bg-white text-scandi-text font-mono text-xs uppercase tracking-widest rounded-sm hover:bg-scandi-bg transition-colors shadow-sm whitespace-nowrap">
            View All Providers
        </a>
    `;

    filterBar.parentNode.insertBefore(banner, filterBar);
}

// Check immediately on load
checkPassword(); // Legacy placeholder

// Removed password event listener


// --- FIREBASE INIT EXECUTION ---
try {
    if (window.firebaseConfig && firebase?.apps?.length === 0) {
        firebase.initializeApp(window.firebaseConfig);
    } else if (window.firebaseConfig && !firebase?.apps?.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
    // Enable offline persistence (best effort)
    if (firebase?.firestore) {
        firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => { });
        db = firebase.firestore();
        // Try to load category group mapping from Firestore config early
        loadCategoryGroupsConfig();
        loadCategoriesConfig();
        // Start auth check immediately
        initAuthListener();

        // Load Rolodex if recommendedBy is present
        if (recommendedByUid) {
            loadRolodex(recommendedByUid);
        }
    }
    // Analytics is loaded lazily via index.html for better page performance
    // Listen for the analyticsReady event to update the reference
    window.addEventListener('analyticsReady', () => {
        analytics = window.analytics;
    });
    // Check if already loaded (in case event fired before this listener)
    if (window.analytics) {
        analytics = window.analytics;
    }
} catch (_) {
    // No-op if Firebase not available; page will still render but without data
}

