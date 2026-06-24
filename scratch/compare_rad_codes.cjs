const fs = require('fs');

function readJsonClean(path) {
    let raw = fs.readFileSync(path, 'utf8');
    raw = raw.replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

const matrix = readJsonClean('src/assets/radiology/radiology_matrix.json');
const dhis2 = readJsonClean('scratch/rad_all_de.json');

const matrixIds = new Set((matrix.radiology || []).map(m => m.criteria));

// Let's analyze DHIS2 data elements
const dhis2BySection = {};
dhis2.sections.forEach(sec => {
    dhis2BySection[sec.name] = [];
    sec.dataElements.forEach(de => {
        if (de.code) {
            dhis2BySection[sec.name].push({
                id: de.id,
                code: de.code,
                name: de.name,
                displayName: de.displayName
            });
        }
    });
});

const unmatchedCodes = [];
const matchedCodes = [];

dhis2.sections.forEach(sec => {
    sec.dataElements.forEach(de => {
        if (!de.code) return;
        
        // Normalize DHIS2 code to match matrix ID
        // DHIS2 code is like "80-RAD_1.4.2.1" or "80-RAD_1.4.2.1-root(RAD)"
        // Let's extract the criteria ID part (e.g. 1.4.2.1)
        let normalized = de.code.trim();
        normalized = normalized.replace(/-root\(.*\)$/, '');
        const lastUnderscoreBeforeDigit = normalized.search(/_(?=\d)/);
        if (lastUnderscoreBeforeDigit !== -1) {
            const match = normalized.match(/.*_(?=\d)/);
            if (match) {
                normalized = normalized.slice(match[0].length);
            }
        }
        normalized = normalized.split(/\s+/)[0];
        
        if (matrixIds.has(normalized)) {
            matchedCodes.push({ deCode: de.code, normalized, section: sec.name });
        } else {
            unmatchedCodes.push({ deCode: de.code, normalized, section: sec.name, deName: de.name });
        }
    });
});

console.log(`Matched DHIS2 Data Elements: ${matchedCodes.length}`);
console.log(`Unmatched DHIS2 Data Elements: ${unmatchedCodes.length}`);

console.log('\nBreakdown of Unmatched Data Elements by DHIS2 Section:');
const secCounts = {};
unmatchedCodes.forEach(x => {
    secCounts[x.section] = (secCounts[x.section] || 0) + 1;
});
console.log(secCounts);

console.log('\nSample Unmatched Data Elements:');
console.log(unmatchedCodes.slice(0, 20));
