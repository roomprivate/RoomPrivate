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
- **2.0.0-alpha**: Introducing **Klee Socket**, a Rust-based socket that replaced Socket.IO, and a backend mix of TypeScript and Rust. [Showcase](https://youtu.be/8_lfL7AwnIE)
- **2.1.0-beta**: Finished Klee Socket
- **2.2.1-alpha**: The first redesign of the web client, replacing the old RoomPrivate Client with the Medusa Client.
- **2.3.2-beta**: Medusa Client finished. [Showcase](https://youtu.be/q5uO7zCbiNk)
- **3.0.0-alpha**: Major update featuring a full Rust backend and the Nietzsche Client for the web. [Showcase](https://youtu.be/5zqiD9TrosI)
- **3.1.1-alpha**: Added upload system for files and videos, with chunked upload for large files, and backend features for SHA256 of uploaded files. And some bug fixes.
- **3.1.2-alpha**: Bug fixes, added support for custom username when creating a room, added a popout on the start. Fixed responsiveness for smartphones.

---

### Note on Version Gaps:
- The versions **2.2.0**, **2.3.0**, and a few others were never built or released because of development changes or focusing on other features. So, the version numbers **jumped** to show the bigger updates that were actually finished and released. These gaps just reflect what was happening behind the scenes, and no official versions came out for the skipped ones.
