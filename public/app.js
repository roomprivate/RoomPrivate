// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;
let currentSocketId = null;
let isCreatingRoom = false;

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

// Initialize connection when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, connecting to WebSocket...');
    connectWebSocket();
    setupUIEventListeners();
});

function connectWebSocket() {
    console.log('Starting WebSocket connection...');
    
    // Close existing connection if any
    if (ws) {
        console.log('Closing existing connection...');
        ws.close();
        ws = null;
    }

    try {
        const wsUrl = 'ws://localhost:2052/ws';
        console.log('Connecting to:', wsUrl);
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket CONNECTED!');
            reconnectAttempts = 0;
            showConnectionStatus('Connected', 'success');
        };
        
        ws.onclose = (event) => {
            console.log('WebSocket CLOSED:', event.code, event.reason);
            currentSocketId = null;
            isCreatingRoom = false;
            showConnectionStatus('Disconnected', 'error');
            
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
                console.log(`Reconnecting in ${delay}ms... Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts}`);
                setTimeout(() => {
                    reconnectAttempts++;
                    connectWebSocket();
                }, delay);
            } else {
                showError('Connection lost. Please refresh the page.');
            }
        };
        
        ws.onmessage = (event) => {
            console.log('Received raw message:', event.data);
            try {
                const { event: eventName, data } = JSON.parse(event.data);
                console.log('Parsed message:', { eventName, data });
                
                if (eventName === 'connection' && data.socketId) {
                    currentSocketId = data.socketId;
                    console.log('Got socket ID:', currentSocketId);
                }
                
                handleEvent(eventName, data);
            } catch (error) {
                console.error('Failed to parse message:', error);
                console.log('Raw message was:', event.data);
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket ERROR:', error);
            showError('Connection error occurred');
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        showError('Failed to connect to server');
        
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
            setTimeout(() => {
                reconnectAttempts++;
                connectWebSocket();
            }, delay);
        }
    }
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
        if (event === 'create-room') {
            isCreatingRoom = true;
        }
        
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

function handleEvent(event, data) {
    console.log('Handling event:', event, data);
    
    switch (event) {
        case 'connection':
            if (data.socketId) {
                currentSocketId = data.socketId;
                console.log('Connected with socket ID:', currentSocketId);
            }
            break;
            
        case 'public-key-registered':
            console.log('Public key registered:', data);
            break;

        case 'room-created':
            if (isCreatingRoom) {
                isCreatingRoom = false;
                handleRoomCreated(data);
            }
            break;

        case 'room-joined':
            handleRoomJoined(data);
            break;

        case 'member-joined':
            if (data.roomId === currentRoom) {
                console.log('New member joined:', data);
                updateMembersList(data.members);
                addSystemMessage(`${data.member.username} has joined the room`);
            }
            break;

        case 'member-left':
            if (data.roomId === currentRoom) {
                console.log('Member left:', data);
                updateMembersList(data.members);
                addSystemMessage(`${data.username} has left the room`);
            }
            break;

        case 'message':
            handleMessage(data);
            break;

        case 'error':
            showError(data.message || 'An error occurred');
            break;

        default:
            console.log('Unknown event:', event, data);
    }
}

messagesDiv.addEventListener('scroll', () => {
    isNearBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 50;
});

messageInput.addEventListener('input', () => {
    isTyping = true;
    setTimeout(() => isTyping = false, 1000);
});

