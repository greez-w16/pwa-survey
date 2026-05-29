const fs = require('fs');
const content = fs.readFileSync('Botswananhq_hospital/extracted_text/se_45.txt', 'utf8');

const lines = content.split('\n');
const criteria = [];
let currentCrit = null;

lines.forEach(line => {
    const trimmed = line.trim();
    // Match something like "45.1.1.1" or "45.2.1.2"
    const match = trimmed.match(/^45\.\d+\.\d+\.\d+/);
    if (match) {
        if (currentCrit) {
            criteria.push(currentCrit);
        }
        currentCrit = { code: match[0], text: trimmed.substring(match[0].length).trim() };
    } else if (currentCrit && trimmed && !trimmed.startsWith('--- Page') && !trimmed.startsWith(' Assessment') && !trimmed.includes('BOTSWANA NATIONAL') && !trimmed.includes('STANDARDS FOR HOSPITALS')) {
        currentCrit.text += ' ' + trimmed;
    }
});
if (currentCrit) {
    criteria.push(currentCrit);
}

console.log('Total criteria found in se_45.txt:', criteria.length);
criteria.forEach(c => {
    // clean up whitespace
    c.text = c.text.replace(/\s+/g, ' ').trim();
    console.log(`- ${c.code}: ${c.text.substring(0, 80)}...`);
});

fs.writeFileSync('scratch/sec45_pdf_criteria.json', JSON.stringify(criteria, null, 2));
