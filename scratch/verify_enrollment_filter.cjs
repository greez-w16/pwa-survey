const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const programId = 'G2gULe4jsfs';
const enrollmentId = 'WOPZY3WkOpH';
const sampleIds = ['F3RqZr2wtCE','yoCSaQs3ISW','cdijViunD1e','K1qFWinzize','m2mzcffSZsf','ITgR7iTC7fm'];

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(new URL(baseUrl + path), { headers: { Authorization: auth, Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ path, status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function summarize(label, payload) {
  const arr = payload.events || payload.instances || [];
  const programs = [...new Set(arr.map(e => e.program).filter(Boolean))];
  console.log(`${label}: count=${arr.length} programs=${programs.join(',')}`);
}

(async () => {
  const enr = await get(`/api/enrollments/${enrollmentId}?fields=enrollment,program,trackedEntityInstance,orgUnit,status,events[event,program,programStage,enrollment]`);
  console.log(`Enrollment direct HTTP ${enr.status}`);
  console.log(enr.body);

  const fields = 'event,enrollment,program,programStage,status,eventDate,trackedEntityInstance';
  const paths = [
    `/api/events?enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`,
    `/api/events?program=${programId}&enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`,
    `/api/tracker/events?enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields.replace('trackedEntityInstance','trackedEntity'))}`,
    `/api/tracker/events?program=${programId}&enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields.replace('trackedEntityInstance','trackedEntity'))}`
  ];
  for (const path of paths) {
    const res = await get(path);
    summarize(path, JSON.parse(res.body || '{}'));
  }

  console.log('\nDirect sample event enrollment fields:');
  for (const id of sampleIds) {
    const res = await get(`/api/events/${id}?fields=${encodeURIComponent(fields)}`);
    if (res.status === 200) {
      const ev = JSON.parse(res.body || '{}');
      console.log(`${id}: enrollment=${ev.enrollment || ''} program=${ev.program || ''} stage=${ev.programStage || ''} tei=${ev.trackedEntityInstance || ''}`);
    } else {
      console.log(`${id}: HTTP ${res.status}`);
    }
  }
})();
