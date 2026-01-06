// Admin panel script: Firestore CRUD for services, users, and category groups
// Includes Auth & Role Verification

let db;
let functions;
let currentUser = null;
let currentView = 'services'; // services, users, beta, suggestions, categories, groups
let allUsers = []; // Cache for users

// -- DOM Elements --
const loadingOverlay = document.getElementById('loading-overlay');

// Navigation Elements
const navItems = {
    users: document.getElementById('navUsers'),
    services: document.getElementById('navServices'),
    suggestions: document.getElementById('navSuggestions'),
    beta: document.getElementById('navBeta'),
    categories: document.getElementById('navCategories'),
    groups: document.getElementById('navGroups'),
    cleanup: document.getElementById('navCleanup')
};

const views = {
    users: document.getElementById('usersView'),
    services: document.getElementById('servicesView'),
    suggestions: document.getElementById('suggestionsView'),
    beta: document.getElementById('betaView'),
    categories: document.getElementById('categoriesView'),
    groups: document.getElementById('groupsView'),
    cleanup: document.getElementById('cleanupView')
};

// Count Elements
const counts = {
    users: document.getElementById('usersCount'),
    services: document.getElementById('servicesCount'),
    suggestions: document.getElementById('suggestionsCount'),
    beta: document.getElementById('betaCount'),
    categories: document.getElementById('categoriesCount'),
    groups: document.getElementById('groupsCount')
}

// User Management Elements
const userSearchEl = document.getElementById('userSearch');
const usersTableBody = document.getElementById('usersTableBody');

// Beta Management Elements
const betaSearchEl = document.getElementById('betaSearch');
const betaFilterEl = document.getElementById('betaFilter');
const betaTableBody = document.getElementById('betaTableBody');

// Service Management Elements
const searchEl = document.getElementById('adminSearch');
const filterEl = document.getElementById('adminCategoryFilter');
const tableBody = document.getElementById('adminTableBody');
const addServiceBtn = document.getElementById('addServiceBtn');
const serviceModal = document.getElementById('serviceModal');
const closeServiceModal = document.getElementById('closeServiceModal');
const serviceModalTitle = document.getElementById('serviceModalTitle');

// Suggestions Elements
const suggestionsTableBody = document.getElementById('suggestionsTableBody');
const noSuggestionsMsg = document.getElementById('noSuggestionsMsg');

// Form elements (Service)
const form = document.getElementById('listingForm');
const docIdEl = document.getElementById('docId');
const businessNameEl = document.getElementById('businessName');
const firstNameEl = document.getElementById('firstName');
const lastNameEl = document.getElementById('lastName');
const phoneEl = document.getElementById('phone');
const emailEl = document.getElementById('email');
const categoryEl = document.getElementById('category');
const sunnyApprovedEl = document.getElementById('sunnyApproved');
const lastRecommendedEl = document.getElementById('lastRecommended');
const recommendationsEl = document.getElementById('recommendations');
const cancelBtn = document.getElementById('cancelBtn');

// Categories UI elements
const categorySearchEl = document.getElementById('categorySearch');
const categoryTableBody = document.getElementById('categoryTableBody');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const categoryModal = document.getElementById('categoryModal');
const closeCategoryModal = document.getElementById('closeCategoryModal');
const categoryModalTitle = document.getElementById('categoryModalTitle');
const editCategoryForm = document.getElementById('editCategoryForm');
const editCategoryOriginalNameEl = document.getElementById('editCategoryOriginalName');
const editCategoryNameEl = document.getElementById('editCategoryName');
const editCategoryGroupEl = document.getElementById('editCategoryGroup');
const cancelCategoryBtn = document.getElementById('cancelCategoryBtn');

// Groups UI Elements
const groupSearchEl = document.getElementById('groupSearch');
const groupTableBody = document.getElementById('groupTableBody');
const addGroupBtn = document.getElementById('addGroupBtn');
const groupModal = document.getElementById('groupModal');
const closeGroupModal = document.getElementById('closeGroupModal');
const groupModalTitle = document.getElementById('groupModalTitle');
const editGroupForm = document.getElementById('editGroupForm');
const editGroupOriginalNameEl = document.getElementById('editGroupOriginalName');
const editGroupNameEl = document.getElementById('editGroupName');
const groupCategoriesChooserEl = document.getElementById('groupCategoriesChooser');
const cancelGroupBtn = document.getElementById('cancelGroupBtn');


// State
let allServices = [];
let categoryGroups = null; // { GroupName: [categories...] }
let categoriesList = []; // ["Electrician", ...]

// -- Initialization --

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (window.firebaseConfig && !firebase.apps.length) {
            firebase.initializeApp(window.firebaseConfig);
        }
        db = firebase.firestore();
        functions = firebase.functions();
        
        // Auth Listener
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                await checkAdminAccess();
            } else {
                // Not logged in, redirect to login
                const returnUrl = encodeURIComponent(window.location.href);
                window.location.href = `../login.html?redirect=${returnUrl}`;
            }
        });

    } catch (e) {
        console.error("Init error:", e);
        alert("Failed to initialize application.");
    }
});

async function checkAdminAccess() {
    try {
        const idToken = await currentUser.getIdToken();

        // Call the Cloud Function via fetch (onRequest)
        const response = await fetch('https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/verifyAdminRole', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.isAdmin) {
            // Force token refresh to pick up new claims if just granted
            await currentUser.getIdToken(true);
            
            // Allow access
            loadingOverlay.classList.add('hidden');
            initDashboard();
        } else {
            alert("Access Denied: You are not an administrator.");
            window.location.href = "../index.html";
        }
    } catch (error) {
        console.error("Admin verification failed:", error);
        alert("Verification failed. Please try again.");
        window.location.href = "../index.html";
    }
}

