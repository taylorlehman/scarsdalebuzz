// Admin panel script: Firestore CRUD for services, users, and category groups
// Includes Auth & Role Verification

let db;
let functions;
let currentUser = null;
let isTlLabsAdmin = false;
let currentView = 'services'; // services, users, beta, suggestions, categories, groups
let allUsers = []; // Cache for users
let approvingSuggestionId = null;
let approvingSuggestionData = null;

// -- DOM Elements --
const loadingOverlay = document.getElementById('loading-overlay');

// Navigation Elements
const navItems = {
    users: document.getElementById('navUsers'),
    services: document.getElementById('navServices'),
    suggestions: document.getElementById('navSuggestions'),
    mergeCategories: document.getElementById('navMergeCategories'),
    beta: document.getElementById('navBeta'),
    categories: document.getElementById('navCategories'),
    groups: document.getElementById('navGroups'),
    qualityDashboard: document.getElementById('navQualityDashboard'),
    cleanup: document.getElementById('navCleanup')
};

const views = {
    users: document.getElementById('usersView'),
    services: document.getElementById('servicesView'),
    suggestions: document.getElementById('suggestionsView'),
    mergeCategories: document.getElementById('mergeCategoriesView'),
    beta: document.getElementById('betaView'),
    categories: document.getElementById('categoriesView'),
    groups: document.getElementById('groupsView'),
    qualityDashboard: document.getElementById('qualityDashboardView'),
    cleanup: document.getElementById('cleanupView')
};

