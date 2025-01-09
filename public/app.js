const socket = io({
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    upgrade: true,
    rememberUpgrade: true,
    secure: true,
    rejectUnauthorized: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: true,
    query: {
        t: Date.now() // Prevent caching
    },
    extraHeaders: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1"
    }
});

// Generate encryption keys on startup
let publicKey = CryptoJS.lib.WordArray.random(32).toString();
let privateKey = null;

// UI Elements
const joinContainer = document.getElementById('join-container');
const createRoomContainer = document.getElementById('create-room-container');
const joinRoomForm = document.getElementById('join-room-form');
const chatContainer = document.getElementById('chat-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');

// State
let currentUser = null;
let currentRoom = null;
let roomKey = null;
let currentUsername = null;

// Keep track of room members for mentions
let roomMembers = new Map();

// Track if user is near bottom
let isNearBottom = true;

// Track if user is typing
let isTyping = false;

messagesDiv.addEventListener('scroll', () => {
    isNearBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 50;
});

messageInput.addEventListener('input', () => {
    isTyping = true;
    setTimeout(() => isTyping = false, 1000);
});

// Connection event handlers
socket.on('connect', () => {
    console.log('Connected to server with transport:', socket.io.engine.transport.name);
    updateConnectionStatus('Connected', 'green');
    
    // Register public key with server immediately after connection
    socket.emit('register-key', { publicKey });
    console.log('Connected and registered encryption key');
    
    socket.io.engine.on('upgrade', () => {
        console.log('Upgraded transport to:', socket.io.engine.transport.name);
    });
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    updateConnectionStatus('Disconnected', 'red');
    showError('Connection lost. Retrying...');
    
    // Try to reconnect with websocket transport
    socket.io.opts.transports = ['websocket'];
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    updateConnectionStatus('Disconnected', 'red');
    
    if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        socket.connect();
    }
    
    showError('Disconnected from server. Reconnecting...');
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    updateConnectionStatus('Connected', 'green');
    
    // Rejoin room if we were in one
    if (currentRoom) {
        socket.emit('joinRoom', { roomId: currentRoom, username: currentUsername });
    }
});

socket.on('reconnect_attempt', () => {
    // Always try websocket first
    socket.io.opts.transports = ['websocket'];
});

socket.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error);
    showError('Unable to reconnect. Please check your connection.');
});

socket.on('reconnect_failed', () => {
    console.error('Failed to reconnect');
    showError('Connection failed. Please refresh the page.');
});

// Event Listeners
document.getElementById('create-room-btn').addEventListener('click', () => {
    joinContainer.classList.add('hidden');
    createRoomContainer.classList.remove('hidden');
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    joinContainer.classList.add('hidden');
    joinRoomForm.classList.remove('hidden');
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        joinContainer.classList.remove('hidden');
    });
});

// Password toggle handlers
document.getElementById('room-password-toggle').addEventListener('change', function() {
    const passwordGroup = document.getElementById('room-password-group');
    passwordGroup.classList.toggle('hidden', !this.checked);
    if (!this.checked) {
        document.getElementById('room-password').value = '';
    }
});

document.getElementById('create-room-submit').addEventListener('click', async () => {
    const username = document.getElementById('create-username').value.trim();
    const description = document.getElementById('room-description').value.trim();
    const maxMembers = parseInt(document.getElementById('room-max-members').value) || 0;
    const password = document.getElementById('room-password-toggle').checked ? 
        document.getElementById('room-password').value : '';

    if (!username) {
        showError('Please enter a username');
        return;
    }

    socket.emit('create-room', {
        username,
        description,
        maxMembers,
        password,
        publicKey
    });
});

document.getElementById('join-room-submit').addEventListener('click', () => {
    const roomId = document.getElementById('room-id').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('join-room-password').value;

    if (!roomId || !username) {
        showError('Please fill in all required fields');
        return;
    }

    socket.emit('join-room', {
        roomId,
        username,
        password,
        publicKey
    });
});

document.getElementById('send-message').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.getElementById('leave-room').addEventListener('click', () => {
    socket.emit('leave-room', { roomId: currentRoom });
    currentRoom = null;
    currentUser = null;
    roomKey = null;
    chatContainer.classList.add('hidden');
    joinContainer.classList.remove('hidden');
    document.title = 'Chat Room';
});

