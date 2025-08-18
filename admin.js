// Admin panel script: Firestore CRUD for services and category groups/categories

let db;
try {
  if (window.firebaseConfig && !firebase?.apps?.length) {
    firebase.initializeApp(window.firebaseConfig);
  }
  if (firebase?.firestore) {
    firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
    db = firebase.firestore();
  }
} catch (_) {}

// State
let allServices = [];
let categoryGroups = null; // { GroupName: [categories...] }
let categoriesList = []; // ["Electrician", ...]

// Elements
const searchEl = document.getElementById('adminSearch');
const filterEl = document.getElementById('adminCategoryFilter');
const tableBody = document.getElementById('adminTableBody');
// Toggle elements
const toggleServicesBtn = document.getElementById('toggleServices');
const toggleCategoriesBtn = document.getElementById('toggleCategories');
const servicesControls = document.getElementById('servicesControls');
const servicesPanel = document.getElementById('servicesPanel');
const categoriesPanel = document.getElementById('categoriesPanel');
// No persistent New button; use Cancel in the form instead

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

function slugifyId({ businessName, firstName, lastName, phone, email }) {
  const parts = [
    (businessName || '').trim().toLowerCase().replace(/\s+/g, '-'),
    (firstName || '').trim().toLowerCase(),
    (lastName || '').trim().toLowerCase(),
    (phone || '').trim().replace(/[+\s-]/g, ''),
  ].filter(Boolean);
  return parts.join('-') || null;
}

async function loadCategoryGroups() {
  if (!db) return;
  try {
    const doc = await db.collection('config').doc('categoryGroups').get();
    if (doc.exists) {
      const data = doc.data();
      if (data && data.groups && typeof data.groups === 'object') {
        categoryGroups = data.groups;
      }
    }
  } catch (e) {
    console.warn('Failed to load category groups; using fallback from data', e);
  }
}

async function loadCategoriesList() {
  if (!db) return;
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
    // Fallback to union of group categories, then services
    if (categoryGroups) {
      const set = new Set();
      Object.values(categoryGroups).forEach(arr => arr.forEach(c => set.add(c)));
      categoriesList = Array.from(set).sort();
    } else {
      const set = new Set(allServices.map(s => s.category).filter(Boolean));
      categoriesList = Array.from(set).sort();
    }
  }
}

function getAllCategories() {
  if (categoriesList && categoriesList.length) return categoriesList.slice();
  // derive from services as fallback
  const set = new Set(allServices.map(s => s.category).filter(Boolean));
  return Array.from(set).sort();
}

function populateCategorySelects() {
  const categories = getAllCategories();
  // filter dropdown
  filterEl.innerHTML = '<option value="">All</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  // form select
  categoryEl.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

// ---------- Toggle between Services and Categories ----------
function showServices() {
  servicesControls?.classList.remove('hidden');
  servicesPanel?.classList.remove('hidden');
  categoriesPanel?.classList.add('hidden');
  toggleServicesBtn?.classList.add('brand-secondary-bg', 'text-stone-700');
  toggleCategoriesBtn?.classList.remove('brand-secondary-bg', 'text-stone-700');
}
function showCategories() {
  servicesControls?.classList.add('hidden');
  servicesPanel?.classList.add('hidden');
  categoriesPanel?.classList.remove('hidden');
  toggleCategoriesBtn?.classList.add('brand-secondary-bg', 'text-stone-700');
  toggleServicesBtn?.classList.remove('brand-secondary-bg', 'text-stone-700');
}
toggleServicesBtn?.addEventListener('click', showServices);
toggleCategoriesBtn?.addEventListener('click', showCategories);

// ---------- Categories Management Rendering ----------
function renderGroupList(selected = null) {
  if (!groupListEl) return;
  groupListEl.innerHTML = '';
  const groups = categoryGroups ? Object.keys(categoryGroups).sort() : [];
  groups.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-3 py-2 rounded-lg border text-sm ' + (selected === name ? 'brand-secondary-bg' : '');
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
    btn.className = 'px-3 py-2 rounded-lg border text-sm ' + (selected === name ? 'brand-secondary-bg' : '');
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
    wrapper.className = 'flex items-center gap-2 p-2 border rounded';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = cat;
    cb.checked = selectedSet.has(cat);
    const span = document.createElement('span');
    span.textContent = cat;
    wrapper.appendChild(cb);
    wrapper.appendChild(span);
    groupCategoriesChooserEl.appendChild(wrapper);
  });
}

function selectGroup(name) {
  if (!categoryGroups) return;
  editGroupOriginalNameEl.value = name;
  editGroupNameEl.value = name;
  const selectedSet = new Set(categoryGroups[name] || []);
  buildChooserCategories(selectedSet);
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
}

// ---------- Categories Management Handlers ----------
addGroupForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!db) return;
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

editGroupForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!db || !categoryGroups) return;
  const orig = editGroupOriginalNameEl.value;
  const newName = (editGroupNameEl.value || '').trim();
  if (!orig) return;
  if (!newName) {
    alert('Name required');
    return;
  }
  // Collect selected categories
  const selected = Array.from(groupCategoriesChooserEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
  if (orig !== newName) {
    // Rename group key
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
  // Ensure categories list includes all referenced
  const set = new Set(categoriesList);
  selected.forEach(c => set.add(c));
  categoriesList = Array.from(set).sort();
  await db.collection('config').doc('categories').set({ list: categoriesList });
  renderGroupList(newName);
  selectGroup(newName);
  renderCategoryList();
});

