const fs = require('fs');
const file = 'src/pages/Dashboard.jsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the old block starting with "let selectedMetadata = null;" after line 1995
const startMarker = 'let selectedMetadata = null;';
let startIdx = -1;
for (let i = 1995; i < lines.length; i++) {
    if (lines[i].includes(startMarker)) {
        startIdx = i;
        break;
    }
}
if (startIdx === -1) {
    console.log('Start marker not found');
    process.exit(1);
}

// Find end: the blank line before "if (selfOnly) {"
let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === 'if (selfOnly) {') {
        endIdx = i;
        break;
    }
}
if (endIdx === -1) {
    console.log('End marker not found');
    process.exit(1);
}

console.log('Replacing lines', startIdx + 1, 'to', endIdx);

const newCode = [
    '            let selectedMetadata = null;',
    '            if (grp) {',
    '                setInitFacilityGroup(grp);',
    "                setLoadingSurveyInfo('Loading assessment metadata\\u2026');",
    '                selectedMetadata = await ensureSurveyMetadataForGroup(grp);',
    '                setInitProgramStageMetadata(selectedMetadata);',
    '                setInitSeOptions(buildSeOptions(grp, selectedMetadata));',
    '                setLockGroup(true);',
    '            } else {',
    '                setInitProgramStageMetadata(null);',
    '            }'
];

lines.splice(startIdx, endIdx - startIdx, ...newCode);

fs.writeFileSync(file, lines.join('\n'));
console.log('Done');