// Set up UI event listeners
function setupUIEventListeners() {
    console.log('Setting up UI event listeners...');
    
    // Create room button
    const createRoomBtn = document.getElementById('create-room-btn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            console.log('Create room clicked');
            joinContainer.classList.add('hidden');
            createRoomContainer.classList.remove('hidden');
        });
    }
    
    // Create room submit button
    const createRoomSubmit = document.getElementById('create-room-submit');
    if (createRoomSubmit) {
        createRoomSubmit.addEventListener('click', () => {
            console.log('Creating room...');
            
            const username = document.getElementById('create-username').value.trim();
            const description = document.getElementById('room-description').value.trim();
            const maxMembers = parseInt(document.getElementById('room-max-members').value) || 0;
            const hasPassword = document.getElementById('room-password-toggle').checked;
            const password = hasPassword ? document.getElementById('room-password').value : '';
            
            if (!username) {
                showError('Please enter a username');
                return;
            }
            
            console.log('Sending create-room event with data:', {
                username,
                description,
                maxMembers,
                hasPassword
            });
            
            sendEvent('create-room', {
                username,
                roomName: `${username}'s Room`,
                description,
                maxMembers,
                password
            });
        });
    }
    
    // Join room button
    const joinRoomBtn = document.getElementById('join-room-btn');
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            console.log('Join room clicked');
            joinContainer.classList.add('hidden');
            joinRoomForm.classList.remove('hidden');
        });
    }
    
    // Join room submit button
    const joinRoomSubmit = document.getElementById('join-room-submit');
    if (joinRoomSubmit) {
        joinRoomSubmit.addEventListener('click', () => {
            console.log('Joining room...');
            
            const username = document.getElementById('username').value.trim();
            const roomId = document.getElementById('room-id').value.trim();
            const password = document.getElementById('join-room-password').value;
            
            if (!username || !roomId) {
                showError('Username and Room ID are required');
                return;
            }
            
            console.log('Sending join-room event:', { username, roomId });
            
            sendEvent('join-room', {
                username,
                roomId,
                password
            });
        });
    }
    
    // Back buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('Back clicked');
            createRoomContainer.classList.add('hidden');
            joinRoomForm.classList.add('hidden');
            joinContainer.classList.remove('hidden');
        });
    });
}

// Password toggle handlers
document.getElementById('room-password-toggle').addEventListener('change', function() {
    const passwordGroup = document.getElementById('room-password-group');
    passwordGroup.classList.toggle('hidden', !this.checked);
    if (!this.checked) {
        document.getElementById('room-password').value = '';
    }
});

document.getElementById('join-room-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (!currentSocketId) {
        showError('Not connected to server. Please try again.');
        return;
    }
    
    const roomId = document.getElementById('join-room-id').value.trim();
    const username = document.getElementById('join-username').value.trim();
    const password = document.getElementById('join-room-password').value.trim();
    
    if (!roomId || !username) {
        showError('Room ID and username are required');
        return;
    }
    
    joinRoom(roomId, username, password);
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

function handleRoomCreated(data) {
    console.log('Room created:', data);
    
    // Hide create form and show chat
    const createRoomContainer = document.getElementById('create-room-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (!createRoomContainer || !chatContainer) {
        console.error('Required elements not found');
        return;
    }
    
    createRoomContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // Set current room info
    currentRoom = data.id;
    currentUsername = data.members[0].username;
    
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
    updateMembersList(data.members, data.maxMembers);
    
    // Add system message
    addSystemMessage('Room created successfully');
    
    // Focus message input
    const messageInput = document.getElementById('message-input');
    if (messageInput) messageInput.focus();
}

