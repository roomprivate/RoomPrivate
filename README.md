# RoomPrivate

RoomPrivate is an open-source, secure, end-to-end encrypted chat created by [c0dE](https://c0de.wtf) and [Júlia Klee](https://juliaklee.wtf/).

The project was created as a "remake" of one of c0dE's old projects, **[CSL (Chat System Legacy)](https://github.com/C0dezin/chatsystemlegacy)**. CSL was originally built with Node.js, and RoomPrivate was the remake, originally developed in TypeScript.

Klee started working on the remake after c0dE told her about CSL. She looked at the code and decided to remake both the front-end and the back-end while keeping the old room system.

The CSL room system was known between them as "Stupid but functional" because the code would return **"The specified room does not exist"** if the user typed the wrong password, an unauthorized username, or anything else. This was done to prevent people from trying to brute-force the room by thinking, "Oh! So the room exists? Let me try again."

After some development, they started taking the project more seriously, releasing new versions. These updates ranged from improving the room system to redesigning the UI, and even doing a complete rewrite in Rust!

There is a full video archive documenting ALL versions of RoomPrivate, including CSL. You can see more about the versions and their videos [here](https://github.com/roomprivate/room/blob/main/docs/versions.md).
