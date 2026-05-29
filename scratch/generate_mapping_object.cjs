const fs = require('fs');

const elements = JSON.parse(fs.readFileSync('scratch/sec45_elements.json', 'utf8'));
const q45Clean = JSON.parse(fs.readFileSync('scratch/sec45_final_cleaned.json', 'utf8'));

// Extract non-comment questions from elements in order
const q40 = [];
elements.forEach(e => {
    if (e.code.endsWith('-comments')) return;
    const label = e.name;
    const match = e.code.match(/_40\.\d+\.\d+\.\d+/);
    if (match) {
        q40.push({ id: e.id, code: match[0].replace('_', '') });
    }
});

const q45Keys = Object.keys(q45Clean).sort();

const criteriaMap = {};
for (let i = 0; i < q45Keys.length; i++) {
    const code40 = q40[i].code;
    const code45 = q45Keys[i];
    const text45 = q45Clean[code45];
    criteriaMap[code40] = { code: code45, label: text45 };
}

// Map standard headers as well:
// 40.1 -> 45.1
// 40.1.1 -> 45.1.1
// 40.1.2 -> 45.1.2
// 40.1.3 -> 45.2.1 (wait, let's see which header maps to which standard)
// Let's list Q45 standard boundaries:
// 45.1.1.1 starts Std 45.1.1
// 45.1.2.1 starts Std 45.1.2
// 45.2.1.1 starts Std 45.2.1
// 45.2.2.1 starts Std 45.2.2
// 45.3.1.1 starts Std 45.3.1
// 45.4.1.1 starts Std 45.4.1
// 45.5.1.1 starts Std 45.5.1
// 45.6.1.1 starts Std 45.6.1
// 45.7.1.1 starts Std 45.7.1
// 45.8.1.1 starts Std 45.8.1

// Let's check which Q40 questions correspond to these starts:
// 45.1.1.1 (index 0) <==> 40.1.1.1
// 45.1.2.1 (index 11) <==> 40.1.3.3
// 45.2.1.1 (index 16) <==> 40.1.3.8
// 45.2.2.1 (index 25) <==> 40.2.2.4
// 45.3.1.1 (index 31) <==> 40.2.2.10
// 45.4.1.1 (index 36) <==> 40.2.2.15
// 45.5.1.1 (index 46) <==> 40.3.1.5
// 45.6.1.1 (index 50) <==> 40.3.2.2
// 45.7.1.1 (index 56) <==> 40.3.2.8
// 45.8.1.1 (index 60) <==> 40.3.3.3

const headerMap = {
    '40.1': { code: '45.1', label: 'Management and Staffing' },
    '40.1.1': { code: '45.1.1', label: 'Management and Staffing' },
    '40.1.2': { code: '45.1.2', label: 'Volunteer Agreement' },
    '40.1.3': { code: '45.2.1', label: 'Volunteer Orientation and Induction' },
    '40.2': { code: '45.2', label: 'Volunteer Development and Education' },
    '40.2.1': { code: '45.2.2', label: 'In-service Education and Training' },
    '40.2.2': { code: '45.3.1', label: 'Policies and Procedures' },
    '40.2.3': { code: '45.4.1', label: 'Facilities and Equipment' },
    '40.3': { code: '45.5', label: 'Patient Care' },
    '40.3.1': { code: '45.5.1', label: 'Patient Care Activities' },
    '40.3.2': { code: '45.6.1', label: 'Quality Improvement' },
    '40.3.3': { code: '45.7.1', label: 'Patient Rights' },
    '40.3.4': { code: '45.8.1', label: 'Prevention and Control of Infection' }
};

console.log('const SE45_CRITERIA_MAP = ' + JSON.stringify(criteriaMap, null, 2) + ';');
console.log('const SE45_HEADER_MAP = ' + JSON.stringify(headerMap, null, 2) + ';');
fs.writeFileSync('scratch/sec45_mapped_config.json', JSON.stringify({ criteriaMap, headerMap }, null, 2));
