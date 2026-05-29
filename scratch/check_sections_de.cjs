const fs = require('fs');
const sections = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));

for (let i = 39; i <= 45; i++) {
    const sec = sections[i];
    if (sec) {
        console.log(`\nSection Name: ${sec.name} | ID: ${sec.id}`);
        console.log(`DE count: ${sec.dataElements ? sec.dataElements.length : 0}`);
        if (sec.dataElements && sec.dataElements.length > 0) {
            console.log('First 3 DEs:');
            sec.dataElements.slice(0, 3).forEach(de => {
                console.log(`  - Code: ${de.code} | Name: ${de.name}`);
            });
        }
    }
}