async function initDashboard() {
    setupNavigation();
    
    // Initial data load
    await Promise.all([
        loadCategoryGroups(),
        loadCategoriesList(),
        loadServicesOnce()
    ]);
    
    populateCategorySelects();
    renderTable();
    renderGroupTable();
    renderCategoryTable();
    
    setupEventListeners();
    
    // Default View
    switchView('services');
}

// -- Navigation --

function setupNavigation() {
    Object.keys(navItems).forEach(key => {
        if (navItems[key]) {
            navItems[key].addEventListener('click', () => switchView(key));
        }
    });
}

function switchView(viewName) {
    if (!views[viewName]) return;
    
    currentView = viewName;
    
    // Update Sidebar
    Object.values(navItems).forEach(el => el.classList.remove('active'));
    if (navItems[viewName]) navItems[viewName].classList.add('active');
    
    // Update Panels
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    
    // Trigger specific loads
    if (viewName === 'users') loadUsers();
    if (viewName === 'beta') loadUsers(); // Reuse user loader but renders differently
    if (viewName === 'suggestions') loadSuggestions();
    if (viewName === 'cleanup') initCleanup();
}

function updateCounts() {
    if (allServices) counts.services.textContent = `(${allServices.length})`;
    if (allUsers) {
        counts.users.textContent = `(${allUsers.length})`;
        // Count beta applicants (pending)
        const pendingCount = allUsers.filter(u => u.sunnyBetaStatus === 'pending').length;
        const approvedCount = allUsers.filter(u => u.sunnyBetaStatus === 'approved').length;
        counts.beta.textContent = `(${pendingCount} pending, ${approvedCount} approved)`;
    }
    if (categoriesList) counts.categories.textContent = `(${categoriesList.length})`;
    if (categoryGroups) counts.groups.textContent = `(${Object.keys(categoryGroups).length})`;
    // suggestions updated in loadSuggestions
}

// -- Data Loading --

async function loadCategoryGroups() {
  try {
    const doc = await db.collection('config').doc('categoryGroups').get();
    if (doc.exists) {
      const data = doc.data();
      if (data && data.groups && typeof data.groups === 'object') {
        categoryGroups = data.groups;
      }
    }
    updateCounts();
  } catch (e) {
    console.warn('Failed to load category groups', e);
  }
}

async function loadCategoriesList() {
  categoriesList = [];
  try {
    const doc = await db.collection('config').doc('categories').get();
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data.list)) categoriesList = data.list.slice().sort();
    }
  } catch (e) {
    console.warn('Failed to load categories list', e);
  }
  
  if (!categoriesList.length) {
    // Fallback logic
    if (categoryGroups) {
      const set = new Set();
      Object.values(categoryGroups).forEach(arr => arr.forEach(c => set.add(c)));
      categoriesList = Array.from(set).sort();
    } else if (allServices.length > 0) {
      const set = new Set(allServices.map(s => s.category).filter(Boolean));
      categoriesList = Array.from(set).sort();
    }
  }
  updateCounts();
}

async function loadServicesOnce() {
  try {
      const snap = await db.collection('services').get();
      allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateCounts();
  } catch (e) {
      console.error("Failed to load services:", e);
      alert("Error loading services. Check console.");
  }
}

// -- User Management --

async function loadUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-scandi-muted">Loading users...</td></tr>';
    try {
        // Note: Listing all users might be heavy if many users. Simple implementation for now.
        const snap = await db.collection('users').orderBy('displayName').get();
        allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        if (currentView === 'users') renderUserTable();
        if (currentView === 'beta') renderBetaTable();
        updateCounts();
    } catch (e) {
        console.error("Failed to load users:", e);
        usersTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-600">Error loading users.</td></tr>';
        if (betaTableBody) betaTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-600">Error loading users.</td></tr>';
    }
}

