const fs = require('fs');

function readJsonClean(path) {
    let raw = fs.readFileSync(path, 'utf8');
    raw = raw.replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

const matrix = readJsonClean('src/assets/radiology/radiology_matrix.json');
const config = readJsonClean('src/assets/radiology/radiology_config.json');
const dhis2 = readJsonClean('scratch/rad_all_de.json');

console.log('--- Config Analysis ---');
const configCriteria = [];
config.service_elements.forEach(se => {
    se.sections.forEach(sec => {
        sec.standards.forEach(std => {
            std.criteria.forEach(c => {
                configCriteria.push(c.id);
            });
        });
    });
});
console.log(`Total Service Elements in Config: ${config.service_elements.length}`);
console.log(`Total Criteria in Config: ${configCriteria.length}`);
console.log(`Config Criteria Range: ${configCriteria[0]} to ${configCriteria[configCriteria.length - 1]}`);

console.log('\n--- Matrix Analysis ---');
const matrixList = matrix.radiology || [];
console.log(`Total Criteria in Matrix: ${matrixList.length}`);
if (matrixList.length > 0) {
    console.log(`Matrix Criteria Range: ${matrixList[0].criteria} to ${matrixList[matrixList.length - 1].criteria}`);
}

console.log('\n--- DHIS2 Analysis ---');
let totalDhis2De = 0;
const dhis2Codes = new Set();
dhis2.sections.forEach(sec => {
    sec.dataElements.forEach(de => {
        if (de.code) {
            dhis2Codes.add(de.code);
            totalDhis2De++;
        }
    });
});
console.log(`Total Data Elements with code in DHIS2: ${totalDhis2De}`);

const matrixMatched = [];
const matrixUnmatched = [];
matrixList.forEach(item => {
    const id = item.criteria;
    const matchedDe = [...dhis2Codes].find(code => {
        return code.endsWith('_' + id) || code.includes('_' + id + '-');
    });
    if (matchedDe) {
        matrixMatched.push({ id, code: matchedDe });
    } else {
        matrixUnmatched.push(id);
    }
});

console.log(`Matrix criteria matched to DHIS2 codes: ${matrixMatched.length} / ${matrixList.length}`);
console.log(`Unmatched matrix criteria count: ${matrixUnmatched.length}`);
if (matrixUnmatched.length > 0) {
    console.log('Sample unmatched matrix criteria:', matrixUnmatched.slice(0, 10));
}

// Let's check if the configuration should be built from the matrix instead
const { buildConfigFromMatrix } = require('./src/utils/matrixConfig.js');
const dynamicConfig = buildConfigFromMatrix('radiology', matrixList);
const dynamicCriteriaCount = dynamicConfig.service_elements.reduce((acc, se) => {
    return acc + se.sections.reduce((acc2, sec) => {
        return acc2 + sec.standards.reduce((acc3, std) => {
            return acc3 + std.criteria.length;
        }, 0);
    }, 0);
}, 0);
console.log(`\nIf built from Matrix using buildConfigFromMatrix:`);
console.log(`- Service Elements: ${dynamicConfig.service_elements.length}`);
console.log(`- Criteria: ${dynamicCriteriaCount}`);
