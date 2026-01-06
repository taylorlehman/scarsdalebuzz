// Initialize Shared Header and Modal
let shareModal;

document.addEventListener('DOMContentLoaded', () => {
    new SharedHeader({
        activePage: 'account',
        rootPath: './'
    });
    
    // Initialize ShareModal
    shareModal = new ShareModal();
});

firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Initialize Rolodex
        loadRolodex(user.uid);

        // Setup Share Button
        document.getElementById('share-rolodex-btn').onclick = () => {
            const url = `${window.location.origin}/directory/index.html?recommendedBy=${user.uid}`;
            shareModal.show(url, 'Share My Rolodex');
        };
    } else {
        // Not signed in, redirect to login
        window.location.href = 'login.html';
    }
});

// --- ROLODEX LOGIC ---
const loadRolodex = async (uid) => {
    const loading = document.getElementById('rolodex-loading');
    const empty = document.getElementById('rolodex-empty');
    const content = document.getElementById('rolodex-content');
    
    // Reset state
    content.innerHTML = '';
    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    content.classList.add('hidden');

    try {
        // 1. Get liked service IDs from user's private profile
        // (Authenticated users can still read their own full profile)
        const userDoc = await db.collection('users').doc(uid).get();
        const likedIds = userDoc.data()?.likedServices || [];
        
        if (likedIds.length === 0) {
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }

        // 2. Fetch service details (batch in chunks of 10)
        const services = [];
        for (let i = 0; i < likedIds.length; i += 10) {
            const chunk = likedIds.slice(i, i + 10);
            const snapshot = await db.collection('services')
                .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
            snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
        }

        if (services.length === 0) {
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }

        // 3. Render
        renderRolodexContent(services, uid);
        loading.classList.add('hidden');
        content.classList.remove('hidden');

    } catch (e) {
        console.error("Error loading rolodex", e);
        loading.textContent = "Error loading recommendations.";
    }
};

const renderRolodexContent = (services, uid) => {
    const content = document.getElementById('rolodex-content');
    
    // Group by Category
    const grouped = {};
    services.forEach(s => {
        const cat = s.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
    });
    
    // Sort categories
    const categories = Object.keys(grouped).sort();
    
    categories.forEach(cat => {
        const catSection = document.createElement('div');
        catSection.innerHTML = `
            <div class="flex justify-between items-center mb-4 border-b border-dashed border-scandi-line/50 pb-2">
                <h4 class="font-serif text-lg text-scandi-text">${cat}</h4>
                <button onclick="shareCategory('${uid}', '${cat}')" class="text-[10px] uppercase tracking-widest text-scandi-muted hover:text-scandi-clay transition-colors flex items-center gap-1 group/share">
                    <span>Share Category</span>
                    <svg class="w-3 h-3 group-hover/share:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                </button>
            </div>
            <div class="grid gap-3">
                ${grouped[cat].map(service => {
                    const safeId = service.id.replace(/'/g, "\\'");
                    const fullName = [service.firstName, service.lastName].filter(Boolean).join(' ');
                    const title = service.businessName || fullName;
                    return `
                        <div class="bg-scandi-bg/30 p-4 rounded-sm border border-scandi-line/50 flex justify-between items-center group hover:border-scandi-clay/30 transition-colors">
                            <div class="overflow-hidden mr-4">
                                <div class="font-medium text-scandi-text truncate">${title}</div>
                                <div class="text-xs text-scandi-muted truncate">${service.email || service.phone || 'No contact info'}</div>
                            </div>
                            <button onclick="removeFromRolodex('${safeId}')" class="text-scandi-clay hover:text-red-700 transition-colors shrink-0 p-2 hover:bg-white rounded-full" title="Remove recommendation">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        content.appendChild(catSection);
    });
};

window.shareCategory = (uid, cat) => {
    const url = `${window.location.origin}/directory/index.html?recommendedBy=${uid}&category=${encodeURIComponent(cat)}`;
    shareModal.show(url, `Share ${cat} Picks`);
};

window.removeFromRolodex = async (serviceId) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    
    if (!confirm('Remove this recommendation from your Rolodex?')) return;
    
    const serviceRef = db.collection('services').doc(serviceId);
    const userRef = db.collection('users').doc(uid);
    const likeRef = serviceRef.collection('recommendations').doc(uid);

    try {
        await db.runTransaction(async (transaction) => {
            const serviceDoc = await transaction.get(serviceRef);
            const likeDoc = await transaction.get(likeRef);

            if (!serviceDoc.exists) throw "Service does not exist!";
            
            const currentRecs = serviceDoc.data().recommendations || 0;
            const currentRecent = serviceDoc.data().recentRecommenders || [];

            if (likeDoc.exists) {
                // REMOVE LIKE
                const newRecent = currentRecent.filter(r => r.uid !== uid);

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
        
        // Refresh list
        await loadRolodex(uid);
        
    } catch (e) {
        console.error("Transaction failed: ", e);
        alert("Could not update recommendation. Please try again.");
    }
};
