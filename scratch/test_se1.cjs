const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));
const sec1 = data[1];
console.log('SE 1 id:', sec1.id, 'name:', sec1.name);
sec1.dataElements.forEach(de => {
    if (de.code && de.code.includes('1.1.1')) {
        console.log('Found DE:', de.id, de.code, de.name);
    }
});