// Mobile menu handlers
document.getElementById('toggle-members').addEventListener('click', () => {
    document.querySelector('.members-sidebar').classList.add('active');
});

document.querySelector('.close-members').addEventListener('click', () => {
    document.querySelector('.members-sidebar').classList.remove('active');
});

// Socket event handlers
socket.on('room-created', (encryptedData) => {
    try {
        console.log('Received room-created event');
        const decryptedData = decryptMessage(encryptedData);
        console.log('Decrypted room data:', decryptedData);
        
        const { userId, roomId, name, description, members, encryptedRoomKey } = decryptedData;
        
        currentUser = userId;
        currentRoom = roomId;
        currentUsername = document.getElementById('create-username').value;
        roomKey = encryptedRoomKey;
        
        // Join room with all required data
        socket.emit('joinRoom', { 
            roomId,
            username: currentUsername,
            publicKey,
            userId: currentUser
        });
        
        // Hide all forms
        joinContainer.classList.add('hidden');
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        
        // Show chat
        chatContainer.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = name || 'Unnamed Room';
        document.getElementById('room-id-display').textContent = `Room ID: ${currentRoom}`;
        document.getElementById('room-description-display').textContent = description || '';
        document.title = `${name || 'Unnamed Room'} - Chat Room`;
        
        // Update members list and count
        updateMembersList(members);
        updateMembersCount(members.length);
        
        addSystemMessage(`Welcome to ${name || 'the room'}!`);
        console.log('Room UI updated successfully');
    } catch (error) {
        console.error('Error processing room-created data:', error);
        showError('Failed to process room data. Please try again.');
    }
});

socket.on('room-joined', (encryptedData) => {
    try {
        console.log('Received room-joined event');
        const decryptedData = decryptMessage(encryptedData);
        console.log('Decrypted room data:', decryptedData);
        
        const { userId, roomId, name, description, members, encryptedRoomKey } = decryptedData;
        
        currentUser = userId;
        currentRoom = roomId;
        roomKey = encryptedRoomKey;
        currentUsername = document.getElementById('username').value;
        
        // Hide all forms
        joinContainer.classList.add('hidden');
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        
        // Show chat
        chatContainer.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = name || 'Unnamed Room';
        document.getElementById('room-id-display').textContent = `Room ID: ${currentRoom}`;
        document.getElementById('room-description-display').textContent = description || '';
        document.title = `${name || 'Unnamed Room'} - Chat Room`;
        
        // Update members list and count
        updateMembersList(members);
        updateMembersCount(members.length);
        
        addSystemMessage(`Welcome to ${name || 'the room'}!`);
        console.log('Room UI updated successfully');
    } catch (error) {
        console.error('Error processing room-joined data:', error);
        showError('Failed to process room data. Please try again.');
    }
});

socket.on('user-joined', (data) => {
    try {
        const { username } = data;
        addSystemMessage(`${username} joined the room`);
        updateMembersList([...document.querySelectorAll('.member-item')].map(el => ({
            username: el.textContent,
            status: 'online'
        })).concat([{ username, status: 'online' }]));
    } catch (error) {
        console.error('Error processing user-joined data:', error);
    }
});

socket.on('user-left', (encryptedData) => {
    try {
        const { userId, username, members, currentMembers } = decryptMessage(encryptedData);
        updateMembersList(members);
        updateMembersCount(currentMembers);
        addSystemMessage(`${username} left the room`);
    } catch (error) {
        console.error('Error processing user-left data:', error);
    }
});

