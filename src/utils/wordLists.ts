export const adjectives = [
    'Happy', 'Brave', 'Clever', 'Gentle', 'Swift',
    'Bright', 'Calm', 'Wild', 'Wise', 'Noble',
    'Proud', 'Bold', 'Kind', 'Pure', 'Free',
    'Warm', 'Cool', 'Keen', 'Fair', 'Rich'
];

export const nouns = [
    'Phoenix', 'Dragon', 'Tiger', 'Eagle', 'Wolf',
    'River', 'Mountain', 'Ocean', 'Forest', 'Star',
    'Moon', 'Sun', 'Cloud', 'Storm', 'Wind',
    'Crystal', 'Garden', 'Haven', 'Spirit', 'Heart'
];

export function generateRoomName(): string {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}${noun}`;
}
