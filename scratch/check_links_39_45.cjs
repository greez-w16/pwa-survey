const fs = require('fs');
const links = JSON.parse(fs.readFileSync('src/assets/hospital_links.json', 'utf8'));

const majors = new Set();
links.forEach(l => {
    const code = l.criteria;
    const major = code.split('.')[0];
    majors.add(parseInt(major, 10));
});

console.log('Unique major numbers in hospital_links.json:', [...majors].sort((a,b)=>a-b));
