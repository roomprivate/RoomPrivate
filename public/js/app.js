import websocket from './websocket.js';
import { UI } from './ui.js';
import { generateUserColor } from './utils.js';

// Global state to store username
window.state = {
    username: localStorage.getItem('username') || '',
    userId: localStorage.getItem('userId') || crypto.randomUUID(),
    connected: false
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing app...');

    // Initialize login form
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const chatInterface = document.getElementById('chatInterface');
    const loginModal = document.getElementById('loginModal');

    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const username = usernameInput?.value.trim();
        console.log('Username submitted:', username);
        
        if (username) {
            // Save username and userId
            window.state.username = username;
            localStorage.setItem('username', username);
            localStorage.setItem('userId', window.state.userId);
            
            // Hide login modal
            if (loginModal) {
                loginModal.style.display = 'none';
            }
            
            // Show chat interface
            if (chatInterface) {
                chatInterface.style.display = 'flex';
            }

            // Update user info display
            const userInitials = document.getElementById('userInitials');
            const userName = document.getElementById('userName');
            if (userInitials) {
                userInitials.textContent = username.charAt(0).toUpperCase();
            }
            if (userName) {
                userName.textContent = username;
            }
        }
        
        return false;
    });

    // Initialize window modals
    window.modals = window.modals || {};

    // Initialize create room modal
    window.modals.createRoom = {
        modal: null,
        init() {
            this.modal = new Modal(document.getElementById('createRoomModal'));
            const form = document.getElementById('createRoomForm');
            
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                const nameInput = document.getElementById('createRoomName');
                const name = nameInput?.value.trim();
                const descriptionInput = document.getElementById('createRoomDescription');
                const description = descriptionInput?.value.trim();
                const passwordInput = document.getElementById('createRoomPassword');
                const password = passwordInput?.value.trim();
                const maxMembersInput = document.getElementById('createRoomMaxMembers');
                const maxMembers = parseInt(maxMembersInput?.value || '0', 10);
                
                if (name) {
                    websocket.send('create-room', {
                        name,
                        description,
                        password,
                        maxMembers: maxMembers > 0 ? maxMembers : 0,
                        creator: window.state.username
                    });
                    
                    if (nameInput) nameInput.value = '';
                    if (descriptionInput) descriptionInput.value = '';
                    if (passwordInput) passwordInput.value = '';
                    if (maxMembersInput) maxMembersInput.value = '';
                    this.close();
                }
            });
        },
        open() {
            this.modal?.show();
        },
        close() {
            this.modal?.hide();
        }
    };

    // Initialize join room modal
    window.modals.joinRoom = {
        modal: null,
        init() {
            console.log('Initializing join room modal...');
            this.modal = new Modal(document.getElementById('joinRoomModal'));
            const form = document.getElementById('joinRoomForm');
            
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                const roomIdInput = document.getElementById('joinRoomId');
                const roomId = roomIdInput?.value.trim();
                const roomPasswordInput = document.getElementById('joinRoomPassword');
                const password = roomPasswordInput?.value.trim() || '';
                
                console.log('Join room form submitted:', { roomId });
                
                if (roomId) {
                    websocket.send('join-room', {
                        roomId,
                        username: window.state.username,
                        password
                    });
                    
                    if (roomPasswordInput) roomPasswordInput.value = '';
                    if (roomIdInput) roomIdInput.value = '';
                    this.close();
                }
            });
        },
        open() {
            console.log('Opening join room modal...');
            this.modal?.show();
        },
        close() {
            this.modal?.hide();
        }
    };

    // Initialize modals
    window.modals.createRoom.init();
    window.modals.joinRoom.init();

    // Initialize room key storage
    window.roomKeys = new Map();

    try {
        // Connect to WebSocket server
        await websocket.connect();
        window.state.connected = true;

        // Check if username is set
        if (!window.state.username) {
            // Show login modal (it's already shown by default)
            if (loginModal && usernameInput) {
                loginModal.style.display = 'flex';
                usernameInput.focus();
            }
        } else {
            // Hide login modal
            if (loginModal) {
                loginModal.style.display = 'none';
            }
            
            // Show chat interface
            if (chatInterface) {
                chatInterface.style.display = 'flex';
            }
            
            // Update user info display
            const userInitials = document.getElementById('userInitials');
            const userName = document.getElementById('userName');
            if (userInitials) {
                userInitials.textContent = window.state.username.charAt(0).toUpperCase();
            }
            if (userName) {
                userName.textContent = window.state.username;
            }
        }
    } catch (error) {
        console.error('Failed to connect to WebSocket server:', error);
    }
});