// Count Elements
const counts = {
    users: document.getElementById('usersCount'),
    navUsers: document.getElementById('navUsersCount'),
    services: document.getElementById('servicesCount'),
    suggestions: document.getElementById('suggestionsCount'),
    navSuggestions: document.getElementById('navSuggestionsCount'),
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
    const newCategoryContainer = document.getElementById('newCategoryContainer');
    const newCategoryInput = document.getElementById('newCategory');
    const newCategoryGroupEl = document.getElementById('newCategoryGroup');
    const sunnyApprovedEl = document.getElementById('sunnyApproved');
    const isTestProviderEl = document.getElementById('isTestProvider');
    const lastRecommendedEl = document.getElementById('lastRecommended');
    const recommendationsEl = document.getElementById('recommendations');
const saveServiceBtn = document.getElementById('saveServiceBtn');
const rejectSuggestionBtn = document.getElementById('rejectSuggestionBtn');
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
        const response = await fetch(window.firebaseConfig.functionUrls.verifyAdminRole, {
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
            isTlLabsAdmin = !!data.isTlLabs;
            
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
    
    // If not a TL Labs admin, restrict view to Users only
    if (!isTlLabsAdmin) {
        // Hide all nav items except Users
        Object.keys(navItems).forEach(key => {
            if (key !== 'users' && navItems[key]) {
                navItems[key].classList.add('hidden');
            }
        });

        // Hide Section Headers
        const headersToHide = [
            'headerServiceManagement',
            'headerCategoryManagement',
            'headerDataQuality'
        ];
        headersToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        
        // Force switch to users view
        switchView('users');
    } else {
        // Default View for full admins
        switchView('services');
    }
    
    // Initial data load
    await Promise.all([
        loadCategoryGroups(),
        loadCategoriesList(),
        loadServicesOnce(),
        loadUsers(),
        loadSuggestions()
    ]);
    
    populateCategorySelects();
    renderTable();
    renderGroupTable();
    renderCategoryTable();
    
    setupEventListeners();
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
    if (viewName === 'qualityDashboard') loadQualityDashboard();
    if (viewName === 'cleanup') initCleanup();
    if (viewName === 'mergeCategories') initMergeCategories();
}

function updateCounts() {
    if (allServices) counts.services.textContent = `(${allServices.length})`;
    if (allUsers) {
        counts.users.textContent = `(${allUsers.length})`;
        
        // Count pending users for nav
        const pendingUsers = allUsers.filter(u => !u.directoryStatus || u.directoryStatus === 'pending').length;
        if (counts.navUsers) counts.navUsers.textContent = pendingUsers > 0 ? `(${pendingUsers})` : '';

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
    
    // Sort: Pending first, then by createdAt descending (newest first)
    filtered.sort((a, b) => {
        const statusA = a.directoryStatus || 'pending';
        const statusB = b.directoryStatus || 'pending';
        
        if (statusA === 'pending' && statusB !== 'pending') return -1;
        if (statusA !== 'pending' && statusB === 'pending') return 1;
        
        // Both are approved (or rejected/other)
        // Sort by createdAt desc
        const getTime = (d) => {
            if (!d) return 0;
            // Handle Firestore Timestamp or Date string/object
            return d.toDate ? d.toDate().getTime() : new Date(d).getTime();
        };

        const timeA = getTime(a.createdAt);
        const timeB = getTime(b.createdAt);

        return timeB - timeA; // Descending
    });
    
    usersTableBody.innerHTML = '';
    filtered.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-scandi-bg/50 transition-colors group';
        
        const status = u.directoryStatus || 'pending';
        
        let statusBadge = '';
        let actionButtons = '';
        
        if (status === 'approved') {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Approved</span>';
            
            // Check if admin (either via DB flag or email domain)
            const isTlLabsEmail = u.email && u.email.endsWith('@tl-labs.com');
            const isAdmin = !!u.isAdmin || isTlLabsEmail;
            
            const adminBadge = isAdmin ? '<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 uppercase tracking-wide">ADMIN</span>' : '';
            statusBadge += adminBadge;

            // Overflow Menu
            actionButtons = `
                <div class="relative inline-block text-left">
                    <button onclick="toggleUserMenu('${u.uid}', event)" class="p-2 text-scandi-muted hover:text-scandi-text rounded-full hover:bg-scandi-bg transition-colors">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>
                    <div id="menu-${u.uid}" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-scandi-line origin-top-right">
                        ${!isAdmin ? `<button onclick="handleMakeAdmin('${u.uid}')" class="block w-full text-left px-4 py-2 text-sm text-scandi-text hover:bg-scandi-bg">Make Admin</button>` : ''}
                        <button onclick="handleDeleteUser('${u.uid}')" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete User</button>
                    </div>
                </div>
            `;
        } else {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>';
            actionButtons = `
                <button class="text-xs font-bold text-green-600 hover:text-green-800 uppercase tracking-widest border border-green-200 px-3 py-1 rounded hover:bg-green-50 mr-2" onclick="handleApproveAccess('${u.uid}')">Accept</button>
                <button class="text-xs font-bold text-red-600 hover:text-red-800 uppercase tracking-widest border border-red-200 px-3 py-1 rounded hover:bg-red-50" onclick="handleRejectAccess('${u.uid}')">Reject</button>
            `;
        }

        tr.innerHTML = `
            <td class="py-4 px-4 md:px-6 font-medium text-scandi-text flex items-center gap-3">
                ${u.photoURL ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full bg-gray-200" />` : '<div class="w-8 h-8 rounded-full bg-scandi-line flex items-center justify-center text-xs">?</div>'}
                <div>
                    <div>${u.displayName || 'Unknown'}</div>
                    <div class="text-[10px] text-scandi-muted font-mono">${u.uid}</div>
                    <div class="md:hidden text-xs text-scandi-muted mt-1">
                        <div>${u.email || '-'}</div>
                        ${u.createdAt ? `<div class="text-[10px] opacity-70">Created: ${new Date(u.createdAt.toDate ? u.createdAt.toDate() : u.createdAt).toLocaleDateString()}</div>` : ''}
                    </div>
                </div>
            </td>
            <td class="py-4 px-4 md:px-6 text-scandi-muted font-mono text-xs hidden md:table-cell">
                <div>${u.email || '-'}</div>
                ${u.createdAt ? `<div class="text-[10px] opacity-70 mt-1">Created: ${new Date(u.createdAt.toDate ? u.createdAt.toDate() : u.createdAt).toLocaleDateString()}</div>` : ''}
            </td>
            <td class="py-4 px-4 md:px-6">${statusBadge}</td>
            <td class="py-4 px-4 md:px-6 text-right">
                ${actionButtons}
            </td>
        `;
        usersTableBody.appendChild(tr);
    });
}

window.handleApproveAccess = async (uid) => {
    try {
        const updateData = {
            directoryStatus: 'approved',
            joinedDate: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(uid).update(updateData);
        
        // Optimistic update
        const user = allUsers.find(u => u.uid === uid);
        if (user) {
            user.directoryStatus = 'approved';
            user.joinedDate = new Date(); // Approximate for immediate display
        }
        renderUserTable();
        updateCounts();
        
    } catch (e) {
        console.error("Approval failed", e);
        alert("Failed to approve user: " + e.message);
    }
};

window.handleRejectAccess = async (uid) => {
    if (!confirm('Reject this user? This will delete their account request.')) return;
    // Reuse delete logic as rejection implies removal in this context
    handleDeleteUser(uid);
};

window.toggleUserMenu = (uid, event) => {
    event.stopPropagation();
    const btn = event.currentTarget;
    const menuId = `menu-${uid}`;

    // Close all others
    document.querySelectorAll('[id^="menu-"]').forEach(el => {
        if (el.id !== menuId) el.classList.add('hidden');
    });
    
    const menu = document.getElementById(menuId);
    if (!menu) return;

    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        return;
    }

    // Show and position
    menu.classList.remove('hidden');
    
    // Use fixed positioning to escape overflow container
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 8}px`; // slight offset
    menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
    menu.style.left = 'auto'; // reset in case
    menu.style.zIndex = '9999';
};

// Close menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('[id^="menu-"]').forEach(el => el.classList.add('hidden'));
});

// Close menus on scroll (capture phase to catch table scroll)
window.addEventListener('scroll', () => {
    document.querySelectorAll('[id^="menu-"]').forEach(el => el.classList.add('hidden'));
}, true);

