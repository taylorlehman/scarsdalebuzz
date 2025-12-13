// Set Current Year
document.addEventListener('DOMContentLoaded', () => {
    const yearElement = document.getElementById('year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});

// Navigation Scroll Effect
const navbar = document.getElementById('navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('bg-[#F9F8F4]/90', 'backdrop-blur-md', 'border-b', 'border-[#E8E6E1]');
            navbar.classList.remove('bg-transparent');
        } else {
            navbar.classList.remove('bg-[#F9F8F4]/90', 'backdrop-blur-md', 'border-b', 'border-[#E8E6E1]');
            navbar.classList.add('bg-transparent');
        }
    });
}

// Mobile Menu Toggle
const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const iconMenu = document.getElementById('icon-menu');
const iconClose = document.getElementById('icon-close');
const mobileLinks = document.querySelectorAll('.mobile-link');
let isMenuOpen = false;

function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    if (isMenuOpen) {
        mobileMenu.classList.remove('hidden');
        mobileMenu.classList.add('flex');
        iconMenu.classList.add('hidden');
        iconClose.classList.remove('hidden');
    } else {
        mobileMenu.classList.add('hidden');
        mobileMenu.classList.remove('flex');
        iconMenu.classList.remove('hidden');
        iconClose.classList.add('hidden');
    }
}

if (menuBtn) {
    menuBtn.addEventListener('click', toggleMenu);
}

// Close menu when a link is clicked
if (mobileLinks.length > 0) {
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (isMenuOpen) toggleMenu();
        });
    });
}

// Hero Animation Logic
const btnViewDirectory = document.getElementById('btn-view-directory');
const btnMeetSunny = document.getElementById('btn-meet-sunny');
const cardDirectory = document.getElementById('hero-card-directory');
const cardSunny = document.getElementById('hero-card-sunny');

if (btnViewDirectory && btnMeetSunny && cardDirectory && cardSunny) {
    
    // Helper to set state
    const setCardState = (card, isFront) => {
        if (isFront) {
            card.style.zIndex = '30';
            card.style.transform = 'scale(1)';
            card.style.opacity = '1';
        } else {
            card.style.zIndex = '10';
            card.style.transform = 'scale(0.95)';
            card.style.opacity = '0.9';
        }
    };

    const bringDirectoryFront = () => {
        setCardState(cardDirectory, true);
        setCardState(cardSunny, false);
    };

    const bringSunnyFront = () => {
        setCardState(cardSunny, true);
        setCardState(cardDirectory, false);
    };

    // Event Listeners for Buttons
    btnViewDirectory.addEventListener('mouseenter', bringDirectoryFront);
    btnMeetSunny.addEventListener('mouseenter', bringSunnyFront);

    // Add click listeners to cards to toggle their z-index
    cardDirectory.addEventListener('click', (e) => {
        bringDirectoryFront();
    });
    cardSunny.addEventListener('click', (e) => {
        bringSunnyFront();
    });
    
    // Initialize State (Sunny Front by default based on HTML z-indexes, but let's enforce)
    // Initial HTML: Sunny z-10, Directory z-0. 
    // We want to match that visual start or enforce our new logic.
    // Let's enforce Sunny Front on load to match the design.
    bringSunnyFront();
}
