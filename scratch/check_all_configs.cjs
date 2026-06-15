const fs = require('fs');

function readJsonClean(path) {
    let raw = fs.readFileSync(path, 'utf8');
    raw = raw.replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

const facilityTypes = [
    { name: 'obsterics-gyno', config: 'src/assets/obsterics-gyno/obsterics_gyno_config.json', matrix: 'src/assets/obsterics-gyno/obsterics_gyno_matrix.json', matrixKey: 'obsterics_gyno' },
    { name: 'physiotheraphy', config: 'src/assets/physiotheraphy/physiotheraphy_config.json', matrix: 'src/assets/physiotheraphy/physiotheraphy_matrix.json', matrixKey: 'physiotheraphy' },
    { name: 'general-practice', config: 'src/assets/general-practice/general_practice_config.json', matrix: 'src/assets/general-practice/general_practice_matrix.json', matrixKey: 'general_practice' },
    { name: 'private-diabetic', config: 'src/assets/private-diabetic/private_diabetic_config.json', matrix: 'src/assets/private-diabetic/private_diabetic_matrix.json', matrixKey: 'private_diabetic' },
    { name: 'oral', config: 'src/assets/oral/oral_config.json', matrix: 'src/assets/oral/oral_matrix.json', matrixKey: 'oral' },
    { name: 'private-oncology', config: 'src/assets/private-oncology/private_oncology_config.json', matrix: 'src/assets/private-oncology/private_oncology_matrix.json', matrixKey: 'private_oncology' },
    { name: 'paediatric', config: 'src/assets/paediatric/paediatric_config.json', matrix: 'src/assets/paediatric/paediatric_matrix.json', matrixKey: 'paediatric' }
];

facilityTypes.forEach(fac => {
    try {
        const configData = readJsonClean(fac.config);
        const matrixData = readJsonClean(fac.matrix);
        
        let configCount = 0;
        (configData.service_elements || []).forEach(se => {
            (se.sections || []).forEach(sec => {
                (sec.standards || []).forEach(std => {
                    configCount += (std.criteria || []).length;
                });
            });
        });
        
        const matrixList = matrixData[fac.matrixKey] || [];
        const matrixCount = matrixList.length;
        
        console.log(`${fac.name}:`);
        console.log(`  Config JSON criteria count: ${configCount}`);
        console.log(`  Matrix JSON criteria count: ${matrixCount}`);
        if (configCount !== matrixCount) {
            console.log(`  => MISMATCH! Needs dynamic parsing from matrix.`);
        } else {
            console.log(`  => Matches.`);
        }
    } catch (e) {
        console.log(`Error checking ${fac.name}: ${e.message}`);
    }
});
