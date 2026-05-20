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
    https.get(new URL(baseUrl + path), {
      headers: { Authorization: auth, Accept: 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function summarize(label, payload) {
  const items = payload.events || payload.instances || [];
  const deleted = items.filter((x) => x.deleted === true).length;
  const notDeleted = items.filter((x) => x.deleted !== true).length;
  const unmapped = items.filter((ev) => {
    const dv = (ev.dataValues || []).find((x) => x.dataElement === sysTagDeId);
    const tag = dv && String(dv.value || '').trim();
    return !tag;
  });
  const unmappedDeleted = unmapped.filter((x) => x.deleted === true).length;
  const unmappedNotDeleted = unmapped.filter((x) => x.deleted !== true).length;
  console.log(label);
  console.log(`  total=${items.length} deleted=${deleted} notDeleted=${notDeleted}`);
  console.log(`  unmapped=${unmapped.length} unmappedDeleted=${unmappedDeleted} unmappedNotDeleted=${unmappedNotDeleted}`);
}

(async () => {
  const legacy = await get(`/api/events?enrollment=${enrollmentId}&paging=false&fields=event,deleted,dataValues[dataElement,value]`);
  const tracker = await get(`/api/tracker/events?enrollment=${enrollmentId}&paging=false&fields=event,deleted,dataValues[dataElement,value]`);
  summarize('Legacy /api/events', JSON.parse(legacy.body || '{}'));
  summarize('Tracker /api/tracker/events', JSON.parse(tracker.body || '{}'));
})();
