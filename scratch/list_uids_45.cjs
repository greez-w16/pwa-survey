const fs = require('fs');

const elements = JSON.parse(fs.readFileSync('scratch/sec45_elements.json', 'utf8'));

console.log('--- DHIS2 Data Element UIDs for Section SEC00000045 ---');
console.log('Format: Code | DHIS2 UID | Name');

const lines = [];
elements.forEach(e => {
    // extract code
    let code = e.code;
    const match = e.code.match(/HOSPITAL_(40\.\d+(?:\.\d+)*)(.*)/);
    if (match) {
        code = match[1] + (match[2] || '');
    }
    const cleanName = e.name.replace(/^SURV_HOSP_\d+-/, '');
    lines.push({ code, uid: e.id, name: cleanName });
});

// Write to a readable text file for standard reference
const outputText = lines.map(l => `${l.code.padEnd(25)} | ${l.uid.padEnd(12)} | ${l.name}`).join('\n');
fs.writeFileSync('scratch/sec45_uids_list.txt', outputText);

console.log(`Successfully wrote ${lines.length} data elements to scratch/sec45_uids_list.txt`);
// Print first 40 entries
lines.slice(0, 40).forEach(l => {
    console.log(`${l.code.padEnd(25)} | ${l.uid.padEnd(12)} | ${l.name}`);
});
