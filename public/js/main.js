import room from './room.js';

// Initialize FontAwesome
const fontAwesome = document.createElement('link');
fontAwesome.rel = 'stylesheet';
fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
document.head.appendChild(fontAwesome);

// UI Elements
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomPanel = document.getElementById('createRoom');
const joinRoomPanel = document.getElementById('joinRoom');
const leaveRoomBtn = document.getElementById('leaveRoom');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.querySelector('.btn-send');
const copyRoomIdBtn = document.getElementById('copyRoomId');

// Copy Room ID functionality
copyRoomIdBtn.addEventListener('click', async () => {
    const roomId = document.getElementById('roomId').textContent;
    if (!roomId) return;

    try {
        await navigator.clipboard.writeText(roomId);
        copyRoomIdBtn.classList.add('copied');
        copyRoomIdBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            copyRoomIdBtn.classList.remove('copied');
            copyRoomIdBtn.innerHTML = '<i class="fas fa-copy"></i>';
        }, 2000);
    } catch (err) {
        console.error('Failed to copy room ID:', err);
    }
});

// Event Listeners for Room Controls
createRoomBtn.addEventListener('click', () => {
    createRoomPanel.classList.toggle('hidden');
    joinRoomPanel.classList.add('hidden');
});

joinRoomBtn.addEventListener('click', () => {
    joinRoomPanel.classList.toggle('hidden');
    createRoomPanel.classList.add('hidden');
});

createRoomPanel.querySelector('button').addEventListener('click', () => {
    const name = document.getElementById('createRoomName').value.trim();
    const desc = document.getElementById('createRoomDesc').value.trim();
    const password = document.getElementById('createRoomPassword').value.trim();
    
    if (name) {
        room.createRoom(name, desc, password);
        createRoomPanel.classList.add('hidden');
        document.getElementById('createRoomName').value = '';
        document.getElementById('createRoomDesc').value = '';
        document.getElementById('createRoomPassword').value = '';
    }
});

joinRoomPanel.querySelector('button').addEventListener('click', () => {
    const key = document.getElementById('joinKey').value.trim();
    const password = document.getElementById('joinPassword').value.trim();
    const name = document.getElementById('userName').value.trim();
    
    if (key && name) {
        room.joinRoom(key, password, name);
        joinRoomPanel.classList.add('hidden');
        document.getElementById('joinKey').value = '';
        document.getElementById('joinPassword').value = '';
        document.getElementById('userName').value = '';
    }
});

leaveRoomBtn.addEventListener('click', () => room.leaveRoom());

// Event Listeners for Chat
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && messageInput.value.trim()) {
        room.sendMessage(messageInput.value.trim());
        messageInput.value = '';
    }
});

sendMessageBtn.addEventListener('click', () => {
    if (messageInput.value.trim()) {
        room.sendMessage(messageInput.value.trim());
        messageInput.value = '';
    }
});

// Room Event Handlers
room.on('roomCreated', (roomInfo) => {
    document.getElementById('roomName').textContent = roomInfo.name;
    document.getElementById('roomDescription').textContent = roomInfo.description || '';
    document.getElementById('roomId').textContent = roomInfo.id || roomInfo.join_key || 'N/A';
});

room.on('roomJoined', (roomInfo, participants) => {
    document.getElementById('roomName').textContent = roomInfo.name;
    document.getElementById('roomDescription').textContent = roomInfo.description || '';
    document.getElementById('roomId').textContent = roomInfo.id || roomInfo.join_key || 'N/A';
    updateMembers(participants);
});

room.on('message', (text, type, sender) => {
    appendMessage(text, type, sender);
});

room.on('membersUpdated', (members) => {
    updateMembers(members);
});

room.on('left', () => {
    document.getElementById('roomName').textContent = '';
    document.getElementById('roomDescription').textContent = '';
    document.getElementById('roomId').textContent = '';
    document.getElementById('messages').innerHTML = '';
    document.getElementById('members').innerHTML = '';
});

// Helper Functions
function updateMembers(members) {
    const membersContainer = document.getElementById('members');
    const memberCount = document.querySelector('.member-count');
    
    membersContainer.innerHTML = members.map(member => `
        <div class="member">
            <div class="member-avatar">${member.charAt(0).toUpperCase()}</div>
            <span class="member-name">${member}</span>
        </div>
    `).join('');
    
    memberCount.textContent = members.length;
}

function appendMessage(text, type, sender = '') {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.className = `message ${type}`;
    
    if (type === 'system') {
        messageDiv.innerHTML = text;
    } else {
        messageDiv.innerHTML = `
            ${type === 'self' ? '' : `<div class="message-sender">${sender}</div>`}
            ${text}
            <div class="message-time">${timestamp}</div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