window.handleMakeAdmin = async (uid) => {
    if (!confirm('Are you sure you want to make this user an Admin? They will have full access to this dashboard.')) return;
    
    // Safety Check: Ensure the URL is defined
    const url = window.firebaseConfig?.functionUrls?.grantAdminRole;
    if (!url) {
        console.error("Configuration error: grantAdminRole URL is missing.", window.firebaseConfig);
        alert("Configuration error: The 'Grant Admin' feature is not properly configured in this environment (URL missing). Please clear your cache or contact support.");
        return;
    }

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uid })
        });
        
        if (!response.ok) {
            // Check content type to see if it's HTML (likely 404 page)
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                throw new Error("Server returned a 404 Page (Function not found or misconfigured URL).");
            }
            
            const err = await response.text();
            throw new Error(err || 'Request failed');
        }
        
        alert('Admin role granted successfully.');
        
        // Optimistic update
        const user = allUsers.find(u => u.uid === uid);
        if (user) user.isAdmin = true;
        renderUserTable();
        
    } catch (e) {
        console.error("Grant admin failed:", e);
        alert("Failed to grant admin role: " + e.message);
    }
};

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
            <td class="py-4 px-4 md:px-6 font-medium text-scandi-text flex items-center gap-3">
                ${u.photoURL ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full bg-gray-200" />` : '<div class="w-8 h-8 rounded-full bg-scandi-line flex items-center justify-center text-xs">?</div>'}
                <div class="min-w-0">
                    <div class="truncate">${u.displayName || 'Unknown'}</div>
                    <div class="md:hidden text-xs text-scandi-muted mt-1 truncate">${u.email || '-'}</div>
                </div>
            </td>
            <td class="py-4 px-4 md:px-6 text-scandi-muted font-mono text-xs hidden md:table-cell">${u.email || '-'}</td>
            <td class="py-4 px-4 md:px-6">${statusBadge}</td>
            <td class="py-4 px-4 md:px-6 text-right">
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
        
        const response = await fetch(window.firebaseConfig.functionUrls.deleteUser, {
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
  
  let catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  catOptions += '<option value="Other">Other (New Category)</option>';
  categoryEl.innerHTML = catOptions;
  
  // Populate new category group dropdown
  if (categoryGroups) {
      const groups = Object.keys(categoryGroups).sort();
      newCategoryGroupEl.innerHTML = '<option value="">(Select a Group)</option>' + 
          groups.map(g => `<option value="${g}">${g}</option>`).join('');
  }
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
        if (counts.navSuggestions) counts.navSuggestions.textContent = snap.size > 0 ? `(${snap.size})` : '';
        
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
                <td class="py-4 px-4 md:px-6 font-medium text-scandi-text">
                    <div>${name || '-'}</div>
                    <div class="md:hidden text-xs text-scandi-muted mt-1 space-y-0.5">
                        <div>${data.category || '-'}</div>
                        <div>${contact || '-'}</div>
                        <div class="flex items-center gap-2 mt-1">
                            <img src="${suggester.photoURL || 'https://www.gravatar.com/avatar?d=mp'}" alt="${suggester.name}" class="w-4 h-4 rounded-full bg-gray-100 object-cover border border-scandi-line">
                            <span>${suggester.name}</span>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-4 md:px-6 text-scandi-muted hidden md:table-cell">${data.category || '-'}</td>
                <td class="py-4 px-4 md:px-6 text-scandi-muted text-xs hidden md:table-cell">${contact || '-'}</td>
                <td class="py-4 px-4 md:px-6 hidden md:table-cell">
                    <div class="flex items-center gap-3">
                        <img src="${suggester.photoURL || 'https://www.gravatar.com/avatar?d=mp'}" alt="${suggester.name}" class="w-8 h-8 rounded-full bg-gray-100 object-cover border border-scandi-line">
                        <div class="text-xs text-scandi-muted">
                            <span class="font-medium text-scandi-text block">${suggester.name}</span>
                            <span class="opacity-50 text-[10px]">${data.suggestedBy.slice(0, 8)}...</span>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-4 md:px-6 text-right space-x-2">
                    <button class="text-xs font-bold text-scandi-text hover:text-scandi-muted uppercase tracking-widest border border-scandi-line px-3 py-1 rounded hover:bg-scandi-bg" onclick="reviewSuggestion('${doc.id}')">Review</button>
                </td>
            `;
            suggestionsTableBody.appendChild(tr);
        });

    } catch (e) {
        console.error("Failed to load suggestions:", e);
        suggestionsTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-600">Error loading suggestions.</td></tr>';
    }
}

window.reviewSuggestion = async (suggestionId) => {
    try {
        const suggestionDoc = await db.collection('suggested_services').doc(suggestionId).get();
        if (!suggestionDoc.exists) throw "Suggestion not found";
        
        const data = suggestionDoc.data();
        
        approvingSuggestionId = suggestionId;
        approvingSuggestionData = data;
        
        // Map to service format
        const serviceData = {
            id: '', // New service
            businessName: data.businessName,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email,
            category: data.category,
            recommendations: 1,
            sunnyApproved: false,
            isTestProvider: false,
            lastRecommended: new Date()
        };
        
        fillFormFromDoc(serviceData);
        serviceModalTitle.textContent = 'Review Suggestion';
        
    } catch (e) {
        console.error("Error preparing review:", e);
        alert("Failed to open review modal: " + e.message);
    }
};

// Kept for backward compatibility if needed, but reviewSuggestion handles the flow now
window.approveSuggestion = window.reviewSuggestion;

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
      <td class="py-4 px-4 md:px-6 font-medium text-scandi-text">
        <div>
            ${name || '-'}
            ${s.sunnyApproved ? '<span title="Sunny Approved" class="ml-2">☀️</span>' : ''}
            ${s.isTestProvider ? '<span title="Test Provider" class="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-mono uppercase tracking-wide">TEST</span>' : ''}
        </div>
        <div class="md:hidden text-xs text-scandi-muted mt-1 flex flex-col gap-0.5">
            <span>${s.category || '-'}</span>
            <span>${s.recommendations ?? 0} Recs</span>
        </div>
      </td>
      <td class="py-4 px-4 md:px-6 text-scandi-muted hidden md:table-cell">${s.category || '-'}</td>
      <td class="py-4 px-4 md:px-6 text-scandi-muted hidden md:table-cell">${s.recommendations ?? 0}</td>
      <td class="py-4 px-4 md:px-6 text-right space-x-2">
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
            <td class="py-4 px-4 md:px-6 font-medium text-scandi-text">
                ${name}
                <div class="md:hidden text-xs text-scandi-muted mt-1">${cats.length} categories</div>
            </td>
            <td class="py-4 px-4 md:px-6 text-scandi-muted text-xs hidden md:table-cell">${cats.length} categories</td>
            <td class="py-4 px-4 md:px-6 text-right space-x-2">
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
            <td class="py-4 px-4 md:px-6 font-medium text-scandi-text">
                ${name}
                <div class="md:hidden text-xs text-scandi-muted mt-1">${groupName}</div>
            </td>
            <td class="py-4 px-4 md:px-6 text-scandi-muted hidden md:table-cell">${groupName}</td>
            <td class="py-4 px-4 md:px-6 text-right space-x-2">
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
  serviceModalTitle.textContent = doc.id ? 'Edit Listing' : 'Add New Listing';
  docIdEl.value = doc.id || '';
  businessNameEl.value = doc.businessName || '';
  firstNameEl.value = doc.firstName || '';
  lastNameEl.value = doc.lastName || '';
  phoneEl.value = doc.phone || '';
  emailEl.value = doc.email || '';
  
  // Handle potential new category
  // Clear any previous "New" options first (though populateCategorySelects should handle this on reset)
  
  const isNewCategory = doc.category && !Array.from(categoryEl.options).some(o => o.value === doc.category) && doc.category !== 'Other';
  
  if (isNewCategory) {
      // If it's a new category, set to "Other" and fill the input
      categoryEl.value = 'Other';
      newCategoryContainer.classList.remove('hidden');
      newCategoryInput.value = doc.category;
      
      // Add visual warning
      newCategoryInput.classList.add('border-orange-500', 'bg-orange-50');
      // Create or show warning message
      let warning = document.getElementById('categoryWarning');
      if (!warning) {
          warning = document.createElement('p');
          warning.id = 'categoryWarning';
          warning.className = 'text-xs text-orange-600 mt-1 font-bold';
          newCategoryContainer.appendChild(warning);
      }
      warning.textContent = '⚠️ This is a NEW category. Saving will add it to the official list.';
      warning.classList.remove('hidden');
  } else {
      // Existing category
      categoryEl.value = doc.category || '';
      newCategoryContainer.classList.add('hidden');
      
      // Reset visual warning
      newCategoryInput.classList.remove('border-orange-500', 'bg-orange-50');
      const warning = document.getElementById('categoryWarning');
      if (warning) warning.classList.add('hidden');
  }
  
  sunnyApprovedEl.checked = !!doc.sunnyApproved;
  isTestProviderEl.checked = !!doc.isTestProvider;
  
  if (doc.lastRecommended) {
    const d = typeof doc.lastRecommended.toDate === 'function' ? doc.lastRecommended.toDate() : new Date(doc.lastRecommended);
    if (!isNaN(d)) {
      lastRecommendedEl.value = d.toISOString().slice(0, 10);
    }
  } else {
      lastRecommendedEl.value = '';
  }
  
  recommendationsEl.value = Number(doc.recommendations || 0);
  
  // UI Adjustments for Review Mode
  if (approvingSuggestionId) {
      saveServiceBtn.textContent = 'Approve';
      rejectSuggestionBtn.classList.remove('hidden');
  } else {
      saveServiceBtn.textContent = 'Save';
      rejectSuggestionBtn.classList.add('hidden');
  }
  
  openModal(serviceModal);
}

function resetFormToNew() {
  approvingSuggestionId = null;
  approvingSuggestionData = null;
  serviceModalTitle.textContent = 'Add New Listing';
  docIdEl.value = '';
  form.reset();
  
  // Pre-populate today's date
  lastRecommendedEl.value = new Date().toISOString().slice(0, 10);

  sunnyApprovedEl.checked = false;
  isTestProviderEl.checked = false;
  recommendationsEl.value = 0;
  
  // Reset category options (remove temporary ones)
  populateCategorySelects();
  
  // Reset visual warning and input
  newCategoryContainer.classList.add('hidden');
  newCategoryInput.value = '';
  newCategoryInput.classList.remove('border-orange-500', 'bg-orange-50');
  newCategoryGroupEl.value = '';
  const warning = document.getElementById('categoryWarning');
  if (warning) warning.classList.add('hidden');
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
    // Mobile Sidebar Logic
    // Hijack the main header mobile menu button
    const headerMenuBtn = document.getElementById('mobile-menu-btn');
    if (headerMenuBtn) {
        // Clone to remove existing listeners (which toggle the default mobile menu)
        const newBtn = headerMenuBtn.cloneNode(true);
        headerMenuBtn.parentNode.replaceChild(newBtn, headerMenuBtn);
        
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling
            toggleSidebar(true);
        });
    }

    const sidebar = document.getElementById('adminSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    function toggleSidebar(show) {
        if (show) {
            sidebar.classList.remove('-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
            // slight delay for transition
            requestAnimationFrame(() => {
                sidebarOverlay.classList.remove('opacity-0');
            });
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        } else {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('opacity-0');
            setTimeout(() => {
                sidebarOverlay.classList.add('hidden');
            }, 300);
            document.body.style.overflow = '';
        }
    }
    
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }

    // Close sidebar on nav item click (mobile)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 1024) { // lg breakpoint
                toggleSidebar(false);
            }
        });
    });

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
    
    // Category Select Change (in Modal)
    categoryEl.addEventListener('change', () => {
        if (categoryEl.value === 'Other') {
            newCategoryContainer.classList.remove('hidden');
            newCategoryInput.value = ''; // Clear unless we are filling it
        } else {
            newCategoryContainer.classList.add('hidden');
        }
    });
    
    // Group Search
    groupSearchEl.addEventListener('input', renderGroupTable);
    
    // Service Modal
    addServiceBtn.addEventListener('click', () => {
        resetFormToNew();
        openModal(serviceModal);
    });
    closeServiceModal.addEventListener('click', () => closeModal(serviceModal));
    cancelBtn.addEventListener('click', () => closeModal(serviceModal));
    
    // Reject Button Handler
    rejectSuggestionBtn.addEventListener('click', async () => {
        if (!approvingSuggestionId) return;
        if (!confirm('Reject this suggestion? It will be marked as rejected.')) return;
        
        try {
            await db.collection('suggested_services').doc(approvingSuggestionId).update({ status: 'rejected' });
            closeModal(serviceModal);
            loadSuggestions();
            // Reset state
            approvingSuggestionId = null;
            approvingSuggestionData = null;
        } catch (e) {
            console.error("Rejection failed:", e);
            alert("Failed to reject: " + e.message);
        }
    });
    
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
            const response = await fetch(window.firebaseConfig.functionUrls.deleteService, {
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
        
        let selectedCategory = categoryEl.value;
        if (selectedCategory === 'Other') {
            selectedCategory = newCategoryInput.value.trim();
            if (!selectedCategory) {
                alert('Please enter a name for the new category.');
                return;
            }
        }

        const payload = {
            businessName: businessNameEl.value.trim() || null,
            firstName: firstNameEl.value.trim() || null,
            lastName: lastNameEl.value.trim() || null,
            phone: phoneEl.value.trim() || null,
            email: emailEl.value.trim() || null,
            category: selectedCategory || null,
            sunnyApproved: sunnyApprovedEl.checked,
            isTestProvider: isTestProviderEl.checked,
            recommendations: Number(recommendationsEl.value || 0),
        };
        const ts = parseDateToTimestamp(lastRecommendedEl.value.trim());
        if (ts) payload.lastRecommended = ts;

        // Check for new category
        if (payload.category && !categoriesList.includes(payload.category)) {
            const newGroup = newCategoryGroupEl.value;
            const confirmMsg = newGroup 
                ? `Category "${payload.category}" is new. Add it to the official list and assign to group "${newGroup}"?`
                : `Category "${payload.category}" is new. Add it to the official list (ungrouped)?`;

            if (confirm(confirmMsg)) {
                categoriesList.push(payload.category);
                categoriesList.sort();
                
                const batch = db.batch();
                
                // Update categories list
                const categoriesRef = db.collection('config').doc('categories');
                batch.set(categoriesRef, { list: categoriesList });
                
                // Update group if selected
                if (newGroup && categoryGroups) {
                    if (!categoryGroups[newGroup]) categoryGroups[newGroup] = [];
                    categoryGroups[newGroup].push(payload.category);
                    categoryGroups[newGroup].sort();
                    
                    const groupsRef = db.collection('config').doc('categoryGroups');
                    batch.set(groupsRef, { groups: categoryGroups });
                }
                
                await batch.commit();
                populateCategorySelects(); // Refresh dropdowns
            }
        }

        const existingId = docIdEl.value;
        try {
            if (approvingSuggestionId) {
                // APPROVING SUGGESTION logic
                
                // Add suggestion-specific fields
                payload.lastRecommended = firebase.firestore.FieldValue.serverTimestamp();
                payload.recentRecommenders = [{
                    uid: approvingSuggestionData.suggestedBy,
                    timestamp: new Date()
                }];
                
                // Batch write
                const serviceRef = db.collection('services').doc();
                const batch = db.batch();
                
                batch.set(serviceRef, payload);
                
                // Add recommendation
                const recRef = serviceRef.collection('recommendations').doc(approvingSuggestionData.suggestedBy);
                batch.set(recRef, {
                    uid: approvingSuggestionData.suggestedBy,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update suggestion status
                const suggestionRef = db.collection('suggested_services').doc(approvingSuggestionId);
                batch.update(suggestionRef, { status: 'approved' });
                
                await batch.commit();
                
                // Reset state
                approvingSuggestionId = null;
                approvingSuggestionData = null;
                loadSuggestions(); // Refresh suggestions list
                
            } else if (existingId) {
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
    const cleanupBackBtn = document.getElementById('cleanupBackBtn');
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

    if (cleanupBackBtn) {
        cleanupBackBtn.addEventListener('click', () => {
            if (currentCleanupIndex > 0) {
                currentCleanupIndex--;
                renderCleanupItem();
            }
        });
    }

    if (acceptPhoneBtn) acceptPhoneBtn.addEventListener('click', () => handleAccept('phone'));
    if (rejectPhoneBtn) rejectPhoneBtn.addEventListener('click', () => handleReject('phone'));
    if (acceptEmailBtn) acceptEmailBtn.addEventListener('click', () => handleAccept('email'));
    if (rejectEmailBtn) rejectEmailBtn.addEventListener('click', () => handleReject('email'));
}


// -- Data Quality Dashboard --

function loadQualityDashboard() {
    if (!allServices) return; // Should be loaded by initDashboard
    renderQualityDashboard();
}

function renderQualityDashboard() {
    // KPI Elements
    const statTotal = document.getElementById('statTotalServices');
    const statMissing = document.getElementById('statMissingContact');
    const statMissingCount = document.getElementById('statMissingContactCount');
    const statSunny = document.getElementById('statSunnyApproved');
    const statSunnyCount = document.getElementById('statSunnyApprovedCount');
    
    // List Elements
    const listMostComplete = document.getElementById('listMostComplete');
    const listLeastComplete = document.getElementById('listLeastComplete');
    const listSmallest = document.getElementById('listSmallestCategories');

    // 1. Global Stats
    const total = allServices.length;
    const missingContact = allServices.filter(s => !s.phone && !s.email);
    const sunnyApproved = allServices.filter(s => s.sunnyApproved);

    statTotal.textContent = total;
    
    const missingPct = total > 0 ? Math.round((missingContact.length / total) * 100) : 0;
    statMissing.textContent = `${missingPct}%`;
    statMissingCount.textContent = `${missingContact.length} providers`;
    
    const sunnyPct = total > 0 ? Math.round((sunnyApproved.length / total) * 100) : 0;
    statSunny.textContent = `${sunnyPct}%`;
    statSunnyCount.textContent = `${sunnyApproved.length} providers`;

    // 2. Category Stats
    const catStats = {}; // { name: { total, withContact } }
    
    // Initialize stats for ALL categories in the config list (even empty ones)
    if (categoriesList) {
        categoriesList.forEach(c => {
            catStats[c] = { name: c, total: 0, withContact: 0 };
        });
    }

    allServices.forEach(s => {
        const cat = s.category || 'Uncategorized';
        if (!catStats[cat]) catStats[cat] = { name: cat, total: 0, withContact: 0 };
        
        catStats[cat].total++;
        if (s.phone || s.email) catStats[cat].withContact++;
    });

    const catArray = Object.values(catStats).map(c => ({
        ...c,
        completeness: c.total > 0 ? (c.withContact / c.total) * 100 : 0
    }));

    // Most Complete (Sort DESC completeness, then DESC total)
    const mostComplete = [...catArray]
        .filter(c => c.total > 2) // Filter out very small cats for this metric? Maybe just show all.
        .sort((a, b) => b.completeness - a.completeness || b.total - a.total)
        .slice(0, 10);

    // Least Complete (Sort ASC completeness, then DESC total to show impactful ones first)
    const leastComplete = [...catArray]
        .filter(c => c.total > 0) // Ensure not empty
        .sort((a, b) => a.completeness - b.completeness || b.total - a.total)
        .slice(0, 10);

    // Smallest Categories (Sort ASC total)
    const smallest = [...catArray]
        .sort((a, b) => a.total - b.total)
        .slice(0, 5);

    // Render Lists
    renderDashboardList(listMostComplete, mostComplete, (c) => `${Math.round(c.completeness)}% (${c.withContact}/${c.total})`);
    renderDashboardList(listLeastComplete, leastComplete, (c) => `${Math.round(c.completeness)}% (${c.withContact}/${c.total})`);
    renderDashboardList(listSmallest, smallest, (c) => c.total);
}

function renderDashboardList(container, items, valueFormatter) {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-xs text-scandi-muted">No data available</td></tr>';
        return;
    }
    
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 text-scandi-text border-b border-scandi-line/50">${item.name}</td>
            <td class="p-3 text-right font-mono text-xs text-scandi-muted border-b border-scandi-line/50">${valueFormatter(item)}</td>
        `;
        container.appendChild(tr);
    });
}


