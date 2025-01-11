import room from './room.js';
import { SidebarManager } from './sidebarManager.js';

// Initialize FontAwesome
const fontAwesome = document.createElement('link');
fontAwesome.rel = 'stylesheet';
fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
document.head.appendChild(fontAwesome);

// Initialize sidebar manager
const sidebarManager = new SidebarManager();

// Room event handlers
room.on('roomCreated', (roomInfo) => {
    updateRoomInfo(roomInfo);
});

room.on('roomJoined', (roomInfo) => {
    updateRoomInfo(roomInfo);
});

room.on('roomLeft', () => {
    updateRoomInfo(null);
});

function updateRoomInfo(roomInfo) {
    const roomName = document.getElementById('roomName');
    const roomDesc = document.getElementById('roomDescription');
    const roomId = document.getElementById('roomId');
    
    if (roomInfo) {
        roomName.textContent = roomInfo.name || '';
        roomDesc.textContent = roomInfo.description || '';
        roomId.textContent = roomInfo.join_key || '';
    } else {
        roomName.textContent = '';
        roomDesc.textContent = '';
        roomId.textContent = '';
    }
}

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

// Message handling
function appendMessage(text, type, sender = '') {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.className = `message ${type}`;
    
    if (type === 'system') {
        messageDiv.innerHTML = `<div class="message-bubble system">${text}</div>`;
    } else {
        messageDiv.innerHTML = `
            <div class="message-content">
                ${type === 'self' ? '' : `<div class="message-sender">${sender}</div>`}
                <div class="message-bubble ${type === 'self' ? 'outgoing' : 'incoming'}">
                    ${text}
                    <div class="message-time">${timestamp}</div>
                </div>
            </div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    
    // Keep only the last 100 messages to prevent excessive growth
    while (messagesDiv.children.length > 100) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
    
    // Scroll to bottom
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// Message input handling
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (messageInput.value.trim()) {
            room.sendMessage(messageInput.value.trim());
            messageInput.value = '';
            messageInput.style.height = 'auto';
        }
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

// Add scroll to bottom button
const scrollButton = document.createElement('button');
scrollButton.className = 'scroll-bottom-btn hidden';
scrollButton.innerHTML = '<i class="fas fa-chevron-down"></i>';
document.querySelector('.chat-container').appendChild(scrollButton);

scrollButton.addEventListener('click', () => {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTo({
        top: messagesDiv.scrollHeight,
        behavior: 'smooth'
    });
});

// Show/hide scroll button based on scroll position
document.getElementById('messages').addEventListener('scroll', function() {
    const isNearBottom = this.scrollHeight - this.scrollTop <= this.clientHeight + 100;
    scrollButton.classList.toggle('hidden', isNearBottom);
});

document.addEventListener('DOMContentLoaded', () => {
    // No-op
});
