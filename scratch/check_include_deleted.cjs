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
  const unmapped = items.filter((ev) => {
    const dv = (ev.dataValues || []).find((x) => x.dataElement === sysTagDeId);
    return !(dv && String(dv.value || '').trim());
  }).length;
  console.log(`${label}: total=${items.length} unmapped=${unmapped}`);
}

(async () => {
  const paths = [
    `/api/events?enrollment=${enrollmentId}&paging=false&fields=event,deleted,dataValues[dataElement,value]`,
    `/api/events?enrollment=${enrollmentId}&includeDeleted=false&paging=false&fields=event,deleted,dataValues[dataElement,value]`,
    `/api/events?enrollment=${enrollmentId}&includeDeleted=true&paging=false&fields=event,deleted,dataValues[dataElement,value]`,
    `/api/tracker/events?enrollment=${enrollmentId}&paging=false&fields=event,deleted,dataValues[dataElement,value]`,
    `/api/tracker/events?enrollment=${enrollmentId}&includeDeleted=false&paging=false&fields=event,deleted,dataValues[dataElement,value]`,
    `/api/tracker/events?enrollment=${enrollmentId}&includeDeleted=true&paging=false&fields=event,deleted,dataValues[dataElement,value]`
  ];

  for (const path of paths) {
    const res = await get(path);
    const json = JSON.parse(res.body || '{}');
    summarize(path, json);
  }
})();
