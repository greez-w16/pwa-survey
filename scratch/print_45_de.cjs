const fs = require('fs');
const sections = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));
const sec45 = sections.find(s => s.id === 'SEC00000045');

const codes = sec45.dataElements.map(d => {
    return { id: d.id, code: d.code, name: d.name };
});

console.log('Total elements in 45:', codes.length);
console.log('Sample elements:');
codes.slice(0, 30).forEach(c => {
    console.log(`- ${c.id}: ${c.code} | Name: ${c.name}`);
});

fs.writeFileSync('scratch/sec45_elements.json', JSON.stringify(codes, null, 2));
