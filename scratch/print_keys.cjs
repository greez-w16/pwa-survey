const fs = require('fs');
const config = JSON.parse(fs.readFileSync('src/assets/hospital_config.json', 'utf8'));
console.log('Keys:', Object.keys(config));
if (config.full_configuration) {
    console.log('full_configuration is array:', Array.isArray(config.full_configuration));
    console.log('length:', config.full_configuration.length);
}
