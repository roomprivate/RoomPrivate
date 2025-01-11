export class RoomControls {
    constructor(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div id="createRoom" class="control-panel">
                <h2>Create Room</h2>
                <input type="text" id="createRoomName" placeholder="Room Name" required>
                <input type="text" id="createRoomDesc" placeholder="Room Description">
                <input type="password" id="createRoomPassword" placeholder="Room Password (optional)">
                <button class="btn-primary">Create Room</button>
            </div>

            <div id="joinRoom" class="control-panel">
                <h2>Join Room</h2>
                <input type="text" id="joinKey" placeholder="Join Key" required>
                <input type="password" id="joinPassword" placeholder="Room Password (if required)">
                <input type="text" id="userName" placeholder="Your Name" required>
                <button class="btn-primary">Join Room</button>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const createBtn = this.container.querySelector('#createRoom button');
        const joinBtn = this.container.querySelector('#joinRoom button');

        createBtn.addEventListener('click', () => {
            const name = document.getElementById('createRoomName').value.trim();
            const desc = document.getElementById('createRoomDesc').value.trim();
            const password = document.getElementById('createRoomPassword').value.trim();
            this.callbacks.onCreateRoom(name, desc, password);
        });

        joinBtn.addEventListener('click', () => {
            const key = document.getElementById('joinKey').value.trim();
            const password = document.getElementById('joinPassword').value.trim();
            const name = document.getElementById('userName').value.trim();
            this.callbacks.onJoinRoom(key, password, name);
        });
    }

    show() {
        this.container.classList.remove('hidden');
    }

    hide() {
        this.container.classList.add('hidden');
    }
}
