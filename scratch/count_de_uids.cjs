const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/06_Questions.csv', 'utf8');

const lines = content.split('\n');
const headers = lines[0].split(',');
const dataElementUidIdx = headers.indexOf('dataElementUid');

let filledCount = 0;
let totalHosp = 0;

lines.slice(1).forEach(line => {
    const parts = line.split(',');
    if (parts[0] === 'HOSPITAL') {
        totalHosp++;
        if (parts[dataElementUidIdx] && parts[dataElementUidIdx].trim() !== '') {
            filledCount++;
        }
    }
});

console.log(`HOSPITAL rows: ${totalHosp}, filled DE UIDs: ${filledCount}`);
