const fs = require('fs');
const { transformMetadata } = require('../src/utils/transformers.js');

const dumpData = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));
const metadata = { id: 'hup8BqEe7Mn', programStageSections: dumpData };
const transformedGroups = transformMetadata(metadata);
const hospitalGroup = transformedGroups.find(g => g.id === 'HOSPITAL');

if (!hospitalGroup) {
    console.log('Hospital group not found');
    process.exit(1);
}

const se45Section = hospitalGroup.sections.find(s => s.se_id === '45' || s.id.includes('45'));
if (se45Section) {
    console.log('SE 45 Section found:', se45Section.id, se45Section.name);
    console.log('Fields count:', se45Section.fields.length);
    se45Section.fields.forEach(f => {
        console.log('  Field:', f.id, 'code:', f.code, 'type:', f.type, 'label:', f.label.substring(0, 50));
    });
} else {
    console.log('SE 45 Section not found');
}
