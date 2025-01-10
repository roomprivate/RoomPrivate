import websocket from '../websocket.js';
import { encryptMessage, decryptMessage, escapeHtml } from '../utils.js';

// Modal class
class Modal {
    constructor(element) {
        this.element = element;
        if (!this.element) {
            console.error('Modal element not found:', element);
            return;
        }
        
        // Close button handler
        const closeButtons = this.element.querySelectorAll('[data-close-modal]');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => this.hide());
        });
        
        // Click outside to close
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) {
                this.hide();
            }
        });
    }
    
    show() {
        console.log('Showing modal:', this.element?.id);
        if (!this.element) {
            console.error('Cannot show modal: element not found');
            return;
        }
        this.element.classList.remove('hidden');
        this.element.classList.add('flex');
    }
    
    hide() {
        console.log('Hiding modal:', this.element?.id);
        if (!this.element) {
            console.error('Cannot hide modal: element not found');
            return;
        }
        this.element.classList.add('hidden');
        this.element.classList.remove('flex');
    }
}

// Export Modal class
window.Modal = Modal;

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
window.privateKeys = new Map();

// Handle room created event
websocket.on('room-created', (data) => {
    console.log('Room created:', data);
    
    // Store room key
    if (data.roomKey) {
        console.log('Storing room key for room:', data.id);
        if (!window.roomKeys) {
            window.roomKeys = new Map();
        }
        window.roomKeys.set(data.id, data.roomKey);
    }

    // Add room to list
    console.log('Adding room to list:', data);
    addRoomToList(data);

    // Hide create room modal
    window.modals.createRoom?.close();
});

