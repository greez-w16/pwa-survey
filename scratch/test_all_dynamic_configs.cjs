const fs = require('fs');
const { buildConfigFromMatrix } = require('../src/utils/matrixConfig.js');

function readJsonClean(path) {
    let raw = fs.readFileSync(path, 'utf8');
    raw = raw.replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

const facilityTypes = [
    { name: 'obgyn', matrix: 'src/assets/obsterics-gyno/obsterics_gyno_matrix.json', key: 'obsterics_gyno' },
    { name: 'physiotheraphy', matrix: 'src/assets/physiotheraphy/physiotheraphy_matrix.json', key: 'physiotheraphy' },
    { name: 'general_practice', matrix: 'src/assets/general-practice/general_practice_matrix.json', key: 'general_practice' },
    { name: 'private_diabetic', matrix: 'src/assets/private-diabetic/private_diabetic_matrix.json', key: 'private_diabetic' },
    { name: 'oral', matrix: 'src/assets/oral/oral_matrix.json', key: 'oral' },
    { name: 'oncology', matrix: 'src/assets/private-oncology/private_oncology_matrix.json', key: 'private_oncology' },
    { name: 'paediatric', matrix: 'src/assets/paediatric/paediatric_matrix.json', key: 'paediatric' }
];

facilityTypes.forEach(fac => {
    try {
        const matrixData = readJsonClean(fac.matrix);
        const matrixList = matrixData[fac.key] || [];
        const dynamicConfig = buildConfigFromMatrix(fac.name, matrixList);
        
        let dynamicCount = 0;
        dynamicConfig.service_elements.forEach(se => {
            se.sections.forEach(sec => {
                sec.standards.forEach(std => {
                    dynamicCount += (std.criteria || []).length;
                });
            });
        });
        
        console.log(`${fac.name}:`);
        console.log(`  Matrix items: ${matrixList.length}`);
        console.log(`  Dynamic config criteria count: ${dynamicCount}`);
        console.log(`  Dynamic config Service Elements: ${dynamicConfig.service_elements.length}`);
    } catch (e) {
        console.log(`Error parsing ${fac.name}: ${e.message}`);
    }
});
