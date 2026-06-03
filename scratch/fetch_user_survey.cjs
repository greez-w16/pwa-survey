const https = require('https');

const DHIS2_URL = 'https://moh-qimsuat.gov.bw/qims';
const USERNAME = 'inspector1';
const PASSWORD = 'Nomisr123$';
const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

async function fetchFromDhis2(endpoint) {
    const url = `${DHIS2_URL}${endpoint}`;
    console.log(`Fetching from endpoint: ${endpoint}`);
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    reject(new Error(`Failed with status ${res.statusCode}: ${data}`));
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log("=== TEI FETCH ===");
        const tei = await fetchFromDhis2('/api/tracker/trackedEntities/oy96rL4BeCY?fields=trackedEntity,trackedEntityType,orgUnit,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName]');
        console.log(JSON.stringify(tei, null, 2));

        console.log("=== ENROLLMENT FETCH ===");
        const enrollment = await fetchFromDhis2('/api/tracker/enrollments/ywZv8NFK0GG?fields=enrollment,program,status,orgUnit,orgUnitName,attributes[attribute,value]');
        console.log(JSON.stringify(enrollment, null, 2));

        console.log("=== EVENTS FETCH ===");
        const events = await fetchFromDhis2('/api/tracker/events?enrollment=ywZv8NFK0GG&fields=event,program,programStage,status,orgUnit,notes,dataValues[dataElement,value]');
        console.log(JSON.stringify(events, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