socket.on('message', (encryptedData) => {
    try {
        console.log('Received message:', encryptedData);
        const data = decryptMessage(encryptedData);
        console.log('Decrypted message:', data);
        if (data && data.content) {
            addMessage({
                username: data.sender,
                userId: data.senderId,
                text: data.content,
                timestamp: data.timestamp
            });
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

socket.on('error', (error) => {
    console.error('Server error:', error);
    showError(error.message || 'An error occurred');
});

// Helper functions
function decryptMessage(encryptedData) {
    try {
        const { key: encryptedKey, message: encryptedMessage } = JSON.parse(encryptedData);
        
        // Decrypt the message key using our public key
        const messageKey = CryptoJS.AES.decrypt(encryptedKey, publicKey).toString(CryptoJS.enc.Utf8);
        if (!messageKey) throw new Error('Failed to decrypt message key');
        
        // Decrypt the actual message using the message key
        const decryptedMessage = CryptoJS.AES.decrypt(encryptedMessage, messageKey).toString(CryptoJS.enc.Utf8);
        if (!decryptedMessage) throw new Error('Failed to decrypt message');
        
        return JSON.parse(decryptedMessage);
    } catch (error) {
        console.error('Decryption error:', error);
        throw error;
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createMessageElement(message, isSystem = false) {
    const messageDiv = document.createElement('div');
    
    if (isSystem) {
        messageDiv.className = 'bg-gray-100 p-3 rounded-lg text-gray-600 text-sm';
        messageDiv.textContent = message || '';
    } else {
        const { username, userId, text, timestamp } = message;
        const isCurrentUser = userId === currentUser;

        messageDiv.className = `flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = `${isCurrentUser ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-800'} p-3 rounded-lg max-w-[80%] break-words shadow-sm`;
        
        if (!isCurrentUser) {
            const userHeader = document.createElement('div');
            userHeader.className = 'font-medium text-sm mb-1';
            userHeader.textContent = `@${username}`;
            messageContent.appendChild(userHeader);
        }
        
        const textContent = document.createElement('div');
        textContent.className = 'text-sm whitespace-pre-wrap';
        textContent.innerHTML = formatMessageContent(text || '', isCurrentUser);
        messageContent.appendChild(textContent);
        
        const timeContent = document.createElement('div');
        timeContent.className = 'text-xs mt-1 opacity-75';
        timeContent.textContent = new Date(timestamp).toLocaleTimeString();
        messageContent.appendChild(timeContent);
        
        messageDiv.appendChild(messageContent);
    }

    return messageDiv;
}

function formatMessageContent(text, isCurrentUserMessage = false) {
    if (!text) return '';
    let formattedText = escapeHtml(text);
    
    // Format mentions
    formattedText = formattedText.replace(/@(\w+)/g, (match, username) => {
        const member = Array.from(roomMembers.values()).find(m => m.username === username);
        if (member) {
            const mentionClass = isCurrentUserMessage ? 
                'text-primary-100 font-semibold cursor-pointer' : 
                'text-primary-700 font-semibold cursor-pointer';
            return `<span class="${mentionClass}">@${escapeHtml(username)}</span>`;
        }
        return match;
    });
    
    // Format URLs
    formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, (url) => {
        const linkClass = isCurrentUserMessage ? 
            'text-primary-100 underline hover:text-white' : 
            'text-primary-600 underline hover:text-primary-800';
        return `<a href="${escapeHtml(url)}" target="_blank" class="${linkClass}">${escapeHtml(url)}</a>`;
    });
    
    return formattedText;
}

const MAX_MESSAGES = 100;

function cullMessages() {
    const messages = messagesDiv.children;
    while (messages.length > MAX_MESSAGES) {
        messagesDiv.removeChild(messages[0]);
    }
}

function addMessage(message, isSystem = false) {
    const messageElement = createMessageElement(message, isSystem);
    messagesDiv.appendChild(messageElement);
    
    // Auto scroll if user is near bottom or typing
    if (isNearBottom || isTyping) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    // Only cull if we have too many messages
    if (messagesDiv.children.length > MAX_MESSAGES) {
        cullMessages();
    }
}

function addSystemMessage(message) {
    addMessage({ text: message }, true);
}

function updateMembersList(members) {
    const membersList = document.getElementById('members-list');
    membersList.innerHTML = '';
    roomMembers.clear();
    
    members.forEach(member => {
        roomMembers.set(member.username, {
            ...member,
            id: member.userId || member.socketId || 'unknown',
            status: 'online' // Force online status for all members
        });
        
        const memberDiv = document.createElement('div');
        memberDiv.className = 'flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer';
        memberDiv.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="w-2 h-2 rounded-full bg-green-500"></div>
                <span class="text-sm text-gray-700">@${escapeHtml(member.username)}</span>
            </div>
            <button class="text-xs text-primary-600 hover:text-primary-700" onclick="mentionUser('${member.username}')">
                Mention
            </button>
        `;
        membersList.appendChild(memberDiv);
    });
}

function updateMembersCount(count, max = 0) {
    const countElement = document.getElementById('members-count');
    countElement.textContent = max > 0 ? `${count}/${max}` : count;
}

function showError(message) {
    const errorContainer = document.getElementById('error-container');
    if (!errorContainer) {
        const container = document.createElement('div');
        container.id = 'error-container';
        container.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-sm mx-auto';
        document.body.appendChild(container);
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-2 rounded-lg shadow-md';
    errorDiv.innerHTML = `
        <div class="flex items-start">
            <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
            </div>
            <div class="ml-3">
                <p class="text-sm text-red-700">${escapeHtml(message)}</p>
            </div>
            <div class="ml-auto pl-3">
                <div class="-mx-1.5 -my-1.5">
                    <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" 
                            class="inline-flex rounded-md p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                        <span class="sr-only">Dismiss</span>
                        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    const container = document.getElementById('error-container');
    container.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv && errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

function updateConnectionStatus(status, color) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.className = `text-${color}-500`;
        statusElement.textContent = `● ${status}`;
    }
}

function createConnectionStatus() {
    // Remove existing status if any
    const existing = document.getElementById('connection-status-container');
    if (existing) {
        existing.remove();
    }

    const statusDiv = document.createElement('div');
    statusDiv.id = 'connection-status-container';
    statusDiv.className = 'fixed top-2 right-2 flex items-center space-x-2 text-sm font-medium px-3 py-1 rounded-full bg-white/90 shadow-sm z-50';
    statusDiv.innerHTML = `
        <span id="connection-status" class="text-gray-500">● Connecting...</span>
    `;
    document.body.appendChild(statusDiv);
}

// Initialize connection status
document.addEventListener('DOMContentLoaded', () => {
    createConnectionStatus();
});

// Add manual reconnect button if needed
function addReconnectButton() {
    const button = document.createElement('button');
    button.className = 'fixed bottom-4 right-4 bg-primary-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2';
    button.textContent = 'Reconnect';
    button.style.display = 'none';
    document.body.appendChild(button);
    
    // Show button when disconnected for too long
    socket.on('disconnect', () => {
        setTimeout(() => {
            if (!socket.connected) {
                button.style.display = 'block';
            }
        }, 10000);
    });
    
    socket.on('connect', () => {
        button.style.display = 'none';
    });
}

// Initialize reconnect button
document.addEventListener('DOMContentLoaded', () => {
    addReconnectButton();
});

// Add connection recovery function
function reconnectSocket() {
    if (!socket.connected) {
        socket.connect();
        showError('Attempting to reconnect...');
    }
}

// Create mention suggestions container
const mentionContainer = document.createElement('div');
mentionContainer.className = 'fixed bottom-16 left-0 right-0 md:left-auto md:right-auto md:ml-4 max-w-sm mx-auto bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 overflow-y-auto z-50 transform transition-transform duration-200 ease-in-out';
mentionContainer.style.display = 'none';
document.body.appendChild(mentionContainer);

// Function to hide mention suggestions
function hideMentionSuggestions() {
    mentionContainer.style.display = 'none';
}

// Function to show mention suggestions
function showMentionSuggestions(matches, input, partial) {
    const suggestions = matches.map(member => {
        const username = escapeHtml(member.username);
        return `<div class="p-3 hover:bg-gray-50 active:bg-gray-100 cursor-pointer flex items-center space-x-3 touch-manipulation" data-username="${username}">
            <div class="w-2 h-2 rounded-full bg-green-500"></div>
            <div class="flex-1">
                <div class="text-sm font-medium text-gray-900">@${username}</div>
            </div>
        </div>`;
    }).join('');

    mentionContainer.innerHTML = `<div class="p-2 bg-gray-50 border-b border-gray-200">
        <div class="text-sm text-gray-500">Tap a user to mention them</div>
    </div>
    <div class="divide-y divide-gray-100">${suggestions}</div>`;
    
    mentionContainer.querySelectorAll('[data-username]').forEach(el => {
        el.addEventListener('click', () => completeMention(el.dataset.username, partial));
    });
    
    mentionContainer.style.display = 'block';
    positionMentionContainer();
}

// Function to position mention container
function positionMentionContainer() {
    const messageInput = document.getElementById('message-input');
    const rect = messageInput.getBoundingClientRect();
    
    if (window.innerWidth >= 768) { // Desktop
        mentionContainer.style.bottom = 'auto';
        mentionContainer.style.top = (rect.top - mentionContainer.offsetHeight - 8) + 'px';
        mentionContainer.style.left = rect.left + 'px';
        mentionContainer.style.right = 'auto';
        mentionContainer.style.width = '320px';
    } else { // Mobile
        mentionContainer.style.bottom = '80px';
        mentionContainer.style.top = 'auto';
        mentionContainer.style.left = '16px';
        mentionContainer.style.right = '16px';
        mentionContainer.style.width = 'auto';
    }
}

// Update input event listener for mentions
document.getElementById('message-input').addEventListener('input', function(e) {
    const input = e.target;
    const text = input.value;
    const cursorPos = input.selectionStart;
    
    // Check if we're typing a mention
    const beforeCursor = text.slice(0, cursorPos);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
        const searchTerm = mentionMatch[1].toLowerCase();
        const matches = Array.from(roomMembers.values())
            .filter(member => member.username.toLowerCase().includes(searchTerm))
            .slice(0, 5); // Limit to 5 suggestions
        
        if (matches.length > 0) {
            showMentionSuggestions(matches, input, mentionMatch[0]);
        } else {
            hideMentionSuggestions();
        }
    } else {
        hideMentionSuggestions();
    }
});

// Add click outside handler
document.addEventListener('click', function(e) {
    if (!mentionContainer.contains(e.target) && !messageInput.contains(e.target)) {
        hideMentionSuggestions();
    }
});

// Function to complete mention
function completeMention(username, partial) {
    const input = document.getElementById('message-input');
    const text = input.value;
    const cursorPos = input.selectionStart;
    const beforeMention = text.slice(0, cursorPos - (partial ? partial.length : 0));
    const afterMention = text.slice(cursorPos);
    
    input.value = beforeMention + '@' + username + ' ' + afterMention;
    input.focus();
    
    // Set cursor position after the mention
    const newCursorPos = beforeMention.length + username.length + 2; // +2 for @ and space
    input.setSelectionRange(newCursorPos, newCursorPos);
    
    hideMentionSuggestions();
}

// Function to mention user
function mentionUser(username) {
    const messageInput = document.getElementById('message-input');
    const mention = `@${username} `;
    const cursorPos = messageInput.selectionStart;
    const text = messageInput.value;
    
    // Insert at cursor position
    messageInput.value = text.slice(0, cursorPos) + mention + text.slice(cursorPos);
    messageInput.focus();
    
    // Move cursor after mention
    const newCursorPos = cursorPos + mention.length;
    messageInput.setSelectionRange(newCursorPos, newCursorPos);
}

function formatMessage(text) {
    return escapeHtml(text);
}

function sendMessage() {
    if (!socket.connected) {
        showError('Not connected to server. Please wait...');
        return;
    }

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!currentRoom) {
        showError('Please join a room before sending messages');
        return;
    }
    
    if (!content) {
        showError('Please enter a message');
        return;
    }
    
    socket.emit('message', {
        roomId: currentRoom,
        content: content,
        senderId: currentUser
    });

    messageInput.value = '';
}

function joinRoom(roomId, options = {}) {
    if (!socket.connected) {
        showError('Not connected to server. Please wait...');
        return;
    }
    
    if (!roomId) {
        showError('Invalid room ID');
        return;
    }

    if (currentRoom === roomId) {
        showError('You are already in this room');
        return;
    }

    socket.emit('joinRoom', { roomId, ...options });
    currentRoom = roomId;
}

socket.on('roomError', (error) => {
    showError(error.message || 'Error joining room');
});

socket.on('messageError', (error) => {
    showError(error.message || 'Error sending message');
});
