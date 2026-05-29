const fs = require('fs');
const config = JSON.parse(fs.readFileSync('src/assets/hospital_config.json', 'utf8'));

[41, 42, 43].forEach(id => {
    const se = config.hospital_full_configuration.find(s => s.se_id === id);
    if (!se) {
        console.log(`SE ${id} not found in hospital_config.json.`);
        return;
    }
    console.log(`SE ${id}: Name: ${se.se_name}`);
    se.sections.forEach(sec => {
        console.log(`  Section PI: ${sec.section_pi_id} | Title: ${sec.title}`);
        sec.standards.forEach(std => {
            console.log(`    Std: ${std.standard_id} | Statement: ${std.statement.substring(0, 50)}...`);
        });
    });
});
