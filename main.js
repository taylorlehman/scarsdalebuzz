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
    // Calculate total recommendations per category
    const categoryTotals = {};
    serviceData.forEach(service => {
        if (!categoryTotals[service.category]) {
            categoryTotals[service.category] = 0;
        }
        categoryTotals[service.category] += service.recommendations;
    });

    // Sort categories by total recommendations (descending)
    const sortedCategories = Object.keys(categoryTotals)
        .sort((a, b) => categoryTotals[b] - categoryTotals[a]);
    
    // Get top 5 categories plus 'All'
    const topCategories = ['All', ...sortedCategories.slice(0, 5)];
    const overflowCategories = sortedCategories.slice(5);
    
    // Check if active category is in overflow
    const isActiveInOverflow = overflowCategories.includes(activeCategory);
    
    categoryFilters.innerHTML = '';
    
    // Render top categories (always show all top categories)
    topCategories.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.className = `category-btn px-4 py-2 rounded-full text-sm font-semibold transition brand-secondary-bg-hover ${activeCategory === category ? 'active' : 'brand-secondary-bg text-stone-700'}`;
        button.dataset.category = category;
        categoryFilters.appendChild(button);
    });
    
    // Handle overflow categories
    if (overflowCategories.length > 0) {
        if (isActiveInOverflow) {
            // Show active overflow category as dropdown trigger
            const activeOverflowButton = document.createElement('button');
            activeOverflowButton.innerHTML = `${activeCategory} <svg class="w-3 h-3 ml-1 inline" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>`;
            activeOverflowButton.className = 'category-btn px-4 py-2 rounded-full text-sm font-semibold transition brand-secondary-bg-hover active flex items-center';
            activeOverflowButton.id = 'active-overflow-btn';
            categoryFilters.appendChild(activeOverflowButton);
            
            // Add click handler to show overflow dialog
            activeOverflowButton.addEventListener('click', () => {
                showOverflowDialog(overflowCategories, categoryTotals);
            });
        } else {
            // Show regular overflow button
            const overflowButton = document.createElement('button');
            overflowButton.textContent = `+${overflowCategories.length} More`;
            overflowButton.className = 'category-btn px-4 py-2 rounded-full text-sm font-semibold transition brand-secondary-bg-hover brand-secondary-bg text-stone-700 relative';
            overflowButton.id = 'overflow-btn';
            categoryFilters.appendChild(overflowButton);
            
            // Add click handler for overflow button
            overflowButton.addEventListener('click', () => {
                showOverflowDialog(overflowCategories, categoryTotals);
            });
        }
    }
};

// --- OVERFLOW DIALOG FUNCTIONS ---
const showOverflowDialog = (overflowCategories, categoryTotals) => {
    // Create modal backdrop
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.id = 'overflow-modal';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'bg-white rounded-xl shadow-2xl max-w-md w-full max-h-96 overflow-hidden';
    
    // Modal header
    const header = document.createElement('div');
    header.className = 'p-6 border-b border-stone-200';
    header.innerHTML = `
        <div class="flex justify-between items-center">
            <h3 class="text-xl font-bold text-stone-800">More Categories</h3>
            <button id="close-overflow" class="text-stone-400 hover:text-stone-600 text-2xl font-bold">&times;</button>
        </div>
    `;
    
    // Modal body with scrollable category list
    const body = document.createElement('div');
    body.className = 'p-6 max-h-80 overflow-y-auto';
    
    const categoryList = document.createElement('div');
    categoryList.className = 'space-y-4';
    
    // Group overflow categories by their category groups
    const groupedCategories = {};
    const ungroupedCategories = [];
    
    // Organize categories into groups
    overflowCategories.forEach(category => {
        let foundGroup = false;
        for (const [groupName, categories] of Object.entries(categoryGroups)) {
            if (categories.includes(category)) {
                if (!groupedCategories[groupName]) {
                    groupedCategories[groupName] = [];
                }
                groupedCategories[groupName].push(category);
                foundGroup = true;
                break;
            }
        }
        if (!foundGroup) {
            ungroupedCategories.push(category);
        }
    });
    
    // Render grouped categories
    Object.entries(groupedCategories).forEach(([groupName, categories]) => {
        // Group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'text-sm font-bold text-stone-500 uppercase tracking-wide mb-2';
        groupHeader.textContent = groupName;
        categoryList.appendChild(groupHeader);
        
        // Group categories
        const groupContainer = document.createElement('div');
        groupContainer.className = 'space-y-2 mb-4';
        
        categories.forEach(category => {
            const categoryItem = document.createElement('button');
            categoryItem.className = `w-full text-left p-3 rounded-lg hover:bg-stone-50 transition flex justify-between items-center ${activeCategory === category ? 'bg-amber-50 border-2 border-amber-200' : 'border border-stone-200'}`;
            categoryItem.innerHTML = `
                <span class="font-semibold text-stone-700">${category}</span>
                <span class="text-sm text-stone-500">${categoryTotals[category]} recs</span>
            `;
            categoryItem.addEventListener('click', () => {
                activeCategory = category;
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
                }, 250);
                
                // Close modal
                document.body.removeChild(modal);
            });
            groupContainer.appendChild(categoryItem);
        });
        
        categoryList.appendChild(groupContainer);
    });
    
    // Render ungrouped categories if any
    if (ungroupedCategories.length > 0) {
        const ungroupedHeader = document.createElement('div');
        ungroupedHeader.className = 'text-sm font-bold text-stone-500 uppercase tracking-wide mb-2';
        ungroupedHeader.textContent = 'Other';
        categoryList.appendChild(ungroupedHeader);
        
        const ungroupedContainer = document.createElement('div');
        ungroupedContainer.className = 'space-y-2';
        
        ungroupedCategories.forEach(category => {
            const categoryItem = document.createElement('button');
            categoryItem.className = `w-full text-left p-3 rounded-lg hover:bg-stone-50 transition flex justify-between items-center ${activeCategory === category ? 'bg-amber-50 border-2 border-amber-200' : 'border border-stone-200'}`;
            categoryItem.innerHTML = `
                <span class="font-semibold text-stone-700">${category}</span>
                <span class="text-sm text-stone-500">${categoryTotals[category]} recs</span>
            `;
            categoryItem.addEventListener('click', () => {
                activeCategory = category;
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
                }, 250);
                
                // Close modal
                document.body.removeChild(modal);
            });
            ungroupedContainer.appendChild(categoryItem);
        });
        
        categoryList.appendChild(ungroupedContainer);
    }
    
    body.appendChild(categoryList);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);
    
    // Add close functionality
    const closeBtn = modal.querySelector('#close-overflow');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // Add to DOM
    document.body.appendChild(modal);
    
    // Add fade-in animation
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
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
    // Skip if this is the overflow button or active overflow button
    if (e.target.id === 'overflow-btn' || e.target.id === 'active-overflow-btn') return;
    
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
