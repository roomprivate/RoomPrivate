import websocket from '../websocket.js';
import { encryptMessage, decryptMessage, escapeHtml } from '../utils.js';

// Modal event handlers
document.querySelectorAll('.modal').forEach(modal => {
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Close modal when clicking cancel button
    modal.querySelectorAll('button[type="button"]').forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
});

// Create room form handling
const createRoomForm = document.getElementById('createRoomForm');
createRoomForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const description = document.getElementById('roomDescription')?.value.trim();
    const maxMembers = parseInt(document.getElementById('maxMembers')?.value || '0', 10);
    const isPrivate = document.getElementById('isPrivate')?.checked;
    const password = document.getElementById('roomPassword')?.value;

    // Send create room request with username
    websocket.send('create-room', {
        username: window.state.username,
        roomName: `${window.state.username}'s Room`,
        description: description || undefined,
        maxMembers: maxMembers || 0, // 0 means unlimited
        password: isPrivate ? password : undefined
    });

    const modal = createRoomForm.closest('.modal');
    if (modal) {
        modal.classList.remove('active');
    }
});

// Store room keys
window.roomKeys = new Map();

// Handle room created event
websocket.on('room-created', (data) => {
    console.log('Room created:', data);
    addRoomToList(data);
    // Store room key
    if (data.roomKey) {
        console.log('Storing room key for room:', data.id);
        window.roomKeys.set(data.id, data.roomKey);
    }
});

// Handle room joined event
websocket.on('room-joined', (data) => {
    console.log('Room joined:', data);
    
    // Update room header with name and ID
    const currentRoomName = document.getElementById('currentRoomName');
    const roomIdContainer = document.getElementById('roomIdContainer');
    const currentRoomId = document.getElementById('currentRoomId');
    
    if (currentRoomName) currentRoomName.textContent = data.name;
    if (currentRoomId) currentRoomId.textContent = data.id;
    if (roomIdContainer) roomIdContainer.classList.remove('hidden');
    
    // Clear previous messages
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) messagesContainer.innerHTML = '';
    
    // Clear previous member list
    const membersList = document.getElementById('membersList');
    if (membersList) membersList.innerHTML = '';
    
    // Store room key
    if (data.roomKey) {
        console.log('Storing room key for joined room:', data.id);
        window.roomKeys.set(data.id, data.roomKey);
    }
    
    // Highlight active room
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-room-id') === data.id) {
            item.classList.add('active');
        }
    });

    // Request messages and member list
    websocket.send('get-messages', { roomId: data.id });
    websocket.send('get-members', { roomId: data.id });
});

// Handle messages received
websocket.on('message', (data) => {
    console.log('RECEIVED MESSAGE FROM SERVER:', data);
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('FUCK - NO MESSAGES CONTAINER');
        return;
    }

    // Don't show own messages again since we already added them
    if (data.username === window.state.username) {
        console.log('SKIPPING OWN MESSAGE');
        return;
    }

    const roomKey = window.roomKeys.get(data.roomId);
    console.log('GOT ROOM KEY:', roomKey ? 'YES' : 'NO');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    if (data.type === 'system') {
        console.log('SYSTEM MESSAGE:', data.content);
        messageDiv.innerHTML = `
            <div class="system-message">${escapeHtml(data.content)}</div>
        `;
    } else {
        try {
            console.log('DECRYPTING MESSAGE...');
            const decryptedContent = decryptMessage(data.content, data.iv, roomKey);
            console.log('MESSAGE DECRYPTED:', decryptedContent);
            
            const formattedContent = escapeHtml(decryptedContent).replace(/\n/g, '<br>');
            
            messageDiv.innerHTML = `
                <div class="message-bubble other">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium text-gray-300">${escapeHtml(data.username)}</span>
                        <span class="text-xs text-gray-500">
                            ${escapeHtml(data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '')}
                        </span>
                    </div>
                    <div class="text-gray-200 whitespace-pre-wrap break-words">${formattedContent}</div>
                </div>
            `;
        } catch (error) {
            console.error('FUCK - FAILED TO DECRYPT:', error);
            messageDiv.innerHTML = `
                <div class="system-message text-red-500">Failed to decrypt message</div>
            `;
        }
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Handle messages history
websocket.on('messages', (data) => {
    console.log('GOT MESSAGE HISTORY:', data);
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('FUCK - NO MESSAGES CONTAINER');
        return;
    }

    // Clear existing messages
    messagesContainer.innerHTML = '';

    const roomKey = window.roomKeys.get(data.roomId);
    console.log('GOT ROOM KEY FOR HISTORY:', roomKey ? 'YES' : 'NO');

    if (!data.messages) {
        console.error('FUCK - NO MESSAGES IN DATA');
        return;
    }

    data.messages.forEach(message => {
        console.log('PROCESSING MESSAGE:', message);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        if (message.type === 'system') {
            console.log('SYSTEM MESSAGE:', message.content);
            messageDiv.innerHTML = `
                <div class="system-message">${escapeHtml(message.content)}</div>
            `;
        } else {
            try {
                console.log('DECRYPTING MESSAGE...');
                const decryptedContent = decryptMessage(message.content, message.iv, roomKey);
                console.log('MESSAGE DECRYPTED:', decryptedContent);
                
                const isOwn = message.username === window.state.username;
                const formattedContent = escapeHtml(decryptedContent).replace(/\n/g, '<br>');
                
                messageDiv.innerHTML = `
                    <div class="message-bubble ${isOwn ? 'own' : 'other'}">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium text-gray-300">${escapeHtml(message.username)}</span>
                            <span class="text-xs text-gray-500">
                                ${escapeHtml(message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '')}
                            </span>
                        </div>
                        <div class="text-gray-200 whitespace-pre-wrap break-words">${formattedContent}</div>
                    </div>
                `;
            } catch (error) {
                console.error('FUCK - FAILED TO DECRYPT:', error);
                messageDiv.innerHTML = `
                    <div class="system-message text-red-500">Failed to decrypt message</div>
                `;
            }
        }
        
        messagesContainer.appendChild(messageDiv);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Message input handling
const messageInput = document.getElementById('messageInput');
if (messageInput) {
    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight) + 'px';
    });

    // Handle enter key
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const form = messageInput.closest('form');
            if (form) form.dispatchEvent(new Event('submit'));
        }
    });
}

