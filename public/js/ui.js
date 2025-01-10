/**
 * UI Class - Handles all UI-related functionality
 */
export class UI {
    constructor() {
        // Main sections
        this.loginModal = document.getElementById('loginModal');
        this.chatInterface = document.getElementById('chatInterface');
        
        // User elements
        this.usernameDisplay = document.getElementById('userName');
        
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');
        
        // Login form
        this.loginForm = document.getElementById('loginForm');
        this.usernameInput = document.getElementById('username');
        
        // Event handlers
        this.onLogin = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.loginForm) {
            console.error('Login form not found!');
            return;
        }

        // Login form handling
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = this.usernameInput?.value?.trim();
            if (username && this.onLogin) {
                this.onLogin(username);
            }
        });
    }

    showLogin() {
        if (this.loginModal) {
            this.loginModal.classList.remove('hidden');
            this.loginModal.classList.add('flex');
        }
        if (this.chatInterface) {
            this.chatInterface.classList.add('hidden');
            this.chatInterface.classList.remove('flex');
        }
    }

    showChat() {
        if (this.loginModal) {
            this.loginModal.classList.add('hidden');
            this.loginModal.classList.remove('flex');
        }
        if (this.chatInterface) {
            this.chatInterface.classList.remove('hidden');
            this.chatInterface.classList.add('flex');
            this.chatInterface.style.display = 'flex';
        }
    }

    updateConnectionStatus(status, type = 'info') {
        if (this.connectionStatus) {
            this.connectionStatus.textContent = status;
            this.connectionStatus.className = `connection-status ${type}`;
        }
    }

    setUsername(username) {
        if (this.usernameDisplay) {
            this.usernameDisplay.textContent = username;
        }
    }

    on(event, handler) {
        this[`on${event.charAt(0).toUpperCase() + event.slice(1)}`] = handler;
    }
}
