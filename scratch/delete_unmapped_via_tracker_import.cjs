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

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(baseUrl + path), {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const payload = { events: eventIds.map((event) => ({ event })) };
  const del = await request('POST', '/api/tracker?async=false&importStrategy=DELETE', payload);
  console.log(`Tracker import delete HTTP: ${del.status}`);
  console.log(del.body);

  const verify = await request(
    'GET',
    `/api/events?enrollment=${encodeURIComponent(enrollmentId)}&paging=false&fields=event,dataValues[dataElement,value]`
  );

  if (!(verify.status >= 200 && verify.status < 300)) {
    console.log(`Verification fetch failed: HTTP ${verify.status}`);
    process.exit(1);
  }

  const json = JSON.parse(verify.body || '{}');
  const events = Array.isArray(json.events) ? json.events : [];
  const unmapped = events.filter((ev) => {
    const dv = (ev.dataValues || []).find((x) => x.dataElement === sysTagDeId);
    return !(dv && String(dv.value || '').trim());
  });

  console.log(`Post-delete total events in enrollment: ${events.length}`);
  console.log(`Post-delete unmapped events remaining: ${unmapped.length}`);
})();