// Message form handling
const messageForm = document.getElementById('messageForm');
messageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageInput = document.getElementById('messageInput');
    const message = messageInput?.value.trim();
    const roomId = document.getElementById('currentRoomId')?.textContent;

    console.log('TRYING TO SEND MESSAGE:', { message, roomId });

    if (message && roomId) {
        const roomKey = window.roomKeys.get(roomId);
        if (!roomKey) {
            console.error('FUCK - NO ROOM KEY FOR ENCRYPTION');
            return;
        }

        try {
            console.log('ENCRYPTING MESSAGE WITH KEY:', roomKey);
            // Encrypt message
            const encrypted = encryptMessage(message, roomKey);
            console.log('MESSAGE ENCRYPTED:', encrypted);
            
            // Add message to UI first
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                messageDiv.innerHTML = `
                    <div class="message-bubble own">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium text-gray-300">${escapeHtml(window.state.username)}</span>
                            <span class="text-xs text-gray-500">
                                ${escapeHtml(new Date().toLocaleTimeString())}
                            </span>
                        </div>
                        <div class="text-gray-200 whitespace-pre-wrap break-words">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
                    </div>
                `;
                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
            // Send to server
            websocket.send('message', {
                roomId,
                content: encrypted.content,
                iv: encrypted.iv,
                timestamp: new Date().toISOString()
            });
            
            console.log('MESSAGE SENT TO SERVER');
            if (messageInput) {
                messageInput.value = '';
                messageInput.style.height = 'auto';
            }
        } catch (error) {
            console.error('FAILED TO SEND MESSAGE:', error);
        }
    } else {
        console.error('MISSING MESSAGE OR ROOM ID:', { message: !!message, roomId: !!roomId });
    }
});

// Handle member list updates
websocket.on('members', (data) => {
    console.log('Members update:', data);
    const membersList = document.getElementById('membersList');
    if (!membersList) {
        console.error('Members list container not found');
        return;
    }

    membersList.innerHTML = '';
    data.members.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'flex items-center space-x-3 mb-3';
        memberDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <span class="text-sm text-gray-300">${escapeHtml(member.username.charAt(0).toUpperCase())}</span>
            </div>
            <span class="text-gray-300">${escapeHtml(member.username)}</span>
        `;
        membersList.appendChild(memberDiv);
    });
});

// Helper function to add room to list
function addRoomToList(data) {
    console.log('Adding room to list:', data);
    const roomList = document.getElementById('roomList');
    if (!roomList || !data.id) {
        console.error('Room list not found or invalid data');
        return;
    }

    const roomItem = document.createElement('div');
    roomItem.className = 'room-item p-4 hover:bg-gray-800 cursor-pointer transition-colors';
    roomItem.setAttribute('data-room-id', data.id);
    roomItem.innerHTML = `
        <div class="flex justify-between items-center">
            <div>
                <h3 class="font-medium text-gray-300">${escapeHtml(data.name)}</h3>
                ${data.description ? `<p class="text-sm text-gray-500">${escapeHtml(data.description)}</p>` : ''}
            </div>
            <div class="text-sm text-gray-500">
                ${data.maxMembers > 0 ? `${data.memberCount}/${data.maxMembers}` : `${data.memberCount}/∞`}
            </div>
        </div>
    `;
    
    roomItem.addEventListener('click', () => {
        console.log('Room clicked:', data.id);
        websocket.send('join-room', {
            roomId: data.id,
            username: window.state.username,
            password: data.password
        });
    });
    
    roomList.appendChild(roomItem);
}

// Join room form handling
const joinRoomForm = document.getElementById('joinRoomForm');
joinRoomForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomId = document.getElementById('roomId')?.value.trim();
    const password = document.getElementById('roomPassword')?.value;

    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }

    // Send join room request with username
    websocket.send('join-room', {
        roomId,
        password,
        username: window.state.username,
        userColor: window.state.userColor
    });

    const modal = joinRoomForm.closest('.modal');
    if (modal) {
        modal.style.display = 'none';
    }
});

// Handle copy room ID
document.getElementById('copyRoomId')?.addEventListener('click', () => {
    const roomId = document.getElementById('currentRoomId')?.textContent;
    if (roomId) {
        navigator.clipboard.writeText(roomId).then(() => {
            // Show temporary success message
            const button = document.getElementById('copyRoomId');
            if (button) {
                button.classList.add('text-green-500');
                setTimeout(() => button.classList.remove('text-green-500'), 1000);
            }
        });
    }
});
