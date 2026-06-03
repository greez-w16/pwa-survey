const https = require('https');

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
        const SURVEY_PROGRAM_ID = 'G2gULe4jsfs';
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';
        
        // Exact OUs assigned to inspector1
        const userOus = ['WcPoRaFBafy', 'OVpBNoteQ2Y'];
        
        console.log('--- 1. Querying with ouMode=DESCENDANTS ---');
        const urlDescendants = `/api/tracker/trackedEntities?program=${SURVEY_PROGRAM_ID}&orgUnit=${userOus.join(';')}&ouMode=DESCENDANTS&fields=trackedEntity,orgUnit,trackedEntityType,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName,enrolledAt,occurredAt]&filter=${ATTR_ID}:EQ:${ATTR_VALUE}`;
        const dataDesc = await fetchFromDhis2(urlDescendants);
        const instancesDesc = dataDesc.instances || dataDesc.trackedEntities || [];
        console.log(`Found ${instancesDesc.length} self-assessments in DESCENDANTS mode.`);
        instancesDesc.forEach(tei => {
            console.log(`TEI: ${tei.trackedEntity} | orgUnit: ${tei.orgUnit}`);
        });

        console.log('\n--- 2. Querying with ouMode=ALL ---');
        const urlAll = `/api/tracker/trackedEntities?program=${SURVEY_PROGRAM_ID}&ouMode=ALL&fields=trackedEntity,orgUnit,trackedEntityType,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName,enrolledAt,occurredAt]&filter=${ATTR_ID}:EQ:${ATTR_VALUE}`;
        const dataAll = await fetchFromDhis2(urlAll);
        const instancesAll = dataAll.instances || dataAll.trackedEntities || [];
        console.log(`Found ${instancesAll.length} self-assessments in ALL mode.`);
        instancesAll.forEach(tei => {
            console.log(`TEI: ${tei.trackedEntity} | orgUnit: ${tei.orgUnit}`);
        });

    } catch (e) {
        console.error('Error running check:', e);
    }
}

run();
