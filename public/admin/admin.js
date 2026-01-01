// Admin panel script: Firestore CRUD for services and category groups/categories
// Includes Auth & Role Verification

let db;
let functions;
let currentUser = null;

// -- DOM Elements --
const loadingOverlay = document.getElementById('loading-overlay');
const searchEl = document.getElementById('adminSearch');
const filterEl = document.getElementById('adminCategoryFilter');
const tableBody = document.getElementById('adminTableBody');

// Toggle elements
const toggleServicesBtn = document.getElementById('toggleServices');
const toggleCategoriesBtn = document.getElementById('toggleCategories');
const toggleSuggestionsBtn = document.getElementById('toggleSuggestions');
const servicesPanel = document.getElementById('servicesPanel');
const categoriesPanel = document.getElementById('categoriesPanel');
const suggestionsPanel = document.getElementById('suggestionsPanel');

// Suggestions Elements
const suggestionsTableBody = document.getElementById('suggestionsTableBody');
const noSuggestionsMsg = document.getElementById('noSuggestionsMsg');

// Form elements
const form = document.getElementById('listingForm');
const formTitle = document.getElementById('formTitle');
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
const deleteBtn = document.getElementById('deleteBtn');

// Categories UI elements
const groupListEl = document.getElementById('groupList');
const addGroupForm = document.getElementById('addGroupForm');
const newGroupNameEl = document.getElementById('newGroupName');
const editGroupForm = document.getElementById('editGroupForm');
const editGroupOriginalNameEl = document.getElementById('editGroupOriginalName');
const editGroupNameEl = document.getElementById('editGroupName');
const groupCategoriesChooserEl = document.getElementById('groupCategoriesChooser');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');
const clearGroupSelectionBtn = document.getElementById('clearGroupSelectionBtn');

const categoryListEl = document.getElementById('categoryList');
const addCategoryForm = document.getElementById('addCategoryForm');
const newCategoryNameEl = document.getElementById('newCategoryName');
const editCategoryForm = document.getElementById('editCategoryForm');
const editCategoryOriginalNameEl = document.getElementById('editCategoryOriginalName');
const editCategoryNameEl = document.getElementById('editCategoryName');
const editCategoryGroupEl = document.getElementById('editCategoryGroup');
const deleteCategoryBtn = document.getElementById('deleteCategoryBtn');
const clearCategorySelectionBtn = document.getElementById('clearCategorySelectionBtn');

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
        // Get the ID token manually
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
    await loadCategoryGroups();
    await loadCategoriesList();
    await loadServicesOnce();
    
    populateCategorySelects();
    renderTable();
    renderGroupList();
    renderCategoryList();
    
    setupEventListeners();
    showServices(); // Default view
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
}

async function loadServicesOnce() {
  try {
      const snap = await db.collection('services').get();
      allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
      console.error("Failed to load services:", e);
      alert("Error loading services. Check console.");
  }
}

// -- UI Helpers --

function slugifyId({ businessName, firstName, lastName, phone }) {
  const parts = [
    (businessName || '').trim().toLowerCase().replace(/\s+/g, '-'),
    (firstName || '').trim().toLowerCase(),
    (lastName || '').trim().toLowerCase(),
    (phone || '').trim().replace(/[+\s-]/g, ''),
  ].filter(Boolean);
  return parts.join('-') || null;
}

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

// -- View Toggles --

function showServices() {
  servicesPanel.classList.remove('hidden');
  categoriesPanel.classList.add('hidden');
  suggestionsPanel.classList.add('hidden');
  
  toggleServicesBtn.classList.remove('border', 'border-scandi-line', 'text-scandi-muted', 'bg-scandi-bg');
  toggleServicesBtn.classList.add('bg-scandi-text', 'text-white');
  
  toggleCategoriesBtn.classList.add('border', 'border-scandi-line', 'text-scandi-muted');
  toggleCategoriesBtn.classList.remove('bg-scandi-text', 'text-white');

  toggleSuggestionsBtn.classList.add('border', 'border-scandi-line', 'text-scandi-muted');
  toggleSuggestionsBtn.classList.remove('bg-scandi-text', 'text-white');
}

function showCategories() {
  servicesPanel.classList.add('hidden');
  categoriesPanel.classList.remove('hidden');
  suggestionsPanel.classList.add('hidden');
  
  toggleCategoriesBtn.classList.remove('border', 'border-scandi-line', 'text-scandi-muted', 'bg-scandi-bg');
  toggleCategoriesBtn.classList.add('bg-scandi-text', 'text-white');
  
  toggleServicesBtn.classList.add('border', 'border-scandi-line', 'text-scandi-muted');
  toggleServicesBtn.classList.remove('bg-scandi-text', 'text-white');

  toggleSuggestionsBtn.classList.add('border', 'border-scandi-line', 'text-scandi-muted');
  toggleSuggestionsBtn.classList.remove('bg-scandi-text', 'text-white');
}