function renderUserTable() {
    const q = (userSearchEl.value || '').toLowerCase();
    
    const filtered = allUsers.filter(u => {
        if (!q) return true;
        const searchStr = `${u.displayName || ''} ${u.email || ''} ${u.uid}`.toLowerCase();
        return searchStr.includes(q);
    });
    
    usersTableBody.innerHTML = '';
    filtered.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-scandi-bg/50 transition-colors group';
        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-scandi-text flex items-center gap-3">
                ${u.photoURL ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full bg-gray-200" />` : '<div class="w-8 h-8 rounded-full bg-scandi-line flex items-center justify-center text-xs">?</div>'}
                ${u.displayName || 'Unknown'}
            </td>
            <td class="py-4 px-6 text-scandi-muted font-mono text-xs">${u.email || '-'}</td>
            <td class="py-4 px-6 text-scandi-muted font-mono text-xs opacity-50">${u.uid}</td>
            <td class="py-4 px-6 text-right">
                <button class="text-xs font-bold text-red-600 hover:text-red-800 uppercase tracking-widest border border-red-200 px-3 py-1 rounded hover:bg-red-50" onclick="handleDeleteUser('${u.uid}')">Delete</button>
            </td>
        `;
        usersTableBody.appendChild(tr);
    });
}

function renderBetaTable() {
    const q = (betaSearchEl.value || '').toLowerCase();
    const filter = betaFilterEl.value;

    const filtered = allUsers.filter(u => {
        // Status Filter
        const status = u.sunnyBetaStatus || 'none'; // none implies not applied
        if (filter && status !== filter) return false;
        if (!filter && status === 'none') return false; // Hide non-applicants by default in Beta view unless specifically looking for them? No, let's show all if no filter, or maybe just applicants. Let's show only those with status != undefined/null usually, but for "All" let's show everyone who has at least applied (pending/approved/rejected).
        
        // If filter is empty ("All"), only show those with ANY status (meaning they interacted with beta flow)
        if (!filter && !u.sunnyBetaStatus) return false;

        // Search Filter
        if (!q) return true;
        const searchStr = `${u.displayName || ''} ${u.email || ''} ${u.uid}`.toLowerCase();
        return searchStr.includes(q);
    });

    betaTableBody.innerHTML = '';
    if (filtered.length === 0) {
        betaTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-scandi-muted">No applicants found.</td></tr>';
        return;
    }

    filtered.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-scandi-bg/50 transition-colors group';

        const status = u.sunnyBetaStatus || 'none';
        let statusBadge = '';
        if (status === 'approved') statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Approved</span>';
        else if (status === 'pending') statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>';
        else if (status === 'rejected') statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Rejected</span>';
        else statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">None</span>';

        let betaActions = '';
        if (status !== 'approved') {
            betaActions += `<button class="text-xs font-bold text-green-600 hover:text-green-800 uppercase tracking-widest border border-green-200 px-3 py-1 rounded hover:bg-green-50 mr-2" onclick="handleAdmitUser('${u.uid}')">Admit</button>`;
        }
        if (status === 'approved' || status === 'pending') {
             betaActions += `<button class="text-xs font-bold text-orange-600 hover:text-orange-800 uppercase tracking-widest border border-orange-200 px-3 py-1 rounded hover:bg-orange-50 mr-2" onclick="handleKickUser('${u.uid}')">Kick</button>`;
        }

        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-scandi-text flex items-center gap-3">
                ${u.photoURL ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full bg-gray-200" />` : '<div class="w-8 h-8 rounded-full bg-scandi-line flex items-center justify-center text-xs">?</div>'}
                ${u.displayName || 'Unknown'}
            </td>
            <td class="py-4 px-6 text-scandi-muted font-mono text-xs">${u.email || '-'}</td>
            <td class="py-4 px-6">${statusBadge}</td>
            <td class="py-4 px-6 text-right">
                ${betaActions}
            </td>
        `;
        betaTableBody.appendChild(tr);
    });
}

window.handleAdmitUser = async (uid) => {
    if (!confirm('Admit this user to Sunny Beta?')) return;
    try {
        await db.collection('users').doc(uid).update({
            sunnyBetaStatus: 'approved'
        });
        // Optimistic update
        const user = allUsers.find(u => u.uid === uid);
        if (user) user.sunnyBetaStatus = 'approved';
        renderBetaTable();
        updateCounts();
    } catch (e) {
        console.error("Admit failed", e);
        alert("Failed to admit user: " + e.message);
    }
};

window.handleKickUser = async (uid) => {
    if (!confirm('Kick this user from Sunny Beta?')) return;
    try {
        await db.collection('users').doc(uid).update({
            sunnyBetaStatus: 'rejected'
        });
        // Optimistic update
        const user = allUsers.find(u => u.uid === uid);
        if (user) user.sunnyBetaStatus = 'rejected';
        renderBetaTable();
        updateCounts();
    } catch (e) {
        console.error("Kick failed", e);
        alert("Failed to kick user: " + e.message);
    }
};

window.handleDeleteUser = async (uid) => {
    if (!confirm('Are you sure you want to delete this user? This will also remove all their recommendations.')) return;
    
    try {
        // Show loading state on row?
        const idToken = await currentUser.getIdToken();
        
        const response = await fetch('https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/deleteUser', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uid })
        });
        
        if (!response.ok) throw new Error('Delete failed');
        
        alert('User deleted successfully.');
        loadUsers(); // Reload list
        loadServicesOnce(); // Refresh services as counts changed
        
    } catch (e) {
        console.error("Delete user error:", e);
        alert("Failed to delete user: " + e.message);
    }
};


// -- UI Helpers --

function getAllCategories() {
  if (categoriesList && categoriesList.length) return categoriesList.slice();
  const set = new Set(allServices.map(s => s.category).filter(Boolean));
  return Array.from(set).sort();
}

function populateCategorySelects() {
  const categories = getAllCategories();
  filterEl.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  categoryEl.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
}


// -- Suggestions Logic --

async function loadSuggestions() {
    suggestionsTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-scandi-muted">Loading...</td></tr>';
    
    try {
        const snap = await db.collection('suggested_services')
            .where('status', '==', 'pending')
            .orderBy('suggestedAt', 'desc')
            .get();
        
        counts.suggestions.textContent = `(${snap.size})`;
        
        if (snap.empty) {
            suggestionsTableBody.innerHTML = '';
            noSuggestionsMsg.classList.remove('hidden');
            return;
        }

        noSuggestionsMsg.classList.add('hidden');
        suggestionsTableBody.innerHTML = '';

        const userIds = new Set(snap.docs.map(d => d.data().suggestedBy));
        const userProfiles = new Map();
        
        await Promise.all(Array.from(userIds).map(async uid => {
            try {
                const doc = await db.collection('users').doc(uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    userProfiles.set(uid, {
                        name: data.displayName || 'Unknown User',
                        photoURL: data.photoURL || null
                    });
                }
            } catch(e) {}
        }));

        snap.forEach(doc => {
            const data = doc.data();
            const suggester = userProfiles.get(data.suggestedBy) || { name: 'Unknown User', photoURL: null };
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-scandi-bg/50 transition-colors group';
            
            const name = data.businessName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
            const contact = [data.phone, data.email].filter(Boolean).join('<br>');

            tr.innerHTML = `
                <td class="py-4 px-6 font-medium text-scandi-text">${name || '-'}</td>
                <td class="py-4 px-6 text-scandi-muted">${data.category || '-'}</td>
                <td class="py-4 px-6 text-scandi-muted text-xs">${contact || '-'}</td>
                <td class="py-4 px-6">
                    <div class="flex items-center gap-3">
                        <img src="${suggester.photoURL || 'https://www.gravatar.com/avatar?d=mp'}" alt="${suggester.name}" class="w-8 h-8 rounded-full bg-gray-100 object-cover border border-scandi-line">
                        <div class="text-xs text-scandi-muted">
                            <span class="font-medium text-scandi-text block">${suggester.name}</span>
                            <span class="opacity-50 text-[10px]">${data.suggestedBy.slice(0, 8)}...</span>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-6 text-right space-x-2">
                    <button class="text-xs font-bold text-green-600 hover:text-green-800 uppercase tracking-widest" onclick="approveSuggestion('${doc.id}')">Approve</button>
                    <button class="text-xs font-bold text-red-600 hover:text-red-800 uppercase tracking-widest" onclick="rejectSuggestion('${doc.id}')">Reject</button>
                </td>
            `;
            suggestionsTableBody.appendChild(tr);
        });

    } catch (e) {
        console.error("Failed to load suggestions:", e);
        suggestionsTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-600">Error loading suggestions.</td></tr>';
    }
}

window.approveSuggestion = async (suggestionId) => {
    if (!confirm('Approve this suggestion? This will create a new service listing and credit the user.')) return;

    try {
        const suggestionDoc = await db.collection('suggested_services').doc(suggestionId).get();
        if (!suggestionDoc.exists) throw "Suggestion not found";
        
        const data = suggestionDoc.data();
        
        // 1. Create payload for new service
        const payload = {
            businessName: data.businessName,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email,
            category: data.category,
            recommendations: 1, // Start with 1 rec from the suggester
            lastRecommended: firebase.firestore.FieldValue.serverTimestamp(),
            recentRecommenders: [{
                uid: data.suggestedBy,
                timestamp: new Date()
            }]
        };

        // Generate ID (Auto-ID)
        const serviceRef = db.collection('services').doc();
        
        // Batch write to ensure atomicity
        const batch = db.batch();

        // 2. Create Service
        batch.set(serviceRef, payload);

        // 3. Add Recommendation Subcollection
        const recRef = serviceRef.collection('recommendations').doc(data.suggestedBy);
        batch.set(recRef, {
            uid: data.suggestedBy,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 4. Update User's Liked Services - REMOVED (deprecated)
        // const userRef = db.collection('users').doc(data.suggestedBy);
        // batch.set(userRef, {
        //     likedServices: firebase.firestore.FieldValue.arrayUnion(serviceRef.id)
        // }, { merge: true });

        // 5. Update Suggestion Status
        batch.update(suggestionDoc.ref, { status: 'approved' });

        await batch.commit();

        alert('Suggestion approved and service created!');
        loadSuggestions();
        loadServicesOnce(); // Refresh main list
        
    } catch (e) {
        console.error("Approval failed:", e);
        alert("Failed to approve: " + e.message);
    }
};

window.rejectSuggestion = async (suggestionId) => {
    if (!confirm('Reject this suggestion?')) return;
    try {
        await db.collection('suggested_services').doc(suggestionId).update({ status: 'rejected' });
        loadSuggestions();
    } catch (e) {
        console.error("Rejection failed:", e);
        alert("Failed to reject: " + e.message);
    }
};

// -- Render Functions --

function renderTable() {
  const q = (searchEl.value || '').toLowerCase();
  const cat = filterEl.value || '';
  
  const filtered = allServices.filter(s => {
    if (cat && s.category !== cat) return false;
    if (!q) return true;
    const title = s.businessName || `${s.firstName || ''} ${s.lastName || ''}`;
    return [title, s.category, s.phone, s.email, s.firstName, s.lastName]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
  });

  tableBody.innerHTML = '';
  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-scandi-bg/50 transition-colors group';
    
    const name = s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
    
    tr.innerHTML = `
      <td class="py-4 px-6 font-medium text-scandi-text">
        ${name || '-'}
        ${s.sunnyApproved ? '<span title="Sunny Approved" class="ml-2">☀️</span>' : ''}
      </td>
      <td class="py-4 px-6 text-scandi-muted">${s.category || '-'}</td>
      <td class="py-4 px-6 text-scandi-muted">${s.recommendations ?? 0}</td>
      <td class="py-4 px-6 text-right space-x-2">
        <button class="text-xs font-mono uppercase tracking-widest text-scandi-muted hover:text-scandi-text border-b border-transparent hover:border-scandi-text transition-all" onclick="editService('${s.id}')">Edit</button>
        <button class="text-xs font-mono uppercase tracking-widest text-red-400 hover:text-red-600 border-b border-transparent hover:border-red-600 transition-all ml-2" onclick="deleteService('${s.id}')">Delete</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

function renderGroupTable() {
    if (!groupTableBody) return;
    
    const q = (groupSearchEl.value || '').toLowerCase();
    
    groupTableBody.innerHTML = '';
    const groups = categoryGroups ? Object.keys(categoryGroups).sort() : [];
    
    const filteredGroups = groups.filter(name => name.toLowerCase().includes(q));
    
    filteredGroups.forEach(name => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-scandi-bg/50 transition-colors group';
        const cats = categoryGroups[name] || [];
        
        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-scandi-text">${name}</td>
            <td class="py-4 px-6 text-scandi-muted text-xs">${cats.length} categories</td>
            <td class="py-4 px-6 text-right space-x-2">
                <button class="text-xs font-mono uppercase tracking-widest text-scandi-muted hover:text-scandi-text border-b border-transparent hover:border-scandi-text transition-all" onclick="editGroup('${name}')">Edit</button>
                <button class="text-xs font-mono uppercase tracking-widest text-red-400 hover:text-red-600 border-b border-transparent hover:border-red-600 transition-all ml-2" onclick="deleteGroup('${name}')">Delete</button>
            </td>
        `;
        groupTableBody.appendChild(tr);
    });
}

function renderCategoryTable() {
    if (!categoryTableBody) return;
    
    const q = (categorySearchEl.value || '').toLowerCase();
    
    categoryTableBody.innerHTML = '';
    const cats = getAllCategories();
    
    const filteredCats = cats.filter(name => name.toLowerCase().includes(q));
    
    filteredCats.forEach(name => {
        let groupName = '-';
        if (categoryGroups) {
            for (const [g, arr] of Object.entries(categoryGroups)) {
                if (arr.includes(name)) {
                    groupName = g;
                    break;
                }
            }
        }
        
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-scandi-bg/50 transition-colors group';
        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-scandi-text">${name}</td>
            <td class="py-4 px-6 text-scandi-muted">${groupName}</td>
            <td class="py-4 px-6 text-right space-x-2">
                <button class="text-xs font-mono uppercase tracking-widest text-scandi-muted hover:text-scandi-text border-b border-transparent hover:border-scandi-text transition-all" onclick="editCategory('${name}')">Edit</button>
                <button class="text-xs font-mono uppercase tracking-widest text-red-400 hover:text-red-600 border-b border-transparent hover:border-red-600 transition-all ml-2" onclick="deleteCategory('${name}')">Delete</button>
            </td>
        `;
        categoryTableBody.appendChild(tr);
    });
}

