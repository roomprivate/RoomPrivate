"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nouns = exports.adjectives = void 0;
exports.generateRoomName = generateRoomName;
exports.adjectives = [
    'Happy', 'Brave', 'Clever', 'Gentle', 'Swift',
    'Bright', 'Calm', 'Wild', 'Wise', 'Noble',
    'Proud', 'Bold', 'Kind', 'Pure', 'Free',
    'Warm', 'Cool', 'Keen', 'Fair', 'Rich'
];
exports.nouns = [
    'Phoenix', 'Dragon', 'Tiger', 'Eagle', 'Wolf',
    'River', 'Mountain', 'Ocean', 'Forest', 'Star',
    'Moon', 'Sun', 'Cloud', 'Storm', 'Wind',
    'Crystal', 'Garden', 'Haven', 'Spirit', 'Heart'
];
function generateRoomName() {
    const adjective = exports.adjectives[Math.floor(Math.random() * exports.adjectives.length)];
    const noun = exports.nouns[Math.floor(Math.random() * exports.nouns.length)];
    return `${adjective}${noun}`;
}
