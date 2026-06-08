const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\SK\\Documents\\qims\\email-proxy-17092025.py', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('running') || line.includes('Proxy') || line.includes('running') || line.includes('default') || line.includes('@app.route')) {
    if (line.includes('running') || line.includes('Service') || line.includes('Use /email2/api')) {
      console.log(`line ${index + 1}: ${line.trim()}`);
    }
  }
});
