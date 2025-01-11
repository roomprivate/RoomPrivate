### Versions

**RPV** = RoomPrivate Version
**CSL** = ChatSystemLegacy  

We follow [Semantic Versioning 2.0.0](https://semver.org/), where each version number is structured as **MAJOR.MINOR.PATCH**:

- **MAJOR** version changes introduce breaking changes.
- **MINOR** version changes add new features that are backwards compatible.
- **PATCH** version changes include fixes and minor improvements.

---

### Version History
- **CSL**: c0dE's project that served as the base for RoomPrivate's room system. It was eventually remade into RPV1. [Showcase](https://youtube.com/shorts/yturQUrpWg0)
- **1.0.0-alpha**: The first alpha test version of RoomPrivate, marking the transition from CSL to the new system. [Showcase](https://youtu.be/uMI_bCFlTbc)
- **1.0.1-alpha**: Introduced bug fixes and small feature additions. [Showcase](https://youtu.be/rgCnYbPmkZM)
- **2.5.0-alpha**: Major update introducing **Klee Socket**, a Rust-based socket that replaced Socket.IO, and a backend mix of TypeScript and Rust. [Showcase](https://youtu.be/8_lfL7AwnIE)
- **2.6.1-alpha**: Finished Klee Socket
- **2.7.1-alpha**: The first redesign of the web client, replacing the old RoomPrivate Client with the Medusa Client.
- **3.0.2-beta**: Major updating featuring a full Rust backend and the Nietzsche Client for the web.
- **3.1.0-beta**: Added upload system for files and videos, with chunked upload for large files, and backend features for SHA256 of uploaded files. And some bug fixes.
- **3.1.1-beta**: Bug fixes, added support for custom username when create a room, added a popout on the start. Fixed responsive for smartphones.