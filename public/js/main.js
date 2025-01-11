import room from './room.js';

room.on('roomCreated', (roomInfo) => {
    updateRoomInfo(roomInfo);
    showChatContainer();
});

room.on('roomJoined', (roomInfo, participants) => {
    updateRoomInfo(roomInfo);
    showChatContainer();
    updateMembers(participants);
});

room.on('roomLeft', () => {
    updateRoomInfo(null);
    hideChatContainer();
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

function showChatContainer() {
    const chatContainer = document.querySelector('.chat-container');
    const chatHeader = document.querySelector('.chat-header');
    const inputContainer = document.querySelector('.input-container');
    const messagesContainer = document.getElementById('messages');
    
    if (chatContainer) chatContainer.style.display = 'flex';
    if (chatHeader) chatHeader.style.display = 'flex';
    if (inputContainer) inputContainer.style.display = 'flex';
    if (messagesContainer) messagesContainer.style.display = 'flex';
}

function hideChatContainer() {
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) chatContainer.style.display = 'none';
}

// Initialize chat container visibility
document.addEventListener('DOMContentLoaded', () => {
    const room = window.room?.currentRoom;
    if (room) {
        showChatContainer();
    } else {
        hideChatContainer();
    }
});

const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomPanel = document.getElementById('createRoom');
const joinRoomPanel = document.getElementById('joinRoom');
const leaveRoomBtn = document.getElementById('leaveRoom');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.querySelector('.btn-send');
const copyRoomIdBtn = document.getElementById('copyRoomId');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');

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
    const userName = document.getElementById('createUserName').value.trim();
    const password = document.getElementById('createRoomPassword').value.trim();
    
    if (name && userName) {
        room.createRoom(name, desc, password, userName);
        createRoomPanel.classList.add('hidden');
        document.getElementById('createRoomName').value = '';
        document.getElementById('createRoomDesc').value = '';
        document.getElementById('createUserName').value = '';
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

uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        console.log('Selected file:', {
            name: file.name,
            type: file.type,
            size: file.size
        });

        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            console.warn('File too large:', {
                size: file.size,
                maxSize: maxSize
            });
            alert('File size must be less than 100MB'); //need to change that to a better "error/information" display
            return;
        }

        const progressMessage = appendMessage(` Uploading ${file.name}...`, 'system');
        
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            console.log('Creating preview for:', file.type);
            const previewUrl = URL.createObjectURL(file);
            const previewMessage = appendMessage(createLocalPreview(file, previewUrl), 'self');
        }
        
        console.log('Starting file upload...');
        await room.uploadFile(file);
        console.log('File upload completed');
        
        if (progressMessage) {
            progressMessage.remove();
        }
        
        fileInput.value = '';
    } catch (error) {
        console.error('Error in file upload:', error);
        appendMessage(' Failed to upload file', 'system');
    }
});

function createLocalPreview(file, previewUrl) {
    let preview = '';
    
    if (file.type.startsWith('image/')) {
        preview = `
            <div class="file-preview">
                <img src="${previewUrl}" alt="${file.name}" />
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
            </div>
        `;
    } else if (file.type.startsWith('video/')) {
        preview = `
            <div class="file-preview">
                <video controls>
                    <source src="${previewUrl}" type="${file.type}">
                    Your browser does not support the video tag.
                </video>
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
            </div>
        `;
    }
    
    return `<div class="file-message">${preview}</div>`;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    else return (bytes / 1073741824).toFixed(1) + ' GB';
}

function appendMessage(text, type, sender = '') {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.className = `message ${type}`;
    
    if (type === 'system') {
        messageDiv.innerHTML = `<div class="message-bubble system">${text}</div>`;
    } else {
        const isFileMessage = text.includes('file-message') || text.includes('file-preview');
        const messageClass = isFileMessage ? 'file-message' : '';
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${type === 'self' ? '' : `<div class="message-sender">${sender}</div>`}
                <div class="message-bubble ${type === 'self' ? 'outgoing' : 'incoming'} ${messageClass}">
                    ${text}
                    <div class="message-time">${timestamp}</div>
                </div>
            </div>
        `;

        if (isFileMessage && type === 'other') {
            const fileElement = messageDiv.querySelector('.file-message');
            if (fileElement) {
                const fileId = fileElement.dataset.fileId;
                if (fileId) {
                    fileElement.addEventListener('click', () => {
                        room.requestFileDownload(fileId);
                    });
                }
            }
        }
    }
    
    messagesDiv.appendChild(messageDiv);
    
    while (messagesDiv.children.length > 100) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
    
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    return messageDiv;
}

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

room.on('roomCreated', (roomInfo) => {
    document.getElementById('roomName').textContent = roomInfo.name;
    document.getElementById('roomDescription').textContent = roomInfo.description || '';
    document.getElementById('roomId').textContent = roomInfo.join_key || 'N/A';
});

room.on('roomJoined', (roomInfo, participants) => {
    document.getElementById('roomName').textContent = roomInfo.name;
    document.getElementById('roomDescription').textContent = roomInfo.description || '';
    document.getElementById('roomId').textContent = roomInfo.join_key || 'N/A';
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

document.getElementById('messages').addEventListener('scroll', function() {
    const isNearBottom = this.scrollHeight - this.scrollTop <= this.clientHeight + 100;
    scrollButton.classList.toggle('hidden', isNearBottom);
});

async function loadInfoPopout() {
    try {
        const response = await fetch('/info.json');
        const info = await response.json();
        
        const infoContent = document.querySelector('.info-popout .info-content');
        infoContent.innerHTML = `
            <div class="info-item">
                <strong>Name</strong>
                ${info.name}
            </div>
            <div class="info-item">
                <strong>Version</strong>
                ${info.version}
            </div>
            <div class="info-item">
                <strong>Description</strong>
                ${info.description}
            </div>
            <div class="info-item">
                <strong>Author</strong>
                ${info.author}
            </div>
            <a href="${info.website}" target="_blank" class="website-link">Visit Website</a>
        `;
    } catch (error) {
        console.error('Error loading info:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadInfoPopout);

document.querySelector('.info-popout .close-btn').addEventListener('click', () => {
    document.querySelector('.info-popout-overlay').style.display = 'none';
});
