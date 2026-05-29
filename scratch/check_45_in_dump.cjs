const fs = require('fs');
const content = fs.readFileSync('scratch/stage_sections_dump.json', 'utf8');

const match = content.match(/"code":\s*"[^"]*45\.\d+[^"]*"/g);
if (match) {
    console.log(`Found ${match.length} matches for 45. codes:`);
    console.log(match.slice(0, 10));
} else {
    console.log('No matches for 45. codes found in metadata dump.');
}
