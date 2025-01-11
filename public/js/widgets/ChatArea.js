export class ChatArea {
    constructor(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="chat-main">
                <div class="room-info">
                    <div class="room-header">
                        <h2 id="roomName"></h2>
                        <p id="roomDescription"></p>
                    </div>
                    <button class="btn-danger" id="leaveBtn">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
                <div id="messages" class="messages-container"></div>
                <div class="input-container">
                    <input type="text" id="messageInput" placeholder="Type your message...">
                    <button class="btn-send">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
            <div class="member-sidebar">
                <div class="sidebar-header">
                    <h3>Members</h3>
                    <span class="member-count">0</span>
                </div>
                <div id="members" class="members-list"></div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const sendBtn = this.container.querySelector('.btn-send');
        const leaveBtn = this.container.querySelector('#leaveBtn');
        const messageInput = this.container.querySelector('#messageInput');

        sendBtn.addEventListener('click', () => {
            const message = messageInput.value.trim();
            if (message) {
                this.callbacks.onSendMessage(message);
                messageInput.value = '';
            }
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const message = messageInput.value.trim();
                if (message) {
                    this.callbacks.onSendMessage(message);
                    messageInput.value = '';
                }
            }
        });

        leaveBtn.addEventListener('click', () => {
            this.callbacks.onLeaveRoom();
        });
    }

    updateRoomInfo(name, description) {
        this.container.querySelector('#roomName').textContent = name;
        this.container.querySelector('#roomDescription').textContent = description || '';
    }

    updateMembers(members) {
        const membersContainer = this.container.querySelector('#members');
        const memberCount = this.container.querySelector('.member-count');
        
        membersContainer.innerHTML = members.map(member => `
            <div class="member">
                <div class="member-avatar">${member.charAt(0).toUpperCase()}</div>
                <span class="member-name">${member}</span>
            </div>
        `).join('');
        
        memberCount.textContent = members.length;
    }

    appendMessage(text, type, sender = '') {
        const messagesDiv = this.container.querySelector('#messages');
        const messageDiv = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.className = `message ${type}`;
        
        if (type === 'system') {
            messageDiv.innerHTML = `
                <div class="message-content system-message">
                    ${text}
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="message-content">
                    ${type === 'self' ? '' : `<div class="message-sender">${sender}</div>`}
                    <div class="message-text">${text}</div>
                    <div class="message-time">${timestamp}</div>
                </div>
            `;
        }
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    show() {
        this.container.classList.remove('hidden');
    }

    hide() {
        this.container.classList.add('hidden');
    }
}
