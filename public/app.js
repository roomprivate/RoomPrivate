// WebSocket connection
let ws;
let currentRoom;
let currentUsername;
let currentSocketId;
let currentRoomKey;
let currentRoomPrivateKey;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let heartbeatInterval;
let lastMessageTime;

// 4 minutes ping interval (server timeout is 5 minutes)
const HEARTBEAT_INTERVAL = 4 * 60 * 1000;  // 4 minutes
const ACTIVITY_CHECK_INTERVAL = 60 * 1000;  // 1 minute

function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    lastMessageTime = Date.now();
    
    // Send ping every 4 minutes (server timeout is 5 minutes)
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            // Only send heartbeat if no message was sent in the last interval
            const timeSinceLastMessage = Date.now() - lastMessageTime;
            if (timeSinceLastMessage >= HEARTBEAT_INTERVAL) {
                ws.ping();
                console.debug('Sending heartbeat ping');
            }
        }
    }, HEARTBEAT_INTERVAL);
}

function updateLastMessageTime() {
    lastMessageTime = Date.now();
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    if (ws) {
        ws.close();
        stopHeartbeat();
    }
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        showConnectionStatus('Connected', 'success');
        startHeartbeat();
        
        // If we were in a room, try to rejoin
        if (currentRoom && currentUsername) {
            joinRoom(currentRoom, currentUsername, '');
        }
    };
    
    ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        showConnectionStatus('Disconnected - Reconnecting...', 'error');
        stopHeartbeat();
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 1000 * Math.min(reconnectAttempts * 2, 30));
        } else {
            showConnectionStatus('Failed to reconnect - Please refresh the page', 'error');
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showConnectionStatus('Connection error', 'error');
    };
    
    ws.onmessage = (event) => {
        updateLastMessageTime();  // Update last message time on any message
        try {
            const data = JSON.parse(event.data);
            if (data.event === 'connected') {
                currentSocketId = data.data.socketId;
                console.log('Socket ID set:', currentSocketId);
            } else {
                handleEvent(data.event, data.data);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

function handleEvent(event, data) {
    console.log('Handling event:', event, data);
    
    switch (event) {
        case 'room-created':
            handleRoomCreated(data);
            break;
        case 'room-joined':
            handleRoomJoined(data);
            break;
        case 'member-joined':
            handleMemberJoined(data);
            break;
        case 'member-left':
            handleMemberLeft(data);
            break;
        case 'message':
        case 'message-sent':
            handleMessage(data);
            break;
        case 'error':
            handleError(data);
            break;
        default:
            console.log('Unknown event:', event, data);
    }
}

// Initialize WebSocket connection and UI only once when page loads
let initialized = false;
document.addEventListener('DOMContentLoaded', () => {
    if (!initialized) {
        console.log('Initializing application...');
        setupUIEventListeners();
        connectWebSocket();
        initialized = true;
    }
});

// UI Elements
const joinContainer = document.getElementById('join-container');
const createRoomContainer = document.getElementById('create-room-container');
const joinRoomForm = document.getElementById('join-room-form');
const chatContainer = document.getElementById('chat-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');

// State
let currentUser = null;
let roomKey = null;
let publicKey = null;

// Keep track of room members for mentions
let roomMembers = new Map();

// Track if user is near bottom
let isNearBottom = true;

// Track if user is typing
let isTyping = false;

// Message history
let messageHistory = [];

// Create mention suggestions container
const mentionContainer = document.createElement('div');
mentionContainer.id = 'mention-suggestions';
mentionContainer.className = 'fixed bottom-16 left-0 right-0 md:left-auto md:right-auto md:ml-4 max-w-sm mx-auto bg-gray-800 rounded-lg shadow-lg border border-gray-700 max-h-48 overflow-y-auto z-50';
mentionContainer.style.display = 'none';
document.body.appendChild(mentionContainer);

// Function to hide mention suggestions
function hideMentionSuggestions() {
    mentionContainer.style.display = 'none';
}

function showConnectionStatus(message, type) {
    console.log('Connection status:', message, type);
    const statusDiv = document.createElement('div');
    statusDiv.className = `connection-status ${type}`;
    statusDiv.textContent = message;
    document.body.appendChild(statusDiv);
    
    setTimeout(() => {
        statusDiv.remove();
    }, 3000);
}

function sendEvent(event, data) {
    if (!ws) {
        console.error('No WebSocket connection!');
        showError('Not connected to server');
        return false;
    }
    
    if (ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open! State:', ws.readyState);
        showError('Server connection not ready');
        return false;
    }
    
    try {
        const message = JSON.stringify({ event, data });
        console.log('Sending:', message);
        ws.send(message);
        return true;
    } catch (error) {
        console.error('Failed to send message:', error);
        showError('Failed to send message');
        return false;
    }
}

function handleRoomCreated(data) {
    console.log('Room created:', data);
    
    // Hide create form and show chat
    createRoomContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // Set current room info
    currentRoom = data.id;
    // Find our member info from the members object
    const ourMember = Object.values(data.members).find(m => m.userId === currentSocketId);
    currentUsername = ourMember?.username;
    currentRoomPrivateKey = data.privateKey;
    currentRoomKey = data.roomKey;
    
    console.log('Set current user:', { currentUsername, currentSocketId, ourMember });
    
    // Update room info in UI
    const roomNameDisplay = document.getElementById('room-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    
    if (roomNameDisplay) {
        roomNameDisplay.textContent = data.name || 'Unnamed Room';
    } else {
        console.error('Room name display element not found');
    }
    
    if (roomIdDisplay) {
        roomIdDisplay.textContent = `Room ID: ${data.id}`;
    } else {
        console.error('Room ID display element not found');
    }
    
    // Update members list
    updateMembersList(Object.values(data.members), data.maxMembers);
    
    // Add system message
    addSystemMessage('Room created successfully');
    
    // Focus message input
    messageInput.focus();
}

function handleRoomJoined(data) {
    console.log('Joined room:', data);
    
    // Set current room info
    currentRoom = data.id;
    currentRoomPrivateKey = data.privateKey;
    currentRoomKey = data.roomKey;
    
    // Find our member info from the members array
    const ourMember = data.members.find(m => m.userId === currentSocketId);
    if (ourMember) {
        currentUsername = ourMember.username;
        console.log('Set current user:', { currentUsername, currentSocketId, ourMember });
    } else {
        console.error('Could not find our member info in the room members');
    }
    
    // Update room info in UI
    const roomNameDisplay = document.getElementById('room-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    
    if (roomNameDisplay) {
        roomNameDisplay.textContent = data.name || 'Unnamed Room';
    }
    
    if (roomIdDisplay) {
        roomIdDisplay.textContent = `Room ID: ${data.id}`;
    }
    
    // Update members list
    updateMembersList(data.members, data.maxMembers);
    
    // Hide join form and show chat
    joinContainer.classList.add('hidden');
    createRoomContainer.classList.add('hidden');
    joinRoomForm.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // Add system message
    addSystemMessage('You have joined the room');
    
    // Focus message input
    messageInput.focus();
}

function handleMemberJoined(data) {
    console.log('Member joined:', data);
    
    // Update members list
    updateMembersList(data.members, data.maxMembers);
    
    // Add system message
    addSystemMessage(`${data.member.username} has joined the room`);
}

function handleMemberLeft(data) {
    console.log('Member left:', data);
    const { username } = data;
    
    // Clear the members list and update with new data
    const membersList = document.getElementById('members-list');
    membersList.innerHTML = '';
    
    // Update the members list with remaining members
    if (data.members) {
        updateMembersList(data.members, data.maxMembers);
    }
    
    // Add system message
    addSystemMessage(`${username} has left the room`);
}

function updateMembersList(members, maxMembers) {
    console.log('Updating members list:', members);
    const membersList = document.getElementById('members-list');
    const membersCount = document.getElementById('members-count');
    
    if (!membersList || !membersCount) {
        console.error('Members list elements not found');
        return;
    }
    
    // Clear current list
    membersList.innerHTML = '';
    
    // Sort members by username
    members.sort((a, b) => a.username.localeCompare(b.username));
    
    // Add each member
    members.forEach(member => {
        const memberElement = document.createElement('div');
        memberElement.className = 'flex items-center justify-between p-2 hover:bg-gray-700 rounded';
        memberElement.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="w-2 h-2 rounded-full bg-green-500"></div>
                <span class="text-white">${member.username}</span>
            </div>
            ${member.userId === currentSocketId ? '<span class="text-xs text-gray-400">(you)</span>' : ''}
        `;
        memberElement.setAttribute('data-username', member.username);
        membersList.appendChild(memberElement);
    });
    
    // Update count with max members if available
    const maxMembersText = maxMembers > 0 ? `/${maxMembers}` : '';
    membersCount.textContent = `${members.length}${maxMembersText}`;
}

function addSystemMessage(message) {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) {
        console.error('Messages container not found');
        return;
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = 'text-center text-gray-400 text-sm';
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
    const mentionContainer = document.getElementById('mention-suggestions');
    
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

function positionMentionContainer(input) {
    const rect = input.getBoundingClientRect();
    const mentionContainer = document.getElementById('mention-suggestions');
    mentionContainer.style.top = `${rect.top + rect.height}px`;
    mentionContainer.style.left = `${rect.left}px`;
}

function completeMention(username, partial) {
    const input = document.getElementById('message-input');
    const text = input.value;
    const cursorPos = input.selectionStart;
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);
    
    // Replace the partial mention with the full username
    const newText = beforeCursor.replace(new RegExp(`${partial}$`), `@${username} `) + afterCursor;
    input.value = newText;
    
    // Move the cursor to the end of the mention
    input.selectionStart = cursorPos + username.length + 2;
    input.selectionEnd = cursorPos + username.length + 2;
    
    // Hide the mention suggestions
    hideMentionSuggestions();
}

function mentionUser(username) {
    const input = document.getElementById('message-input');
    const text = input.value;
    const cursorPos = input.selectionStart;
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);
    
    // Insert the mention at the cursor position
    const newText = beforeCursor + `@${username} ` + afterCursor;
    input.value = newText;
    
    // Move the cursor to the end of the mention
    input.selectionStart = cursorPos + username.length + 2;
    input.selectionEnd = cursorPos + username.length + 2;
}

function joinRoom(roomId, username, password) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Not connected to server');
        return;
    }
    
    const joinData = {
        roomId: roomId,
        username: username,
        password: password,
        publicKey: publicKey
    };
    
    console.log('Joining room:', joinData);
    sendEvent('join-room', joinData);
}

function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN && currentRoom && currentUsername) {
        sendEvent('leave-room', {
            roomId: currentRoom,
            username: currentUsername
        });
    }
    window.location.reload();
}

function formatMessage(text) {
    return escapeHtml(text);
}

function formatMessage(text, mentions) {
    // Escape HTML to prevent XSS
    text = text.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
    
    // Highlight mentions
    mentions.forEach(mention => {
        const regex = new RegExp(`@${mention}\\b`, 'g');
        text = text.replace(regex, `<span class="text-blue-400">@${mention}</span>`);
    });
    
    // Convert URLs to links
    text = text.replace(
        /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
        '<a href="$1" target="_blank" class="text-blue-400 hover:underline">$1</a>'
    );
    
    return text;
}

function extractMentions(text) {
    const mentions = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1]);
    }
    
    return mentions;
}

async function sendMessage(message) {
    if (!message) return;
    
    if (!currentUsername || !currentRoom) {
        console.error('Cannot send message - not properly connected:', { 
            currentUsername, 
            currentSocketId,
            currentRoom 
        });
        showError('Cannot send message - not properly connected to room');
        return;
    }
    
    const messageData = {
        content: message,
        sender: currentUsername,
        roomId: currentRoom,
        timestamp: Date.now(),
        mentions: extractMentions(message)
    };
    
    console.log('Sending message:', messageData);

    try {
        // First decrypt the room key using our private key
        const roomKey = CryptoJS.AES.decrypt(
            currentRoomKey,
            currentRoomPrivateKey
        ).toString(CryptoJS.enc.Utf8);

        // Generate a random IV
        const iv = CryptoJS.lib.WordArray.random(16);

        // Encrypt message with room key
        const encryptedContent = CryptoJS.AES.encrypt(
            JSON.stringify(messageData),
            roomKey,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        // Send encrypted message
        ws.send(JSON.stringify({
            event: 'message',
            data: {
                roomId: currentRoom,
                encryptedContent: encryptedContent.toString(),
                iv: iv.toString(CryptoJS.enc.Hex)
            }
        }));

        // Clear input
        document.getElementById('message-input').value = '';
    } catch (error) {
        console.error('Error encrypting message:', error);
        showError('Failed to encrypt message');
    }
}

document.getElementById('send-message').addEventListener('click', () => {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    if (message) {
        sendMessage(message);
        messageInput.value = '';
    }
});

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = e.target.value.trim();
        if (message) {
            sendMessage(message);
            e.target.value = '';
        }
    }
});

// Add message event listener to the form
document.getElementById('message-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    if (message) {
        sendMessage(message);
        messageInput.value = '';
    }
});

// Add click event listener to send button
document.getElementById('send-message').addEventListener('click', () => {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    if (message) {
        sendMessage(message);
        messageInput.value = '';
    }
});

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.classList.add('animate-fade-out');
        setTimeout(() => {
            errorDiv.remove();
        }, 300);
    }, 3000);
}

function handleMessage(data) {
    try {
        // First decrypt the room key using our private key
        const roomKey = CryptoJS.AES.decrypt(
            currentRoomKey,
            currentRoomPrivateKey
        ).toString(CryptoJS.enc.Utf8);

        // Decrypt the message content
        const decryptedContent = CryptoJS.AES.decrypt(
            data.encryptedContent,
            roomKey,
            {
                iv: CryptoJS.enc.Hex.parse(data.iv),
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        ).toString(CryptoJS.enc.Utf8);

        const messageData = JSON.parse(decryptedContent);
        console.log('Decrypted message:', messageData);

        // Create and add message to DOM
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-container p-2';
        messageDiv.innerHTML = `
            <div class="flex items-start space-x-2 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <span class="text-white text-sm">${messageData.sender.charAt(0).toUpperCase()}</span>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-baseline space-x-2">
                        <span class="font-medium text-white">${messageData.sender}</span>
                        <span class="text-xs text-gray-400">${new Date(messageData.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="mt-1 text-gray-200 break-words">${formatMessage(messageData.content, messageData.mentions)}</div>
                </div>
            </div>
        `;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Error processing message:', error);
        console.error('Error details:', { data, currentRoomKey, currentRoomPrivateKey });
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

function displayMessage({ username, message, timestamp, isSystem, mentions = [] }) {
    // Check if message has already been displayed
    const messageId = `${username}-${timestamp}-${message}`;
    if (displayedMessages.has(messageId)) {
        return;
    }
    displayedMessages.add(messageId);

    const messagesDiv = document.getElementById('messages');
    const messageElement = document.createElement('div');
    
    // Check if user was near bottom before adding new message
    const isNearBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 50;

    // Rest of the message display logic
    messageElement.className = `p-4 ${isSystem ? 'bg-gray-800' : 'hover:bg-gray-800'} transition-colors duration-200`;
    const formattedMessage = formatMessage(message, mentions);
    
    if (isSystem) {
        messageElement.innerHTML = `
            <div class="text-gray-400 text-sm">${formattedMessage}</div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="flex items-start">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-semibold text-primary-400">${escapeHtml(username)}</span>
                        <span class="text-xs text-gray-500">${new Date(timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="text-gray-300 mt-1">${formattedMessage}</div>
                </div>
            </div>
        `;
    }
    
    messagesDiv.appendChild(messageElement);
    
    // Auto-scroll only if user was already near bottom
    if (isNearBottom) {
        scrollToBottom();
    }
}

function downloadAsText() {
    const messages = document.getElementById('messages').children;
    let content = '';
    
    Array.from(messages).forEach(msg => {
        if (msg.classList.contains('text-gray-400')) {
            // System message
            content += `[System] ${msg.textContent}\n`;
        } else {
            // Regular message
            const username = msg.querySelector('.font-semibold').textContent;
            const time = msg.querySelector('.text-xs').textContent;
            const messageText = msg.querySelector('.text-gray-300').textContent;
            content += `[${time}] ${username}: ${messageText}\n`;
        }
    });
    
    downloadFile(content, 'chat-messages.txt', 'text/plain');
}

function downloadAsCSV() {
    const messages = document.getElementById('messages').children;
    let content = 'Timestamp,Username,Message\n';
    
    Array.from(messages).forEach(msg => {
        if (msg.classList.contains('text-gray-400')) {
            // System message
            content += `${new Date().toISOString()},System,${msg.textContent}\n`;
        } else {
            // Regular message
            const username = msg.querySelector('.font-semibold').textContent;
            const time = msg.querySelector('.text-xs').textContent;
            const messageText = msg.querySelector('.text-gray-300').textContent;
            content += `${time},${username},"${messageText.replace(/"/g, '""')}"\n`;
        }
    });
    
    downloadFile(content, 'chat-messages.csv', 'text/csv');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Track displayed messages to prevent duplicates
const displayedMessages = new Set();

// Set up UI event listeners
function setupUIEventListeners() {
    console.log('Setting up UI event listeners...');
    
    const safeAddEventListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with id '${id}' not found`);
        }
    };

    // Event handlers for room buttons
    safeAddEventListener('create-room-btn', 'click', () => {
        joinContainer.classList.add('hidden');
        createRoomContainer.classList.remove('hidden');
    });

    safeAddEventListener('join-room-btn', 'click', () => {
        joinContainer.classList.add('hidden');
        joinRoomForm.classList.remove('hidden');
    });

    // Back buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            createRoomContainer.classList.add('hidden');
            joinRoomForm.classList.add('hidden');
            joinContainer.classList.remove('hidden');
        });
    });

    // Create room submit
    safeAddEventListener('create-room-submit', 'click', () => {
        const username = document.getElementById('create-username').value;
        const description = document.getElementById('room-description').value;
        const maxMembers = parseInt(document.getElementById('room-max-members').value);
        const password = document.getElementById('room-password').value;

        if (!username) {
            alert('Please enter a username');
            return;
        }

        if (!currentSocketId) {
            console.error('Socket ID not set yet');
            showError('Not connected to server. Please try again.');
            return;
        }

        ws.send(JSON.stringify({
            event: 'create-room',
            data: {
                username,
                description,
                maxMembers,
                password,
                userId: currentSocketId
            }
        }));
    });

    // Join room submit
    safeAddEventListener('join-room-submit', 'click', () => {
        const username = document.getElementById('username').value;
        const roomId = document.getElementById('room-id').value;
        const password = document.getElementById('join-room-password').value;

        if (!username || !roomId) {
            alert('Please enter both username and room ID');
            return;
        }

        if (!currentSocketId) {
            console.error('Socket ID not set yet');
            showError('Not connected to server. Please try again.');
            return;
        }

        ws.send(JSON.stringify({
            event: 'join-room',
            data: {
                username,
                roomId,
                password,
                userId: currentSocketId
            }
        }));
    });

    // Password toggle
    safeAddEventListener('room-password-toggle', 'change', (e) => {
        const passwordGroup = document.getElementById('room-password-group');
        passwordGroup.classList.toggle('hidden', !e.target.checked);
    });

    // Add download and leave room button listeners
    safeAddEventListener('download-txt', 'click', downloadAsText);
    safeAddEventListener('download-csv', 'click', downloadAsCSV);
    safeAddEventListener('leave-room', 'click', leaveRoom);

    // Add copy room ID button listener
    safeAddEventListener('copy-room-id', 'click', () => {
        const roomIdText = document.getElementById('room-id-display').textContent;
        // Extract just the ID part (assuming format is "Room ID: XXX")
        const roomId = roomIdText.split(':')[1]?.trim() || roomIdText;
        navigator.clipboard.writeText(roomId).then(() => {
            // Change button color temporarily to indicate success
            const button = document.getElementById('copy-room-id');
            button.classList.remove('text-gray-400');
            button.classList.add('text-green-400');
            setTimeout(() => {
                button.classList.remove('text-green-400');
                button.classList.add('text-gray-400');
            }, 1000);
        });
    });
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (currentRoom && currentUsername && ws && ws.readyState === WebSocket.OPEN) {
            sendEvent('leave-room', {
                roomId: currentRoom,
                username: currentUsername
            });
        }
    });
}

// Update the room ID display function to format the ID display
function updateRoomDisplay(roomName, roomId) {
    document.getElementById('room-name-display').textContent = roomName;
    document.getElementById('room-id-display').textContent = `Room ID: ${roomId}`;
    document.title = `${roomName} - Chat Room`;
}

// Load app info
fetch('/info.json')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(info => {
        console.log('Loaded app info:', info);
        // Update all app info elements with fallbacks
        document.getElementById('app-name').textContent = info.name || 'RoomPrivate';
        document.getElementById('app-version').textContent = info.version ? `v${info.version}` : 'v0.0.1 Alpha';
        document.getElementById('app-description').textContent = info.description || 'Secure, end-to-end encrypted chat rooms';
        document.getElementById('app-author').textContent = info.author || 'Klee & C0de';
        
        const websiteLink = document.getElementById('app-website');
        websiteLink.href = info.website || 'https://room.juliaklee.wtf';
    })
    .catch(error => {
        console.error('Error loading app info:', error);
        // Keep default values from HTML if info.json fails to load
    });
