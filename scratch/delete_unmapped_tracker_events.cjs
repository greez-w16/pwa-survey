const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

const enrollmentId = 'WOPZY3WkOpH';
const sysTagDeId = 'r8pqjX6Jtr0';
const eventIds = [
  'pdACZvxyq7f','OweQ4q92koJ','fcPm6PFKSEa','Jw11CIbpowE','OYw923ZhGA8',
  'rhlJhs4szYH','jL3l9ZX9uiZ','XY3ZA6C3TVG','htkekOHnBwd','k6X3W88gel2','ePkWTP2XrDx'
];

function request(method, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(baseUrl + path), {
      method,
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  let deleted = 0;
  const failures = [];

  for (const id of eventIds) {
    try {
      const res = await request('DELETE', `/api/tracker/events/${encodeURIComponent(id)}`);
      if (res.status >= 200 && res.status < 300) {
        deleted += 1;
      } else {
        failures.push({ id, status: res.status, body: res.body.slice(0, 300) });
      }
    } catch (err) {
      failures.push({ id, status: 'REQUEST_FAILED', body: String(err.message || err) });
    }
  }

  const verify = await request(
    'GET',
    `/api/events?enrollment=${encodeURIComponent(enrollmentId)}&paging=false&fields=event,dataValues[dataElement,value]`
  );

  if (!(verify.status >= 200 && verify.status < 300)) {
    console.log(`Verification fetch failed: HTTP ${verify.status}`);
    console.log(`Deleted successfully: ${deleted}`);
    process.exit(failures.length ? 1 : 0);
  }

  const json = JSON.parse(verify.body || '{}');
  const events = Array.isArray(json.events) ? json.events : [];
  const unmapped = events.filter((ev) => {
    const dv = (ev.dataValues || []).find((x) => x.dataElement === sysTagDeId);
    return !(dv && String(dv.value || '').trim());
  });

  console.log(`Tracker delete attempted for ${eventIds.length} IDs`);
  console.log(`Deleted successfully: ${deleted}`);
  console.log(`Failures: ${failures.length}`);
  failures.forEach((f) => console.log(`FAIL ${f.id} :: ${f.status} :: ${f.body}`));
  console.log(`Post-delete total events in enrollment: ${events.length}`);
  console.log(`Post-delete unmapped events remaining: ${unmapped.length}`);
})();
