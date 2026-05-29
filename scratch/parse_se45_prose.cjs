const fs = require('fs');
const content = fs.readFileSync('Botswananhq_hospital/extracted_text/se_45.txt', 'utf8');

const lines = content.split('\n').map(l => l.trim());
const criteria = {};
let currentCode = null;
let collectingText = false;
let currentTextParts = [];

const skipWords = [
    'severity:', 'serious', 'very serious', 'moderate', 'minor',
    'category:', 'efficiency', 'structure', 'patient care', 'pat & staff safety',
    'na nc pc c', 'na nc pc c a', 'na nc pc c the'
];

lines.forEach((line, idx) => {
    // Match something like "45.1.1.1" or "45.2.1.2"
    const codeMatch = line.match(/^45\.\d+\.\d+\.\d+$/);
    if (codeMatch) {
        if (currentCode && currentTextParts.length > 0) {
            criteria[currentCode] = currentTextParts.join(' ').replace(/\s+/g, ' ').trim();
        }
        currentCode = codeMatch[0];
        collectingText = false;
        currentTextParts = [];
        return;
    }

    if (!currentCode) return;

    if (line === 'Comment:') {
        if (currentCode && currentTextParts.length > 0) {
            criteria[currentCode] = currentTextParts.join(' ').replace(/\s+/g, ' ').trim();
        }
        currentCode = null;
        collectingText = false;
        currentTextParts = [];
        return;
    }

    const lower = line.toLowerCase();
    if (!line || skipWords.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + '\t'))) {
        return;
    }

    // Skip other metadata page lines
    if (line.startsWith('--- Page') || line.startsWith(' Assessment') || line.includes('BOTSWANA NATIONAL') || line.includes('STANDARDS FOR HOSPITALS') || line.includes('Psychiatric Volunteer Services')) {
        return;
    }

    // It's part of the text
    currentTextParts.push(line);
});

console.log('Parsed criteria count:', Object.keys(criteria).length);
Object.keys(criteria).forEach(code => {
    console.log(`- ${code}: ${criteria[code]}`);
});

fs.writeFileSync('scratch/sec45_clean_texts.json', JSON.stringify(criteria, null, 2));
