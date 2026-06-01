const https = require('https');

const DHIS2_URL = 'https://qimsdev.5am.co.bw/qims';
const USERNAME = 'inspector1';
const PASSWORD = 'Nomisr123$';
const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

async function fetchFromDhis2(endpoint) {
    const url = `${DHIS2_URL}${endpoint}`;
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

const ATTRIBUTE_NAMES = {
    'qrTQdWKRYMB': 'assessmentTypeSelected',
    'ZAcSwTShzlN': 'facilityType (ZAcSwTShzlN)',
    'SlXgujGsSqv': 'facilityAssessmentStatus',
    'ruhbCcyiOsP': 'assessmentStartDate',
    'BHm7pKBQGtf': 'assessmentGuidelineVersion',
    'SNxiLOr01tU': 'assessmentYear',
    'NGUDA6wHnM5': 'linkedSchedulingEnrollmentUid',
    'Bw4PZ8NsYFd': 'assessmentType',
};

async function run() {
    try {
        console.log("=== 1. FETCH TEI ATTRIBUTES (oy96rL4BeCY) ===");
        const tei = await fetchFromDhis2('/api/tracker/trackedEntities/oy96rL4BeCY?fields=trackedEntity,orgUnit,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName]');
        
        if (tei.attributes) {
            tei.attributes.forEach(attr => {
                const name = ATTRIBUTE_NAMES[attr.attribute] || attr.attribute;
                console.log(`Attribute [${name}]: "${attr.value}"`);
            });
        } else {
            console.log("No attributes found on TEI.");
        }

        console.log("\n=== 2. FETCH ENROLLMENT DETAILS (ywZv8NFK0GG) ===");
        const enrollment = await fetchFromDhis2('/api/tracker/enrollments/ywZv8NFK0GG?fields=enrollment,program,status,orgUnit,orgUnitName,attributes[attribute,value]');
        console.log(`Enrollment ID: ${enrollment.enrollment}`);
        console.log(`Program: ${enrollment.program}`);
        console.log(`Status: ${enrollment.status}`);
        console.log(`OrgUnit Name: ${enrollment.orgUnitName} (ID: ${enrollment.orgUnit})`);
        if (enrollment.attributes) {
            enrollment.attributes.forEach(attr => {
                const name = ATTRIBUTE_NAMES[attr.attribute] || attr.attribute;
                console.log(`Attribute [${name}]: "${attr.value}"`);
            });
        } else {
            console.log("No attributes found on Enrollment.");
        }

        console.log("\n=== 3. FETCH EVENT SUMMARY FOR ENROLLMENT ===");
        const eventsData = await fetchFromDhis2('/api/tracker/events?enrollment=ywZv8NFK0GG&fields=event,program,programStage,status,dataValues[dataElement,value]');
        const events = eventsData.instances || eventsData.events || [];
        console.log(`Total events found: ${events.length}`);
        
        events.forEach((ev, idx) => {
            const tagVal = (ev.dataValues || []).find(dv => dv.dataElement === 'r8pqjX6Jtr0')?.value || 'No Tag';
            const groupVal = (ev.dataValues || []).find(dv => dv.dataElement === 'pzenrgsSny3')?.value || 'No Group';
            console.log(`Event #${idx + 1}: ID=${ev.event} | Stage=${ev.programStage} | Status=${ev.status} | SYS_TAG=${tagVal} | Group=${groupVal}`);
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
