import fs from 'fs';

const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1701/content.md', 'utf8');

const matches = text.match(/[a-zA-Z0-9_-]{28,45}/g) || [];
console.log('Total potential IDs found:', matches.length);

const uniqueMatches = Array.from(new Set(matches)).filter(id => id.length >= 33);
console.log('Unique potential IDs:', uniqueMatches);

// Find contexts of any ids containing the string ems_config or ems_links
const lines = text.split('\n');
lines.forEach((line, index) => {
    if (line.toLowerCase().includes('ems_config') || line.toLowerCase().includes('ems_links') || line.toLowerCase().includes('ems_link')) {
        console.log(`Line ${index + 1}:`, line.slice(0, 300));
    }
});
