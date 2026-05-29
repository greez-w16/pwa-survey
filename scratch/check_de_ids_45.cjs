const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/06_Questions.csv', 'utf8');

const lines = content.split('\n');
const headers = lines[0].split(',');
const dataElementUidIdx = headers.indexOf('dataElementUid');
const dhis2CodeIdx = headers.indexOf('dhis2DataElementCode');
const dhis2NameIdx = headers.indexOf('dhis2DataElementName');
const qCodeIdx = headers.indexOf('questionCode');

console.log('Indices:', { dataElementUidIdx, dhis2CodeIdx, dhis2NameIdx, qCodeIdx });

lines.forEach((line, index) => {
    const parts = line.split(',');
    if (parts[0] === 'HOSPITAL' && parts[1] === '45') {
        console.log(`Line ${index + 1}: ${parts[qCodeIdx]} | DE UID: ${parts[dataElementUidIdx]} | DHIS2 Code: ${parts[dhis2CodeIdx]} | DHIS2 Name: ${parts[dhis2NameIdx]}`);
    }
});
