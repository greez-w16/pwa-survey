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
        const SURVEY_PROGRAM_ID = 'G2gULe4jsfs';
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';
        
        // Simulating the user object from AppContext
        const user = {
            id: 'QbWrL3Il7gL',
            username: 'inspector1',
            organisationUnits: [
                { id: 'WcPoRaFBafy', name: 'Thamaga Main Clinic' },
                { id: 'OVpBNoteQ2Y', name: 'Botswana' }
            ]
        };

        const userOus = user.organisationUnits.map(ou => ou.id);
        const ouFilter = userOus.length > 0 ? `&orgUnit=${userOus.join(';')}&ouMode=DESCENDANTS` : '&ouMode=ALL';
        
        const selfUrl = `/api/tracker/trackedEntities?program=${SURVEY_PROGRAM_ID}${ouFilter}&fields=trackedEntity,orgUnit,trackedEntityType,attributes[attribute,value],enrollments[enrollment,program,status,orgUnit,orgUnitName,enrolledAt,occurredAt]&filter=${ATTR_ID}:EQ:${ATTR_VALUE}`;
        
        console.log('Fetching from:', selfUrl);
        const selfData = await fetchFromDhis2(selfUrl);
        const instances = selfData.instances || selfData.trackedEntities || [];
        console.log(`Found ${instances.length} self-assessments from API.`);

        const selfAssessments = instances.map(tei => {
            const enrollment = tei.enrollments?.find(e => e.program === SURVEY_PROGRAM_ID && e.status === 'ACTIVE') || tei.enrollments?.[0];
            return {
                eventId: enrollment?.enrollment || tei.trackedEntity,
                trackedEntityInstance: tei.trackedEntity,
                scheduleTeiId: tei.trackedEntity,
                orgUnit: tei.orgUnit,
                orgUnitId: tei.orgUnit,
                orgUnitName: enrollment?.orgUnitName || 'Self Assessment',
                enrollment: enrollment?.enrollment,
                status: enrollment?.status || 'ACTIVE',
                statusCode: 'FAC_ASS_ASSIGN_ACCEPTED',
                isSelfAssessment: true,
                sortDate: enrollment?.enrolledAt || enrollment?.occurredAt || new Date().toISOString(),
                team: []
            };
        });

        console.log('\nMapped Self Assessments:');
        selfAssessments.forEach(sa => {
            console.log(`  - eventId: ${sa.eventId} | TEI: ${sa.trackedEntityInstance} | orgUnit: ${sa.orgUnit} | sortDate: ${sa.sortDate}`);
        });

        // Simulating the scheduling assignments (which would be empty in this case or have 1)
        const assignments = []; // empty for simulator

        const allAssignments = [...assignments, ...selfAssessments];
        console.log(`\nMerged assignments count: ${allAssignments.length}`);

        const enrichedAssignments = allAssignments.map(assignment => ({
            ...assignment,
            schedule: assignment.isSelfAssessment ? { id: assignment.trackedEntityInstance } : {},
            requiresResponse: assignment.statusCode === 'FAC_ASS_ASSIGN_PENDING',
            isConfirmed: assignment.statusCode === 'FAC_ASS_ASSIGN_ACCEPTED',
            isDeclined: assignment.statusCode === 'FAC_ASS_ASSIGN_DECLINED',
            isCancelled: assignment.statusCode === 'FAC_ASS_ASSIGN_CANCELLED',
            isReplaced: assignment.statusCode === 'FAC_ASS_ASSIGN_REPLACED'
        }));

        // Simulator filters
        const today = new Date().toISOString().slice(0, 10);
        const includeCompleted = false;
        const includeDeclined = false;
        const includePast = false;

        console.log(`\nFiltering with today=${today}, includePast=${includePast}, includeCompleted=${includeCompleted}`);

        const filtered = enrichedAssignments.filter(assignment => {
            if (!includeCompleted && assignment.statusCode === 'FAC_ASS_ASSIGN_COMPLETED') {
                console.log(`    Filtered out ${assignment.eventId}: completed`);
                return false;
            }
            if (!includeDeclined && assignment.isDeclined) {
                console.log(`    Filtered out ${assignment.eventId}: declined`);
                return false;
            }
            if (!includePast && assignment.sortDate < today) {
                console.log(`    Filtered out ${assignment.eventId}: past (${assignment.sortDate} < ${today})`);
                return false;
            }
            return true;
        });

        console.log(`\nFiltered count: ${filtered.length}`);
        filtered.forEach(sa => {
            console.log(`  - eventId: ${sa.eventId} | TEI: ${sa.trackedEntityInstance} | orgUnit: ${sa.orgUnit}`);
        });

        const upcoming = filtered.filter(a =>
            a.statusCode === 'FAC_ASS_ASSIGN_PENDING' ||
            a.statusCode === 'FAC_ASS_ASSIGN_ACCEPTED'
        );
        console.log(`\nUpcoming count: ${upcoming.length}`);

    } catch (e) {
        console.error('Error running check:', e);
    }
}

run();
