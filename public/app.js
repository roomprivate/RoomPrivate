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
let currentRoomMaxMembers = null;

// Keep track of room members for mentions
let roomMembers = new Map();

// Track if user is near bottom
let isNearBottom = true;

// Track if user is typing
let isTyping = false;

// Message history
let messageHistory = [];

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
    
    // Register public key with server immediately after connection
    socket.emit('register-key', { publicKey });
    console.log('Connected and registered encryption key');
    
    socket.io.engine.on('upgrade', () => {
        console.log('Upgraded transport to:', socket.io.engine.transport.name);
    });
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showError('Connection lost. Retrying...');
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    
    if (reason === 'io server disconnect') {
        socket.connect();
    }
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    
    // Rejoin room if we were in one
    if (currentRoom) {
        socket.emit('join-room', {
            roomId: currentRoom,
            username: currentUsername
        });
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

// Mobile menu handlers
document.getElementById('toggle-members').addEventListener('click', () => {
    document.querySelector('.members-sidebar').classList.add('active');
});

document.querySelector('.close-members').addEventListener('click', () => {
    document.querySelector('.members-sidebar').classList.remove('active');
});

// Socket event handlers
socket.on('message', (data) => {
    console.log('Received message:', data);
    try {
        const decryptedMessage = decryptMessage(data);
        console.log('Decrypted message:', decryptedMessage);
        
        displayMessage({
            username: decryptedMessage.sender,
            message: decryptedMessage.content,
            timestamp: decryptedMessage.timestamp,
            isSystem: false
        });
    } catch (error) {
        console.error('Error processing message:', error);
        showError('Failed to decrypt message');
    }
});

socket.on('room-created', (encryptedData) => {
    console.log('Room created raw data:', encryptedData);
    try {
        const data = decryptMessage(encryptedData);
        console.log('Room created decrypted:', data);
        
        // Save room info
        currentUser = data.userId;
        currentRoom = data.roomId;
        roomKey = data.encryptedRoomKey;
        currentUsername = document.getElementById('username').value;
        
        // Hide forms, show chat
        joinContainer.classList.add('hidden');
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = data.name || 'Unnamed Room';
        document.getElementById('room-id-display').textContent = `Room ID: ${data.roomId}`;
        document.getElementById('room-description-display').textContent = data.description || '';
        document.title = `${data.name || 'Unnamed Room'} - Chat Room`;
        
        // Initialize members list
        if (Array.isArray(data.members)) {
            updateMembersList(data.members);
        }
        
        addSystemMessage(`Welcome to ${data.name || 'the room'}!`);
    } catch (error) {
        console.error('Error handling room created:', error);
        showError('Failed to create room. Please try again.');
    }
});

socket.on('room-joined', (encryptedData) => {
    console.log('Room joined raw data:', encryptedData);
    try {
        const data = decryptMessage(encryptedData);
        console.log('Room joined decrypted:', data);
        
        // Save room info
        currentUser = data.userId;
        currentRoom = data.roomId;
        roomKey = data.encryptedRoomKey;
        currentUsername = document.getElementById('username').value;
        
        // Hide forms, show chat
        joinContainer.classList.add('hidden');
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = data.name || 'Unnamed Room';
        document.getElementById('room-id-display').textContent = `Room ID: ${data.roomId}`;
        document.getElementById('room-description-display').textContent = data.description || '';
        document.title = `${data.name || 'Unnamed Room'} - Chat Room`;
        
        // Initialize members list
        if (Array.isArray(data.members)) {
            updateMembersList(data.members);
        }
        
        addSystemMessage(`Welcome to ${data.name || 'the room'}!`);
    } catch (error) {
        console.error('Error handling room joined:', error);
        showError('Failed to join room. Please try again.');
    }
});

socket.on('member-update', (encryptedData) => {
    console.log('Member update raw data:', encryptedData);
    try {
        const data = decryptMessage(encryptedData);
        console.log('Member update decrypted:', data);
        
        if (Array.isArray(data.members)) {
            updateMembersList(data.members);
        }
    } catch (error) {
        console.error('Error handling member update:', error);
    }
});

socket.on('user-joined', (data) => {
    console.log('User joined:', data);
    try {
        // Data is not encrypted for this event
        const { username, userId, status } = data;
        
        // Get current members list
        const membersList = document.getElementById('members-list');
        const currentMembers = Array.from(membersList.children).map(el => ({
            userId: el.dataset.userId,
            username: el.querySelector('.text-gray-100').textContent,
            status: 'online'
        }));
        
        // Add new member if not exists
        if (!currentMembers.find(m => m.userId === userId)) {
            currentMembers.push({
                userId,
                username,
                status: status || 'online'
            });
            
            // Update the list
            updateMembersList(currentMembers);
            addSystemMessage(`${username} joined the room`);
        }
    } catch (error) {
        console.error('Error handling user joined:', error);
    }
});

socket.on('user-left', (data) => {
    console.log('User left:', data);
    // Remove from roomMembers
    if (roomMembers.has(data.userId)) {
        roomMembers.delete(data.userId);
    }
    addSystemMessage(`${data.username} left the room`);
});

socket.on('members-update', (data) => {
    console.log('Members update:', data);
    // Clear and rebuild entire roomMembers
    roomMembers.clear();
    data.members.forEach(member => {
        roomMembers.set(member.userId, member);
    });
    // Update UI
    updateMembersList(Array.from(roomMembers.values()));
});

socket.on('welcome', (data) => {
    console.log('Welcome data:', data);
    displayMessage({
        username: 'System',
        message: `Welcome to Room ${data.roomId}!`,
        timestamp: new Date().toISOString(),
        isSystem: true
    });
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

function displayMessage(data) {
    console.log('Displaying message:', data);
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    const isMyMessage = data.username === currentUsername;
    const isSystem = data.isSystem;
    
    messageDiv.className = 'flex flex-col space-y-1 mb-4';
    
    // Message container with proper spacing and alignment
    const messageContent = document.createElement('div');
    messageContent.className = `flex items-start space-x-2 ${isMyMessage ? 'justify-end' : 'justify-start'} ${isSystem ? 'justify-center' : ''}`;
    
    if (!isSystem) {
        // Avatar circle with first letter (only for non-system messages and other users)
        if (!isMyMessage) {
            const avatar = document.createElement('div');
            avatar.className = 'w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-medium text-white';
            const avatarText = document.createElement('span');
            avatarText.className = 'text-white font-medium text-sm';
            avatarText.textContent = data.username.charAt(0).toUpperCase();
            avatar.appendChild(avatarText);
            messageContent.appendChild(avatar);
        }
        
        // Message bubble
        const bubble = document.createElement('div');
        bubble.className = `flex flex-col space-y-1 rounded-lg p-3 break-words max-w-[70%] ${
            isMyMessage ? 'bg-blue-600 ml-auto' : 'bg-gray-700'
        }`;
        
        // Header with username and time
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between space-x-4';
        
        if (!isMyMessage) {
            const username = document.createElement('span');
            username.className = 'text-blue-300 font-medium text-sm';
            username.textContent = data.username;
            header.appendChild(username);
        }
        
        const time = document.createElement('span');
        time.className = 'text-gray-300 text-xs';
        time.textContent = new Date(data.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        header.appendChild(time);
        
        // Message text with mention highlighting
        const text = document.createElement('div');
        text.className = 'text-white text-sm whitespace-pre-wrap';
        
        // Highlight mentions
        let html = data.message;
        const mentionRegex = /@(\w+)/g;
        html = html.replace(mentionRegex, (match, username) => {
            return `<span class="text-blue-300">${match}</span>`;
        });
        text.innerHTML = html;
        
        bubble.appendChild(header);
        bubble.appendChild(text);
        messageContent.appendChild(bubble);
        
        // Flash title if mentioned
        if (data.mentions && data.mentions.includes(currentUser) && document.hidden) {
            document.title = '🔔 New Mention - Chat';
            const onVisibilityChange = () => {
                if (!document.hidden) {
                    document.title = 'Chat';
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                }
            };
            document.addEventListener('visibilitychange', onVisibilityChange);
        }
    } else {
        // System message
        const systemMessage = document.createElement('div');
        systemMessage.className = 'bg-gray-800 text-gray-400 text-sm px-4 py-2 rounded-full';
        systemMessage.textContent = data.message;
        messageContent.appendChild(systemMessage);
    }
    
    messageDiv.appendChild(messageContent);
    messagesDiv.appendChild(messageDiv);
    
    // Scroll to bottom if near bottom
    if (isNearBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function addSystemMessage(message) {
    displayMessage({
        username: 'System',
        message: message,
        timestamp: Date.now(),
        isSystem: true
    });
}

function setupMessageInput() {
    const input = document.getElementById('message-input');
    const sendButton = document.getElementById('send-message');
    
    // Handle @ mentions
    input.addEventListener('keydown', (e) => {
        if (e.key === '@') {
            // Show all members immediately when @ is typed
            const matches = Array.from(roomMembers.values())
                .filter(member => member.userId !== currentUser)
                .slice(0, 5);
            
            if (matches.length > 0) {
                showMentionSuggestions(matches, input, '@');
            }
        }
    });
    
    input.addEventListener('input', (e) => {
        const text = input.value;
        const cursorPos = input.selectionStart;
        const beforeCursor = text.slice(0, cursorPos);
        const mentionMatch = beforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            const searchTerm = mentionMatch[1].toLowerCase();
            const matches = Array.from(roomMembers.values())
                .filter(member => 
                    member.userId !== currentUser && 
                    member.username.toLowerCase().includes(searchTerm)
                )
                .slice(0, 5);
            
            if (matches.length > 0) {
                showMentionSuggestions(matches, input, mentionMatch[0]);
            } else {
                hideMentionSuggestions();
            }
        } else {
            hideMentionSuggestions();
        }
        
        // Auto-resize and update send button
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        
        const isEmpty = input.value.trim().length === 0;
        sendButton.disabled = isEmpty;
        sendButton.className = `px-6 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            isEmpty ? 'bg-gray-600 cursor-not-allowed' : 'primary-button hover:bg-blue-600'
        }`;
    });
    
    // Handle Enter to send
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Send button click
    sendButton.addEventListener('click', sendMessage);
    
    // Close mention suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#mention-suggestions') && e.target !== input) {
            hideMentionSuggestions();
        }
    });
}

// Show mention suggestions dropdown
function showMentionSuggestions(matches, input, partial) {
    const mentionContainer = document.getElementById('mention-suggestions') || createMentionContainer();
    
    const suggestions = matches.map(member => {
        const username = escapeHtml(member.username);
        return `<div class="p-3 hover:bg-gray-700 cursor-pointer flex items-center space-x-3 touch-manipulation" data-username="${username}">
            <div class="w-2 h-2 rounded-full bg-green-500"></div>
            <div class="flex-1">
                <div class="text-sm font-medium text-gray-100">@${username}</div>
            </div>
        </div>`;
    }).join('');

    mentionContainer.innerHTML = `
        <div class="p-2 bg-gray-800 border-b border-gray-700">
            <div class="text-sm text-gray-400">Tap a user to mention them</div>
        </div>
        <div class="divide-y divide-gray-700">${suggestions}</div>
    `;
    
    mentionContainer.querySelectorAll('[data-username]').forEach(el => {
        el.addEventListener('click', () => completeMention(el.dataset.username, partial));
    });
    
    mentionContainer.style.display = 'block';
    positionMentionContainer(input);
}

// Create mention container if it doesn't exist
function createMentionContainer() {
    const container = document.createElement('div');
    container.id = 'mention-suggestions';
    container.className = 'fixed bg-gray-800 rounded-lg shadow-lg border border-gray-700 max-h-48 overflow-y-auto z-50 transition-transform duration-200 ease-in-out';
    document.body.appendChild(container);
    return container;
}

function updateMembersList(members) {
    console.log('Updating members list with:', members);
    const membersList = document.getElementById('members-list');
    
    // Clear the list
    membersList.innerHTML = '';
    
    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item flex items-center space-x-3 p-2 hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer';
        memberItem.dataset.userId = member.userId;
        
        const avatar = document.createElement('div');
        avatar.className = 'w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-medium text-white';
        avatar.textContent = member.username.charAt(0).toUpperCase();
        
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'text-gray-100';
        usernameSpan.textContent = member.username;
        
        memberItem.appendChild(avatar);
        memberItem.appendChild(usernameSpan);
        
        // Add click handler for mentioning users
        memberItem.addEventListener('click', () => {
            mentionUser(member.username);
        });
        
        membersList.appendChild(memberItem);
    });
    
    // Update room count
    const roomCount = document.getElementById('room-count');
    if (roomCount) {
        roomCount.textContent = members.length;
    }
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && socket.connected && currentRoom) {
        // Extract mentions
        const mentions = [];
        const mentionRegex = /@(\w+)/g;
        let match;
        
        while ((match = mentionRegex.exec(message)) !== null) {
            const username = match[1];
            const memberElement = Array.from(document.querySelectorAll('.member-item')).find(el => 
                el.querySelector('.text-gray-100').textContent === username
            );
            if (memberElement) {
                mentions.push(memberElement.dataset.userId);
            }
        }

        const messageData = {
            content: message,
            sender: currentUsername,
            roomId: currentRoom,
            timestamp: Date.now(),
            mentions: mentions
        };
        
        console.log('Sending message:', messageData);
        socket.emit('message', messageData);
        
        input.value = '';
        input.style.height = 'auto';
        input.focus();
    }
}

