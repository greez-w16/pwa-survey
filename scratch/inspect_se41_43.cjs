const fs = require('fs');
const sections = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));

['SEC00000041', 'SEC00000042', 'SEC00000043'].forEach(id => {
    const sec = sections.find(s => s.id === id);
    if (!sec) {
        console.log(`Section ${id} not found in dump.`);
        return;
    }
    console.log(`Section: ${id} | Name: ${sec.name}`);
    const nonCommentDEs = sec.dataElements.filter(d => !d.code.endsWith('-comments'));
    console.log(`Total non-comment DEs: ${nonCommentDEs.length}`);
    console.log('Sample DE codes:');
    nonCommentDEs.slice(0, 5).forEach(d => {
        console.log(`  - ${d.id}: ${d.code}`);
    });
});