// Handle room joined event
websocket.on('room-joined', (data) => {
    console.log('Room joined:', data);

    // Store room key
    console.log('Storing room key for room:', data.id);
    window.roomKeys = window.roomKeys || new Map();
    window.roomKeys.set(data.id, data.roomKey);
    
    // Store private key if available
    if (data.privateKey) {
        console.log('Storing private key for room:', data.id);
        window.privateKeys = window.privateKeys || new Map();
        window.privateKeys.set(data.id, data.privateKey);
    }
    
    // Store member info
    if (!window.usernames) window.usernames = new Map();
    if (data.members) {
        data.members.forEach(member => {
            console.log('Storing member info:', member);
            window.usernames.set(member.userId, member.username);
        });
    }
    console.log('Updated usernames map:', [...window.usernames.entries()]);

    try {
        // Update room name
        const roomName = document.getElementById('currentRoomName');
        if (roomName) {
            roomName.textContent = data.name;
        }
        
        // Update room ID and show container
        const roomIdContainer = document.getElementById('roomIdContainer');
        const roomId = document.getElementById('currentRoomId');
        const copyButton = document.getElementById('copyRoomId');
        
        if (roomId) {
            roomId.textContent = data.id;
        }
        
        if (roomIdContainer) {
            roomIdContainer.classList.remove('hidden');
            roomIdContainer.style.display = 'flex';
        }
        
        // Add copy functionality
        if (copyButton) {
            copyButton.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(data.id);
                    copyButton.innerHTML = `
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    `;
                    setTimeout(() => {
                        copyButton.innerHTML = `
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                            </svg>
                        `;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            };
        }

        // Show chat interface and hide room list
        const chatInterface = document.getElementById('chatInterface');
        const roomList = document.getElementById('roomList');
        
        if (chatInterface) {
            chatInterface.classList.remove('hidden');
            chatInterface.style.display = 'flex';
        }

        // Clear and update messages container
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        // Update member count
        const memberCount = document.getElementById('memberCount');
        if (memberCount) {
            const totalMembers = (data.members || []).length;
            memberCount.textContent = data.maxMembers > 0 
                ? `${totalMembers}/${data.maxMembers}`
                : `${totalMembers}/∞`;
        }

        // Update members list
        const membersList = document.getElementById('membersList');
        if (membersList) {
            membersList.innerHTML = '';
            if (data.members) {
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
            }
        }
        
        // Request initial messages
        websocket.send('get-messages', { roomId: data.id });
    } catch (error) {
        console.error('Failed to update UI:', error);
    }
});

// Handle messages received
websocket.on('message', async (data) => {
    console.log('RECEIVED MESSAGE FROM SERVER:', data);
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('NO MESSAGES CONTAINER');
        return;
    }

    try {
        // Get current room ID
        const currentRoomId = document.getElementById('currentRoomId')?.textContent;
        if (!currentRoomId) {
            console.error('NO CURRENT ROOM ID');
            return;
        }

        // Get room key and private key
        const roomKey = window.roomKeys.get(currentRoomId);
        const privateKey = window.privateKeys.get(currentRoomId);
        
        console.log('Decryption attempt:', {
            currentRoomId,
            hasRoomKey: !!roomKey,
            hasPrivateKey: !!privateKey,
            messageData: data
        });

        if (!roomKey) {
            console.error('NO ROOM KEY FOR DECRYPTION');
            return;
        }

        // Get message data
        const { iv, content, sender, username, timestamp } = data;
        
        // Skip if no content or IV
        if (!content || !iv) {
            console.error('NO CONTENT OR IV TO DECRYPT');
            return;
        }
        
        // Decrypt message
        const decryptionKey = privateKey ? `${roomKey}:${privateKey}` : roomKey;
        let decryptedContent = '';
        let messageContent = '';
        let messageSender = username || window.usernames?.get(sender) || 'Anonymous';
        let messageTimestamp = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
        
        try {
            decryptedContent = decryptMessage(content, iv, decryptionKey);
            console.log('Decrypted content:', decryptedContent);
            
            // Try to parse as JSON first
            try {
                const parsed = JSON.parse(decryptedContent);
                console.log('Parsed message:', parsed);
                messageContent = parsed.content || decryptedContent;
                if (!username && !sender) {
                    messageSender = parsed.username || window.usernames?.get(parsed.userId) || 'Anonymous';
                }
                if (!timestamp && parsed.timestamp) {
                    messageTimestamp = new Date(parsed.timestamp).toLocaleTimeString();
                }
            } catch (e) {
                // If not JSON, use as raw content
                console.log('Using raw decrypted content');
                messageContent = decryptedContent;
            }
        } catch (error) {
            console.error('Failed to decrypt message:', error);
            return;
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message mb-4';
        const isOwnMessage = window.state?.userId === sender;
        
        messageDiv.innerHTML = `
            <div class="message-bubble ${isOwnMessage ? 'own' : ''} max-w-[80%] ${isOwnMessage ? 'ml-auto' : 'mr-auto'} bg-gray-800 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-gray-300">${escapeHtml(messageSender)}</span>
                    <span class="text-xs text-gray-500">
                        ${escapeHtml(messageTimestamp)}
                    </span>
                </div>
                <div class="text-gray-200 whitespace-pre-wrap break-words">${escapeHtml(messageContent).replace(/\n/g, '<br>')}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('FAILED TO PROCESS MESSAGE:', error);
    }
});

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
        const privateKey = window.privateKeys.get(roomId);
        
        if (!roomKey) {
            console.error('NO ROOM KEY FOR ENCRYPTION');
            return;
        }

        try {
            // Create message data with content and metadata
            const messageData = {
                content: message,
                username: window.state?.username,
                userId: window.state?.userId,
                timestamp: new Date().toISOString()
            };

            console.log('Sending message data:', messageData);

            // Encrypt message using both room key and private key if available
            const encryptionKey = privateKey ? `${roomKey}:${privateKey}` : roomKey;
            const encrypted = encryptMessage(JSON.stringify(messageData), encryptionKey);
            
            // Send to server
            websocket.send('message', {
                roomId,
                content: encrypted.content,
                iv: encrypted.iv,
                sender: window.state?.userId,
                username: window.state?.username,
                timestamp: new Date().toISOString()
            });
            
            // Add message to UI first
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                messageDiv.innerHTML = `
                    <div class="message-bubble own">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium text-gray-300">${escapeHtml(window.state?.username || 'You')}</span>
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
                
                // Try to parse decrypted content for metadata
                let messageContent = decryptedContent;
                let messageSender = 'Anonymous';
                let messageTimestamp = new Date().toLocaleTimeString();
                
                try {
                    const parsed = JSON.parse(decryptedContent);
                    console.log('Parsed message:', parsed);
                    
                    if (parsed.content) {
                        messageContent = parsed.content;
                        messageSender = parsed.username || window.usernames?.get(parsed.userId) || 'Anonymous';
                        if (parsed.timestamp) {
                            messageTimestamp = new Date(parsed.timestamp).toLocaleTimeString();
                        }
                    }
                } catch (e) {
                    console.log('Not a JSON message, using raw content');
                }

                const isOwn = message.username === window.state.username;
                const formattedContent = escapeHtml(messageContent).replace(/\n/g, '<br>');
                
                messageDiv.innerHTML = `
                    <div class="message-bubble ${isOwn ? 'own' : 'other'}">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium text-gray-300">${escapeHtml(messageSender)}</span>
                            <span class="text-xs text-gray-500">
                                ${escapeHtml(messageTimestamp)}
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

// Handle member list updates
websocket.on('members', (data) => {
    console.log('Members update received:', data);
    const membersList = document.getElementById('membersList');
    const memberCount = document.getElementById('memberCount');
    const currentRoomId = document.getElementById('currentRoomId')?.textContent;
    
    if (!membersList) {
        console.error('Members list container not found');
        return;
    }

    // Only update if this is for the current room
    if (currentRoomId !== data.roomId) {
        console.log('Ignoring members update for different room');
        return;
    }

    // Update member count (including creator)
    const totalMembers = (data.members || []).length + 1; // +1 for creator
    if (memberCount) {
        memberCount.textContent = data.maxMembers > 0 
            ? `${totalMembers}/${data.maxMembers}`
            : `${totalMembers}/∞`;
    }

    // Clear and rebuild member list
    membersList.innerHTML = '';
    
    // Add creator first
    if (data.creator) {
        const creatorDiv = document.createElement('div');
        creatorDiv.className = 'flex items-center space-x-3 mb-3';
        creatorDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <span class="text-sm text-gray-300">${escapeHtml(data.creator.charAt(0).toUpperCase())}</span>
            </div>
            <span class="text-gray-300">${escapeHtml(data.creator)} (Creator)</span>
        `;
        membersList.appendChild(creatorDiv);
    }

    // Add other members
    (data.members || []).forEach(member => {
        // Skip if member is the creator (already added)
        if (member.username === data.creator) return;
        
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

// Handle member joined event
websocket.on('member-joined', (data) => {
    console.log('Member joined:', data);
    console.log('Member data:', data.member);

    // Store member username in window state
    if (data.member) {
        if (!window.usernames) window.usernames = new Map();
        window.usernames.set(data.member.userId, data.member.username);
        console.log('Updated usernames map:', [...window.usernames.entries()]);
    }

    // Request updated member list
    websocket.send('get-members', { roomId: data.roomId });
});

// Handle member left event
websocket.on('member-left', (data) => {
    console.log('Member left:', data);
    // Request updated member list
    websocket.send('get-members', { roomId: data.roomId });
});

// Handle members list update
websocket.on('members', (data) => {
    console.log('Members update received:', data);
    
    // Update usernames map with all members
    if (!window.usernames) window.usernames = new Map();
    data.members.forEach(member => {
        window.usernames.set(member.userId, member.username);
    });
    console.log('Updated usernames map:', [...window.usernames.entries()]);

    const membersList = document.getElementById('membersList');
    const memberCount = document.getElementById('memberCount');
    const currentRoomId = document.getElementById('currentRoomId')?.textContent;
    
    if (!membersList) {
        console.error('Members list container not found');
        return;
    }

    // Only update if this is for the current room
    if (currentRoomId !== data.roomId) {
        console.log('Ignoring members update for different room');
        return;
    }

    // Update member count (including creator)
    const totalMembers = (data.members || []).length + 1; // +1 for creator
    if (memberCount) {
        memberCount.textContent = data.maxMembers > 0 
            ? `${totalMembers}/${data.maxMembers}`
            : `${totalMembers}/∞`;
    }

    // Clear and rebuild member list
    membersList.innerHTML = '';
    
    // Add creator first
    if (data.creator) {
        const creatorDiv = document.createElement('div');
        creatorDiv.className = 'flex items-center space-x-3 mb-3';
        creatorDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <span class="text-sm text-gray-300">${escapeHtml(data.creator.charAt(0).toUpperCase())}</span>
            </div>
            <span class="text-gray-300">${escapeHtml(data.creator)} (Creator)</span>
        `;
        membersList.appendChild(creatorDiv);
    }

    // Add other members
    (data.members || []).forEach(member => {
        // Skip if member is the creator (already added)
        if (member.username === data.creator) return;
        
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

// Initialize join room modal
window.modals = window.modals || {};

// Show modal
function showModal(modalId) {
    console.log('Showing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// Hide modal
function hideModal(modalId) {
    console.log('Hiding modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Initialize modals
window.modals = {
    createRoom: {
        show: () => showModal('createRoomModal'),
        close: () => hideModal('createRoomModal')
    },
    joinRoom: {
        show: () => showModal('joinRoomModal'),
        close: () => hideModal('joinRoomModal')
    }
};

// Add room to list
function addRoomToList(room) {
    const roomList = document.getElementById('roomList');
    if (!roomList) return;

    // Create room element
    const roomElement = document.createElement('div');
    roomElement.className = 'room-item flex items-center p-4 hover:bg-gray-700 cursor-pointer transition-colors';
    roomElement.setAttribute('data-room-id', room.id);
    
    // Room info
    roomElement.innerHTML = `
        <div class="flex-1">
            <div class="font-medium text-gray-200">${escapeHtml(room.name)}</div>
            <div class="text-sm text-gray-400">
                ${room.members?.length || 0} / ${room.maxMembers > 0 ? room.maxMembers : '∞'} members
            </div>
        </div>
    `;
    
    // Join on click
    roomElement.onclick = () => {
        console.log('Joining room:', room.id);
        websocket.send('join-room', {
            roomId: room.id,
            username: window.state?.username,
            password: ''
        });
    };
    
    roomList.appendChild(roomElement);
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