function showSuggestions() {
    servicesPanel.classList.add('hidden');
    categoriesPanel.classList.add('hidden');
    suggestionsPanel.classList.remove('hidden');

    toggleSuggestionsBtn.classList.remove('border', 'border-scandi-line', 'text-scandi-muted', 'bg-scandi-bg');
    toggleSuggestionsBtn.classList.add('bg-scandi-text', 'text-white');

    toggleServicesBtn.classList.add('border', 'border-scandi-line', 'text-scandi-muted');
    toggleServicesBtn.classList.remove('bg-scandi-text', 'text-white');

    toggleCategoriesBtn.classList.add('border', 'border-scandi-line', 'text-scandi-muted');
    toggleCategoriesBtn.classList.remove('bg-scandi-text', 'text-white');

    loadSuggestions();
}

// -- Suggestions Logic --

async function loadSuggestions() {
    suggestionsTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-scandi-muted">Loading...</td></tr>';
    
    try {
        const snap = await db.collection('suggested_services')
            .where('status', '==', 'pending')
            .orderBy('suggestedAt', 'desc')
            .get();
        
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

        // Generate ID
        const id = slugifyId(payload);
        const serviceRef = id ? db.collection('services').doc(id) : db.collection('services').doc();
        
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

        // 4. Update User's Liked Services
        const userRef = db.collection('users').doc(data.suggestedBy);
        batch.set(userRef, {
            likedServices: firebase.firestore.FieldValue.arrayUnion(serviceRef.id)
        }, { merge: true });

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
      <td class="py-4 px-6 text-right">
        <button class="text-xs font-mono uppercase tracking-widest text-scandi-muted hover:text-scandi-text border-b border-transparent hover:border-scandi-text transition-all" data-id="${s.id}" data-action="edit">Edit</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

function renderGroupList(selected = null) {
  if (!groupListEl) return;
  groupListEl.innerHTML = '';
  const groups = categoryGroups ? Object.keys(categoryGroups).sort() : [];
  groups.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-3 py-2 rounded-sm border text-xs font-medium transition-colors ' + 
        (selected === name ? 'bg-scandi-text text-white border-scandi-text' : 'border-scandi-line text-scandi-muted hover:text-scandi-text hover:border-scandi-text');
    btn.textContent = name;
    btn.addEventListener('click', () => selectGroup(name));
    groupListEl.appendChild(btn);
  });
}

