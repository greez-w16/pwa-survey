const fs = require('fs');
const rawTexts = JSON.parse(fs.readFileSync('scratch/sec45_clean_texts.json', 'utf8'));

const cleanProse = (text) => {
    return text
        .replace(/^(?:CRITICAL\s+)?(?:&\s*Staff\s*Safety\s+)?(?:NA\s+NC\s+PC\s+C\s+)+/i, '')
        .trim();
};

const cleaned = {};
Object.keys(rawTexts).forEach(code => {
    cleaned[code] = cleanProse(rawTexts[code]);
});

console.log('Total cleaned questions:', Object.keys(cleaned).length);
console.log('Samples:');
Object.keys(cleaned).slice(0, 15).forEach(code => {
    console.log(`- ${code}: ${cleaned[code]}`);
});

fs.writeFileSync('scratch/sec45_final_cleaned.json', JSON.stringify(cleaned, null, 2));
