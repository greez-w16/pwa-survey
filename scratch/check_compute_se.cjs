const fs = require('fs');
const compute = JSON.parse(fs.readFileSync('src/assets/hospital_compute_criteria.json', 'utf8'));

const seIds = compute.hospital_standards_config.service_elements.map(se => se.se_id);
console.log('SE IDs in hospital_compute_criteria.json:', seIds);
