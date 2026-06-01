import fs from 'fs';
const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1663/content.md', 'utf8');

const id1 = '1g96UiMetwNLgp-XY2wMOm2S3by09RKi5';
const lines = text.split('\n');
lines.forEach((line, index) => {
    if (line.includes(id1) && line.includes('.json')) {
        console.log(`Line ${index + 1}:`, line.slice(0, 300));
    }
});
