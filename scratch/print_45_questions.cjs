const fs = require('fs');
const elements = JSON.parse(fs.readFileSync('scratch/sec45_elements.json', 'utf8'));

console.log('--- NON-COMMENT DATA ELEMENTS IN SEC00000045 ---');
elements.forEach(e => {
    if (e.code.endsWith('-comments')) return;
    console.log(`${e.code} | ${e.name}`);
});
