const fs = require('fs');
const sections = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));
sections.forEach((sec, idx) => {
    console.log(`${idx + 1}. ID: ${sec.id} | Name: ${sec.name}`);
});
