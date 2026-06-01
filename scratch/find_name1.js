import fs from 'fs';
const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1663/content.md', 'utf8');

const id1 = '1g96UiMetwNLgp-XY2wMOm2S3by09RKi5';
let index = text.indexOf(id1);
if (index !== -1) {
    const start = Math.max(0, index - 200);
    const end = Math.min(text.length, index + 200);
    console.log('Context for 1g96UiMetwNLgp-XY2wMOm2S3by09RKi5:');
    console.log(text.slice(start, end));
}
