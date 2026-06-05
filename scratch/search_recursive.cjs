const fs = require('fs');
const path = require('path');

const rootDir = 'c:\\Users\\SK\\Documents\\qims';

function searchDir(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (e) {
      return;
    }
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        searchDir(filePath);
      }
    } else {
      // Only read files < 2MB and not zip/docx/pdf/xlsx
      if (stat.size < 2000000 && !/\.(zip|docx|pdf|xlsx|pptm|xlsb|png|jpg|jpeg|gif|tmp)$/i.test(file)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.includes('Proxy Service') || content.includes('QIMS Email') || content.includes('resolve-users')) {
            console.log(`Found in: ${filePath}`);
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (line.includes('Proxy Service') || line.includes('QIMS Email') || line.includes('resolve-users')) {
                console.log(`  Line ${index + 1}: ${line.trim()}`);
              }
            });
          }
        } catch (e) {
          // ignore read errors
        }
      }
    }
  });
}

searchDir(rootDir);
console.log('Search completed.');
