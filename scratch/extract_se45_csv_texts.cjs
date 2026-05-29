const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/06_Questions.csv', 'utf8');

const lines = content.split('\n');
const headers = lines[0].split(',');
const qCodeIdx = headers.indexOf('questionCode');
const qTextIdx = headers.indexOf('questionText');

const se45Questions = {};
lines.forEach(line => {
    const parts = line.split(',');
    if (parts[0] === 'HOSPITAL' && parts[1] === '45') {
        const code = parts[qCodeIdx].trim();
        const text = parts[qTextIdx].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
        se45Questions[code] = text;
    }
});

console.log('Total clean questions found for 45 in CSV:', Object.keys(se45Questions).length);
console.log('Sample question texts:');
Object.keys(se45Questions).slice(0, 10).forEach(code => {
    console.log(`- ${code}: ${se45Questions[code]}`);
});

fs.writeFileSync('scratch/sec45_csv_texts.json', JSON.stringify(se45Questions, null, 2));
