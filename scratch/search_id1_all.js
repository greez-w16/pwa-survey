import fs from 'fs';
const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1663/content.md', 'utf8');

const id1 = '1g96UiMetwNLgp-XY2wMOm2S3by09RKi5';
let index = 0;
while ((index = text.indexOf(id1, index)) !== -1) {
    console.log(`Index ${index}:`);
    const start = Math.max(0, index - 150);
    const end = Math.min(text.length, index + 150);
    console.log(text.slice(start, end));
    index += id1.length;
}