function renderCategoryList(selected = null) {
  if (!categoryListEl) return;
  categoryListEl.innerHTML = '';
  getAllCategories().forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-3 py-2 rounded-sm border text-xs font-medium transition-colors ' + 
        (selected === name ? 'bg-scandi-text text-white border-scandi-text' : 'border-scandi-line text-scandi-muted hover:text-scandi-text hover:border-scandi-text');
    btn.textContent = name;
    btn.addEventListener('click', () => selectCategory(name));
    categoryListEl.appendChild(btn);
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

function selectGroup(name) {
  if (!categoryGroups) return;
  editGroupOriginalNameEl.value = name;
  editGroupNameEl.value = name;
  const selectedSet = new Set(categoryGroups[name] || []);
  buildChooserCategories(selectedSet);
  renderGroupList(name); // Highlight
}

function selectCategory(name) {
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
  renderCategoryList(name); // Highlight
}

function fillFormFromDoc(doc) {
  formTitle.textContent = 'Edit Listing';
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
  deleteBtn.classList.remove('hidden');
  
  // Scroll form into view if needed
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetFormToNew() {
  formTitle.textContent = 'Add New Listing';
  docIdEl.value = '';
  form.reset();
  sunnyApprovedEl.checked = false;
  recommendationsEl.value = 0;
  deleteBtn.classList.add('hidden');
}

function parseDateToTimestamp(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return d;
}

// -- Event Listeners --

function setupEventListeners() {
    // Toggles
    toggleServicesBtn.addEventListener('click', showServices);
    toggleCategoriesBtn.addEventListener('click', showCategories);
    toggleSuggestionsBtn.addEventListener('click', showSuggestions);

    // Filter/Search
    searchEl.addEventListener('input', renderTable);
    filterEl.addEventListener('change', renderTable);

    // Form Actions
    cancelBtn.addEventListener('click', resetFormToNew);
    
    tableBody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.action === 'edit') {
            const id = target.dataset.id;
            const doc = allServices.find(s => s.id === id);
            if (doc) fillFormFromDoc(doc);
        }
    });

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
                const id = slugifyId(payload);
                const ref = id ? db.collection('services').doc(id) : db.collection('services').doc();
                await ref.set(payload);
                docIdEl.value = ref.id;
            }
            await loadServicesOnce();
            renderTable();
            alert('Saved successfully');
        } catch (e) {
            console.error('Save failed', e);
            alert('Save failed: ' + e.message);
        }
    });

    // Listing Delete
    deleteBtn.addEventListener('click', async () => {
        const id = docIdEl.value;
        if (!id) return;
        if (!confirm('Delete this listing?')) return;
        try {
            await db.collection('services').doc(id).delete();
            resetFormToNew();
            await loadServicesOnce();
            renderTable();
        } catch (e) {
            console.error('Delete failed', e);
            alert('Delete failed: ' + e.message);
        }
    });
    
    // Group Add
    addGroupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (newGroupNameEl.value || '').trim();
        if (!name) return;
        categoryGroups = categoryGroups || {};
        if (categoryGroups[name]) {
            alert('Group already exists');
            return;
        }
        categoryGroups[name] = [];
        await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups }, { merge: true });
        renderGroupList(name);
        selectGroup(name);
        newGroupNameEl.value = '';
    });
    
    // Group Edit
    editGroupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!categoryGroups) return;
        const orig = editGroupOriginalNameEl.value;
        const newName = (editGroupNameEl.value || '').trim();
        if (!orig) return;
        if (!newName) {
            alert('Name required');
            return;
        }
        
        const selected = Array.from(groupCategoriesChooserEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        
        if (orig !== newName) {
            if (categoryGroups[newName]) {
                alert('A group with that name already exists');
                return;
            }
            categoryGroups[newName] = selected;
            delete categoryGroups[orig];
        } else {
            categoryGroups[orig] = selected;
        }
        
        await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
        
        // Update categories list union
        const set = new Set(categoriesList);
        selected.forEach(c => set.add(c));
        categoriesList = Array.from(set).sort();
        await db.collection('config').doc('categories').set({ list: categoriesList });
        
        renderGroupList(newName);
        selectGroup(newName);
        renderCategoryList();
    });
    
    // Group Delete
    deleteGroupBtn.addEventListener('click', async () => {
        if (!categoryGroups) return;
        const name = editGroupOriginalNameEl.value;
        if (!name) return;
        const items = categoryGroups[name] || [];
        if (items.length) {
            alert('Cannot delete a group that has categories. Remove all associations first.');
            return;
        }
        if (!confirm(`Delete group "${name}"?`)) return;
        delete categoryGroups[name];
        await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
        editGroupOriginalNameEl.value = '';
        editGroupNameEl.value = '';
        groupCategoriesChooserEl.innerHTML = '';
        renderGroupList();
    });
    
    clearGroupSelectionBtn.addEventListener('click', () => {
        editGroupOriginalNameEl.value = '';
        editGroupNameEl.value = '';
        groupCategoriesChooserEl.innerHTML = '';
    });
    
    // Category Add
    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (newCategoryNameEl.value || '').trim();
        if (!name) return;
        if (categoriesList.includes(name)) {
            alert('Category already exists');
            return;
        }
        categoriesList.push(name);
        categoriesList.sort();
        await db.collection('config').doc('categories').set({ list: categoriesList });
        newCategoryNameEl.value = '';
        renderCategoryList(name);
        selectCategory(name);
        populateCategorySelects();
    });
    
    // Category Edit
    editCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orig = editCategoryOriginalNameEl.value;
        const newName = (editCategoryNameEl.value || '').trim();
        const group = editCategoryGroupEl.value || '';
        
        if (!orig) return;
        if (!newName) {
            alert('Name required');
            return;
        }
        
        if (newName !== orig) {
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
            
            // Update Groups
            if (categoryGroups) {
                for (const [g, arr] of Object.entries(categoryGroups)) {
                    const idx = arr.indexOf(orig);
                    if (idx !== -1) {
                        arr.splice(idx, 1, newName);
                    }
                }
                await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
            }
            
            categoriesList = categoriesList.filter(c => c !== orig);
            categoriesList.push(newName);
            categoriesList.sort();
        }
        
        // Update Group Association
        if (categoryGroups) {
            // Remove from all
            for (const arr of Object.values(categoryGroups)) {
                const idx = arr.indexOf(newName);
                if (idx !== -1) arr.splice(idx, 1);
            }
            // Add to new
            if (group) {
                categoryGroups[group] = categoryGroups[group] || [];
                if (!categoryGroups[group].includes(newName)) categoryGroups[group].push(newName);
                categoryGroups[group].sort();
                await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
            } else {
                await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
            }
        }
        
        await db.collection('config').doc('categories').set({ list: categoriesList });
        renderCategoryList(newName);
        selectCategory(newName);
        populateCategorySelects();
        // Reload services to reflect name changes if any
        if (newName !== orig) {
            await loadServicesOnce();
            renderTable();
        }
    });
    
    // Category Delete
    deleteCategoryBtn.addEventListener('click', async () => {
        const name = editCategoryOriginalNameEl.value;
        if (!name) return;
        
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
        
        editCategoryOriginalNameEl.value = '';
        editCategoryNameEl.value = '';
        renderCategoryList();
        populateCategorySelects();
    });
    
    clearCategorySelectionBtn.addEventListener('click', () => {
        editCategoryOriginalNameEl.value = '';
        editCategoryNameEl.value = '';
    });
}
