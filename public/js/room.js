class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, ...args) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(...args));
        }
    }
}

class Room extends EventEmitter {
    constructor() {
        super();
        this.currentRoom = null;
        this.currentUserName = '';
        this.ws = null;
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsPath = '/ws';
        this.ws = new WebSocket(`${protocol}//${window.location.host}${wsPath}`);
        
        this.ws.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('Received message:', message);
                
                switch(message.type) {
                    case 'room_created':
                        this.currentRoom = message.room_info;
                        this.emit('roomCreated', this.currentRoom);
                        alert(`Room created! Join key: ${this.currentRoom.join_key}`);
                        break;
                        
                    case 'room_joined':
                        this.currentRoom = message.room_info;
                        this.emit('roomJoined', this.currentRoom, message.participants);
                        this.emit('message', 'You joined the room', 'system');
                        break;
                        
                    case 'participant_joined':
                        this.emit('message', `${message.name} joined the room`, 'system');
                        this.ws.send(JSON.stringify({ type: 'get_members' }));
                        break;
                        
                    case 'participant_left':
                        this.emit('message', `${message.name} left the room`, 'system');
                        this.ws.send(JSON.stringify({ type: 'get_members' }));
                        break;
                        
                    case 'chat_message':
                        this.emit('message', message.content, 'other', message.sender);
                        break;

                    case 'member_list':
                        this.emit('membersUpdated', message.members);
                        break;
                        
                    case 'error':
                        alert(message.message);
                        break;
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };

        this.ws.onclose = () => {
            this.emit('message', 'Disconnected from server. Reconnecting...', 'system');
            setTimeout(() => this.connect(), 1000);
        };

        this.ws.onerror = () => {
            this.emit('message', 'Connection error occurred', 'system');
        };
    }

    createRoom(name, description, password) {
        if (!name) {
            alert('Room name is required');
            return;
        }

        this.currentUserName = 'Owner';
        
        this.ws.send(JSON.stringify({
            type: 'create_room',
            name,
            description,
            password: password || undefined
        }));
    }

    joinRoom(joinKey, password, name) {
        if (!joinKey || !name) {
            alert('Join key and name are required');
            return;
        }

        this.currentUserName = name;
        
        this.ws.send(JSON.stringify({
            type: 'join_room',
            join_key: joinKey,
            password: password || undefined,
            name
        }));
    }

    sendMessage(text) {
        if (!text || !this.ws || !this.currentRoom) return;
        
        try {
            this.ws.send(JSON.stringify({
                type: 'chat_message',
                content: text
            }));
            
            this.emit('message', text, 'self');
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message: ' + error.message);
        }
    }

    leaveRoom() {
        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'leave_room' }));
        }
        this.currentRoom = null;
        this.currentUserName = '';
        this.emit('left');
    }
}

const room = new Room();
export default room;
