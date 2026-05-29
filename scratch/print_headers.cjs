const fs = require('fs');

['05_Standards.csv', '06_Questions.csv', '07_DataElements.csv', '08_StageDataElements.csv', '09_SectionQuestions.csv'].forEach(f => {
    const path = `exports/google-sheets/hospital/${f}`;
    const header = fs.readFileSync(path, 'utf8').split('\n')[0];
    console.log(`${f}: ${header}`);
});
