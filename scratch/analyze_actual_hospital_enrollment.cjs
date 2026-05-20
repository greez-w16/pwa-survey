const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const programId = 'G2gULe4jsfs';
const stageId = 'HpHD6u6MV37';
const enrollmentId = 'WOPZY3WkOpH';
const sysTagDeId = 'r8pqjX6Jtr0';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(new URL(baseUrl + path), { headers: { Authorization: auth, Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function tagOf(ev) {
  const dv = (ev.dataValues || []).find(d => d.dataElement === sysTagDeId);
  return dv && String(dv.value || '').trim();
}

function summarize(label, events) {
  const tags = events.map(tagOf).filter(Boolean);
  const unmapped = events.filter(ev => !tagOf(ev));
  const uniqueTags = [...new Set(tags)].sort((a,b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  console.log(`\n${label}`);
  console.log(`  count=${events.length} mapped=${tags.length} unmapped=${unmapped.length}`);
  console.log(`  tags=${uniqueTags.join(',')}`);
  if (unmapped.length) console.log(`  unmapped IDs=${unmapped.map(e => e.event).join(',')}`);
  const byEnrollment = new Map();
  events.forEach(ev => byEnrollment.set(ev.enrollment || '(none)', (byEnrollment.get(ev.enrollment || '(none)') || 0) + 1));
  console.log(`  byEnrollment=${[...byEnrollment.entries()].map(([k,v]) => `${k}:${v}`).join(' ')}`);
}

(async () => {
  const enr = JSON.parse((await get(`/api/enrollments/${enrollmentId}?fields=enrollment,program,trackedEntityInstance,orgUnit,status,created,lastUpdated`)).body || '{}');
  console.log(`Enrollment ${enrollmentId}: program=${enr.program} tei=${enr.trackedEntityInstance} orgUnit=${enr.orgUnit} status=${enr.status}`);

  const fields = 'event,enrollment,program,programStage,status,eventDate,trackedEntityInstance,dataValues[dataElement,value]';
  const paths = {
    'Hospital program + enrollment': `/api/events?program=${programId}&enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`,
    'Hospital program + enrollment + execution stage': `/api/events?program=${programId}&programStage=${stageId}&enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`,
    'Hospital program + TEI + execution stage': `/api/events?program=${programId}&programStage=${stageId}&trackedEntityInstance=${enr.trackedEntityInstance}&paging=false&fields=${encodeURIComponent(fields)}`,
    'Enrollment-only legacy query': `/api/events?enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`,
  };

  for (const [label, path] of Object.entries(paths)) {
    const res = await get(path);
    const events = (JSON.parse(res.body || '{}').events || []);
    summarize(label, events);
  }
})();
