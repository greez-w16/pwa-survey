const fs = require('fs');
const elements = JSON.parse(fs.readFileSync('scratch/sec45_elements.json', 'utf8'));

const codes = elements.map(e => {
    const match = e.code.match(/_40\.(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (match) {
        return `40.${match[1]}${match[2] ? '.' + match[2] : ''}${match[3] ? '.' + match[3] : ''}`;
    }
    const match2 = e.code.match(/HOSPITAL_40\.(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (match2) {
         return `40.${match2[1]}${match2[2] ? '.' + match2[2] : ''}${match2[3] ? '.' + match2[3] : ''}`;
    }
    // Try standard code matching
    const match3 = e.code.match(/40\.\d+(?:\.\d+)*/);
    return match3 ? match3[0] : e.code;
});

const uniqueCodes = [...new Set(codes)].sort();
console.log('Unique codes present in SEC00000045:', uniqueCodes.length);
console.log(uniqueCodes.join(', '));
