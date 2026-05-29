const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/08_StageDataElements.csv', 'utf8');

const lines = content.split('\n');
const matchingLines = [];
lines.forEach((line, index) => {
    if (line.includes(',45,')) {
        matchingLines.push({ lineNum: index + 1, content: line });
    }
});

console.log(`Found ${matchingLines.length} lines with ,45, in 08_StageDataElements.csv:`);
matchingLines.slice(0, 15).forEach(ml => {
    console.log(`Line ${ml.lineNum}: ${ml.content}`);
});
