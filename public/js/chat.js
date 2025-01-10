import { generateUserColor } from './utils.js';

/**
 * Chat class - Handles basic chat functionality and WebSocket communication
 */
export class Chat {
    constructor(ui, websocket) {
        this.ui = ui;
        this.ws = websocket;
        this.username = null;
        this.userColor = null;
        this.currentRoom = null;
        
        this.setupWebSocketHandlers();
    }

    /**
     * Set up WebSocket event handlers
     * @private
     */
    setupWebSocketHandlers() {
        // Connection status
        this.ws.on('connectionStatus', (data) => {
            this.ui.updateConnectionStatus(data.status, data.type);
        });

        // Message handling
        this.ws.on('message', (data) => {
            this.ui.addMessage(data);
        });

        // Room events
        this.ws.on('room-created', (data) => {
            this.currentRoom = data.roomId;
            this.ui.setCurrentRoom(data);
        });

        this.ws.on('room-joined', (data) => {
            this.currentRoom = data.roomId;
            this.ui.setCurrentRoom(data);
        });

        this.ws.on('room-list', (data) => {
            this.ui.updateRoomList(data.rooms);
        });

        this.ws.on('user-list', (data) => {
            this.ui.updateUserList(data.users);
        });
    }

    /**
     * Set the username and initialize user settings
     * @param {string} username 
     */
    setUsername(username) {
        this.username = username;
        this.userColor = generateUserColor();
        this.ui.setUsername(username);
        this.ui.showChat();
        
        if (this.ws.isConnected()) {
            this.ws.send('set-username', {
                username: this.username,
                color: this.userColor
            });
        }
    }

    /**
     * Create a new chat room
     * @param {Object} data
     */
    createRoom(data) {
        if (!this.username) {
            throw new Error('Please set username first');
        }
        this.ws.send('create-room', {
            ...data,
            creator: this.username
        });
    }

    /**
     * Join an existing chat room
     * @param {Object} data
     */
    joinRoom(data) {
        if (!this.username) {
            throw new Error('Please set username first');
        }
        this.ws.send('join-room', {
            ...data,
            username: this.username
        });
    }

    /**
     * Send a message to the current room
     * @param {string} content 
     */
    sendMessage(content) {
        if (!this.currentRoom || !content.trim()) {
            return;
        }

        this.ws.send('message', {
            content,
            roomId: this.currentRoom,
            username: this.username,
            userColor: this.userColor,
            timestamp: Date.now()
        });
    }
}
