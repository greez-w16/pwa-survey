import fs from 'fs';
const text = fs.readFileSync('C:/Users/SK/.gemini/antigravity/brain/3937ff85-2f19-4149-aa6a-47c584c3dd7c/.system_generated/steps/1701/content.md', 'utf8');

const id1 = '1eL-WsAn_CryT8BIr-dWiuj2c0z5qCxMk';
const id2 = '1Ei5xRYHzasXvKc7no6od6ExvJF_l-_Yf';

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
