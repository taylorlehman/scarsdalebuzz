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
                const cat = doc.data().category;
                if (cat) set.add(cat);
            });
            categoriesList = Array.from(set).sort();
        } catch(e) {}
    }

    // Populate Select
    categoriesList.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
    });
}

// --- FORM SUBMISSION ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        authModal.classList.remove('hidden');
        return;
    }

    const category = categorySelect.value;
    const businessName = document.getElementById('businessName').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!category || (!businessName && !firstName && !lastName)) {
        alert('Please provide a category and at least a business name or contact name.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        await db.collection('suggested_services').add({
            category,
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

