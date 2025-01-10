/**
 * @typedef {Object} ConnectionStatus
 * @property {string} status - The status message
 * @property {'success' | 'error' | 'warning'} type - The type of status
 */

/**
 * @typedef {Object} RoomData
 * @property {string} roomId - The room identifier
 * @property {string} [description] - Optional room description
 * @property {string} [password] - Optional room password
 * @property {boolean} [isPrivate] - Whether the room is private
 * @property {string} userId - The user's socket ID
 */

/**
 * @typedef {Object} MessageData
 * @property {string} content - The message content
 * @property {string} roomId - The room identifier
 * @property {string[]} [mentions] - Optional array of mentioned usernames
 */

/**
 * WebSocketClient - A class to handle WebSocket connections with automatic reconnection,
 * heartbeat mechanism, and event handling.
 */
class WebSocketClient {
    /**
     * Creates a new WebSocketClient instance
     * @param {Object} config - Configuration options
     * @param {number} [config.maxReconnectAttempts=5] - Maximum number of reconnection attempts
     * @param {number} [config.heartbeatInterval=30000] - Heartbeat interval in milliseconds
     * @param {number} [config.activityCheckInterval=10000] - Activity check interval in milliseconds
     * @param {number} [config.reconnectInterval=2000] - Reconnection interval in milliseconds
     */
    constructor(config = {}) {
        // Connection related
        this.ws = null;
        this.currentSocketId = null;
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = config.maxReconnectAttempts || 5;
        this.RECONNECT_INTERVAL = config.reconnectInterval || 2000;
        
        // Heartbeat related
        this.heartbeatInterval = null;
        this.lastMessageTime = null;
        this.HEARTBEAT_INTERVAL = config.heartbeatInterval || 30000; // 30 seconds
        this.ACTIVITY_CHECK_INTERVAL = config.activityCheckInterval || 10000; // 10 seconds
        
        // Event handling
        this.eventHandlers = new Map();
        
        // Bind methods
        this.handleOpen = this.handleOpen.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
    }

    /**
     * Establishes a WebSocket connection
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
                console.log('WebSocket already exists, closing...');
                this.ws.close();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
            
            console.log('Connecting to WebSocket server:', wsUrl);
            
            this.ws = new WebSocket(wsUrl);
            
            // Set up event handlers
            this.ws.onopen = this.handleOpen;
            this.ws.onclose = this.handleClose;
            this.ws.onerror = this.handleError;
            this.ws.onmessage = this.handleMessage;
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.emit('error', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Handles WebSocket open event
     * @private
     */
    handleOpen() {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connectionStatus', { status: 'Connected', type: 'success' });
        this.startHeartbeat();
    }

    /**
     * Handles WebSocket close event
     * @private
     * @param {CloseEvent} event
     */
    handleClose(event) {
        console.log('WebSocket disconnected', event.code, event.reason);
        this.stopHeartbeat();
        this.emit('connectionStatus', { status: 'Disconnected - Reconnecting...', type: 'warning' });
        
        // Don't reconnect if it was a normal closure
        if (event.code !== 1000) {
            this.scheduleReconnect();
        }
    }

    /**
     * Schedules a reconnection attempt
     * @private
     */
    scheduleReconnect() {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
            setTimeout(() => this.connect(), delay);
        } else {
            this.emit('connectionStatus', { 
                status: 'Failed to reconnect - Please refresh the page', 
                type: 'error' 
            });
        }
    }

    /**
     * Handles WebSocket error event
     * @private
     * @param {Event} error
     */
    handleError(error) {
        console.error('WebSocket error:', error);
        this.emit('connectionStatus', { status: 'Connection error', type: 'error' });
    }

    /**
     * Handles WebSocket message event
     * @private
     * @param {MessageEvent} event
     */
    handleMessage(event) {
        this.updateLastMessageTime();
        try {
            const data = JSON.parse(event.data);
            if (data.event === 'connected') {
                this.currentSocketId = data.data.socketId;
                console.log('Socket ID set:', this.currentSocketId);
                this.emit('connected', data.data);
            } else {
                this.emit(data.event, data.data);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    /**
     * Starts the heartbeat mechanism
     * @private
     */
    startHeartbeat() {
        this.stopHeartbeat();
        
        this.lastMessageTime = Date.now();
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                const timeSinceLastMessage = Date.now() - this.lastMessageTime;
                if (timeSinceLastMessage >= this.HEARTBEAT_INTERVAL) {
                    this.send('ping');
                    console.debug('Sending heartbeat ping');
                }
            }
        }, this.ACTIVITY_CHECK_INTERVAL);
    }

    /**
     * Stops the heartbeat mechanism
     * @private
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Updates the last message timestamp
     * @private
     */
    updateLastMessageTime() {
        this.lastMessageTime = Date.now();
    }

    /**
     * Sends a message through the WebSocket connection
     * @param {string} event - The event name
     * @param {*} [data] - The data to send
     * @throws {Error} If not connected to server
     */
    send(event, data = null) {
        if (!this.isConnected()) {
            throw new Error('Not connected to server');
        }

        try {
            const message = JSON.stringify({ event, data });
            console.log('Sending:', message);
            this.ws.send(message);
            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            throw new Error('Failed to send message');
        }
    }

    /**
     * Registers an event handler
     * @param {string} event - The event name
     * @param {Function} handler - The event handler
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }

    /**
     * Removes an event handler
     * @param {string} event - The event name
     * @param {Function} handler - The event handler to remove
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }

    /**
     * Emits an event to all registered handlers
     * @private
     * @param {string} event - The event name
     * @param {*} data - The event data
     */
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }

    /**
     * Gets the current socket ID
     * @returns {string|null} The socket ID or null if not connected
     */
    getSocketId() {
        return this.currentSocketId;
    }

    /**
     * Checks if the WebSocket is connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Disconnects the WebSocket
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close(1000, 'Normal closure');
            this.ws = null;
        }
        this.currentSocketId = null;
    }

    // Room-related methods
    /**
     * Creates a new room
     * @param {RoomData} roomData - The room data
     */
    createRoom(roomData) {
        this.send('create-room', roomData);
    }

    /**
     * Joins an existing room
     * @param {RoomData} roomData - The room data
     */
    joinRoom(roomData) {
        this.send('join-room', roomData);
    }

    /**
     * Leaves the current room
     * @param {string} roomId - The room ID
     */
    leaveRoom(roomId) {
        this.send('leave-room', { roomId });
    }

    /**
     * Sends a message to a room
     * @param {MessageData} messageData - The message data
     */
    sendMessage(messageData) {
        this.send('message', messageData);
    }
}

// Create and export a singleton instance
const websocketClient = new WebSocketClient({
    heartbeatInterval: 30000,
    activityCheckInterval: 10000,
    maxReconnectAttempts: 5,
    reconnectInterval: 2000
});

// Export both the class and the singleton instance
export { WebSocketClient };
export default websocketClient;
