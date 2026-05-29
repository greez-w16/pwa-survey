const fs = require('fs');
const sections = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));

const sec40 = sections.find(s => s.id === 'SEC00000040');
const sec45 = sections.find(s => s.id === 'SEC00000045');

console.log('sec40 DEs:', sec40.dataElements.length);
console.log('sec45 DEs:', sec45.dataElements.length);

const ids40 = new Set(sec40.dataElements.map(d => d.id));
const ids45 = new Set(sec45.dataElements.map(d => d.id));

let commonCount = 0;
sec45.dataElements.forEach(d => {
    if (ids40.has(d.id)) {
        commonCount++;
    }
});

console.log(`Common data elements by ID: ${commonCount}`);

// Print some elements from sec45 that are NOT in sec40 (if any)
const diff45 = sec45.dataElements.filter(d => !ids40.has(d.id));
console.log(`Unique elements in sec45: ${diff45.length}`);
if (diff45.length > 0) {
    console.log('Sample unique elements in sec45:');
    diff45.slice(0, 5).forEach(d => {
        console.log(`  - ID: ${d.id} | Code: ${d.code} | Name: ${d.name}`);
    });
}
