"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROLE = exports.OWNER_ROLE = exports.Permission = void 0;
var Permission;
(function (Permission) {
    Permission["KICK_USER"] = "KICK_USER";
    Permission["EDIT_ROOM"] = "EDIT_ROOM";
    Permission["MANAGE_ROLES"] = "MANAGE_ROLES";
    Permission["DELETE_ROOM"] = "DELETE_ROOM";
    Permission["BAN_USER"] = "BAN_USER";
    Permission["UNBAN_USER"] = "UNBAN_USER";
    Permission["PIN_MESSAGE"] = "PIN_MESSAGE";
    Permission["DELETE_MESSAGE"] = "DELETE_MESSAGE";
    Permission["MUTE_USER"] = "MUTE_USER";
    Permission["UNMUTE_USER"] = "UNMUTE_USER";
})(Permission || (exports.Permission = Permission = {}));
exports.OWNER_ROLE = {
    id: 'owner',
    name: 'Owner',
    color: '#ff0000',
    permissions: Object.values(Permission),
    position: 1000
};
exports.DEFAULT_ROLE = {
    id: 'default',
    name: 'Member',
    color: '#808080',
    permissions: [],
    position: 0
};
