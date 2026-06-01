import fs from 'fs';
const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1663/content.md', 'utf8');

const id1 = '1g96UiMetwNLgp-XY2wMOm2S3by09RKi5';
const id2 = '1r5P27w02Dpdhcnj00YQ0ggNlKy-RyXUF';

const findContext = (id, label) => {
    let index = 0;
    while ((index = text.indexOf(id, index)) !== -1) {
        console.log(`--- Context for ${label} (${id}) at index ${index} ---`);
        const start = Math.max(0, index - 200);
        const end = Math.min(text.length, index + 200);
        console.log(text.slice(start, end));
        index += id.length;
    }
};

findContext(id1, 'ID 1');
findContext(id2, 'ID 2');
