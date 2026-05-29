const fs = require('fs');

const elements = JSON.parse(fs.readFileSync('scratch/sec45_elements.json', 'utf8'));
const q45 = JSON.parse(fs.readFileSync('scratch/sec45_pdf_criteria.json', 'utf8'));

// Extract non-comment questions from elements in order
const q40 = [];
elements.forEach(e => {
    if (e.code.endsWith('-comments')) return;
    // Check if it's a question (not a header)
    const label = e.name;
    const isHeader = label.includes('(--)') || label.trim().endsWith('--') || label.includes('Coordination of Patient Care') || label.includes('Assessment of Patients') || label.includes('Patient Care');
    // More precise header detection: headers don't have 4-part codes like 40.1.1.1
    const match = e.code.match(/_40\.\d+\.\d+\.\d+/);
    if (match) {
        q40.push({ id: e.id, code: match[0].replace('_', ''), name: label.split('-').slice(1).join('-') });
    }
});

console.log(`Non-comment Q40s: ${q40.length}`);
console.log(`Q45s from PDF: ${q45.length}`);

// Print them side by side
const max = Math.max(q40.length, q45.length);
for (let i = 0; i < max; i++) {
    const c40 = q40[i] || { code: '', name: '' };
    const c45 = q45[i] || { code: '', text: '' };
    console.log(`${String(i+1).padStart(2)}: ${c40.code.padEnd(10)} | ${c40.name.substring(0, 40).padEnd(40)} <==> ${c45.code.padEnd(10)} | ${c45.text.substring(0, 45)}`);
}
