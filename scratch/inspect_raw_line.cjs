const fs = require('fs');
const content = fs.readFileSync('exports/google-sheets/hospital/06_Questions.csv', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
    const parts = line.split(',');
    if (parts[0] === 'HOSPITAL' && parts[1] === '45' && parts[4] === '45.1.1.1') {
        console.log('Raw line:', line);
        console.log('Parts:', parts);
    }
});
