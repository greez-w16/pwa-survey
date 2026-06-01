import fs from 'fs';
import path from 'path';

const baseDir = 'c:/Users/SK/Documents/qims/pwa-bots-final-App 2/Survey 2';
const assetsDir = path.join(baseDir, 'src/assets');

const files = [
    'hospital_config.json',
    'ems_config.json',
    'mortuary_config.json',
    'clinics_config.json'
];

files.forEach(f => {
    const filePath = path.join(assetsDir, f);
    if (!fs.existsSync(filePath)) {
        console.log(`${f} does not exist.`);
        return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`=== ${f} ===`);
    console.log('Top-level keys:', Object.keys(data));
    Object.entries(data).forEach(([key, val]) => {
        console.log(`  Key "${key}": type=${typeof val}, isArray=${Array.isArray(val)}`);
        if (Array.isArray(val)) {
            console.log(`    Length: ${val.length}`);
            if (val.length > 0) {
                console.log(`    First item type: ${typeof val[0]}`);
            }
        } else if (val && typeof val === 'object') {
            console.log(`    Sub-keys:`, Object.keys(val).slice(0, 5));
        }
    });
});
