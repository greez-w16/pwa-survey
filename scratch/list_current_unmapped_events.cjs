const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const enrollmentId = 'WOPZY3WkOpH';
const sysTagDeId = 'r8pqjX6Jtr0';

https.get(new URL(`${baseUrl}/api/events?enrollment=${enrollmentId}&paging=false&fields=event,programStage,status,eventDate,dataValues[dataElement,value]`), {
  headers: { Authorization: auth, Accept: 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    const json = JSON.parse(data || '{}');
    const events = json.events || [];
    const unmapped = events.filter((ev) => {
      const dv = (ev.dataValues || []).find((x) => x.dataElement === sysTagDeId);
      return !(dv && String(dv.value || '').trim());
    });
    console.log(`Total events: ${events.length}`);
    console.log(`Current unmapped events: ${unmapped.length}`);
    unmapped.forEach((u) => {
      console.log(`${u.event}  stage=${u.programStage}  status=${u.status}  date=${u.eventDate}`);
    });
  });
}).on('error', () => {
  console.log('Request failed');
  process.exit(1);
});