// -- Data Cleanup Logic --

function initCleanup() {
    // 1. Filter services missing phone (Requirement: Only providers with no phone number)
    cleanupQueue = allServices.filter(s => !s.phone);
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
    
    // Back button state
    const backBtn = document.getElementById('cleanupBackBtn');
    if (backBtn) backBtn.disabled = currentCleanupIndex === 0;
    
    els.name.textContent = service.businessName || `${service.firstName || ''} ${service.lastName || ''}`;
    els.category.textContent = service.category || 'Uncategorized';
    els.address.textContent = 'Scarsdale Area'; // Placeholder as address isn't in model yet
    els.progress.textContent = `${currentCleanupIndex + 1}/${cleanupQueue.length}`;

    // Reset Cards
    resetCleanupCard(els.phoneVal, els.phoneSrc, els.phoneBadge, els.phoneActions, els.phoneStatus);
    resetCleanupCard(els.emailVal, els.emailSrc, els.emailBadge, els.emailActions, els.emailStatus);
    
    // Manual Trigger: Show button instead of auto-searching
    els.loading.classList.remove('hidden'); // Reusing loading container for the button state temporarily
    els.loading.innerHTML = `
        <button id="startSearchBtn" class="bg-scandi-clay text-white px-4 md:px-6 py-3 rounded-sm text-sm font-mono uppercase tracking-widest hover:opacity-90 shadow-soft flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            Find Contact Info
        </button>
    `;
    
    // Hide results initially until searched
    els.results.classList.add('hidden');
    
    document.getElementById('startSearchBtn').onclick = () => {
         triggerCleanupSearch(service);
    };
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
    
    // Switch to actual loading state
    loadingEl.classList.remove('hidden');
    loadingEl.innerHTML = `
        <div class="w-8 h-8 border-2 border-scandi-clay border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-sm text-scandi-muted animate-pulse">Sunny is searching Google for contact info...</p>
    `;
    
    resultsEl.classList.add('hidden'); // Ensure hidden while loading
    // resultsEl.classList.add('opacity-50', 'pointer-events-none'); // (Previously used for dimming)

    try {
        const idToken = await currentUser.getIdToken();
        
        // Use direct fetch to ensure Auth header is passed correctly
        // 'onCall' functions require the body to be wrapped in { "data": ... }
        const response = await fetch(window.firebaseConfig.functionUrls.findBusinessContactInfo, {
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
        resultsEl.classList.remove('hidden'); // Show results

    } catch (e) {
        console.error("Cleanup search failed:", e);
        const errorData = { 
            value: "Error searching", 
            confidence: "None", 
            source: e.message || "Unknown error" 
        };
        updateCleanupCard('phone', errorData, service.phone);
        updateCleanupCard('email', errorData, service.email);
        resultsEl.classList.remove('hidden'); // Show results (with error)
    } finally {
        loadingEl.classList.add('hidden'); // Hide loading/button container
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
    
    // NEW: Verification Context
    if (data.verification_text) {
        els.src.innerHTML += `<br><span class="block mt-2 p-2 bg-scandi-bg/50 rounded-sm text-[10px] font-mono text-scandi-text/80 border-l-2 border-scandi-clay/50">"${data.verification_text}"</span>`;
    }
    
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


// -- Merge Categories Logic --

function initMergeCategories() {
    const sourceSelect = document.getElementById('mergeSourceCategory');
    const destSelect = document.getElementById('mergeDestCategory');
    const mergeBtn = document.getElementById('mergeCategoriesBtn');
    const sourceCountEl = document.getElementById('mergeSourceCount');
    const destCountEl = document.getElementById('mergeDestCount');
    const previewSourceEl = document.getElementById('mergePreviewSource');
    const previewDestEl = document.getElementById('mergePreviewDest');
    const statusEl = document.getElementById('mergeStatus');
    const servicesPreview = document.getElementById('mergeServicesPreview');
    const servicesTableBody = document.getElementById('mergeServicesTableBody');
    
    // Populate category dropdowns
    const categories = getAllCategories();
    const options = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    
    sourceSelect.innerHTML = '<option value="">Select source category...</option>' + options;
    destSelect.innerHTML = '<option value="">Select destination category...</option>' + options;
    
    // Reset UI state
    sourceCountEl.textContent = '';
    destCountEl.textContent = '';
    previewSourceEl.textContent = '—';
    previewDestEl.textContent = '—';
    statusEl.textContent = '';
    mergeBtn.disabled = true;
    servicesPreview.classList.add('hidden');
    
    // Remove old event listeners by cloning
    const newSourceSelect = sourceSelect.cloneNode(true);
    const newDestSelect = destSelect.cloneNode(true);
    const newMergeBtn = mergeBtn.cloneNode(true);
    
    sourceSelect.parentNode.replaceChild(newSourceSelect, sourceSelect);
    destSelect.parentNode.replaceChild(newDestSelect, destSelect);
    mergeBtn.parentNode.replaceChild(newMergeBtn, mergeBtn);
    
    // Enable controls in case they were disabled
    newSourceSelect.disabled = false;
    newDestSelect.disabled = false;
    
    // Add event listeners
    newSourceSelect.addEventListener('change', updateMergePreview);
    newDestSelect.addEventListener('change', updateMergePreview);
    newMergeBtn.addEventListener('click', executeMerge);
}

function updateMergePreview() {
    const sourceSelect = document.getElementById('mergeSourceCategory');
    const destSelect = document.getElementById('mergeDestCategory');
    const mergeBtn = document.getElementById('mergeCategoriesBtn');
    const sourceCountEl = document.getElementById('mergeSourceCount');
    const destCountEl = document.getElementById('mergeDestCount');
    const previewSourceEl = document.getElementById('mergePreviewSource');
    const previewDestEl = document.getElementById('mergePreviewDest');
    const servicesPreview = document.getElementById('mergeServicesPreview');
    const servicesTableBody = document.getElementById('mergeServicesTableBody');
    
    const sourceCategory = sourceSelect.value;
    const destCategory = destSelect.value;
    
    // Update preview labels
    previewSourceEl.textContent = sourceCategory || '—';
    previewDestEl.textContent = destCategory || '—';
    
    // Count services in each category
    const sourceServices = allServices.filter(s => s.category === sourceCategory);
    const destServices = allServices.filter(s => s.category === destCategory);
    
    if (sourceCategory) {
        sourceCountEl.textContent = `${sourceServices.length} service${sourceServices.length !== 1 ? 's' : ''} in this category`;
    } else {
        sourceCountEl.textContent = '';
    }
    
    if (destCategory) {
        destCountEl.textContent = `${destServices.length} service${destServices.length !== 1 ? 's' : ''} in this category`;
    } else {
        destCountEl.textContent = '';
    }
    
    // Validate selection
    const isValid = sourceCategory && destCategory && sourceCategory !== destCategory;
    mergeBtn.disabled = !isValid;
    
    // Show services preview if source is selected
    if (sourceCategory && sourceServices.length > 0) {
        servicesPreview.classList.remove('hidden');
        servicesTableBody.innerHTML = '';
        
        sourceServices.forEach(s => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-scandi-bg/50';
            const name = s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
            tr.innerHTML = `
                <td class="py-3 px-4 md:px-6 text-scandi-text">
                    ${name || '-'}
                    ${s.sunnyApproved ? '<span title="Sunny Approved" class="ml-2">☀️</span>' : ''}
                </td>
                <td class="py-3 px-4 md:px-6 text-scandi-muted">${s.recommendations ?? 0}</td>
            `;
            servicesTableBody.appendChild(tr);
        });
    } else if (sourceCategory && sourceServices.length === 0) {
        servicesPreview.classList.remove('hidden');
        servicesTableBody.innerHTML = `
            <tr>
                <td colspan="2" class="py-8 px-4 md:px-6 text-center text-scandi-muted italic">
                    No services in this category. You can delete it directly from the Categories page.
                </td>
            </tr>
        `;
    } else {
        servicesPreview.classList.add('hidden');
    }
    
    // Warning if same category selected
    if (sourceCategory && destCategory && sourceCategory === destCategory) {
        document.getElementById('mergeStatus').textContent = 'Source and destination cannot be the same category.';
    } else {
        document.getElementById('mergeStatus').textContent = '';
    }
}

async function executeMerge() {
    const sourceSelect = document.getElementById('mergeSourceCategory');
    const destSelect = document.getElementById('mergeDestCategory');
    const mergeBtn = document.getElementById('mergeCategoriesBtn');
    const statusEl = document.getElementById('mergeStatus');
    
    const sourceCategory = sourceSelect.value;
    const destCategory = destSelect.value;
    
    if (!sourceCategory || !destCategory || sourceCategory === destCategory) {
        alert('Please select valid source and destination categories.');
        return;
    }
    
    const sourceServices = allServices.filter(s => s.category === sourceCategory);
    
    // Confirmation dialog
    const confirmMsg = sourceServices.length > 0
        ? `This will move ${sourceServices.length} service${sourceServices.length !== 1 ? 's' : ''} from "${sourceCategory}" to "${destCategory}" and then delete the "${sourceCategory}" category.\n\nThis action cannot be undone. Continue?`
        : `This will delete the empty category "${sourceCategory}".\n\nContinue?`;
    
    if (!confirm(confirmMsg)) return;
    
    // Disable UI during operation
    mergeBtn.disabled = true;
    sourceSelect.disabled = true;
    destSelect.disabled = true;
    statusEl.textContent = 'Processing...';
    statusEl.classList.remove('text-green-600', 'text-red-600');
    statusEl.classList.add('text-scandi-muted');
    
    try {
        // Step 1: Update all services in the source category
        if (sourceServices.length > 0) {
            statusEl.textContent = `Moving ${sourceServices.length} services...`;
            
            const batchSize = 400;
            let batch = db.batch();
            let i = 0;
            
            for (const service of sourceServices) {
                const ref = db.collection('services').doc(service.id);
                batch.update(ref, { category: destCategory });
                i++;
                
                if (i % batchSize === 0) {
                    await batch.commit();
                    batch = db.batch();
                }
            }
            
            // Commit remaining
            if (i % batchSize !== 0) {
                await batch.commit();
            }
        }
        
        // Step 2: Verify source category is empty
        statusEl.textContent = 'Verifying source category is empty...';
        const verifySnap = await db.collection('services').where('category', '==', sourceCategory).limit(1).get();
        
        if (!verifySnap.empty) {
            throw new Error('Failed to move all services. Some services still remain in the source category.');
        }
        
        // Step 3: Delete source category from categories list
        statusEl.textContent = 'Deleting source category...';
        categoriesList = categoriesList.filter(c => c !== sourceCategory);
        await db.collection('config').doc('categories').set({ list: categoriesList });
        
        // Step 4: Remove source category from any group associations
        if (categoryGroups) {
            for (const [groupName, cats] of Object.entries(categoryGroups)) {
                const idx = cats.indexOf(sourceCategory);
                if (idx !== -1) {
                    cats.splice(idx, 1);
                }
            }
            await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
        }
        
        // Step 5: Update local services cache
        allServices.forEach(s => {
            if (s.category === sourceCategory) {
                s.category = destCategory;
            }
        });
        
        // Success!
        statusEl.textContent = `Successfully merged "${sourceCategory}" into "${destCategory}"!`;
        statusEl.classList.remove('text-scandi-muted');
        statusEl.classList.add('text-green-600');
        
        // Refresh UI
        populateCategorySelects();
        renderTable();
        renderCategoryTable();
        renderGroupTable();
        updateCounts();
        
        // Re-initialize the merge view with updated data
        setTimeout(() => {
            initMergeCategories();
        }, 1500);
        
    } catch (e) {
        console.error('Merge failed:', e);
        statusEl.textContent = `Error: ${e.message}`;
        statusEl.classList.remove('text-scandi-muted');
        statusEl.classList.add('text-red-600');
        
        // Re-enable UI
        sourceSelect.disabled = false;
        destSelect.disabled = false;
        mergeBtn.disabled = false;
        
        // Reload data to ensure consistency
        await loadServicesOnce();
        await loadCategoriesList();
        await loadCategoryGroups();
    }
}