function buildChooserCategories(selectedSet) {
  groupCategoriesChooserEl.innerHTML = '';
  getAllCategories().forEach(cat => {
    const id = 'chk-' + cat.replace(/[^a-z0-9]/gi, '-');
    const wrapper = document.createElement('label');
    wrapper.className = 'flex items-center gap-2 p-2 hover:bg-scandi-bg/50 rounded-sm cursor-pointer';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = cat;
    cb.checked = selectedSet.has(cat);
    cb.className = 'text-scandi-clay focus:ring-scandi-clay rounded-sm border-scandi-line';
    
    const span = document.createElement('span');
    span.textContent = cat;
    span.className = 'text-xs text-scandi-text';
    
    wrapper.appendChild(cb);
    wrapper.appendChild(span);
    groupCategoriesChooserEl.appendChild(wrapper);
  });
}

// -- Selection Helpers --

window.editGroup = (name) => {
  if (!categoryGroups) return;
  editGroupOriginalNameEl.value = name;
  editGroupNameEl.value = name;
  const selectedSet = new Set(categoryGroups[name] || []);
  buildChooserCategories(selectedSet);
  
  groupModalTitle.textContent = 'Edit Group';
  openModal(groupModal);
};

window.deleteGroup = async (name) => {
    if (!categoryGroups) return;
    const items = categoryGroups[name] || [];
    if (items.length) {
        alert('Cannot delete a group that has categories. Remove all associations first.');
        return;
    }
    if (!confirm(`Delete group "${name}"?`)) return;
    
    delete categoryGroups[name];
    await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
    
    renderGroupTable();
    updateCounts();
}

