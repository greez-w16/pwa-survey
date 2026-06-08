const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\SK\\Documents\\qims';
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (file.endsWith('.py')) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('resolve') || line.includes('admin') || line.includes('email2')) {
        console.log(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
});
