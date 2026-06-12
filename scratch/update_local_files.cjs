const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, '..', 'hospital_config_rebuilt.json');
const dest1 = path.join(__dirname, '..', 'src', 'assets', 'hospital', 'hospital_config.json');
const dest2 = path.join(__dirname, '..', 'hospital_config_utf8.json');

try {
    fs.copyFileSync(srcFile, dest1);
    console.log(`Copied rebuilt config to ${dest1}`);
    fs.copyFileSync(srcFile, dest2);
    console.log(`Copied rebuilt config to ${dest2}`);
    console.log('Local files updated successfully!');
} catch (err) {
    console.error('Error copying local files:', err);
}