window.editCategory = (name) => {
  editCategoryOriginalNameEl.value = name;
  editCategoryNameEl.value = name;
  // Populate group dropdown
  editCategoryGroupEl.innerHTML = '<option value="">(Ungrouped)</option>' +
    (categoryGroups ? Object.keys(categoryGroups).sort().map(g => `<option value="${g}">${g}</option>`).join('') : '');
  
  // Preselect group if present
  if (categoryGroups) {
    for (const [g, arr] of Object.entries(categoryGroups)) {
      if (arr.includes(name)) {
        editCategoryGroupEl.value = g;
        break;
      }
    }
  }
  
  categoryModalTitle.textContent = 'Edit Category';
  openModal(categoryModal);
}

window.deleteCategory = async (name) => {
    const snap = await db.collection('services').where('category', '==', name).limit(1).get();
    if (!snap.empty) {
        alert('Cannot delete: there are services associated with this category.');
        return;
    }
    
    if (!confirm(`Delete category "${name}"?`)) return;
    
    categoriesList = categoriesList.filter(c => c !== name);
    await db.collection('config').doc('categories').set({ list: categoriesList });
    
    if (categoryGroups) {
        for (const [g, arr] of Object.entries(categoryGroups)) {
            const idx = arr.indexOf(name);
            if (idx !== -1) arr.splice(idx, 1);
        }
        await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
    }
    
    renderCategoryTable();
    renderGroupTable();
    updateCounts();
}

function fillFormFromDoc(doc) {
  serviceModalTitle.textContent = 'Edit Listing';
  docIdEl.value = doc.id;
  businessNameEl.value = doc.businessName || '';
  firstNameEl.value = doc.firstName || '';
  lastNameEl.value = doc.lastName || '';
  phoneEl.value = doc.phone || '';
  emailEl.value = doc.email || '';
  categoryEl.value = doc.category || '';
  sunnyApprovedEl.checked = !!doc.sunnyApproved;
  
  if (doc.lastRecommended) {
    const d = typeof doc.lastRecommended.toDate === 'function' ? doc.lastRecommended.toDate() : new Date(doc.lastRecommended);
    if (!isNaN(d)) {
      lastRecommendedEl.value = d.toISOString().slice(0, 10);
    }
  } else {
      lastRecommendedEl.value = '';
  }
  
  recommendationsEl.value = Number(doc.recommendations || 0);
  
  openModal(serviceModal);
}

function resetFormToNew() {
  serviceModalTitle.textContent = 'Add New Listing';
  docIdEl.value = '';
  form.reset();
  sunnyApprovedEl.checked = false;
  recommendationsEl.value = 0;
}

