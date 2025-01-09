const socket = io();

// Generate encryption keys on startup
let publicKey = CryptoJS.lib.WordArray.random(32).toString();

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

// Register public key with server immediately after connection
socket.on('connect', () => {
    socket.emit('register-key', { publicKey });
    console.log('Connected and registered encryption key');
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

document.getElementById('create-room-submit').addEventListener('click', () => {
    const username = document.getElementById('create-username').value;
    const description = document.getElementById('room-description').value;
    const maxMembers = parseInt(document.getElementById('room-max-members').value) || 0;
    const hasPassword = document.getElementById('room-password-toggle').checked;
    const password = hasPassword ? document.getElementById('room-password').value : null;
    const persistentKey = document.getElementById('persistent-key').value;

    socket.emit('create-room', {
        username,
        description,
        maxMembers,
        hasPassword,
        password,
        persistentKey
    });
});

document.getElementById('join-room-submit').addEventListener('click', () => {
    const roomId = document.getElementById('room-id').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('join-room-password').value;
    const persistentKey = document.getElementById('join-persistent-key').value;

    currentRoom = roomId; // Set currentRoom when joining
    socket.emit('join-room', {
        roomId,
        username,
        password,
        persistentKey
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
});

// Socket event handlers
socket.on('room-created', ({ roomId }) => {
    console.log('Room created:', roomId);
    currentRoom = roomId;
    
    // Join the room immediately after creating it
    const username = document.getElementById('create-username').value;
    socket.emit('join-room', {
        roomId,
        username,
        persistentKey: document.getElementById('persistent-key').value
    });
});

socket.on('joined-room', (encryptedData) => {
    try {
        console.log('Received joined-room event');
        const decryptedData = decryptMessage(encryptedData);
        console.log('Decrypted room data:', decryptedData);
        
        const { userId, roomId, roomKey: key, roomName, description, maxMembers, currentMembers, members } = decryptedData;
        
        currentUser = userId;
        currentRoom = roomId; // Make sure we store the room ID
        roomKey = key;
        
        // Hide all forms
        joinContainer.classList.add('hidden');
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        
        // Show chat
        chatContainer.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = roomName || 'Unnamed Room';
        document.getElementById('room-id-display').textContent = `Room ID: ${currentRoom}`;
        document.getElementById('room-description-display').textContent = description || '';
        
        // Update members list and count
        updateMembersList(members);
        updateMembersCount(currentMembers, maxMembers);
        
        addSystemMessage(`Welcome to ${roomName || 'the room'}!`);
        console.log('Room UI updated successfully');
    } catch (error) {
        console.error('Error processing joined-room data:', error);
        showError('Failed to process room data. Please try again.');
    }
});

socket.on('user-joined', (encryptedData) => {
    try {
        const { userId, username, members, currentMembers } = decryptMessage(encryptedData);
        updateMembersList(members);
        updateMembersCount(currentMembers);
        addSystemMessage(`${username} joined the room`);
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
        const data = decryptMessage(encryptedData);
        if (data && data.content && data.sender) {
            addMessage(data.sender, data.content, data.sender === currentUser);
        }
    } catch (error) {
        console.error('Error processing message:', error);
        showError('Failed to process message');
    }
});

socket.on('error', ({ message }) => {
    console.error('Server error:', message);
    showError(message);
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

function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (content && currentRoom) { // Make sure we have both content and room ID
        console.log('Sending message to room:', currentRoom);
        socket.emit('message', {
            roomId: currentRoom,
            content: content
        });
        messageInput.value = '';
    } else if (!currentRoom) {
        showError('Not connected to a room');
    }
}

function addMessage(userId, content, isOwn = false) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own-message' : 'other-message'}`;
    div.textContent = `${isOwn ? 'You' : userId}: ${content}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(message) {
    const div = document.createElement('div');
    div.className = 'message system-message';
    div.textContent = message;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateMembersList(members) {
    const membersList = document.getElementById('members');
    membersList.innerHTML = '';
    members.forEach(member => {
        const li = document.createElement('li');
        li.textContent = member;
        if (member === currentUser) li.classList.add('current-user');
        membersList.appendChild(li);
    });
}

function updateMembersCount(current, max = 0) {
    const count = document.getElementById('room-members-count');
    count.textContent = max > 0 ? 
        `Members: ${current}/${max}` : 
        `Members: ${current}`;
}

function showError(message) {
    console.error(message);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}
