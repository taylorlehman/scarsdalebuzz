document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- State ---
    let currentUser = null;
    let unsubscribeFirestore = null; // To stop listener on logout
    let activeRequestId = null;
    let requestToCancelId = null; // Track which request is being cancelled
    let requestsCache = {};
    let isCreatingNew = false;

    // --- DOM Elements ---
    const requestsList = document.getElementById('requests-list');
    const newRequestBtn = document.getElementById('new-request-btn');
    
    // Header Elements
    const userNameEl = document.getElementById('user-name');
    const userPhotoEl = document.getElementById('user-photo');
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    const signOutBtn = document.getElementById('sign-out-btn');

    // Desktop Chat Elements
    const chatHeader = document.getElementById('chat-header');
    const chatTitle = document.getElementById('chat-title');
    const chatDescription = document.getElementById('chat-description');
    const chatStatus = document.getElementById('chat-status');
    const chatMessages = document.getElementById('chat-messages');
    const chatInputArea = document.getElementById('chat-input-area');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const emptyState = document.getElementById('empty-state');
    const emptyStateNewBtn = document.getElementById('empty-state-new-btn');
    const chatDetailsBtn = document.getElementById('chat-details-btn');

    // Confirmation View Elements
    const confirmationView = document.getElementById('confirmation-view');
    const confirmProvider = document.getElementById('confirm-provider');
    const confirmTime = document.getElementById('confirm-time');
    const confirmProviderContact = document.getElementById('confirm-provider-contact');
    const confirmPhone = document.getElementById('confirm-phone');
    const confirmCancelBtnView = document.getElementById('confirm-cancel-btn-view');

    // Mobile Elements
    const mobileChatOverlay = document.getElementById('mobile-chat-overlay');
    const mobileBackBtn = document.getElementById('mobile-back-btn');
    const mobileChatTitle = document.getElementById('mobile-chat-title');
    const mobileChatStatus = document.getElementById('mobile-chat-status');
    const mobileChatMessages = document.getElementById('mobile-chat-messages');
    const mobileChatInputArea = document.getElementById('mobile-chat-input-area');
    const mobileChatForm = document.getElementById('mobile-chat-form');
    const mobileChatInput = document.getElementById('mobile-chat-input');
    const mobileDetailsBtn = document.getElementById('mobile-details-btn');

    // Modals
    const detailsModal = document.getElementById('details-modal');
    const detailsCloseBtn = document.getElementById('details-close-btn');
    const modalRequestId = document.getElementById('modal-request-id');
    const modalSummary = document.getElementById('modal-summary');
    const modalProviderName = document.getElementById('modal-provider-name');
    const modalProviderPhone = document.getElementById('modal-provider-phone');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    
    const confirmModal = document.getElementById('confirm-modal');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmActionBtn = document.getElementById('confirm-action-btn');

    // Onboarding Elements
    const onboardingModal = document.getElementById('onboarding-modal');
    const onboardStep0 = document.getElementById('onboard-step-0');
    const onboardStepHow = document.getElementById('onboard-step-how');
    const onboardStep1 = document.getElementById('onboard-step-1');
    const onboardStep2 = document.getElementById('onboard-step-2');
    
    const onboardStartBtn = document.getElementById('onboard-start-btn');
    const onboardHowNextBtn = document.getElementById('onboard-how-next-btn');
    const onboardAddressInput = document.getElementById('onboard-address');
    const onboardStep1Next = document.getElementById('onboard-step-1-next');
    const onboardPhoneInput = document.getElementById('onboard-phone');
    const onboardStep2Back = document.getElementById('onboard-step-2-back');
    const onboardFinishBtn = document.getElementById('onboard-finish-btn');

    // --- Helper Functions ---

    const getStatusEmoji = (status) => {
        switch (status) {
            case 'in progress': return '🐝';
            case 'scheduled': return '🗓️';
            case 'user action required': return '⚠️';
            case 'provider unavailable': return '🚫';
            case 'closed': return '🏁';
            default: return '⚪';
        }
    };

    const formatTime = (date) => {
        if (!date) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const autoResizeTextarea = (element) => {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    };

    // --- Render Functions ---

    const renderRequestsList = (snapshot) => {
        requestsList.innerHTML = '';
        requestsCache = {};

        if (snapshot.empty) {
            requestsList.innerHTML = `
                <div class="text-center p-6 text-stone-500">
                    <p>No requests found.</p>
                    <p class="text-sm mt-2">Tap + to start a new one!</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            requestsCache[doc.id] = data;
            
            const isActive = doc.id === activeRequestId;
            const div = document.createElement('div');
            div.className = `request-item relative p-4 rounded-xl cursor-pointer transition border ${isActive ? 'bg-white border-orange-300 shadow-md ring-1 ring-orange-200' : 'bg-white border-stone-200 hover:border-orange-200 hover:shadow-sm'}`;
            div.dataset.id = doc.id;
            div.onclick = () => selectRequest(doc.id);

            const title = data.title || 'Untitled Request';
            const summary = data.summary || 'No details yet...';
            const statusEmoji = getStatusEmoji(data.status);

            div.innerHTML = `
                <!-- Emoji: Vertically Centered Left -->
                <div class="absolute left-4 top-1/2 -translate-y-1/2 text-2xl" title="${data.status}">
                    ${statusEmoji}
                </div>
                
                <!-- Menu: Vertically Centered Right -->
                <button class="menu-btn absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition z-10" data-id="${doc.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                </button>

                <!-- Content: Padded to clear accessories -->
                <div class="ml-10 mr-6">
                    <h3 class="font-bold text-stone-800 leading-tight mb-1">${title}</h3>
                    <p class="text-xs text-stone-500 line-clamp-2">${summary}</p>
                </div>
                
                <!-- Dropdown Menu -->
                <div id="menu-${doc.id}" class="menu-dropdown hidden absolute right-2 top-8 bg-white shadow-xl border border-stone-200 rounded-lg z-20 w-40 py-1 overflow-hidden">
                    <button class="cancel-request-action w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-bold flex items-center gap-2" data-id="${doc.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel Request
                    </button>
                </div>
            `;
            // Ensure relative positioning for the menu
            div.classList.add('relative');
            
            requestsList.appendChild(div);
        });

        // If we are creating a new request but a list update happened, stay in create mode visually
        if (isCreatingNew && activeRequestId === 'new') {
            // Optionally highlight a "New Request" placeholder if we added one to the list
        }
    };

    const renderMessage = (role, text, timestamp) => {
        const isUser = role === 'You' || role === 'User';
        const alignment = isUser ? 'justify-end' : 'justify-start';
        const bg = isUser ? 'bg-orange-100 text-stone-800 rounded-br-none' : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none';
        const timeString = timestamp ? formatTime(timestamp.toDate ? timestamp.toDate() : new Date(timestamp)) : '';

        const userAvatar = currentUser && currentUser.photoURL ? currentUser.photoURL : 'https://www.gravatar.com/avatar?d=mp';
        const sunnyAvatar = '../images/sunny_the_bee.png';

        return `
            <div class="flex ${alignment} items-end gap-2 mb-4">
                ${!isUser ? `<img src="${sunnyAvatar}" class="w-8 h-8 rounded-full border border-stone-200 bg-white mb-5 flex-shrink-0">` : ''}
                
                <div class="max-w-[80%] md:max-w-[70%]">
                    <div class="p-3 md:p-4 rounded-2xl shadow-sm ${bg}">
                        <p class="whitespace-pre-wrap leading-relaxed text-sm md:text-base">${text}</p>
                    </div>
                    <p class="text-[10px] text-stone-400 mt-1 px-1 ${isUser ? 'text-right' : 'text-left'}">${role} • ${timeString}</p>
                </div>

                ${isUser ? `<img src="${userAvatar}" class="w-8 h-8 rounded-full border border-stone-200 mb-5 flex-shrink-0">` : ''}
            </div>
        `;
    };

    const renderChatHistory = (chatHistory, targetContainer = null) => {
        const container = targetContainer || (window.innerWidth < 768 ? mobileChatMessages : chatMessages);
        container.innerHTML = '';
        
        if (!chatHistory || chatHistory.length === 0) {
            container.innerHTML = '<div class="text-center text-stone-400 italic mt-10">No messages yet.</div>';
            return;
        }

        // Sort chronologically just in case
        const sortedHistory = [...chatHistory].sort((a, b) => {
            const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
            const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
            return tA - tB;
        });

        let html = '';
        sortedHistory.forEach(msg => {
            // Filter logic: Only show messages involving the User (either as sender or receiver)
            // Backward compatibility for old messages without sender/receiver
            const isVisible = 
                (msg.sender === 'User') || 
                (msg.receiver === 'User') ||
                // Legacy support
                (!msg.sender && (msg.role === 'User' || msg.role === 'Sunny'));

            if (isVisible) {
                // Display name logic
                let roleDisplay = msg.sender || msg.role;
                if (roleDisplay === 'User') roleDisplay = 'You';
                
                html += renderMessage(roleDisplay, msg.message, msg.timestamp);
            }
        });
        
        container.innerHTML = html;
        scrollToBottom(container);
    };

    const scrollToBottom = (element) => {
        element.scrollTop = element.scrollHeight;
    };

    // --- Actions ---

    const selectRequest = (requestId) => {
        if (activeRequestId === requestId && !isCreatingNew) return; // Already selected

        // Reset Placeholder for standard chat
        chatInput.placeholder = "Type a message...";
        mobileChatInput.placeholder = "Type a message...";

        isCreatingNew = false;
        activeRequestId = requestId;
        const data = requestsCache[requestId];

        if (!data) return;

        // Update Desktop UI
        emptyState.classList.add('hidden');
        chatHeader.classList.remove('hidden');
        
        if (data.status === 'scheduled') {
            // Show Confirmation View
            chatMessages.classList.add('hidden');
            chatInputArea.classList.add('hidden');
            confirmationView.classList.remove('hidden');
            
            confirmProvider.textContent = data.providerName || 'Service Provider';
            
            // Update Contact Info
            confirmProviderContact.textContent = data.providerName || 'the provider';
            if (data.providerPhoneNumber) {
                confirmPhone.textContent = data.providerPhoneNumber;
                confirmPhone.href = `tel:${data.providerPhoneNumber}`;
            } else {
                confirmPhone.textContent = 'support';
                confirmPhone.href = '#';
            }
            
            // Format Date
            let dateStr = 'TBD';
            if (data.serviceDate) {
                const d = new Date(data.serviceDate);
                dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
            confirmTime.textContent = dateStr;

        } else {
            // Show Chat Interface
            confirmationView.classList.add('hidden');
            chatMessages.classList.remove('hidden');
            chatInputArea.classList.remove('hidden');
            renderChatHistory(data.chat_history);
        }
        
        chatTitle.textContent = data.title || 'Request';
        chatDescription.textContent = data.summary || 'No details yet...';
        chatStatus.innerHTML = `<span>${getStatusEmoji(data.status)}</span> <span>${data.status}</span>`;

        // Update Mobile UI (Overlay)
        if (window.innerWidth < 768) {
            mobileChatOverlay.classList.remove('hidden');
            mobileChatTitle.textContent = data.title || 'Request';
            mobileChatStatus.innerHTML = `<span>${getStatusEmoji(data.status)}</span> <span>${data.status}</span>`;
            // Render chat history into mobile container
            renderChatHistory(data.chat_history); // Logic above handles selecting correct container based on width, but we need to be careful
            // Actually, let's just populate both to be safe or strictly check
            // Re-run render for mobile specific container to be sure
            // We need to replicate the filter logic here or refactor renderChatHistory to take a container argument (which it does)
            // But 'selectRequest' calls it for the main container. We need to call it again for mobile.
            
            let mobileHtml = '';
            data.chat_history.forEach(msg => {
                 const isVisible = 
                    (msg.sender === 'User') || 
                    (msg.receiver === 'User') ||
                    (!msg.sender && (msg.role === 'User' || msg.role === 'Sunny'));

                if (isVisible) {
                    let roleDisplay = msg.sender || msg.role;
                    if (roleDisplay === 'User') roleDisplay = 'You';
                    
                    // Use the same sort order? Yes, data.chat_history is not sorted here.
                    // We should use the sorted list.
                }
            });
            
            // Better approach: Reuse renderChatHistory by passing the mobile container explicitly
            renderChatHistory(data.chat_history, mobileChatMessages);
        }
    };

    const startNewRequest = () => {
        isCreatingNew = true;
        activeRequestId = 'new';
        
        // Set Placeholder for First Message
        const promptText = "Describe your issue! Include what's wrong, how urgently you need it fixed, and what times you are available.";
        chatInput.placeholder = promptText;
        mobileChatInput.placeholder = promptText;

        // Desktop
        emptyState.classList.add('hidden');
        confirmationView.classList.add('hidden');
        chatMessages.classList.remove('hidden');
        chatHeader.classList.remove('hidden');
        chatInputArea.classList.remove('hidden');
        
        chatTitle.textContent = 'New Request';
        chatDescription.textContent = 'How can we help?';
        chatStatus.innerHTML = '✨ Starting fresh...';
        chatMessages.innerHTML = `
            <div class="text-center p-8">
                <p class="text-stone-500 mb-2">How can Sunny help you today?</p>
                <p class="text-sm text-stone-400">Describe your issue (e.g., "My kitchen sink is leaking")</p>
            </div>
        `;

        // Mobile
        if (window.innerWidth < 768) {
            mobileChatOverlay.classList.remove('hidden');
            mobileChatTitle.textContent = 'New Request';
            mobileChatStatus.innerHTML = '✨ Starting fresh...';
            mobileChatMessages.innerHTML = `
                <div class="text-center p-8 mt-10">
                    <p class="text-stone-500 mb-2">How can Sunny help you today?</p>
                    <p class="text-sm text-stone-400">Describe your issue...</p>
                </div>
            `;
        }
        
        // Focus input
        setTimeout(() => {
            if (window.innerWidth < 768) {
                mobileChatInput.focus();
            } else {
                chatInput.focus();
            }
        }, 100);
    };

    const handleSendMessage = async (text) => {
        if (!text.trim()) return;
        
        const inputField = window.innerWidth < 768 ? mobileChatInput : chatInput;
        const container = window.innerWidth < 768 ? mobileChatMessages : chatMessages;
        
        inputField.value = '';
        inputField.style.height = 'auto'; // Reset height

        // Optimistic Render
        const tempMsgHtml = renderMessage('User', text, new Date());
        container.insertAdjacentHTML('beforeend', tempMsgHtml);
        scrollToBottom(container);

        if (isCreatingNew) {
            // Create New Request
            // Add loading indicator
            const loadingId = 'loading-' + Date.now();
            container.insertAdjacentHTML('beforeend', `
                <div id="${loadingId}" class="flex justify-start">
                     <div class="bg-white text-stone-500 p-3 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-2">
                        <div class="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                        <span class="text-sm">Sunny is thinking...</span>
                     </div>
                </div>
            `);
            scrollToBottom(container);

            try {
                const token = currentUser ? await currentUser.getIdToken() : null;
                const functionUrl = 'https://submitrequest-bnvo6soxla-uc.a.run.app';
                const response = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ 
                        description: text
                    }),
                });
                
                if (!response.ok) throw new Error('Failed to submit');
                
                const data = await response.json();
                const replyText = data.message;
                const newId = data.id;
                
                // Remove loading
                document.getElementById(loadingId)?.remove();
                
                // Add Sunny's reply
                container.insertAdjacentHTML('beforeend', renderMessage('Sunny', replyText, new Date()));
                scrollToBottom(container);
                
                // Update activeRequestId to the new ID, but keep isCreatingNew = true
                // untill the Firestore listener confirms the data exists.
                activeRequestId = newId;
                // isCreatingNew = false; // Handled in listener
                
                // Reset Placeholder for subsequent messages
                chatInput.placeholder = "Type a message...";
                mobileChatInput.placeholder = "Type a message...";

            } catch (error) {
                document.getElementById(loadingId)?.remove();
                alert('Error submitting request: ' + error.message);
            }

        } else {
            // Append to Existing Request (User Answer)
            // This assumes the user is responding to a question or adding info
            // We need to call 'handleUserResponse' cloud function
            
             const loadingId = 'loading-' + Date.now();
            container.insertAdjacentHTML('beforeend', `
                <div id="${loadingId}" class="flex justify-start">
                     <div class="bg-white text-stone-500 p-3 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-2">
                        <div class="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                        <span class="text-sm">Sending reply...</span>
                     </div>
                </div>
            `);
            scrollToBottom(container);

            try {
                const token = currentUser ? await currentUser.getIdToken() : null;
                const functionUrl = 'https://handleuserresponse-bnvo6soxla-uc.a.run.app';
                const response = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        requestId: activeRequestId,
                        response: text
                    }),
                });

                if (!response.ok) throw new Error('Failed to send reply');
                
                // Remove loading
                document.getElementById(loadingId)?.remove();
                
                // We don't need to manually append the message because Firestore listener
                // will update the chat history. But for immediate feedback we could.
                // However, since we just optimistically added the user's message, 
                // and the server might not reply immediately with a new message (unless Sunny does),
                // we wait for Firestore.
                
            } catch (error) {
                document.getElementById(loadingId)?.remove();
                alert('Error sending message: ' + error.message);
            }
        }
    };

    const showDetails = () => {
        if (!activeRequestId || isCreatingNew) return;
        const data = requestsCache[activeRequestId];
        if (!data) return;

        modalRequestId.textContent = `ID: ${activeRequestId}`;
        modalSummary.textContent = data.summary || 'No summary available.';
        
        modalProviderName.textContent = data.providerName || 'Finding a pro...';
        modalProviderPhone.textContent = data.providerPhoneNumber || '---';
        
        detailsModal.classList.remove('hidden');
    };

    // --- Event Listeners ---

    // Desktop Inputs
    chatInput.addEventListener('input', () => autoResizeTextarea(chatInput));
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(chatInput.value);
        }
    });
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSendMessage(chatInput.value);
    });

    // Mobile Inputs
    mobileChatInput.addEventListener('input', () => autoResizeTextarea(mobileChatInput));
    // Mobile users usually prefer the send button or have a specific 'Go' key behavior managed by the OS, 
    // but adding Enter support for external keyboards on tablets is good practice.
    mobileChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(mobileChatInput.value);
        }
    });
    mobileChatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSendMessage(mobileChatInput.value);
    });

    // Buttons
    newRequestBtn.addEventListener('click', startNewRequest);
    
    // Updated listener with animation for empty state button
    emptyStateNewBtn.addEventListener('click', () => {
        const logo = emptyState.querySelector('img');
        const btn = emptyStateNewBtn;

        // Add animation classes
        logo.classList.add('animate-fly-up');
        btn.classList.add('fade-out');

        // Wait for animation
        setTimeout(() => {
            startNewRequest();
            
            // Reset classes (so it's ready if we come back)
            // Use a small delay to ensure it's hidden before resetting opacity
            setTimeout(() => {
                logo.classList.remove('animate-fly-up');
                btn.classList.remove('fade-out');
            }, 100); 
        }, 600);
    });
    
    chatDetailsBtn.addEventListener('click', showDetails);
    mobileDetailsBtn.addEventListener('click', showDetails);
    
    mobileBackBtn.addEventListener('click', () => {
        mobileChatOverlay.classList.add('hidden');
        activeRequestId = null;
        isCreatingNew = false;
    });

    // Modal Actions
    detailsCloseBtn.addEventListener('click', () => detailsModal.classList.add('hidden'));
    
    modalCancelBtn.addEventListener('click', () => {
        requestToCancelId = activeRequestId; // Set target
        detailsModal.classList.add('hidden');
        confirmModal.classList.remove('hidden');
    });
    
    confirmCancelBtnView.addEventListener('click', () => {
        requestToCancelId = activeRequestId;
        confirmModal.classList.remove('hidden');
    });

    confirmCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        requestToCancelId = null;
    });
    
    confirmActionBtn.addEventListener('click', async () => {
        if (!requestToCancelId) return;
        
        const originalText = confirmActionBtn.innerText;
        confirmActionBtn.innerText = 'Cancelling...';
        confirmActionBtn.disabled = true;

        try {
            const token = currentUser ? await currentUser.getIdToken() : null;
            const functionUrl = 'https://cancelrequest-bnvo6soxla-uc.a.run.app';
            await fetch(functionUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ requestId: requestToCancelId }),
            });
            
            confirmModal.classList.add('hidden');
            
            // If we cancelled the currently active request, clear the view
            if (activeRequestId === requestToCancelId) {
                activeRequestId = null;
                emptyState.classList.remove('hidden');
                confirmationView.classList.add('hidden');
                chatMessages.classList.add('hidden');
                chatHeader.classList.add('hidden');
                chatInputArea.classList.add('hidden');
                mobileChatOverlay.classList.add('hidden');
            }
            
            requestToCancelId = null;

        } catch (e) {
            alert('Failed to cancel request');
            console.error(e);
        } finally {
            confirmActionBtn.innerText = originalText;
            confirmActionBtn.disabled = false;
        }
    });

    // Request List Event Delegation (Menu handling)
    requestsList.addEventListener('click', (e) => {
        // Handle Menu Button Click
        const menuBtn = e.target.closest('.menu-btn');
        if (menuBtn) {
            e.stopPropagation(); // Prevent selection
            const id = menuBtn.dataset.id;
            const menu = document.getElementById(`menu-${id}`);
            
            // Close all other menus
            document.querySelectorAll('.menu-dropdown').forEach(el => {
                if (el !== menu) el.classList.add('hidden');
            });
            
            if (menu) menu.classList.toggle('hidden');
            return;
        }

        // Handle Cancel Action Click
        const cancelBtn = e.target.closest('.cancel-request-action');
        if (cancelBtn) {
            e.stopPropagation();
            const id = cancelBtn.dataset.id;
            // Close menu
            const menu = document.getElementById(`menu-${id}`);
            if (menu) menu.classList.add('hidden');
            
            // Show confirm modal
            requestToCancelId = id;
            confirmModal.classList.remove('hidden');
            return;
        }
    });

    // --- Onboarding Logic ---
    onboardStartBtn.addEventListener('click', () => {
        onboardStep0.classList.add('hidden');
        onboardStepHow.classList.remove('hidden');
    });

    onboardHowNextBtn.addEventListener('click', () => {
        onboardStepHow.classList.add('hidden');
        onboardStep1.classList.remove('hidden');
    });

    onboardStep1Next.addEventListener('click', () => {
        if (!onboardAddressInput.value.trim()) {
            onboardAddressInput.classList.add('ring-2', 'ring-red-500');
            return;
        }
        onboardStep1.classList.add('hidden');
        onboardStep2.classList.remove('hidden');
    });
    
    onboardAddressInput.addEventListener('input', () => onboardAddressInput.classList.remove('ring-2', 'ring-red-500'));

    onboardStep2Back.addEventListener('click', () => {
        onboardStep2.classList.add('hidden');
        onboardStep1.classList.remove('hidden');
    });
    
    onboardPhoneInput.addEventListener('input', () => onboardPhoneInput.classList.remove('ring-2', 'ring-red-500'));

    onboardFinishBtn.addEventListener('click', async () => {
        if (!onboardPhoneInput.value.trim()) {
            onboardPhoneInput.classList.add('ring-2', 'ring-red-500');
            return;
        }
        
        onboardFinishBtn.disabled = true;
        onboardFinishBtn.textContent = 'Saving...';
        
        try {
            await db.collection('users').doc(currentUser.uid).set({
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
                address: onboardAddressInput.value.trim(),
                phoneNumber: window.formatPhoneNumber(onboardPhoneInput.value.trim()),
                onboardingCompleted: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            onboardingModal.classList.add('hidden');
            
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("Error saving profile. Please try again.");
            onboardFinishBtn.disabled = false;
            onboardFinishBtn.textContent = 'All Set!';
        }
    });

    // --- Header Actions ---
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('hidden');
    });

    signOutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '../login.html';
        });
    });

    // Close user dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
    });

    // --- Auth & Data Listener ---
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;

            // Check Onboarding Status
            db.collection('users').doc(user.uid).get().then(doc => {
                const data = doc.data();
                if (!doc.exists || !data || !data.address || !data.phoneNumber) {
                    // Show Onboarding Modal
                    onboardingModal.classList.remove('hidden');
                    // Pre-fill if partial
                    if (data && data.address) onboardAddressInput.value = data.address;
                    if (data && data.phoneNumber) onboardPhoneInput.value = data.phoneNumber;
                }
            });

            // Update Header
            if (userNameEl) userNameEl.textContent = user.displayName || 'User';
            if (userPhotoEl && user.photoURL) {
                userPhotoEl.src = user.photoURL;
            }
            
            // Start Firestore Listener (Filtered by User)
            if (unsubscribeFirestore) unsubscribeFirestore();
            
            unsubscribeFirestore = db.collection('requests')
                .where('userId', '==', user.uid)
                .orderBy('timestamp', 'desc')
                .onSnapshot((snapshot) => {
                    renderRequestsList(snapshot);

                    // Safeguard: If no requests exist and we aren't creating a new one, force empty state
                    if (snapshot.empty && !isCreatingNew) {
                        activeRequestId = null;
                        emptyState.classList.remove('hidden');
                        confirmationView.classList.add('hidden');
                        chatMessages.classList.add('hidden');
                        chatHeader.classList.add('hidden');
                        chatInputArea.classList.add('hidden');
                        mobileChatOverlay.classList.add('hidden');
                        return;
                    }
                    
                    // Check if we are waiting for a new request to appear in the snapshot
                    if (isCreatingNew && activeRequestId && activeRequestId !== 'new' && requestsCache[activeRequestId]) {
                        isCreatingNew = false;
                    }

                    // If we have an active request selected, update its chat view
                    if (activeRequestId && !isCreatingNew) {
                        const data = requestsCache[activeRequestId];
                        if (data) {
                            
                            if (data.status === 'scheduled') {
                                // Switch to Confirmation View
                                chatMessages.classList.add('hidden');
                                chatInputArea.classList.add('hidden');
                                confirmationView.classList.remove('hidden');
                                
                                confirmProvider.textContent = data.providerName || 'Service Provider';
                                let dateStr = 'TBD';
                                if (data.serviceDate) {
                                    const d = new Date(data.serviceDate);
                                    dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                }
                                confirmTime.textContent = dateStr;
                            } else {
                                // Switch to Chat View
                                confirmationView.classList.add('hidden');
                                chatMessages.classList.remove('hidden');
                                chatInputArea.classList.remove('hidden');
                                
                                // Update Chat History
                                renderChatHistory(data.chat_history);
                            }
                            
                            // Update Headers/Status/Description
                            chatTitle.textContent = data.title || 'Request';
                            chatDescription.textContent = data.summary || 'No details yet...';
                        } else {
                            // Switch to Chat View
                            confirmationView.classList.add('hidden');
                            chatMessages.classList.remove('hidden');
                            chatInputArea.classList.remove('hidden');
                            
                            // Update Chat History
                            renderChatHistory(data.chat_history);
                        }
                    }
                }, (error) => {
                    console.error("Error fetching requests: ", error);
                    if (error.code === 'failed-precondition') {
                         console.error("Index needed:", error);
                    }
                    requestsList.innerHTML = '<p class="text-red-500 p-4 text-center">Could not connect to server.</p>';
                });

        } else {
            // Redirect
            window.location.href = '../login.html';
        }
    });

});