function joinRoom(roomId, username) {
    if (!socket.connected) {
        showError('Not connected to server');
        return;
    }
    
    const joinData = {
        roomId: roomId,
        username: username,
        publicKey: publicKey
    };
    
    console.log('Joining room:', joinData);
    socket.emit('join-room', joinData);
}

socket.on('roomError', (error) => {
    showError(error.message || 'Error joining room');
});

socket.on('messageError', (error) => {
    showError(error.message || 'Error sending message');
});

// Handle leave room button click
document.getElementById('leave-room').addEventListener('click', () => {
    leaveRoom();
});

function leaveRoom() {
    console.log('Leave room clicked');
    if (currentRoom) {
        socket.emit('leave-room', { 
            roomId: currentRoom,
            userId: currentUser 
        });
        
        // Clear everything
        currentRoom = null;
        currentUsername = null;
        messageHistory = [];
        roomMembers.clear();
        
        // Clear UI
        document.getElementById('messages').innerHTML = '';
        document.getElementById('members-list').innerHTML = '';
        document.getElementById('chat-container').classList.add('hidden');
        
        // Show join container and reset form
        const joinContainer = document.getElementById('join-container');
        joinContainer.classList.remove('hidden');
        document.getElementById('username').value = '';
        document.getElementById('room-id').value = '';
        
        // Force reload to ensure clean state
        window.location.reload();
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
    positionMentionContainer(input);
}

// Function to position mention container
function positionMentionContainer(input) {
    const rect = input.getBoundingClientRect();
    
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

function downloadAsText() {
    const text = messageHistory.map(msg => 
        `[${new Date(msg.timestamp).toLocaleString()}] ${msg.username}: ${msg.message}`
    ).join('\n');
    
    downloadFile(text, 'chat-history.txt', 'text/plain');
}

function downloadAsCSV() {
    const header = 'Timestamp,Username,Message\n';
    const csv = messageHistory.map(msg => 
        `"${msg.timestamp}","${msg.username}","${msg.message.replace(/"/g, '""')}"`
    ).join('\n');
    
    downloadFile(header + csv, 'chat-history.csv', 'text/csv');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Load app info
fetch('/info.json')
    .then(response => response.json())
    .then(info => {
        // Update all app info elements
        document.getElementById('app-name').textContent = info.name;
        document.getElementById('app-version').textContent = `v${info.version}`;
        document.getElementById('app-description').textContent = info.description;
        document.getElementById('app-author').textContent = info.author;
        
        const websiteLink = document.getElementById('app-website');
        websiteLink.href = info.website;
        websiteLink.textContent = info.website;
    })
    .catch(console.error);

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add download button event listeners
    document.getElementById('download-txt').addEventListener('click', downloadAsText);
    document.getElementById('download-csv').addEventListener('click', downloadAsCSV);
    
    // Update leave room button to clear history
    document.getElementById('leave-room').addEventListener('click', leaveRoom);
    setupMessageInput();
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
