document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase
    firebase.initializeApp(window.firebaseConfig);
    const db = firebase.firestore();

    // Get DOM elements
    const issueDescription = document.getElementById('issue-description');
    const submitButton = document.getElementById('submit-request');
    const requestsList = document.getElementById('requests-list');
    const loadingModal = document.getElementById('loading-modal');
    const wittyMessage = document.getElementById('witty-message');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    const detailsModal = document.getElementById('details-modal');
    const detailsCloseBtn = document.getElementById('details-close-btn');
    const detailsCancelRequestBtn = document.getElementById('details-cancel-request-btn');

    const wittyMessages = [
        "Searching for a pro who isn't 'booked until 2026'...",
        "Consulting the ancient scrolls of 'Who Actually Shows Up on Time'...",
        "Deciphering contractor voicemail hieroglyphics...",
        "Bribing the scheduler with virtual cookies...",
        "Scanning for work vans in a 5-mile radius...",
    ];
    let messageInterval;
    let actionToConfirm = null;
    let requestsData = {}; // Cache for request data

    // --- Modal Functions ---
    const showModal = () => {
        let lastIndex = -1;
        
        const getRandomMessage = () => {
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * wittyMessages.length);
            } while (newIndex === lastIndex && wittyMessages.length > 1);
            lastIndex = newIndex;
            return wittyMessages[newIndex];
        };

        wittyMessage.textContent = getRandomMessage();
        loadingModal.classList.remove('hidden');
        
        messageInterval = setInterval(() => {
            wittyMessage.textContent = getRandomMessage();
        }, 2500);
    };

    const hideModal = () => {
        loadingModal.classList.add('hidden');
        clearInterval(messageInterval);
    };

    const showConfirmModal = (action) => {
        actionToConfirm = action;
        confirmModal.classList.remove('hidden');
    };

    const showDetailsModal = (requestId) => {
        const data = requestsData[requestId];
        if (!data) return;

        // Populate standard fields
        document.getElementById('details-title').textContent = data.title || 'Untitled Request';
        document.getElementById('details-summary').textContent = data.summary || 'No updates yet.';
        document.getElementById('details-user-request').textContent = data.chat_history.find(m => m.role === 'User')?.message || 'No description provided.';
        
        // Populate Provider Info
        document.getElementById('details-provider-name').textContent = data.providerName || 'Finding a pro...';
        document.getElementById('details-provider-phone').textContent = data.providerPhoneNumber || '';
        
        // Update status badge
        const statusBadge = document.getElementById('details-status-badge');
        const statusEmoji = document.getElementById('details-status-emoji');
        const statusText = document.getElementById('details-status-text');

        statusEmoji.textContent = getStatusEmoji(data.status);
        statusText.textContent = data.status;
        statusBadge.className = `inline-flex items-center gap-2 text-white font-bold py-1 px-3 rounded-full text-sm status-${data.status.replace(/ /g, '-')}`;

        // Handle 'User Action Required' state
        const userActionSection = document.getElementById('details-user-action-section');
        if (data.status === 'user action required') {
            const providerQuestion = data.chat_history.filter(m => m.role === 'Service Provider').pop()?.message || 'No question found.';
            document.getElementById('details-provider-question').textContent = `"${providerQuestion}"`;
            userActionSection.classList.remove('hidden');
        } else {
            userActionSection.classList.add('hidden');
        }

        // Store the requestId on the cancel button for later use
        detailsCancelRequestBtn.dataset.requestId = requestId;

        detailsModal.classList.remove('hidden');
    };

    const hideDetailsModal = () => {
        detailsModal.classList.add('hidden');
    };

    detailsCloseBtn.addEventListener('click', hideDetailsModal);
    detailsModal.addEventListener('click', (e) => {
        if (e.target.id === 'details-modal') { // Click on the overlay
            hideDetailsModal();
        }
    });

    const userResponseForm = document.getElementById('user-response-form');
    userResponseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const response = e.target.elements.response.value;
        const requestId = document.getElementById('details-cancel-request-btn').dataset.requestId;
        const userActionSection = document.getElementById('details-user-action-section');

        // Show spinner
        userActionSection.innerHTML = '<div class="spinner"></div>';

        // Make API call to new cloud function
        const functionUrl = 'https://handleuserresponse-bnvo6soxla-uc.a.run.app';
        fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                requestId: requestId,
                response: response,
            }),
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('Network response was not ok');
            }
            return res.json();
        })
        .then(data => {
            // The onSnapshot listener will automatically update the UI.
            // No need to manually refresh, but we'll log for debugging.
            console.log('Response submitted successfully:', data);
        })
        .catch(error => {
            console.error('Error submitting response:', error);
            userActionSection.innerHTML = '<p class="text-red-500">Error submitting response. Please try again.</p>';
        });
    });

    detailsCancelRequestBtn.addEventListener('click', (e) => {
        const requestId = e.target.dataset.requestId;
        hideDetailsModal(); // Hide details modal first
        // Trigger the existing confirmation flow
        const cancelButton = document.querySelector(`.request-item[data-id="${requestId}"] .cancel-button`);
        cancelButton?.click();
    });

    const hideConfirmModal = () => {
        actionToConfirm = null;
        confirmModal.classList.add('hidden');
    };

    confirmCancelBtn.addEventListener('click', hideConfirmModal);
    confirmActionBtn.addEventListener('click', () => {
        if (actionToConfirm) {
            actionToConfirm();
        }
        hideConfirmModal();
    });

    // --- Rendering Functions ---
    const getStatusEmoji = (status) => {
        switch (status) {
            case 'in progress': return '🕵️'; // Detective
            case 'scheduled': return '🗓️'; // Calendar
            case 'user action required': return '⚠️'; // Warning
            case 'provider unavailable': return '🚫'; // Prohibited
            case 'closed': return '🏁'; // Checkered Flag
            default: return '⚪';
        }
    };

    const renderRequests = (requests) => {
        requestsList.innerHTML = ''; // Clear the list
        requestsData = {}; // Clear and rebuild cache
        if (requests.empty) {
            requestsList.innerHTML = '<p class="text-stone-500 italic">No requests yet. Submit one to get started!</p>';
        } else {
            requests.forEach(doc => {
                const request = doc.data();
                requestsData[doc.id] = request; // Cache the full data

                const title = request.title || 'Untitled Request';
                const summary = request.summary || 'No summary available.';
                const li = document.createElement('li');
                li.className = 'request-item';
                if (request.status === 'user action required') {
                    li.classList.add('user-action-required');
                }
                li.dataset.id = doc.id;
                li.innerHTML = `
                    <div class="request-content">
                        <span class="status-emoji">${getStatusEmoji(request.status)}</span>
                        <div class="request-text">
                            <p class="request-title">${title}</p>
                            <p class="request-summary">${summary}</p>
                        </div>
                    </div>
                    <div class="overflow-menu-container">
                        <button class="overflow-menu-button">•••</button>
                        <div class="overflow-menu-dropdown hidden">
                            <a href="#" class="overflow-menu-item cancel-button">Cancel</a>
                        </div>
                    </div>
                `;
                requestsList.appendChild(li);
            });
        }
        // Hide the loading modal now that the UI has been updated.
        hideModal();
    };

    // --- Firestore & Event Listeners ---

    // Listen for real-time updates to requests
    db.collection('requests').orderBy('timestamp', 'desc').onSnapshot(renderRequests, (error) => {
        console.error("Error fetching requests: ", error);
        requestsList.innerHTML = '<p class="text-red-500">Could not load requests.</p>';
    });

    // Listen for submit button click
    submitButton.addEventListener('click', () => {
        const description = issueDescription.value;
        if (description.trim() === '') {
            alert('Please describe your issue.');
            return;
        }
        showModal();
        const functionUrl = 'https://submitrequest-bnvo6soxla-uc.a.run.app';
        fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: description,
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        })
        .then(text => {
            console.log('Server response:', text);
            issueDescription.value = '';
        })
        .catch(error => {
            hideModal();
            console.error('Error submitting request:', error);
            alert('Failed to submit request: ' + error.message);
        });
    });

    // Event delegation for request list actions
    requestsList.addEventListener('click', (e) => {
        // Handle opening the details modal
        const requestItem = e.target.closest('.request-item');
        if (requestItem && !e.target.closest('.overflow-menu-container')) {
            showDetailsModal(requestItem.dataset.id);
            return;
        }

        if (e.target.classList.contains('overflow-menu-button')) {
            const dropdown = e.target.nextElementSibling;
            document.querySelectorAll('.overflow-menu-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
            return;
        }

        if (e.target.classList.contains('cancel-button')) {
            e.preventDefault();
            const requestItem = e.target.closest('.request-item');
            const requestId = requestItem.dataset.id;

            showConfirmModal(() => {
                const functionUrl = 'https://cancelrequest-bnvo6soxla-uc.a.run.app';
                fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: requestId }),
                })
                .then(response => {
                    if (!response.ok) throw new Error('Failed to cancel request.');
                    console.log(`Request ${requestId} cancelled.`);
                })
                .catch(error => {
                    console.error('Error cancelling request:', error);
                    alert('There was an error cancelling the request.');
                });
            });
            document.querySelectorAll('.overflow-menu-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });

    // Hide overflow menus when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.overflow-menu-container')) {
            document.querySelectorAll('.overflow-menu-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });
});