function handleRoomJoined(data) {
    console.log('Joined room:', data);
    
    // Hide join form and show chat
    const joinRoomForm = document.getElementById('join-room-form');
    const chatContainer = document.getElementById('chat-container');
    
    if (!joinRoomForm || !chatContainer) {
        console.error('Required elements not found');
        return;
    }
    
    joinRoomForm.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // Set current room info
    currentRoom = data.id;
    currentUsername = data.members.find(m => m.userId === currentSocketId)?.username;
    
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
    updateMembersList(data.members, data.maxMembers);
    
    // Add system message
    addSystemMessage('You have joined the room');
    
    // Focus message input
    const messageInput = document.getElementById('message-input');
    if (messageInput) messageInput.focus();
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
                <div class="w-2 h-2 rounded-full ${member.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}"></div>
                <span class="text-white">${member.username}</span>
            </div>
            ${member.userId === currentSocketId ? '<span class="text-xs text-gray-400">(you)</span>' : ''}
        `;
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
    console.log('Leave room clicked');
    if (currentRoom) {
        // Send leave room event
        sendEvent('leave-room', { 
            roomId: currentRoom,
            userId: currentUser 
        });
        
        // Clear room state
        currentRoom = null;
        currentUser = null;
        roomKey = null;
        currentUsername = null;
        roomMembers.clear();
        
        // Clear messages
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = '';
        
        // Reset UI
        chatContainer.classList.add('hidden');
        joinContainer.classList.remove('hidden');
        document.title = 'Chat Room';
        
        // Clear input
        document.getElementById('message-input').value = '';
        
        addSystemMessage('You have left the room');
    }
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

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!message || !currentRoom || !currentUsername) return;
    
    const messageData = {
        content: message,
        sender: currentUsername,
        roomId: currentRoom,
        timestamp: Date.now(),
        mentions: extractMentions(message)
    };
    
    console.log('Sending message:', messageData);
    
    // Send the message event
    sendEvent('message', messageData);
    
    // Clear input
    input.value = '';
    
    // Display message locally immediately
    handleMessage(messageData);
}

function extractMentions(message) {
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
    
    return mentions;
}

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

function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Track displayed messages to prevent duplicates
const displayedMessages = new Set();

function handleMessage(data) {
    try {
        // Messages are not encrypted in this version
        console.log('Received message:', data);
        
        // Create a unique key for this message
        const messageKey = `${data.sender}-${data.timestamp}-${data.content}`;
        
        // Skip if we've already displayed this message
        if (displayedMessages.has(messageKey)) {
            console.log('Skipping duplicate message:', messageKey);
            return;
        }
        
        // Add to displayed messages set
        displayedMessages.add(messageKey);
        
        // Clean up old messages from the set (keep last 100)
        if (displayedMessages.size > 100) {
            const [firstKey] = displayedMessages;
            displayedMessages.delete(firstKey);
        }
        
        displayMessage({
            username: data.sender,
            message: data.content,
            timestamp: data.timestamp,
            isSystem: false,
            mentions: data.mentions || []
        });
    } catch (error) {
        console.error('Error processing message:', error);
        showError('Failed to display message');
    }
}

function decryptMessage(encryptedData) {
    try {
        // Only decrypt if the data is actually encrypted
        if (typeof encryptedData === 'string') {
            const { key: encryptedKey, message: encryptedMessage } = JSON.parse(encryptedData);
            
            // Decrypt the message key using our private key
            const messageKey = CryptoJS.AES.decrypt(
                encryptedKey,
                publicKey
            ).toString(CryptoJS.enc.Utf8);
            
            // Use the decrypted message key to decrypt the actual message
            const decryptedMessage = CryptoJS.AES.decrypt(
                encryptedMessage,
                messageKey
            ).toString(CryptoJS.enc.Utf8);
            
            return JSON.parse(decryptedMessage);
        } else {
            // If data is not encrypted (like room creation response), return as is
            return encryptedData;
        }
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

function displayMessage({ username, message, timestamp, isSystem, mentions = [] }) {
    console.log('Displaying message:', { username, message, timestamp, isSystem, mentions });
    
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = isSystem ? 'text-gray-400 text-sm' : 'message-container';

    if (isSystem) {
        messageDiv.textContent = message;
    } else {
        const time = new Date(timestamp).toLocaleTimeString();
        messageDiv.innerHTML = `
            <div class="flex items-start space-x-2">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <span class="text-white text-sm">${username.charAt(0).toUpperCase()}</span>
                    </div>
                </div>
                <div class="flex-1">
                    <div class="flex items-baseline space-x-2">
                        <span class="font-medium text-white">${username}</span>
                        <span class="text-xs text-gray-400">${time}</span>
                    </div>
                    <div class="mt-1 text-gray-200">${formatMessage(message, mentions)}</div>
                </div>
            </div>
        `;
    }

    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
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
