import fs from 'fs';
const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1663/content.md', 'utf8');

// Find all matches for 11+ character strings that look like Google Drive IDs
// e.g. 1CszUtc3O2BK2M-uMQ1APJpNWGzt5NwIy
// Google Drive folder/file UIDs are usually 33 characters (alphanumeric, underscores, hyphens)
const matches = text.match(/[a-zA-Z0-9_-]{28,45}/g) || [];
console.log('Total potential IDs found:', matches.length);

const uniqueMatches = Array.from(new Set(matches));
console.log('Unique potential IDs:', uniqueMatches.filter(id => {
    // Filter to ones that look like typical Drive file IDs (often contain dashes/underscores, mixed case, around 33 chars)
    return id.length >= 33;
}));

// Search for mentions of mortuary
const lines = text.split('\n');
lines.forEach((line, index) => {
    if (line.toLowerCase().includes('mortuary')) {
        console.log(`Line ${index + 1}:`, line.slice(0, 200));
    }
});
