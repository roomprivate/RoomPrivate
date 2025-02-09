# RoomPrivate

[![Codeberg Mirror](https://img.shields.io/static/v1?style=for-the-badge&label=Codeberg%20Mirror&message=codeberg.org/urwq/RoomPrivate)](https://codeberg.org/urwq/RoomPrivate/)

RoomPrivate is an open-source, secure, end-to-end encrypted chat created by [c0dE](https://c0de.wtf/) and [Júlia Klee](https://juliaklee.wtf/), which uses the Zacato protocol (designed specifically for this project).

The project was created as a "remake" of one of c0dE's old projects, **[CSL (Chat System Legacy)](https://github.com/C0dezin/chatsystemlegacy)**. CSL was originally built with Node.js, and RoomPrivate was the remake, originally developed in TypeScript.

Klee had the idea of making a Discord-like website, but with e2e and privacy enhanced. She named that project "Privcord" and started to work on that, Klee didn't know how to implement the e2e system. So, Klee remembered of the project that c0dE told her, CSL, and tried to remake that to have an idea. She looked at the code from CSL and decided to remake both the front-end and the back-end while keeping the old room system.

The CSL room system was known between them as "Stupid but functional" because it would return **"The specified room does not exist"** if the user typed the wrong password, an unauthorized username, or anything else. This was done to prevent people from trying to brute-force the room by thinking, "Oh! So the room exists? Let me try again."

After some development, they began taking RoomPrivate more seriously and abandoned many Discord-like features (roles for example), releasing new versions. These updates ranged from improving the room system to doing a complete rewrite in Rust.

There is a full video archive documenting ALL versions of RoomPrivate, including CSL. You can see more about the versions and their videos [here](https://github.com/roomprivate/room/blob/main/docs/versions.md)

<a href="https://star-history.com/#roomprivate/RoomPrivate&Timeline">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=roomprivate/RoomPrivate&type=Timeline&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=roomprivate/RoomPrivate&type=Timeline" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=roomprivate/RoomPrivate&type=Timeline" />
  </picture>
</a>
