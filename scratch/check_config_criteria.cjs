const fs = require('fs');
const config = JSON.parse(fs.readFileSync('src/assets/hospital_config.json', 'utf8'));

let nonMin = 0;
config.hospital_full_configuration.forEach(se => {
    const seId = se.se_id;
    se.sections.forEach(sec => {
        sec.standards.forEach(std => {
            if (std.criteria && std.criteria.length > 0) {
                nonMin++;
                console.log(`SE ${seId} | Std ${std.standard_id} has ${std.criteria.length} criteria`);
            }
        });
    });
});

console.log('Total standards with non-empty criteria:', nonMin);
