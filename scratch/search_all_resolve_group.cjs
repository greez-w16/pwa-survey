const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\SK\\Documents\\qims\\pwa-bots-final-App 2\\Survey 2\\src';

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      searchDir(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('resolveGroupIdFromText') && line.includes('function') || line.includes('const resolveGroupIdFromText')) {
          console.log(`${path.relative(srcDir, filePath)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  });
}

searchDir(srcDir);
