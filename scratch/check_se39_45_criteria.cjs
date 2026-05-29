const fs = require('fs');
const config = JSON.parse(fs.readFileSync('src/assets/hospital_config.json', 'utf8'));

config.hospital_full_configuration.forEach(se => {
    const seId = se.se_id;
    if (seId >= 39) {
        console.log(`SE ${seId}: Name: ${se.se_name}`);
        se.sections.forEach(sec => {
            sec.standards.forEach(std => {
                console.log(`  Std ${std.standard_id}: ${std.criteria ? std.criteria.length : 'no criteria array'} criteria`);
            });
        });
    }
});