function parseDateToTimestamp(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return d;
}

// -- Modal Logic --
function openModal(modal) {
    modal.classList.remove('hidden');
    // slight delay for transition
    requestAnimationFrame(() => {
        modal.classList.add('open');
    });
}

function closeModal(modal) {
    modal.classList.remove('open');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}


// -- Event Listeners --

function setupEventListeners() {
    // User Search
    userSearchEl.addEventListener('input', renderUserTable);

    // Beta Search & Filter
    betaSearchEl.addEventListener('input', renderBetaTable);
    betaFilterEl.addEventListener('change', renderBetaTable);

    // Filter/Search
    searchEl.addEventListener('input', renderTable);
    filterEl.addEventListener('change', renderTable);
    
    // Category Search
    categorySearchEl.addEventListener('input', renderCategoryTable);
    
    // Group Search
    groupSearchEl.addEventListener('input', renderGroupTable);
    
    // Service Modal
    addServiceBtn.addEventListener('click', () => {
        resetFormToNew();
        openModal(serviceModal);
    });
    closeServiceModal.addEventListener('click', () => closeModal(serviceModal));
    cancelBtn.addEventListener('click', () => closeModal(serviceModal));
    
    // Category Modal
    addCategoryBtn.addEventListener('click', () => {
        editCategoryOriginalNameEl.value = '';
        editCategoryNameEl.value = '';
        editCategoryGroupEl.innerHTML = '<option value="">(Ungrouped)</option>' +
            (categoryGroups ? Object.keys(categoryGroups).sort().map(g => `<option value="${g}">${g}</option>`).join('') : '');
        categoryModalTitle.textContent = 'Add Category';
        openModal(categoryModal);
    });
    closeCategoryModal.addEventListener('click', () => closeModal(categoryModal));
    cancelCategoryBtn.addEventListener('click', () => closeModal(categoryModal));
    
    // Group Modal
    addGroupBtn.addEventListener('click', () => {
        editGroupOriginalNameEl.value = '';
        editGroupNameEl.value = '';
        buildChooserCategories(new Set());
        groupModalTitle.textContent = 'Add Group';
        openModal(groupModal);
    });
    closeGroupModal.addEventListener('click', () => closeModal(groupModal));
    cancelGroupBtn.addEventListener('click', () => closeModal(groupModal));
    
    // Inline Edit/Delete Service
    window.editService = (id) => {
        const doc = allServices.find(s => s.id === id);
        if (doc) fillFormFromDoc(doc);
    };
    
    window.deleteService = async (id) => {
        if (!confirm('Delete this listing?')) return;
        
        try {
            const idToken = await currentUser.getIdToken();
            const response = await fetch('https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/deleteService', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ serviceId: id })
            });

            if (!response.ok) throw new Error('Delete failed');

            await loadServicesOnce();
            renderTable();
        } catch (e) {
            console.error('Delete failed', e);
            alert('Delete failed: ' + e.message);
        }
    };

    // Listing Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            businessName: businessNameEl.value.trim() || null,
            firstName: firstNameEl.value.trim() || null,
            lastName: lastNameEl.value.trim() || null,
            phone: phoneEl.value.trim() || null,
            email: emailEl.value.trim() || null,
            category: categoryEl.value || null,
            sunnyApproved: sunnyApprovedEl.checked,
            recommendations: Number(recommendationsEl.value || 0),
        };
        const ts = parseDateToTimestamp(lastRecommendedEl.value.trim());
        if (ts) payload.lastRecommended = ts;

        const existingId = docIdEl.value;
        try {
            if (existingId) {
                await db.collection('services').doc(existingId).set(payload, { merge: true });
            } else {
                await db.collection('services').add(payload);
            }
            closeModal(serviceModal);
            await loadServicesOnce();
            renderTable();
            // alert('Saved successfully');
        } catch (e) {
            console.error('Save failed', e);
            alert('Save failed: ' + e.message);
        }
    });
    
    // Group Edit/Add Form
    editGroupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!categoryGroups) categoryGroups = {};
        
        const orig = editGroupOriginalNameEl.value;
        const newName = (editGroupNameEl.value || '').trim();
        
        if (!newName) {
            alert('Name required');
            return;
        }
        
        const selected = Array.from(groupCategoriesChooserEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        
        if (orig && orig !== newName) {
            // Rename
            if (categoryGroups[newName]) {
                alert('A group with that name already exists');
                return;
            }
            categoryGroups[newName] = selected;
            delete categoryGroups[orig];
        } else if (!orig) {
            // New
             if (categoryGroups[newName]) {
                alert('Group already exists');
                return;
            }
            categoryGroups[newName] = selected;
        } else {
            // Update existing same name
            categoryGroups[orig] = selected;
        }
        
        await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
        
        // Update categories list union
        const set = new Set(categoriesList);
        selected.forEach(c => set.add(c));
        categoriesList = Array.from(set).sort();
        await db.collection('config').doc('categories').set({ list: categoriesList });
        
        closeModal(groupModal);
        renderGroupTable();
        renderCategoryTable();
        updateCounts();
    });
    
    // Category Edit/Add Form
    editCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orig = editCategoryOriginalNameEl.value;
        const newName = (editCategoryNameEl.value || '').trim();
        const group = editCategoryGroupEl.value || '';
        
        if (!newName) {
            alert('Name required');
            return;
        }
        
        // Add or Rename Logic
        if (orig && newName !== orig) {
             if (categoriesList.includes(newName)) {
                alert('A category with that name already exists');
                return;
            }
            
            // Batch update services
            const snap = await db.collection('services').where('category', '==', orig).get();
            const batchSize = 400;
            let pending = db.batch();
            let i = 0;
            snap.forEach(doc => {
                pending.update(doc.ref, { category: newName });
                i++;
                if (i % batchSize === 0) {
                    pending.commit();
                    pending = db.batch();
                }
            });
            await pending.commit();
            
            // Update Groups for Rename
            if (categoryGroups) {
                for (const [g, arr] of Object.entries(categoryGroups)) {
                    const idx = arr.indexOf(orig);
                    if (idx !== -1) {
                        arr.splice(idx, 1, newName);
                    }
                }
            }
            categoriesList = categoriesList.filter(c => c !== orig);
            categoriesList.push(newName);
        } else if (!orig) {
            // New
            if (categoriesList.includes(newName)) {
                alert('Category already exists');
                return;
            }
            categoriesList.push(newName);
        }
        
        categoriesList.sort();
        
        // Update Group Association (for both New and Edit)
        if (categoryGroups) {
            // Remove from all first
            for (const arr of Object.values(categoryGroups)) {
                const idx = arr.indexOf(newName);
                if (idx !== -1) arr.splice(idx, 1);
            }
            // Add to new selected group
            if (group) {
                categoryGroups[group] = categoryGroups[group] || [];
                if (!categoryGroups[group].includes(newName)) categoryGroups[group].push(newName);
                categoryGroups[group].sort();
            }
            await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
        }
        
        await db.collection('config').doc('categories').set({ list: categoriesList });
        
        closeModal(categoryModal);
        renderCategoryTable();
        renderGroupTable();
        populateCategorySelects();
        
        if (orig && newName !== orig) {
            await loadServicesOnce();
            renderTable();
        }
        updateCounts();
    });

    // Cleanup Events
    const cleanupNextBtn = document.getElementById('cleanupNextBtn');
    const acceptPhoneBtn = document.getElementById('acceptPhoneBtn');
    const rejectPhoneBtn = document.getElementById('rejectPhoneBtn');
    const acceptEmailBtn = document.getElementById('acceptEmailBtn');
    const rejectEmailBtn = document.getElementById('rejectEmailBtn');

    if (cleanupNextBtn) {
        cleanupNextBtn.addEventListener('click', () => {
            currentCleanupIndex++;
            renderCleanupItem();
        });
    }

    if (acceptPhoneBtn) acceptPhoneBtn.addEventListener('click', () => handleAccept('phone'));
    if (rejectPhoneBtn) rejectPhoneBtn.addEventListener('click', () => handleReject('phone'));
    if (acceptEmailBtn) acceptEmailBtn.addEventListener('click', () => handleAccept('email'));
    if (rejectEmailBtn) rejectEmailBtn.addEventListener('click', () => handleReject('email'));
}


