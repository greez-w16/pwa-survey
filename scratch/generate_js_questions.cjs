const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/06_Questions.csv', 'utf8');

const lines = content.split('\n');
const headers = lines[0].split(',');
const qCodeIdx = headers.indexOf('questionCode');
const qTextIdx = headers.indexOf('questionText');

const se45Questions = [];
lines.forEach(line => {
    const parts = line.split(',');
    if (parts[0] === 'HOSPITAL' && parts[1] === '45') {
        const code = parts[qCodeIdx].trim();
        let text = parts[qTextIdx].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
        
        // Clean severity prefixes
        text = text.replace(/^(?:CRITICAL\s+)?Severity:\s*.*?\s+NA\s+NC\s+PC\s+C\s+/i, '').trim();
        // Also some might just start with Severity: Serious Category: Pat & Staff Safety etc.
        text = text.replace(/^(?:CRITICAL\s+)?Severity:\s*.*?(?:Category:\s*.*?)?,/i, '').trim();
        // Let's do a general cleanup
        text = text.replace(/^(?:CRITICAL\s+)?Severity:\s*[^A-Z]*/i, '').trim();
        // Remove standard prefix if present
        text = text.replace(/^(?:CRITICAL\s+)?Severity:\s*(?:Very\s+)?(?:Serious|Moderate|Minor)\s*(?:Category:\s*[\w\s&]+)?\s*/i, '').trim();
        
        se45Questions.push({ code, label: text });
    }
});

console.log('const SE45_QUESTIONS = [');
se45Questions.forEach((q, idx) => {
    const comma = idx === se45Questions.length - 1 ? '' : ',';
    console.log(`  { code: '${q.code}', label: ${JSON.stringify(q.label)} }${comma}`);
});
console.log('];');
