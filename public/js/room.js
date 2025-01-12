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

import markdownProcessor from './markdown.js';

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
                console.log('Received WebSocket message:', message);
                
                switch(message.type) {
                    case 'room_created':
                        this.currentRoom = message.room_info;
                        this.emit('roomCreated', this.currentRoom);
                        alert(`Room created! Join key: ${this.currentRoom.join_key}`); //need to change that to a better "error/information" display
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
                        if (typeof message.content === 'string' && message.content.includes('[Video:')) {
                            const match = message.content.match(/\[Video: (.*?)\] \((.*?)\)/);
                            if (match) {
                                const [_, filename, size] = match;
                                const preview = `
                                    <div class="file-preview">
                                        <video controls preload="none">
                                            <source src="/files/${filename}" type="video/mp4">
                                            Your browser does not support the video tag.
                                        </video>
                                        <div class="file-info">
                                            <span class="file-name">${filename}</span>
                                            <span class="file-size">${size}</span>
                                        </div>
                                    </div>
                                `;
                                this.emit('message', preview, 'other', message.sender);
                            }
                        } else if (message.content && message.content.type === 'file') {
                            const filePreview = this.createFilePreview(message.content);
                            this.emit('message', filePreview, 'other', message.sender);
                        } else {
                            const processedContent = markdownProcessor.process(message.content);
                            this.emit('message', processedContent, 'other', message.sender);
                        }
                        break;

                    case 'file_message':
                        const receivedFilePreview = this.createFilePreview(message);
                        this.emit('message', receivedFilePreview, 'other', message.sender);
                        break;

                    case 'file_upload_success':
                        this.emit('message', `✅ File "${message.filename}" uploaded successfully`, 'system');
                        break;

                    case 'file_upload_error':
                        this.emit('message', `❌ Failed to upload file: ${message.error}`, 'system');
                        break;

                    case 'file_uploaded':
                        console.log('File uploaded successfully:', message.metadata);
                        const fileInfo = `✅ Uploaded: ${message.metadata.name} (${this.formatFileSize(message.metadata.size)})`;
                        this.emit('message', fileInfo, 'system');
                        break;

                    case 'file_content':
                        console.log('Received file content:', {
                            name: message.metadata.name,
                            type: message.metadata.mime_type,
                            size: message.metadata.size
                        });
                        const downloadedFilePreview = this.createFilePreview(message);
                        this.emit('message', downloadedFilePreview, 'other', message.sender);
                        break;

                    case 'member_list':
                        this.emit('membersUpdated', message.members);
                        break;
                        
                    case 'error':
                        console.error('Server error:', message.message);
                        this.emit('message', `❌ Error: ${message.message}`, 'system');
                        break;
                    case 'file_upload':
                        const fileData = message.content;
                        const blob = new Blob([fileData], {type: message.filetype});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = message.filename;
                        a.click();
                        URL.revokeObjectURL(url);
                        break;
                    case 'file_download':
                        const fileId = message.file_id;
                        this.emit('fileDownload', fileId);
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

    createRoom(name, description, password, userName) {
        if (!name || !userName) {
            alert('Room name and your name are required'); //need to change that to a better "error/information" display
            return;
        }
    
        if (this.ws.readyState !== WebSocket.OPEN) {
            alert('Connection lost. Please try again.'); //need to change that to a better "error/information" display
            return;
        }
    
        this.currentUserName = userName;
    
        this.ws.send(JSON.stringify({
            type: 'create_room',
            name,
            description,
            password: password || undefined,
            user_name: userName
        }));
    }

    joinRoom(joinKey, password, name) {
        if (!joinKey || !name) {
            alert('Join key and name are required'); //need to change that to a better "error/information" display
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

    async uploadFile(file) {
        const MAX_SIZE = 100 * 1024 * 1024;
        const CHUNK_SIZE = 10 * 1024 * 1024;

        if (file.size > MAX_SIZE) {
            this.emit('message', '❌ File too large (max 100MB)', 'system');
            return;
        }

        try {
            await this.uploadFileInChunks(file);

            if (file.type.startsWith('video/')) {
                this.ws.send(JSON.stringify({
                    type: 'chat_message',
                    content: `[Video: ${file.name}] (${this.formatFileSize(file.size)})`
                }));
            } else {
                const base64Content = await this.readFileAsBase64(file);
                this.ws.send(JSON.stringify({
                    type: 'chat_message',
                    content: {
                        type: 'file',
                        filename: file.name,
                        filetype: file.type,
                        filesize: file.size,
                        content: base64Content
                    }
                }));
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            this.emit('message', '❌ Failed to upload file', 'system');
        }
    }

    async uploadFileInChunks(file) {
        const CHUNK_SIZE = 10 * 1024 * 1024;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            const base64Chunk = await this.readFileAsBase64(chunk);
            
            this.ws.send(JSON.stringify({
                type: 'upload_chunk',
                name: file.name,
                mime_type: file.type,
                chunk_index: i,
                total_chunks: totalChunks,
                content: base64Chunk
            }));

            const progress = Math.round((i + 1) * 100 / totalChunks);
            this.emit('message', `📤 Uploading ${file.name}: ${progress}%`, 'system');

            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64Content = reader.result.split(',')[1];
                resolve(base64Content);
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsDataURL(file);
        });
    }

    sendMessage(content) {
        if (!content || !this.ws || !this.currentRoom) return;
        
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'chat_message',
                content: content
            }));
            const processedContent = markdownProcessor.process(content);
            this.emit('message', processedContent, 'self');
        }
    }

    requestFileDownload(fileId) {
        if (!this.ws || !this.currentRoom) return;

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'file_download',
                file_id: fileId
            }));
        }
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        else return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    leaveRoom() {
        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'leave_room' }));
        }
        this.currentRoom = null;
        this.currentUserName = '';
        this.emit('roomLeft');
        this.emit('left');
    }

    createFilePreview(message) {
        const { filename, filetype, filesize, file_id } = message;
        let preview = '';

        if (filetype.startsWith('image/')) {
            preview = `
                <div class="file-preview">
                    <img src="data:${filetype};base64,${message.content}" alt="${filename}" />
                    <div class="file-info">
                        <span class="file-name">${filename}</span>
                        <span class="file-size">${this.formatFileSize(filesize)}</span>
                    </div>
                </div>
            `;
        } else if (filetype.startsWith('video/')) {
            preview = `
                <div class="file-preview">
                    <video controls preload="none" poster="/images/video-placeholder.png">
                        <source src="/files/${file_id}" type="${filetype}">
                        Your browser does not support the video tag.
                    </video>
                    <div class="file-info">
                        <span class="file-name">${filename}</span>
                        <span class="file-size">${this.formatFileSize(filesize)}</span>
                    </div>
                </div>
            `;
        } else {
            preview = `
                <div class="file-preview file-link" onclick="window.open('/files/${file_id}', '_blank')">
                    <div class="file-icon">📎</div>
                    <div class="file-info">
                        <span class="file-name">${filename}</span>
                        <span class="file-size">${this.formatFileSize(filesize)}</span>
                    </div>
                </div>
            `;
        }

        return preview;
    }
}

const room = new Room();
export default room;