// -- Data Cleanup Logic --

function initCleanup() {
    // 1. Filter services missing phone OR email
    cleanupQueue = allServices.filter(s => !s.phone || !s.email);
    currentCleanupIndex = 0;
    renderCleanupItem();
}

function renderCleanupItem() {
    const els = {
        name: document.getElementById('cleanupName'),
        category: document.getElementById('cleanupCategory'),
        address: document.getElementById('cleanupAddress'),
        progress: document.getElementById('cleanupProgress'),
        loading: document.getElementById('cleanupLoading'),
        content: document.getElementById('cleanupContent'),
        empty: document.getElementById('cleanupEmptyState'),
        results: document.getElementById('cleanupResults'),
        
        // Phone
        phoneVal: document.getElementById('phoneValue'),
        phoneSrc: document.getElementById('phoneSource'),
        phoneBadge: document.getElementById('phoneBadge'),
        phoneActions: document.getElementById('phoneActions'),
        phoneStatus: document.getElementById('phoneStatus'),
        
        // Email
        emailVal: document.getElementById('emailValue'),
        emailSrc: document.getElementById('emailSource'),
        emailBadge: document.getElementById('emailBadge'),
        emailActions: document.getElementById('emailActions'),
        emailStatus: document.getElementById('emailStatus'),
    };

    if (cleanupQueue.length === 0) {
        els.content.classList.add('hidden');
        els.empty.classList.remove('hidden');
        els.progress.textContent = "0/0";
        return;
    }

    if (currentCleanupIndex >= cleanupQueue.length) {
        // Finished loop? Restart or show done?
        // Let's just wrap or show empty
        currentCleanupIndex = 0; // Simple loop for now
    }

    const service = cleanupQueue[currentCleanupIndex];
    els.content.classList.remove('hidden');
    els.empty.classList.add('hidden');
    
    els.name.textContent = service.businessName || `${service.firstName || ''} ${service.lastName || ''}`;
    els.category.textContent = service.category || 'Uncategorized';
    els.address.textContent = 'Scarsdale Area'; // Placeholder as address isn't in model yet
    els.progress.textContent = `${currentCleanupIndex + 1}/${cleanupQueue.length}`;

    // Reset Cards
    resetCleanupCard(els.phoneVal, els.phoneSrc, els.phoneBadge, els.phoneActions, els.phoneStatus);
    resetCleanupCard(els.emailVal, els.emailSrc, els.emailBadge, els.emailActions, els.emailStatus);
    
    // Auto-Trigger Search
    triggerCleanupSearch(service);
}

function resetCleanupCard(valEl, srcEl, badgeEl, actionsEl, statusEl) {
    valEl.textContent = '-';
    valEl.classList.remove('text-scandi-text', 'text-scandi-muted');
    valEl.classList.add('text-scandi-muted');
    srcEl.textContent = '';
    badgeEl.classList.add('hidden');
    badgeEl.className = 'hidden px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide'; // Reset colors
    actionsEl.classList.add('hidden');
    statusEl.textContent = '';
    statusEl.className = 'hidden mt-2 text-xs font-bold uppercase tracking-wide';
}

