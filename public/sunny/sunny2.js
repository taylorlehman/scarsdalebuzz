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
        // Updated to use text/icons in the render function, but keeping generic logic here if needed
        return status;
    };

    const formatTime = (date) => {
        if (!date) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date) => {
        if (!date) return '';
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
                <div class="text-center p-6 text-scandi-muted font-mono text-xs uppercase tracking-widest mt-10">
                    <p>No active matters.</p>
                    <p class="mt-2 opacity-60">Initiate a request above.</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            requestsCache[doc.id] = data;
            
            const isActive = doc.id === activeRequestId;
            const div = document.createElement('div');
            
            // New Scandi Sidebar Item Style
            div.className = `group p-4 rounded-sm cursor-pointer transition-all duration-300 border-l-2 relative ${isActive ? 'bg-white border-scandi-clay shadow-soft' : 'bg-transparent border-transparent hover:bg-white/50 hover:border-scandi-line'}`;
            div.dataset.id = doc.id;
            div.onclick = () => selectRequest(doc.id);

            const title = data.title || 'Untitled Request';
            const status = data.status || 'Active';
            // Use timestamp for date if available
            let dateStr = 'Today';
            if (data.timestamp) {
                const d = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                dateStr = formatDate(d);
            }

            div.innerHTML = `
                <div class="flex justify-between items-start mb-1 pr-6">
                    <h3 class="font-serif text-lg leading-tight truncate w-full ${isActive ? 'text-scandi-text' : 'text-scandi-muted group-hover:text-scandi-text'}">${title}</h3>
                    ${isActive ? '<div class="w-1.5 h-1.5 rounded-full bg-scandi-clay mt-2 flex-shrink-0 ml-2"></div>' : ''}
                </div>
                <div class="flex justify-between items-center text-xs">
                    <span class="uppercase tracking-widest font-medium ${isActive ? 'text-scandi-clay' : 'text-scandi-muted'}">${status}</span>
                    <span class="font-mono text-scandi-muted opacity-60">${dateStr}</span>
                </div>

                <!-- Menu Button (Bottom Right) -->
                <button class="menu-btn absolute right-2 bottom-2 p-1 text-scandi-muted hover:text-scandi-text hover:bg-scandi-bg rounded-sm transition z-10 opacity-0 group-hover:opacity-100 focus:opacity-100" data-id="${doc.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
                
                <!-- Dropdown Menu -->
                <div id="menu-${doc.id}" class="menu-dropdown hidden absolute right-2 top-8 bg-white shadow-hover border border-scandi-line rounded-sm z-20 w-40 py-1 overflow-hidden">
                    <button class="cancel-request-action w-full text-left px-4 py-3 text-xs uppercase tracking-widest text-red-800 hover:bg-red-50 font-medium flex items-center gap-2" data-id="${doc.id}">
                        Cancel Request
                    </button>
                </div>
            `;
            
            requestsList.appendChild(div);
        });
    };

    const renderMessage = (role, text, timestamp) => {
        const isUser = role === 'You' || role === 'User';
        const timeString = timestamp ? formatTime(timestamp.toDate ? timestamp.toDate() : new Date(timestamp)) : '';

        // Avatar Initials
        let userInitial = 'U';
        if (currentUser && currentUser.displayName) userInitial = currentUser.displayName[0].toUpperCase();

        return `
            <div class="flex gap-4 py-6 fade-in group ${!isUser ? 'bg-scandi-bg/30 -mx-8 px-8' : ''}">
                <!-- Avatar -->
                <div class="w-8 flex-shrink-0 pt-1">
                    ${isUser ? 
                        `<div class="w-8 h-8 rounded-full bg-scandi-text text-white flex items-center justify-center font-serif italic text-sm">${userInitial}</div>` : 
                        `<div class="w-8 h-8 rounded-full bg-scandi-clay text-white flex items-center justify-center"><span class="font-bold text-xs">S</span></div>`
                    }
                </div>

                <!-- Content -->
                <div class="flex-grow max-w-2xl">
                    <div class="flex items-baseline justify-between mb-2">
                        <span class="text-sm font-medium tracking-wide ${isUser ? 'text-scandi-text' : 'text-scandi-clay'}">${isUser ? 'You' : 'Sunny'}</span>
                        <span class="text-xs font-mono text-scandi-muted opacity-0 group-hover:opacity-100 transition-opacity">${timeString}</span>
                    </div>
                    <p class="text-base leading-relaxed whitespace-pre-wrap ${isUser ? 'font-serif text-scandi-text' : 'font-sans text-scandi-text'}">${text}</p>
                </div>
            </div>
        `;
    };

    const renderChatHistory = (chatHistory, targetContainer = null) => {
        const container = targetContainer || (window.innerWidth < 768 ? mobileChatMessages : chatMessages);
        container.innerHTML = '';
        
        if (!chatHistory || chatHistory.length === 0) {
            container.innerHTML = '<div class="text-center text-scandi-muted italic mt-10 font-serif">No transcript available.</div>';
            return;
        }

        // Sort chronologically
        const sortedHistory = [...chatHistory].sort((a, b) => {
            const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
            const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
            return tA - tB;
        });

        let html = '';
        sortedHistory.forEach(msg => {
            const isVisible = 
                (msg.sender === 'User') || 
                (msg.receiver === 'User') ||
                (!msg.sender && (msg.role === 'User' || msg.role === 'Sunny'));

            if (isVisible) {
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
        if (activeRequestId === requestId && !isCreatingNew) return;

        // Reset Placeholder
        chatInput.placeholder = "Type a message to Sunny...";
        mobileChatInput.placeholder = "Type a message...";

        isCreatingNew = false;
        activeRequestId = requestId;
        const data = requestsCache[requestId];

        if (!data) return;

        // Update Desktop UI
        emptyState.classList.add('hidden');
        chatHeader.classList.remove('hidden');
        
        if (data.status === 'scheduled') {
            chatMessages.classList.add('hidden');
            chatInputArea.classList.add('hidden');
            confirmationView.classList.remove('hidden');
            
            confirmProvider.textContent = data.providerName || 'Service Provider';
            confirmProviderContact.textContent = data.providerName || 'the provider';
            if (data.providerPhoneNumber) {
                confirmPhone.textContent = data.providerPhoneNumber;
                confirmPhone.href = `tel:${data.providerPhoneNumber}`;
            } else {
                confirmPhone.textContent = 'support';
                confirmPhone.href = '#';
            }
            
            let dateStr = 'TBD';
            if (data.serviceDate) {
                const d = new Date(data.serviceDate);
                dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
            confirmTime.textContent = dateStr;

        } else {
            confirmationView.classList.add('hidden');
            chatMessages.classList.remove('hidden');
            chatInputArea.classList.remove('hidden');
            renderChatHistory(data.chat_history);
        }
        
        chatTitle.textContent = data.title || 'Request';
        chatDescription.textContent = data.summary || 'Details...';
        chatStatus.innerHTML = `<span class="uppercase tracking-widest text-xs">${data.status}</span>`;

        // Update Mobile UI
        if (window.innerWidth < 768) {
            mobileChatOverlay.classList.remove('hidden');
            mobileChatTitle.textContent = data.title || 'Request';
            mobileChatStatus.textContent = data.status;
            renderChatHistory(data.chat_history, mobileChatMessages);
        }
        
        // Re-render requests list to update active state styling
        // We need to re-fetch or just update classes. 
        // For simplicity, finding the element is easiest if we don't want to re-render all.
        // But renderRequestsList is fast enough for now, or we rely on Firestore update trigger.
        // Actually, we should manually update the UI selection to be instant:
        document.querySelectorAll('.request-item').forEach(el => {
             // Logic to toggle classes would be complex here due to the many classes.
             // We rely on Firestore listener update (which might be slow) OR we force a re-render from cache
             // Re-rendering from cache:
             // renderRequestsList({ empty: false, forEach: (cb) => Object.values(requestsCache).forEach(d => cb({data:()=>d, id:??})) });
             // Too complex to mock snapshot. Let's just wait for real data or modify styles manually.
        });
        // We will just let the click handler set the ID. 
        // The renderRequestsList logic uses `activeRequestId` to set classes.
        // So we can just call renderRequestsList with current data if we had the snapshot.
        // We don't have the snapshot easily available.
        // Simple fix: Reload via cache simulation?
        // Actually, since `requestsCache` has data, we can rebuild the list.
        const mockSnapshot = {
            empty: Object.keys(requestsCache).length === 0,
            forEach: (cb) => {
                Object.keys(requestsCache).forEach(id => {
                    cb({ id, data: () => requestsCache[id] });
                });
            }
        };
        renderRequestsList(mockSnapshot);
    };

    const startNewRequest = () => {
        isCreatingNew = true;
        activeRequestId = 'new';
        
        const promptText = "Describe your issue! Include urgency and availability.";
        chatInput.placeholder = promptText;
        mobileChatInput.placeholder = promptText;

        emptyState.classList.add('hidden');
        confirmationView.classList.add('hidden');
        chatMessages.classList.remove('hidden');
        chatHeader.classList.remove('hidden');
        chatInputArea.classList.remove('hidden');
        
        chatTitle.textContent = 'New Matter';
        chatDescription.textContent = 'Initiating protocol...';
        chatStatus.innerHTML = '✨ DRAFTING';
        
        const introHtml = `
            <div class="flex gap-4 py-6 fade-in bg-scandi-bg/30 -mx-8 px-8">
                <div class="w-8 flex-shrink-0 pt-1">
                    <div class="w-8 h-8 rounded-full bg-scandi-clay text-white flex items-center justify-center"><span class="font-bold text-xs">S</span></div>
                </div>
                <div class="flex-grow max-w-2xl">
                    <div class="flex items-baseline justify-between mb-2">
                         <span class="text-sm font-medium tracking-wide text-scandi-clay">Sunny</span>
                    </div>
                    <p class="text-base leading-relaxed font-sans text-scandi-text">
                        How can I assist with your home today? Please describe the issue.
                    </p>
                </div>
            </div>
        `;

        chatMessages.innerHTML = introHtml;

        if (window.innerWidth < 768) {
            mobileChatOverlay.classList.remove('hidden');
            mobileChatTitle.textContent = 'New Matter';
            mobileChatStatus.textContent = 'DRAFTING';
            mobileChatMessages.innerHTML = introHtml;
        }
        
        setTimeout(() => {
            if (window.innerWidth < 768) {
                mobileChatInput.focus();
            } else {
                chatInput.focus();
            }
        }, 100);
        
        // Update sidebar selection
        const mockSnapshot = {
            empty: Object.keys(requestsCache).length === 0,
            forEach: (cb) => {
                Object.keys(requestsCache).forEach(id => {
                    cb({ id, data: () => requestsCache[id] });
                });
            }
        };
        renderRequestsList(mockSnapshot);
    };

    const handleSendMessage = async (text) => {
        if (!text.trim()) return;
        
        const inputField = window.innerWidth < 768 ? mobileChatInput : chatInput;
        const container = window.innerWidth < 768 ? mobileChatMessages : chatMessages;
        
        inputField.value = '';
        inputField.style.height = 'auto';

        // Optimistic Render
        const tempMsgHtml = renderMessage('You', text, new Date());
        container.insertAdjacentHTML('beforeend', tempMsgHtml);
        scrollToBottom(container);

        if (isCreatingNew) {
            const loadingId = 'loading-' + Date.now();
            container.insertAdjacentHTML('beforeend', `
                <div id="${loadingId}" class="flex gap-4 py-6 fade-in bg-scandi-bg/30 -mx-8 px-8 opacity-70">
                     <div class="w-8 flex-shrink-0 pt-1">
                          <div class="w-8 h-8 rounded-full bg-scandi-clay text-white flex items-center justify-center"><span class="font-bold text-xs">S</span></div>
                     </div>
                     <div class="flex items-center gap-2 text-scandi-muted font-mono text-sm">
                          <div class="animate-spin h-3 w-3 border-2 border-scandi-clay border-t-transparent rounded-full"></div>
                          <span>Sunny is thinking...</span>
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
                
                document.getElementById(loadingId)?.remove();
                
                container.insertAdjacentHTML('beforeend', renderMessage('Sunny', replyText, new Date()));
                scrollToBottom(container);
                
                activeRequestId = newId;
                chatInput.placeholder = "Type a message...";
                mobileChatInput.placeholder = "Type a message...";

            } catch (error) {
                document.getElementById(loadingId)?.remove();
                alert('Error submitting request: ' + error.message);
            }

        } else {
             const loadingId = 'loading-' + Date.now();
            container.insertAdjacentHTML('beforeend', `
                <div id="${loadingId}" class="flex gap-4 py-6 fade-in bg-scandi-bg/30 -mx-8 px-8 opacity-70">
                     <div class="w-8 flex-shrink-0 pt-1">
                          <div class="w-8 h-8 rounded-full bg-scandi-clay text-white flex items-center justify-center"><span class="font-bold text-xs">S</span></div>
                     </div>
                     <div class="flex items-center gap-2 text-scandi-muted font-mono text-sm">
                          <div class="animate-spin h-3 w-3 border-2 border-scandi-clay border-t-transparent rounded-full"></div>
                          <span>Sending reply...</span>
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
                document.getElementById(loadingId)?.remove();
                
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

    mobileChatInput.addEventListener('input', () => autoResizeTextarea(mobileChatInput));
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

    newRequestBtn.addEventListener('click', startNewRequest);
    emptyStateNewBtn.addEventListener('click', startNewRequest);
    
    chatDetailsBtn.addEventListener('click', showDetails);
    mobileDetailsBtn.addEventListener('click', showDetails);
    
    mobileBackBtn.addEventListener('click', () => {
        mobileChatOverlay.classList.add('hidden');
        activeRequestId = null;
        isCreatingNew = false;
    });

    detailsCloseBtn.addEventListener('click', () => detailsModal.classList.add('hidden'));
    
    modalCancelBtn.addEventListener('click', () => {
        requestToCancelId = activeRequestId;
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

    requestsList.addEventListener('click', (e) => {
        const menuBtn = e.target.closest('.menu-btn');
        if (menuBtn) {
            e.stopPropagation();
            const id = menuBtn.dataset.id;
            const menu = document.getElementById(`menu-${id}`);
            document.querySelectorAll('.menu-dropdown').forEach(el => {
                if (el !== menu) el.classList.add('hidden');
            });
            if (menu) menu.classList.toggle('hidden');
            return;
        }

        const cancelBtn = e.target.closest('.cancel-request-action');
        if (cancelBtn) {
            e.stopPropagation();
            const id = cancelBtn.dataset.id;
            const menu = document.getElementById(`menu-${id}`);
            if (menu) menu.classList.add('hidden');
            requestToCancelId = id;
            confirmModal.classList.remove('hidden');
            return;
        }
    });

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
            onboardAddressInput.classList.add('border-red-500');
            return;
        }
        onboardStep1.classList.add('hidden');
        onboardStep2.classList.remove('hidden');
    });
    
    onboardAddressInput.addEventListener('input', () => onboardAddressInput.classList.remove('border-red-500'));

    onboardStep2Back.addEventListener('click', () => {
        onboardStep2.classList.add('hidden');
        onboardStep1.classList.remove('hidden');
    });
    
    onboardPhoneInput.addEventListener('input', () => onboardPhoneInput.classList.remove('border-red-500'));

    onboardFinishBtn.addEventListener('click', async () => {
        if (!onboardPhoneInput.value.trim()) {
            onboardPhoneInput.classList.add('border-red-500');
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
                phoneNumber: window.formatPhoneNumber ? window.formatPhoneNumber(onboardPhoneInput.value.trim()) : onboardPhoneInput.value.trim(),
                onboardingCompleted: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            onboardingModal.classList.add('hidden');
            
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("Error saving profile. Please try again.");
            onboardFinishBtn.disabled = false;
            onboardFinishBtn.textContent = 'Complete Setup';
        }
    });

    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('hidden');
    });

    signOutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '../login.html';
        });
    });

    document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
        if (!e.target.closest('.menu-btn') && !e.target.closest('.menu-dropdown')) {
             document.querySelectorAll('.menu-dropdown').forEach(el => el.classList.add('hidden'));
        }
    });

    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            db.collection('users').doc(user.uid).get().then(doc => {
                const data = doc.data();
                if (!doc.exists || !data || !data.address || !data.phoneNumber) {
                    onboardingModal.classList.remove('hidden');
                    if (data && data.address) onboardAddressInput.value = data.address;
                    if (data && data.phoneNumber) onboardPhoneInput.value = data.phoneNumber;
                }
            });

            if (userNameEl) userNameEl.textContent = user.displayName || 'User';
            if (userPhotoEl && user.photoURL) {
                userPhotoEl.src = user.photoURL;
            }
            
            if (unsubscribeFirestore) unsubscribeFirestore();
            
            unsubscribeFirestore = db.collection('requests')
                .where('userId', '==', user.uid)
                .orderBy('timestamp', 'desc')
                .onSnapshot((snapshot) => {
                    renderRequestsList(snapshot);

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
                    
                    if (isCreatingNew && activeRequestId && activeRequestId !== 'new' && requestsCache[activeRequestId]) {
                        isCreatingNew = false;
                    }

                    if (activeRequestId && !isCreatingNew) {
                        const data = requestsCache[activeRequestId];
                        if (data) {
                            if (data.status === 'scheduled') {
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
                                confirmationView.classList.add('hidden');
                                chatMessages.classList.remove('hidden');
                                chatInputArea.classList.remove('hidden');
                                renderChatHistory(data.chat_history);
                            }
                            
                            chatTitle.textContent = data.title || 'Request';
                            chatDescription.textContent = data.summary || 'Details...';
                            
                            // Re-run selection to highlight correct item
                             const mockSnapshot = {
                                empty: Object.keys(requestsCache).length === 0,
                                forEach: (cb) => {
                                    Object.keys(requestsCache).forEach(id => {
                                        cb({ id, data: () => requestsCache[id] });
                                    });
                                }
                            };
                            renderRequestsList(mockSnapshot);
                        }
                    }
                }, (error) => {
                    console.error("Error fetching requests: ", error);
                    requestsList.innerHTML = '<p class="text-red-500 p-4 text-center">Could not connect to ledger.</p>';
                });

        } else {
            window.location.href = '../login.html';
        }
    });

});
