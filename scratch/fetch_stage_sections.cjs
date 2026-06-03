const https = require('https');
const fs = require('fs');

const DHIS2_URL = 'https://moh-qimsuat.gov.bw/qims';
const USERNAME = 'inspector1';
const PASSWORD = 'Nomisr123$';

async function fetchFromDhis2(endpoint) {
    const dhisPath = DHIS2_URL.endsWith('/') ? DHIS2_URL.slice(0, -1) : DHIS2_URL;
    const url = new URL(`${dhisPath}${endpoint}`);
    const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

    const options = {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${auth}`
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        resolve(body);
                    }
                } else {
                    reject(new Error(`Failed for ${endpoint}: ${res.statusCode} - ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function run() {
    try {
        console.log('Fetching program stage hup8BqEe7Mn...');
        const stage = await fetchFromDhis2('/api/programStages/hup8BqEe7Mn?fields=id,name,programStageSections[id,name,code,dataElements[id,name,code,valueType]]');
        
        console.log(`Program Stage: ${stage.name} (${stage.id})`);
        console.log(`Sections count: ${stage.programStageSections ? stage.programStageSections.length : 0}`);
        
        fs.writeFileSync('scratch/stage_sections_dump.json', JSON.stringify(stage.programStageSections, null, 2), 'utf8');
        console.log('Dumped sections metadata to scratch/stage_sections_dump.json');
        
        if (stage.programStageSections) {
            const se45 = stage.programStageSections.find(s => {
                const name = s.name || '';
                const code = s.code || '';
                return name.includes('45') || code.includes('45') || name.includes('Volunteer');
            });
            if (se45) {
                console.log(`\nFound Section: ${se45.name} (code: ${se45.code}, id: ${se45.id})`);
                console.log(`Data Elements count: ${se45.dataElements ? se45.dataElements.length : 0}`);
                if (se45.dataElements) {
                    console.log('First 10 Data Elements:');
                    se45.dataElements.slice(0, 10).forEach(de => {
                        console.log(`  - ID: ${de.id} | Code: ${de.code} | Name: ${de.name}`);
                    });
                }
            } else {
                console.log('Section 45 / Volunteer Services not found in metadata!');
            }
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