async function triggerCleanupSearch(service) {
    const loadingEl = document.getElementById('cleanupLoading');
    const resultsEl = document.getElementById('cleanupResults');
    
    loadingEl.classList.remove('hidden');
    resultsEl.classList.add('opacity-50', 'pointer-events-none'); // Dim existing

    try {
        const idToken = await currentUser.getIdToken();
        
        // Use direct fetch to ensure Auth header is passed correctly
        // 'onCall' functions require the body to be wrapped in { "data": ... }
        const response = await fetch('https://us-central1-scarsdale-buzz-prod.cloudfunctions.net/findBusinessContactInfo', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    businessName: service.businessName || `${service.firstName} ${service.lastName}`,
                    category: service.category,
                    address: 'Scarsdale, NY' 
                }
            })
        });

        if (!response.ok) {
            // Try to parse error details from onCall standard error format
            const errJson = await response.json().catch(() => ({}));
            const errMsg = errJson.error ? errJson.error.message : response.statusText;
            throw new Error(errMsg || `Server error: ${response.status}`);
        }

        const json = await response.json();
        const result = json.result; // onCall returns { result: ... }

        // RACE CONDITION CHECK:
        // Ensure this result matches the service currently being viewed.
        const currentService = cleanupQueue[currentCleanupIndex];
        if (!currentService || currentService.id !== service.id) {
            console.log('Cleanup result discarded (stale request)', service.businessName);
            return;
        }

        currentCleanupResult = result;
        displayCleanupResult(result, service);

    } catch (e) {
        console.error("Cleanup search failed:", e);
        const errorData = { 
            value: "Error searching", 
            confidence: "None", 
            source: e.message || "Unknown error" 
        };
        updateCleanupCard('phone', errorData, service.phone);
        updateCleanupCard('email', errorData, service.email);
    } finally {
        loadingEl.classList.add('hidden');
        resultsEl.classList.remove('opacity-50', 'pointer-events-none');
    }
}

function displayCleanupResult(result, service) {
    // Phone
    updateCleanupCard(
        'phone', 
        result.phone, 
        service.phone // existing value
    );
    
    // Email
    updateCleanupCard(
        'email', 
        result.email, 
        service.email // existing value
    );
}

function updateCleanupCard(type, data, existingValue) {
    const els = {
        val: document.getElementById(`${type}Value`),
        src: document.getElementById(`${type}Source`),
        badge: document.getElementById(`${type}Badge`),
        actions: document.getElementById(`${type}Actions`),
        status: document.getElementById(`${type}Status`),
    };

    if (existingValue) {
        els.val.textContent = existingValue;
        els.src.textContent = '(Existing in database)';
        els.badge.textContent = 'EXISTING';
        els.badge.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-yellow-100', 'text-yellow-800', 'bg-red-100', 'text-red-800');
        els.badge.classList.add('bg-gray-100', 'text-gray-800');
        els.val.classList.remove('text-scandi-muted');
        els.val.classList.add('text-scandi-text');
        // No actions needed if existing? Or maybe allow replace?
        // Requirement says "for services... that have no contact info".
        // So if we have it, we skip searching for it?
        // Actually the prompt searches for both. If we have it, let's just show it and disable actions.
        return; 
    }

    if (!data || !data.value) {
        els.val.textContent = 'Not found';
        els.src.textContent = 'AI could not verify a reliable number.';
        return;
    }

    els.val.textContent = data.value;
    els.val.classList.remove('text-scandi-muted');
    els.val.classList.add('text-scandi-text');
    els.src.textContent = data.source || 'No source provided';
    
    // Badge
    els.badge.textContent = data.confidence || 'UNKNOWN';
    els.badge.classList.remove('hidden');
    if (data.confidence === 'High') els.badge.classList.add('bg-green-100', 'text-green-800');
    else if (data.confidence === 'Medium') els.badge.classList.add('bg-yellow-100', 'text-yellow-800');
    else els.badge.classList.add('bg-red-100', 'text-red-800');

    // Actions
    els.actions.classList.remove('hidden');
}

async function handleAccept(type) {
    if (!currentCleanupResult || !currentCleanupResult[type]) return;
    
    const service = cleanupQueue[currentCleanupIndex];
    const newValue = currentCleanupResult[type].value;
    
    const actionsEl = document.getElementById(`${type}Actions`);
    const statusEl = document.getElementById(`${type}Status`);
    
    actionsEl.classList.add('hidden');
    statusEl.textContent = 'Saving...';
    statusEl.classList.remove('hidden');
    statusEl.classList.add('text-scandi-muted');

    try {
        await db.collection('services').doc(service.id).update({
            [type]: newValue
        });
        
        // Update local state
        const idx = allServices.findIndex(s => s.id === service.id);
        if (idx !== -1) allServices[idx][type] = newValue;
        
        statusEl.textContent = 'Accepted & Saved';
        statusEl.classList.remove('text-scandi-muted');
        statusEl.classList.add('text-green-600');
        
    } catch (e) {
        console.error("Save failed", e);
        statusEl.textContent = 'Error Saving';
        statusEl.classList.remove('text-scandi-muted');
        statusEl.classList.add('text-red-600');
        actionsEl.classList.remove('hidden'); // Allow retry
    }
}

function handleReject(type) {
    const actionsEl = document.getElementById(`${type}Actions`);
    const statusEl = document.getElementById(`${type}Status`);
    
    actionsEl.classList.add('hidden');
    statusEl.textContent = 'Rejected';
    statusEl.classList.remove('hidden');
    statusEl.classList.add('text-gray-500');
}
