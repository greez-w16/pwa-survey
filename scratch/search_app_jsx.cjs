const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\SK\\Documents\\qims\\pwa-bots-final-App 2\\Survey 2\\src\\App.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('Mortuary') || line.includes('OBGYN') || line.includes('obgyn') || line.includes('mortuary') || line.includes('surveyType') || line.includes('surveyGroup')) {
    console.log(`line ${index + 1}: ${line.trim()}`);
  }
});
