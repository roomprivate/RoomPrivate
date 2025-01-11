import markdownProcessor from '../markdown.js';

export class ChatArea {
    constructor(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="chat-main">
                <div class="chat-header">
                    <div class="header-left">
                        <button class="sidebar-toggle left-toggle">
                            <i class="fas fa-bars"></i>
                        </button>
                    </div>
                    <div class="header-center">
                        <div class="header-main">
                            <h2 id="roomName"></h2>
                            <div class="room-id-container">
                                <span class="room-id-label">Join Key:</span>
                                <span id="roomId" class="room-id"></span>
                                <button id="copyRoomId" class="btn-icon" title="Copy Join Key">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <p id="roomDescription"></p>
                    </div>
                    <div class="header-right">
                        <button class="sidebar-toggle right-toggle">
                            <i class="fas fa-users"></i>
                        </button>
                    </div>
                </div>
                <div id="messages"></div>
                <div class="input-container">
                    <input type="text" id="messageInput" placeholder="Type your message...">
                    <button class="btn-send">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const sendBtn = this.container.querySelector('.btn-send');
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
    }

    updateRoomInfo(name, description) {
        const roomName = this.container.querySelector('#roomName');
        const roomDescription = this.container.querySelector('#roomDescription');
        const roomId = this.container.querySelector('#roomId');
        const copyRoomId = this.container.querySelector('#copyRoomId');

        roomName.textContent = name;
        roomDescription.textContent = description;

        const joinKey = window.room?.currentRoom?.join_key || '';
        roomId.textContent = joinKey;

        const copyHandler = async () => {
            try {
                await navigator.clipboard.writeText(joinKey);
                copyRoomId.classList.add('copied');
                copyRoomId.title = 'Copied!';
                setTimeout(() => {
                    copyRoomId.classList.remove('copied');
                    copyRoomId.title = 'Copy Join Key';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };

        copyRoomId.removeEventListener('click', copyHandler);
        copyRoomId.addEventListener('click', copyHandler);
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
                <div class="message-content system">
                    ${text}
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="message-content ${type}">
                    ${type === 'self' ? '' : `<div class="message-sender">${sender}</div>`}
                    <div class="message-text markdown-content">${text}</div>
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
