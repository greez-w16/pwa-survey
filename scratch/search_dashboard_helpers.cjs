const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\SK\\Documents\\qims\\pwa-bots-final-App 2\\Survey 2\\src\\pages\\Dashboard.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('resolveGroupIdFromText') || line.includes('resolveGroupId')) {
    console.log(`line ${index + 1}: ${line.trim()}`);
  }
});
