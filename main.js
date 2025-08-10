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

// --- RENDER FUNCTIONS ---
const renderServices = (services) => {
    serviceList.innerHTML = '';
    if (services.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'card bg-white rounded-xl shadow-lg overflow-hidden flex flex-col';

        let title = service.businessName || `${service.firstName} ${service.lastName}`;
        let subtitle = '';
        if (service.businessName && service.firstName) {
            subtitle = `${service.firstName} ${service.lastName}`;
        }

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const isOldRec = new Date(service.lastRecommended) < oneYearAgo;

        let recPillHTML = '';
        if (isOldRec) {
            recPillHTML = `
            <div class="bg-red-50 p-3 text-center">
                <span class="px-2 py-1 text-xs font-bold text-red-800 bg-red-100 rounded-full">
                    ⚠️ No Rec in the Past Year
                </span>
            </div>`;
        } else {
            recPillHTML = `
            <div class="bg-stone-50 p-3 text-center">
                <span class="px-2 py-1 text-xs font-bold text-amber-800 bg-amber-100 rounded-full">
                    Recommended: ${new Date(service.lastRecommended).toLocaleDateString()}
                </span>
            </div>`;
        }

        card.innerHTML = `
            <div class="p-6 flex-grow">
                <div class="flex items-center mb-4">
                    <div class="w-16 h-16 rounded-full brand-accent-bg flex flex-col items-center justify-center mr-4 flex-shrink-0 p-1 text-center">
                        <span class="text-2xl font-black text-white leading-none">${service.recommendations}</span>
                        <span class="text-xs font-bold text-white uppercase leading-none">Recs</span>
                    </div>
                    <div class="flex-grow">
                        <h3 class="text-xl font-black text-stone-800">${title}</h3>
                        ${subtitle ? `<p class="text-md text-stone-600 font-semibold">${subtitle}</p>` : ''}
                    </div>
                </div>
                <div class="text-center">
                     <a href="tel:${service.phone}" class="text-lg font-bold brand-accent-text">${service.phone}</a>
                </div>
            </div>
            ${recPillHTML}
        `;
        serviceList.appendChild(card);
    });
};

const renderCategoryButtons = () => {
    const categories = ['All', ...new Set(serviceData.map(s => s.category).sort())];
    categoryFilters.innerHTML = '';
    categories.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.className = `category-btn px-4 py-2 rounded-full text-sm font-semibold transition brand-secondary-bg-hover ${activeCategory === category ? 'active' : 'brand-secondary-bg text-stone-700'}`;
        button.dataset.category = category;
        categoryFilters.appendChild(button);
    });
};

// --- EVENT HANDLERS & LOGIC ---

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
            (service.category && service.category.toLowerCase().includes(searchTerm))
        );
    }
    filteredServices.sort((a, b) => {
        if (b.recommendations !== a.recommendations) {
            return b.recommendations - a.recommendations;
        }
        return new Date(b.lastRecommended) - new Date(a.lastRecommended);
    });
    renderServices(filteredServices);
};

// Add debounced search with smooth fade animation
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    
    // Start fade out
    serviceList.classList.remove('fade-in');
    serviceList.classList.add('fade-out');
    
    searchTimeout = setTimeout(() => {
        // Update content while faded out
        filterAndRender();
        
        // Fade back in
        serviceList.classList.remove('fade-out');
        serviceList.classList.add('fade-in');
    }, 250); // Wait for fade-out to complete
});

categoryFilters.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    const newCategory = e.target.dataset.category;
    if (newCategory === activeCategory) return;

    activeCategory = newCategory;
    renderCategoryButtons();
    
    // Start fade out animation
    serviceList.classList.remove('fade-in');
    serviceList.classList.add('fade-out');
    
    // Wait for fade-out, then update content and fade in
    setTimeout(() => {
        filterAndRender();
        
        // Fade back in
        serviceList.classList.remove('fade-out');
        serviceList.classList.add('fade-in');
    }, 250); // Wait for fade-out to complete
});

// --- PASSWORD PROTECTION ---
passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPassword = passwordInput.value;
    const correctPassword = 'raiders';

    if (enteredPassword === correctPassword) {
        // Correct password: Fade out modal and show content
        passwordError.classList.add('hidden');
        passwordModal.style.opacity = '0';
        
        setTimeout(() => {
            passwordModal.classList.add('hidden');
            mainContent.classList.remove('hidden');
            // mainContent is now visible

            // Initialize the app now that content is visible
            renderCategoryButtons();
            filterAndRender();
        }, 500); // Match transition duration

    } else {
        // Incorrect password: Show error and shake modal
        passwordError.classList.remove('hidden');
        passwordInput.value = '';
        passwordInput.focus();
        
        const modalContent = passwordForm.parentElement;
        modalContent.classList.add('animate-shake');
        setTimeout(() => {
            modalContent.classList.remove('animate-shake');
        }, 600);
    }
});
