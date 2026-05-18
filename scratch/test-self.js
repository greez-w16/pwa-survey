const https = require('https');

const DHIS2_URL = 'https://qimsdev.5am.co.bw/qims';
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
        console.log('--- 1. Querying ME profile details ---');
        const me = await fetchFromDhis2('/api/me?fields=id,displayName,username,organisationUnits[id,name]');
        console.log('User ID:', me.id);
        console.log('Assigned OUs:', me.organisationUnits.map(ou => `${ou.name} (${ou.id})`));

        console.log('\n--- 2. Querying Self Assessments using ALL mode ---');
        const SURVEY_PROGRAM_ID = 'G2gULe4jsfs';
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';
        
        const urlAll = `/api/tracker/trackedEntities?program=${SURVEY_PROGRAM_ID}&ouMode=ALL&fields=trackedEntity,orgUnit,trackedEntityType,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName,enrolledAt,occurredAt]&filter=${ATTR_ID}:EQ:${ATTR_VALUE}`;
        const dataAll = await fetchFromDhis2(urlAll);
        const instances = dataAll.instances || dataAll.trackedEntities || [];
        console.log(`Found ${instances.length} self-assessments in ALL mode.`);
        instances.forEach(tei => {
            console.log(`TEI: ${tei.trackedEntity} | orgUnit: ${tei.orgUnit}`);
            if (tei.enrollments) {
                tei.enrollments.forEach(e => {
                    console.log(`  - Enrollment: ${e.enrollment} | status: ${e.status} | program: ${e.program}`);
                });
            }
        });

        console.log('\n--- 3. Querying with exact orgUnit Q363I00X4TY ---');
        const urlSelected = `/api/tracker/trackedEntities?program=${SURVEY_PROGRAM_ID}&orgUnit=Q363I00X4TY&ouMode=SELECTED&fields=trackedEntity,orgUnit,trackedEntityType,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName,enrolledAt,occurredAt]&filter=${ATTR_ID}:EQ:${ATTR_VALUE}`;
        const dataSelected = await fetchFromDhis2(urlSelected).catch(e => ({ error: e.message }));
        console.log('Selected Mode Results:', dataSelected.error || (dataSelected.instances || dataSelected.trackedEntities || []).length + ' instances found.');

        console.log('\n--- 4. Querying legacy trackedEntityInstances for comparison ---');
        const urlLegacy = `/api/trackedEntityInstances?program=${SURVEY_PROGRAM_ID}&ou=Q363I00X4TY&ouMode=SELECTED`;
        const dataLegacy = await fetchFromDhis2(urlLegacy).catch(e => ({ error: e.message }));
        const legacyInstances = dataLegacy.trackedEntityInstances || [];
        console.log(`Found ${legacyInstances.length} legacy instances for Q363I00X4TY.`);
        legacyInstances.forEach(tei => {
            console.log(`Legacy TEI: ${tei.trackedEntityInstance}`);
        });

    } catch (e) {
        console.error('Error running check:', e);
    }
}

run();
