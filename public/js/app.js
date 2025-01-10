import websocket from './websocket.js';
import { UI } from './ui.js';
import { generateUserColor } from './utils.js';

// Global state to store username
window.state = {
    username: null,
    userColor: null
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const ui = new UI();

    // Handle login - just save username, don't send to WebSocket
    ui.on('login', (username) => {
        window.state.username = username;
        window.state.userColor = generateUserColor();
        ui.setUsername(username);
        ui.showChat();
    });

    // Handle WebSocket connection status
    websocket.on('connectionStatus', (data) => {
        ui.updateConnectionStatus(data.status, data.type);
    });

    // Handle WebSocket connection
    websocket.on('connected', (data) => {
        console.log('Connected to server');
        ui.updateConnectionStatus('Connected', 'success');
    });

    // Initialize modals
    window.modals = {
        createRoom: {
            open: () => {
                if (!window.state.username) {
                    alert('Please enter a username first');
                    return;
                }
                const modal = document.getElementById('createRoomModal');
                modal.classList.add('active');
                console.log('Opening create room modal');
            },
            close: () => {
                const modal = document.getElementById('createRoomModal');
                modal.classList.remove('active');
            }
        },
        joinRoom: {
            open: () => {
                if (!window.state.username) {
                    alert('Please enter a username first');
                    return;
                }
                const modal = document.getElementById('joinRoomModal');
                modal.classList.add('active');
                console.log('Opening join room modal');
            },
            close: () => {
                const modal = document.getElementById('joinRoomModal');
                modal.classList.remove('active');
            }
        }
    };

    // Add click handler for create room button
    document.getElementById('createRoomBtn')?.addEventListener('click', () => {
        window.modals.createRoom.open();
    });

    // Add click handler for join room button
    document.getElementById('joinRoomBtn')?.addEventListener('click', () => {
        window.modals.joinRoom.open();
    });

    // Start in login state
    ui.showLogin();

    // Connect to WebSocket server
    websocket.connect();
});
