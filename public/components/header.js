class SharedHeader {
    constructor(options = {}) {
        this.options = {
            activePage: 'directory', // 'directory' or 'sunny'
            rootPath: './',
            ...options
        };
        this.init();
    }

    init() {
        this.render();
        this.attachListeners();
        this.initAuth();
    }

    render() {
        const { activePage, rootPath } = this.options;
        const container = document.getElementById('header-container');
        if (!container) return;

        // Styles for active/inactive links
        const activeClass = "font-serif text-scandi-text font-medium border-b border-scandi-clay text-base tracking-wide";
        const inactiveClass = "font-serif text-scandi-muted hover:text-scandi-text transition-colors text-base tracking-wide";

        // Determine links
        const dirLink = activePage === 'directory' ? '#' : `${rootPath}directory/index.html`;
        const sunnyLink = activePage === 'sunny' ? '#' : `${rootPath}sunny/index.html`;

        const dirClass = activePage === 'directory' ? activeClass : inactiveClass;
        const sunnyClass = activePage === 'sunny' ? activeClass : inactiveClass;

        container.innerHTML = `
            <header class="shrink-0 h-20 bg-scandi-bg border-b border-scandi-line flex items-center justify-between px-8 z-50 fixed w-full top-0">
                <!-- Links -->
                <nav class="flex gap-8">
                    <a href="${dirLink}" class="${dirClass}">Directory</a>
                    <a href="${sunnyLink}" class="${sunnyClass}">Sunny</a>
                </nav>
                
                <!-- Logo -->
                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <img src="${rootPath}images/logo.png" alt="Scarsdale Buzz" class="h-10 w-auto opacity-80 hover:opacity-100 transition-opacity"> 
                </div>

                <!-- User Info -->
                <div class="relative">
                     <button id="user-menu-btn" class="flex items-center gap-3 hover:opacity-70 transition group">
                        <div class="text-right hidden md:block">
                            <div id="user-name" class="text-xs font-medium text-scandi-text font-mono uppercase tracking-widest">Guest</div>
                        </div>
                        <img id="user-photo" src="https://www.gravatar.com/avatar?d=mp" alt="User" class="w-8 h-8 rounded-full bg-scandi-stone object-cover border border-scandi-line group-hover:border-scandi-clay transition-colors">
                    </button>
                    <!-- Dropdown -->
                    <div id="user-dropdown" class="hidden absolute right-0 top-full mt-4 w-56 bg-white border border-scandi-line shadow-soft rounded-sm py-2 z-50">
                         <a href="${rootPath}account.html" class="block px-4 py-3 text-xs uppercase tracking-widest text-scandi-text hover:bg-scandi-bg font-mono">Account</a>
                        <a href="${rootPath}privacy.html" class="block px-4 py-3 text-xs uppercase tracking-widest text-scandi-text hover:bg-scandi-bg font-mono">Privacy Policy</a>
                        <button id="sign-out-btn" class="block w-full text-left px-4 py-3 text-xs uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-scandi-line mt-2 pt-2 font-mono">Sign Out</button>
                    </div>
                </div>
            </header>
        `;
    }

    attachListeners() {
        const userMenuBtn = document.getElementById('user-menu-btn');
        const userDropdown = document.getElementById('user-dropdown');
        const signOutBtn = document.getElementById('sign-out-btn');
        
        if (userMenuBtn) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('hidden');
            });
        }
        
        document.addEventListener('click', (e) => {
            if (userMenuBtn && !userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
            }
        });
    }

    initAuth() {
        if (typeof firebase === 'undefined') return;

        // Ensure Firebase is initialized
        if (!firebase.apps.length && window.firebaseConfig) {
            firebase.initializeApp(window.firebaseConfig);
        }

        if (firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                const nameEl = document.getElementById('user-name');
                const photoEl = document.getElementById('user-photo');
                const dropdown = document.getElementById('user-dropdown');
                
                if (user) {
                    if(nameEl) nameEl.textContent = user.displayName || 'User';
                    if(photoEl && user.photoURL) photoEl.src = user.photoURL;
                    
                    // Show User Menu Content
                    if (dropdown) {
                        dropdown.innerHTML = `
                             <a href="${this.options.rootPath}account.html" class="block px-4 py-3 text-xs uppercase tracking-widest text-scandi-text hover:bg-scandi-bg font-mono">Account</a>
                            <a href="${this.options.rootPath}privacy.html" class="block px-4 py-3 text-xs uppercase tracking-widest text-scandi-text hover:bg-scandi-bg font-mono">Privacy Policy</a>
                            <button id="sign-out-btn" class="block w-full text-left px-4 py-3 text-xs uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-scandi-line mt-2 pt-2 font-mono">Sign Out</button>
                        `;
                        // Re-attach sign out listener since we replaced innerHTML
                        const newSignOut = document.getElementById('sign-out-btn');
                        if (newSignOut) {
                            newSignOut.addEventListener('click', () => {
                                firebase.auth().signOut().then(() => {
                                    window.location.reload();
                                });
                            });
                        }
                    }
                } else {
                    if(nameEl) nameEl.textContent = 'Guest';
                    if(photoEl) photoEl.src = `https://www.gravatar.com/avatar?d=mp`;

                    // Show Guest Menu Content
                    if (dropdown) {
                        const currentUrl = encodeURIComponent(window.location.href);
                        const loginUrl = `${this.options.rootPath}login.html?redirect=${currentUrl}`;
                        
                        dropdown.innerHTML = `
                            <a href="${loginUrl}" class="block px-4 py-3 text-xs uppercase tracking-widest text-scandi-text hover:bg-scandi-bg font-mono font-bold">Sign In</a>
                            <a href="${this.options.rootPath}privacy.html" class="block px-4 py-3 text-xs uppercase tracking-widest text-scandi-text hover:bg-scandi-bg font-mono border-t border-scandi-line mt-2 pt-2">Privacy Policy</a>
                        `;
                    }
                }
            });
        }
    }
}