deleteGroupBtn?.addEventListener('click', async () => {
  if (!db || !categoryGroups) return;
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

clearGroupSelectionBtn?.addEventListener('click', () => {
  editGroupOriginalNameEl.value = '';
  editGroupNameEl.value = '';
  groupCategoriesChooserEl.innerHTML = '';
});

addCategoryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!db) return;
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
});

editCategoryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!db) return;
  const orig = editCategoryOriginalNameEl.value;
  const newName = (editCategoryNameEl.value || '').trim();
  const group = editCategoryGroupEl.value || '';
  if (!orig) return;
  if (!newName) {
    alert('Name required');
    return;
  }
  // If renaming, update services and groups
  if (newName !== orig) {
    if (categoriesList.includes(newName)) {
      alert('A category with that name already exists');
      return;
    }
    // Update all services with matching category
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
    // Update groups mapping
    if (categoryGroups) {
      for (const [g, arr] of Object.entries(categoryGroups)) {
        const idx = arr.indexOf(orig);
        if (idx !== -1) {
          arr.splice(idx, 1, newName);
        }
      }
      await db.collection('config').doc('categoryGroups').set({ groups: categoryGroups });
    }
    // Update categories list
    categoriesList = categoriesList.filter(c => c !== orig);
    categoriesList.push(newName);
    categoriesList.sort();
  }
  // Update association to group
  if (categoryGroups) {
    // Remove from all groups first
    for (const arr of Object.values(categoryGroups)) {
      const idx = arr.indexOf(newName);
      if (idx !== -1) arr.splice(idx, 1);
    }
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
});

deleteCategoryBtn?.addEventListener('click', async () => {
  if (!db) return;
  const name = editCategoryOriginalNameEl.value;
  if (!name) return;
  // Prevent delete if any service uses it
  const snap = await db.collection('services').where('category', '==', name).limit(1).get();
  if (!snap.empty) {
    alert('Cannot delete: there are services associated with this category.');
    return;
  }
  if (!confirm(`Delete category "${name}"?`)) return;
  // Remove from categories list
  categoriesList = categoriesList.filter(c => c !== name);
  await db.collection('config').doc('categories').set({ list: categoriesList });
  // Remove from any groups
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
  selectGroup(editGroupOriginalNameEl.value || '');
  populateCategorySelects();
});

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
    tr.className = 'border-b hover:bg-stone-50';
    const name = s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
    tr.innerHTML = `
      <td class="py-2 pr-4">${name || '-'}</td>
      <td class="py-2 pr-4">${s.category || '-'}</td>
      <td class="py-2 pr-4">${s.phone || '-'}</td>
      <td class="py-2 pr-4">${s.email || '-'}</td>
      <td class="py-2 pr-4">${s.recommendations ?? 0}</td>
      <td class="py-2">
        <button class="underline text-stone-700 hover:text-stone-900" data-id="${s.id}" data-action="edit">Edit</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

function resetFormToNew() {
  formTitle.textContent = 'Add New Listing';
  docIdEl.value = '';
  form.reset();
  recommendationsEl.value = 0;
  deleteBtn.classList.add('hidden');
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
  if (doc.lastRecommended) {
    const d = typeof doc.lastRecommended.toDate === 'function' ? doc.lastRecommended.toDate() : new Date(doc.lastRecommended);
    if (!isNaN(d)) {
      lastRecommendedEl.value = d.toISOString().slice(0, 10);
    }
  }
  recommendationsEl.value = Number(doc.recommendations || 0);
  deleteBtn.classList.remove('hidden');
}

function parseDateToTimestamp(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  // Firestore compat will convert JS Date to Timestamp
  return d;
}

// Event listeners
searchEl.addEventListener('input', renderTable);
filterEl.addEventListener('change', renderTable);
if (cancelBtn) cancelBtn.addEventListener('click', resetFormToNew);

tableBody.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === 'edit') {
    const id = target.dataset.id;
    const doc = allServices.find(s => s.id === id);
    if (doc) fillFormFromDoc(doc);
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!db) return;
  const payload = {
    businessName: businessNameEl.value.trim() || null,
    firstName: firstNameEl.value.trim() || null,
    lastName: lastNameEl.value.trim() || null,
    phone: phoneEl.value.trim() || null,
    email: emailEl.value.trim() || null,
    category: categoryEl.value || null,
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
    // reload services
    await loadServicesOnce();
    renderTable();
    alert('Saved');
  } catch (e) {
    console.error('Save failed', e);
    alert('Save failed: ' + e.message);
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!db) return;
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

async function loadServicesOnce() {
  if (!db) return;
  const snap = await db.collection('services').get();
  allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

(async function init() {
  await loadCategoryGroups();
  await loadCategoriesList();
  await loadServicesOnce();
  populateCategorySelects();
  renderTable();
  renderGroupList();
  renderCategoryList();
  showServices();
})();
