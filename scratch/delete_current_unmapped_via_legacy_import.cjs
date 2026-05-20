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
  'ZmTPVKUxP81','Hq01BAv1llf','kYogWgRa1pc','AiFa4b7urCo','QFiueoQGF02',
  'vC82wrVAh9W','j2ttIGlrJR8','qzAxkrIu8bk','caLnWPry44h','wWPIaoHuICK','vLAo65dzzrs'
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
  const del = await request('POST', '/api/events?strategy=DELETE', payload);
  console.log(`Legacy bulk delete HTTP: ${del.status}`);
  console.log(del.body);

  const checkOne = await request('GET', `/api/events/${eventIds[0]}?fields=event`);
  console.log(`Check deleted event ${eventIds[0]} -> HTTP ${checkOne.status}`);

  const verify = await request(
    'GET',
    `/api/events?enrollment=${encodeURIComponent(enrollmentId)}&paging=false&fields=event,programStage,status,eventDate,dataValues[dataElement,value]`
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
  unmapped.forEach((u) => {
    console.log(`${u.event}  stage=${u.programStage}  status=${u.status}  date=${u.eventDate}`);
  });
})();
