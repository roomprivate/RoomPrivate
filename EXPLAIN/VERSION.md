### Version Explain

**rpv** = RoomPrivate Version  
Version in that context means "the main structure version."

We have three main structure versions:  
- **csl** = ChatSystemLegacy  
- **rpv1** = RoomPrivate v1  
- **rpv2** = RoomPrivate v2  

The **csl** is the room system used in RoomPrivate.
The **rpv1** is the legacy version (TypeScript backend).  
The **rpv2** is the actual version, with a Rust backend and more stability.  

The main version refers to the base code used, which includes the language and structure.  

We use the structure `MAINSTRUCTUREVERSION.Major.Minor.Patch(ID)`  

- **MAJOR**: Big update, like a new API and etc.  
- **MINOR**: Minor update, like adding new features or UI/UX updates.  
- **Patch**: Security update or bug fix.  

**(ID)**: The identifier of the type of the version:  
- **a** = Alpha  
- **b** = Beta  
- **ex** = Experimental  
- **r** = Released, stable  

---

### Version History

We have these versions:

#### RoomPrivate Versions
- **rpv1-0.0.0a**: The first test of the RoomPrivate, alpha.  
- **rpv1-0.0.1a**: This version introduced a lot of things and fixes.  
- **rpv1-0.5.0a**: Introduced the KCT (Klee Socket), a socket in Rust to optimize the relation between client and server (the previous version used Socket.IO) and a hybrid backend with TypeScript and Rust.  
- **rpv1-0.5.1a**: Introduced the first rework in the web client, removing the old RoomPrivate Client and introducing the Medusa Client.  
- **rpv2-2.0.1b**: The first beta introduced the new backend (100% in Rust) and the new web client, Nietzsche Client.  
