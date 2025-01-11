export class SidebarManager {
    constructor() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'sidebar-overlay';
        document.body.appendChild(this.overlay);

        // Get sidebars
        this.leftSidebar = document.querySelector('.left-sidebar');
        this.rightSidebar = document.querySelector('.right-sidebar');

        // Get toggle buttons
        const leftToggles = document.querySelectorAll('.left-toggle');
        const rightToggles = document.querySelectorAll('.right-toggle');

        // Add click handlers
        leftToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSidebar('left');
            });
        });

        rightToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSidebar('right');
            });
        });

        // Close on overlay click
        this.overlay.addEventListener('click', () => {
            this.closeSidebars();
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSidebars();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 1220;
            
            // If transitioning to mobile, hide sidebars
            if (isMobile) {
                this.closeSidebars();
            } else {
                // If transitioning to desktop, show sidebars without overlay
                this.leftSidebar?.classList.remove('show');
                this.rightSidebar?.classList.remove('show');
                this.overlay?.classList.remove('show');
            }
        });

        // Initial setup
        if (window.innerWidth <= 1220) {
            this.closeSidebars();
        }
    }

    toggleSidebar(side) {
        const sidebar = side === 'left' ? this.leftSidebar : this.rightSidebar;
        const otherSidebar = side === 'left' ? this.rightSidebar : this.leftSidebar;
        const isMobile = window.innerWidth <= 1220;

        if (sidebar.classList.contains('show')) {
            sidebar.classList.remove('show');
            if (!otherSidebar.classList.contains('show')) {
                this.overlay.classList.remove('show');
            }
        } else {
            if (isMobile) {
                // On mobile, close other sidebar first
                otherSidebar.classList.remove('show');
            }
            sidebar.classList.add('show');
            if (isMobile) {
                this.overlay.classList.add('show');
            }
        }
    }

    closeSidebars() {
        this.leftSidebar?.classList.remove('show');
        this.rightSidebar?.classList.remove('show');
        this.overlay?.classList.remove('show');
    }
}
