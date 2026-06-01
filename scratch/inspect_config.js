import fs from 'fs';
const data = JSON.parse(fs.readFileSync('c:/Users/SK/Documents/qims/pwa-bots-final-App 2/Survey 2/src/assets/hospital_config.json', 'utf8'));
console.log('Keys of hospital_config.json:', Object.keys(data));
if (data.hospital_full_configuration) {
    console.log('hospital_full_configuration type:', typeof data.hospital_full_configuration, Array.isArray(data.hospital_full_configuration));
    if (Array.isArray(data.hospital_full_configuration)) {
        console.log('Number of items:', data.hospital_full_configuration.length);
        console.log('First item:', JSON.stringify(data.hospital_full_configuration[0], null, 2).slice(0, 1000));
    }
}
