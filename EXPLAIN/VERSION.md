### Version Explain

rpv = RoomPrivate Version
Version in that context means "the main structure version"

We have two main structure version:
crl = ChatRoomLegacy
rpv1 = RoomPrivate v1
rpv2 = RoomPrivate v2

The rpv1 is the legacy version (Typescript backend)
The rpv2 is the actual versio, with Rust backend and more stable

The main version refer to the base code used, that means language and structure

We use the structure MAINSTRUCTUREVERSION (rpv).Major Version.Minor.Patch(ID)


MAJOR: Big update, like a new api and etc
MINOR: Minor update, like add new features, UI/UX update
Patch: Security update or bug fix

(ID): The identifier of the type of the version:

a = Alpha
b = Beta
ex = Experimental
r = Released, stable


### **Version History**

We have those version

ChatRoomLegacy: The room system used in RoomPrivate

**rpv1-0.0.0a**: The first test of the RoomPrivate, alpha
**rpv1-0.0.1a*: That version introduce a lot of things, and fix
**rpv1-0.5.0a**: Introduced the KCT Klee Socket a socket in rust, to optimize the relation between client and server (the previous version use socket.io) and a hybrid backend with Typescript and Rust
**rpv1-0.5.1a**: Introduced the first rework in webclient removing the old RoomPrivate Client and introduce Medusa Client
**rpv2-2.0.1b**: The first beta and introduce the new backend 100% in rust, and the new webclient Niestzche Client
