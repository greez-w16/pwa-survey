const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/06_Questions.csv', 'utf8');

const lines = content.split('\n');
const q45 = [];

lines.forEach((line, index) => {
    const parts = line.split(',');
    if (parts[0] === 'HOSPITAL' && parts[1] === '45') {
        q45.push({ lineNum: index + 1, code: parts[4], name: parts[5] || '' });
    }
});

console.log('Total questions in csv for 45:', q45.length);
q45.forEach(q => {
    console.log(`Line ${q.lineNum}: ${q.code} | ${q.name.substring(0, 80)}...`);
});
