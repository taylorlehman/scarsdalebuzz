// RECOMMENDATIONS PAGE LOGIC
// Displays services recommended by the current user

let db;
let currentUser = null;
let recommendations = []; 
let serviceCache = new Map();
let shareModal;

document.addEventListener('DOMContentLoaded', () => {
    // Shared Header
    new SharedHeader({
        activePage: 'directory', // Highlight directory as parent
        rootPath: './'
    });

    // Initialize Share Modal
    shareModal = new ShareModal();

    if (window.firebaseConfig && !firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
    
    db = firebase.firestore();

    // UI Refs
    const loading = document.getElementById('rolodex-loading');
    const empty = document.getElementById('rolodex-empty');
    const content = document.getElementById('rolodex-content');

    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            loadUserRecommendations(user.uid);
            
            // Share Button Logic
            document.getElementById('share-rolodex-btn').onclick = () => {
                const shareUrl = `${window.location.origin}/directory/index.html?recommendedBy=${user.uid}`;
                if (shareModal) {
                    shareModal.show(shareUrl, `${user.displayName}'s Recommendations`);
                } else {
                    // Fallback to clipboard
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        const span = document.getElementById('share-btn-text');
                        const original = span.textContent;
                        span.textContent = 'Link Copied!';
                        setTimeout(() => span.textContent = original, 2000);
                    });
                }
            };

        } else {
            // Redirect to login if not authenticated
            window.location.href = 'login.html?redirect=recommendations.html';
        }
    });
});

async function loadUserRecommendations(uid) {
    const loading = document.getElementById('rolodex-loading');
    const empty = document.getElementById('rolodex-empty');
    const content = document.getElementById('rolodex-content');

    try {
        // 1. Get all recommendations by this user
        const snapshot = await db.collectionGroup('recommendations')
            .where('uid', '==', uid)
            .orderBy('timestamp', 'desc')
            .get();

        if (snapshot.empty) {
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }

        // 2. Extract Service IDs
        const serviceIds = [];
        snapshot.docs.forEach(doc => {
            if (doc.ref.parent && doc.ref.parent.parent) {
                serviceIds.push(doc.ref.parent.parent.id);
            }
        });

        // 3. Fetch Service Details (Batching if needed, simple Promise.all for now)
        const services = [];
        // Chunk requests to avoid Firestore 'in' limit if we were using it, 
        // but here we are fetching individually or could use get() on doc refs.
        // Reusing existing batched logic pattern or simple Promise.all
        await Promise.all(serviceIds.map(async (id) => {
            try {
                const doc = await db.collection('services').doc(id).get();
                if (doc.exists) {
                    services.push({ id: doc.id, ...doc.data() });
                }
            } catch (e) {
                console.warn("Failed to fetch service", id);
            }
        }));

        renderRecommendations(services, uid);
        loading.classList.add('hidden');
        content.classList.remove('hidden');

    } catch (e) {
        console.error("Error loading recommendations", e);
        loading.textContent = "Error loading your picks.";
    }
}

function renderRecommendations(services, uid) {
    const content = document.getElementById('rolodex-content');
    content.innerHTML = '';

    // Group by Category (One service can be in multiple groups)
    const grouped = {};
    services.forEach(s => {
        const cats = s.categories || (s.category ? [s.category] : ['Uncategorized']);
        if (cats.length === 0) cats.push('Uncategorized');
        
        cats.forEach(cat => {
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(s);
        });
    });

    // Render Groups
    Object.keys(grouped).sort().forEach(category => {
        const section = document.createElement('div');
        section.className = 'fade-in mb-8';
        
        const headerContainer = document.createElement('div');
        headerContainer.className = 'flex justify-between items-center mb-4 border-b border-dashed border-scandi-line/50 pb-2';
        headerContainer.innerHTML = `
            <h4 class="font-serif text-lg text-scandi-text">${category}</h4>
            <button onclick="shareCategory('${uid}', '${category}')" class="text-[10px] uppercase tracking-widest text-scandi-muted hover:text-scandi-clay transition-colors flex items-center gap-1 group/share">
                <span>Share Category</span>
                <svg class="w-3 h-3 group-hover/share:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
            </button>
        `;
        section.appendChild(headerContainer);

        const grid = document.createElement('div');
        grid.className = 'grid gap-3';

        grouped[category].forEach(service => {
            const card = document.createElement('div');
            card.className = 'bg-scandi-bg/30 p-4 rounded-sm border border-scandi-line/50 flex justify-between items-center group hover:border-scandi-clay/30 transition-colors';
            
            const name = service.businessName || `${service.firstName} ${service.lastName}`;
            const safeId = service.id.replace(/'/g, "\\'");
            
            card.innerHTML = `
                <div class="overflow-hidden mr-4">
                    <div class="font-medium text-scandi-text truncate cursor-pointer hover:text-scandi-clay transition-colors" onclick="window.location.href='directory/index.html?category=${encodeURIComponent(category)}'">${name}</div>
                    <div class="text-xs text-scandi-muted truncate">${service.phone || service.email || 'No contact info'}</div>
                </div>
                <button onclick="removeRecommendation('${safeId}')" class="text-scandi-clay hover:text-red-700 transition-colors shrink-0 p-2 hover:bg-white rounded-full" title="Remove recommendation">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                </button>
            `;
            grid.appendChild(card);
        });

        section.appendChild(grid);
        content.appendChild(section);
    });
}

window.removeRecommendation = async (serviceId) => {
    if (!confirm('Remove this recommendation?')) return;
    
    try {
        const userRef = db.collection('services').doc(serviceId).collection('recommendations').doc(currentUser.uid);
        const serviceRef = db.collection('services').doc(serviceId);

        await db.runTransaction(async (t) => {
            const sDoc = await t.get(serviceRef);
            if (!sDoc.exists) return;
            
            const currentRecs = sDoc.data().recommendations || 0;
            const currentRecent = sDoc.data().recentRecommenders || [];
            
            t.delete(userRef);
            t.update(serviceRef, {
                recommendations: Math.max(0, currentRecs - 1),
                recentRecommenders: currentRecent.filter(r => r.uid !== currentUser.uid)
            });
        });

        // Reload
        loadUserRecommendations(currentUser.uid);

    } catch (e) {
        console.error("Error removing", e);
        alert("Failed to remove. Try again.");
    }
};

window.shareCategory = (uid, cat) => {
    const url = `${window.location.origin}/directory/index.html?recommendedBy=${uid}&category=${encodeURIComponent(cat)}`;
    if (shareModal) {
        shareModal.show(url, `Share ${cat} Picks`);
    } else {
        // Fallback if modal not ready
        prompt("Copy this link:", url);
    }
};

