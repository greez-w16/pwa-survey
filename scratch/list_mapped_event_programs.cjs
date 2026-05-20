const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
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

(async () => {
  const fields = 'event,enrollment,program,programStage,status,eventDate,trackedEntityInstance,dataValues[dataElement,value]';
  const res = await get(`/api/events?enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`);
  const events = (JSON.parse(res.body || '{}').events || []);
  events
    .map(ev => ({ ...ev, tag: tagOf(ev) }))
    .filter(ev => ev.tag)
    .sort((a,b) => String(a.tag).localeCompare(String(b.tag), undefined, { numeric: true }))
    .forEach(ev => console.log(`tag=${ev.tag} event=${ev.event} enrollment=${ev.enrollment || ''} program=${ev.program || ''} stage=${ev.programStage || ''} status=${ev.status}`));
})();
