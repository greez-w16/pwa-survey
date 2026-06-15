const https = require('https');
const fs = require('fs');

const DHIS2_URL = 'https://moh-qimsuat.gov.bw/qims';
const USERNAME = 'inspector1';
const PASSWORD = 'Nomisr123$';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
        console.log('Fetching program stage radStageU11...');
        const stage = await fetchFromDhis2('/api/programStages/radStageU11?fields=id,name,programStageSections[id,name,code,dataElements[id,name,code,valueType,description,displayName]]');
        
        console.log(`Program Stage: ${stage.name} (${stage.id})`);
        
        const output = {
            name: stage.name,
            id: stage.id,
            sections: []
        };
        
        if (stage.programStageSections) {
            console.log(`Sections count: ${stage.programStageSections.length}`);
            stage.programStageSections.forEach(sec => {
                const des = sec.dataElements || [];
                console.log(`Section: ${sec.name} (${sec.id}) | Code: ${sec.code} | Data Elements: ${des.length}`);
                output.sections.push({
                    name: sec.name,
                    id: sec.id,
                    code: sec.code,
                    dataElements: des.map(de => ({
                        id: de.id,
                        name: de.name,
                        displayName: de.displayName,
                        code: de.code,
                        valueType: de.valueType,
                        description: de.description
                    }))
                });
            });
        }
        
        fs.writeFileSync('scratch/rad_all_de.json', JSON.stringify(output, null, 2), 'utf8');
        console.log('Successfully wrote to scratch/rad_all_de.json');
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
