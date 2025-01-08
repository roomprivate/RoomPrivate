const socket = io();

// State
let currentUser = null;
let currentRoom = null;
let roomKey = null;

// DOM Elements
const joinContainer = document.getElementById('join-container');
const createRoomContainer = document.getElementById('create-room-container');
const joinRoomForm = document.getElementById('join-room-form');
const chatContainer = document.getElementById('chat-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const roomIdDisplay = document.getElementById('room-id-display');
const roomNameDisplay = document.getElementById('room-name-display');
const membersList = document.getElementById('members');
const descriptionDisplay = document.getElementById('room-description-display');
const countDisplay = document.getElementById('room-members-count');

// Event Listeners
document.getElementById('create-room-btn').addEventListener('click', () => {
    joinContainer.classList.add('hidden');
    createRoomContainer.classList.remove('hidden');
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    joinContainer.classList.add('hidden');
    joinRoomForm.classList.remove('hidden');
});

document.getElementById('room-password-toggle').addEventListener('change', (e) => {
    const passwordInput = document.getElementById('room-password');
    passwordInput.classList.toggle('hidden', !e.target.checked);
});

document.getElementById('persistent-id-toggle').addEventListener('change', (e) => {
    const keyInput = document.getElementById('persistent-key');
    const helpText = document.getElementById('persistent-key-help');
    keyInput.classList.toggle('hidden', !e.target.checked);
    helpText.classList.toggle('hidden', !e.target.checked);
});

document.getElementById('join-persistent-id-toggle').addEventListener('change', (e) => {
    const keyInput = document.getElementById('join-persistent-key');
    const helpText = document.getElementById('join-persistent-key-help');
    keyInput.classList.toggle('hidden', !e.target.checked);
    helpText.classList.toggle('hidden', !e.target.checked);
});

document.getElementById('create-room-submit').addEventListener('click', () => {
    const hasPassword = document.getElementById('room-password-toggle').checked;
    const password = hasPassword ? document.getElementById('room-password').value : null;
    const description = document.getElementById('room-description').value.trim();
    const maxMembers = parseInt(document.getElementById('room-max-members').value) || 0;
    const username = document.getElementById('create-username').value.trim();
    const usePersistentId = document.getElementById('persistent-id-toggle').checked;
    const persistentKey = usePersistentId ? document.getElementById('persistent-key').value : null;
    
    if (!username) {
        showError('Please enter a username');
        return;
    }
    
    socket.emit('create-room', { 
        hasPassword, 
        password, 
        description, 
        maxMembers,
        username,
        persistentKey
    });
});

document.getElementById('join-room-submit').addEventListener('click', () => {
    const roomId = document.getElementById('room-id').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('join-room-password').value;
    const usePersistentId = document.getElementById('join-persistent-id-toggle').checked;
    const persistentKey = usePersistentId ? document.getElementById('join-persistent-key').value : null;
    
    if (!roomId || !username) {
        showError('Please fill in all required fields');
        return;
    }
    
    socket.emit('join-room', { roomId, username, password, persistentKey });
});

document.getElementById('send-message').addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.getElementById('leave-room').addEventListener('click', () => {
    location.reload();
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        createRoomContainer.classList.add('hidden');
        joinRoomForm.classList.add('hidden');
        joinContainer.classList.remove('hidden');
    });
});

// Socket event handlers
socket.on('room-created', ({ roomId, roomName }) => {
    const roomIdInput = document.getElementById('room-id');
    roomIdInput.value = roomId;
    
    showError(`Room "${roomName}" created successfully!\nRoom ID: ${roomId}`, 'success');
    
    createRoomContainer.classList.add('hidden');
    joinRoomForm.classList.remove('hidden');
});

socket.on('joined-room', ({ userId, roomKey: key, roomName, description, maxMembers, currentMembers, members, roles, userRoles }) => {
    currentUser = userId;
    roomKey = key;
    currentRoom = document.getElementById('room-id').value;
    
    joinRoomForm.classList.add('hidden');
    createRoomContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    roomNameDisplay.textContent = roomName;
    roomIdDisplay.textContent = `ID: ${currentRoom}`;
    descriptionDisplay.textContent = description || 'No description provided';
    updateMembersCount(currentMembers, maxMembers);
    updateMembersList(members);
    
    // Update roles display
    const rolesDisplay = document.getElementById('roles-display');
    if (rolesDisplay && userRoles) {
        rolesDisplay.innerHTML = '<h4>Your Roles:</h4>';
        userRoles.forEach(role => {
            const span = document.createElement('span');
            span.className = 'role-badge';
            span.style.backgroundColor = role.color || '#666';
            span.textContent = role.name;
            rolesDisplay.appendChild(span);
        });
    }

    addSystemMessage(`Welcome to ${roomName}!`);
});

socket.on('user-joined', ({ userId, members, currentMembers }) => {
    updateMembersList(members);
    updateMembersCount(currentMembers);
    addSystemMessage(`${userId} joined the room`);
});

socket.on('user-left', ({ userId, members, currentMembers }) => {
    updateMembersList(members);
    updateMembersCount(currentMembers);
    addSystemMessage(`${userId} left the room`);
});

socket.on('message', ({ userId, encryptedMessage }) => {
    const decryptedMessage = CryptoJS.AES.decrypt(encryptedMessage, roomKey).toString(CryptoJS.enc.Utf8);
    addMessage(userId, decryptedMessage, false);
});

socket.on('error', ({ message }) => {
    showError(message);
});

// Helper functions
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    const encryptedMessage = CryptoJS.AES.encrypt(message, roomKey).toString();
    socket.emit('message', { encryptedMessage, roomId: currentRoom });
    
    addMessage(currentUser, message, true);
    messageInput.value = '';
}

function addMessage(username, message, isSent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const usernameSpan = document.createElement('div');
    usernameSpan.className = 'username';
    usernameSpan.textContent = username;
    
    const messageContent = document.createElement('div');
    messageContent.textContent = message;
    
    messageDiv.appendChild(usernameSpan);
    messageDiv.appendChild(messageContent);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.style.textAlign = 'center';
    messageDiv.style.color = '#666';
    messageDiv.textContent = message;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateMembersList(members) {
    membersList.innerHTML = '';
    members.forEach(member => {
        const li = document.createElement('li');
        li.textContent = member;
        if (member === currentUser) {
            li.classList.add('current-user');
        }
        membersList.appendChild(li);
    });
}

function updateMembersCount(current, max = null) {
    countDisplay.textContent = max > 0 
        ? `Members: ${current}/${max}`
        : `Members: ${current}`;
}

function showError(message, type = 'error') {
    const errorDiv = document.getElementById('error-message') || createErrorDiv();
    errorDiv.textContent = message;
    errorDiv.className = `error-message ${type}`;
    errorDiv.classList.remove('hidden');
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

function createErrorDiv() {
    const errorDiv = document.createElement('div');
    errorDiv.id = 'error-message';
    errorDiv.className = 'error-message';
    document.body.insertBefore(errorDiv, document.body.firstChild);
    return errorDiv;
}
