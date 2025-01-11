export class SidebarManager {
    constructor() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'sidebar-overlay';
        document.body.appendChild(this.overlay);

        this.leftSidebar = document.querySelector('.left-sidebar');
        this.rightSidebar = document.querySelector('.right-sidebar');

        const leftToggles = document.querySelectorAll('.left-toggle');
        const rightToggles = document.querySelectorAll('.right-toggle');

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

        this.overlay.addEventListener('click', () => {
            this.closeSidebars();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSidebars();
            }
        });

        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 1220;
            
            if (isMobile) {
                this.closeSidebars();
            } else {
                this.leftSidebar?.classList.remove('show');
                this.rightSidebar?.classList.remove('show');
                this.overlay?.classList.remove('show');
            }
        });

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
