const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const stageIds = ['cbqX7f02ZSF','hczvoscj8Ce','YzqtE5Uv8Qd','JZ8OvCybWuK','MuJubgTzJrY','QVYb76rTsmW'];
const enrollmentId = 'WOPZY3WkOpH';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(new URL(baseUrl + path), { headers: { Authorization: auth, Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

(async () => {
  console.log('Program stage lookups:');
  for (const id of stageIds) {
    const fields = 'id,name,displayName,description,sortOrder,repeatable,program[id,name,displayName]';
    const res = await get(`/api/programStages/${id}?fields=${encodeURIComponent(fields)}`);
    if (res.status === 200) {
      const s = JSON.parse(res.body || '{}');
      const p = s.program || {};
      console.log(`${id} | ${s.displayName || s.name || ''} | program=${p.displayName || p.name || p.id || ''} (${p.id || ''}) | repeatable=${s.repeatable}`);
    } else {
      console.log(`${id} | lookup HTTP ${res.status}`);
    }
  }

  const eventFields = 'event,program,programStage,status,eventDate,created,lastUpdated,storedBy,dataValues[dataElement,value]';
  const eventsRes = await get(`/api/events?enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(eventFields)}`);
  const events = (JSON.parse(eventsRes.body || '{}').events || []);
  console.log('\nUnmapped event program fields:');
  events.filter(ev => !(ev.dataValues || []).some(dv => dv.dataElement === 'r8pqjX6Jtr0' && String(dv.value || '').trim()))
    .forEach(ev => console.log(`${ev.event} | program=${ev.program || ''} | stage=${ev.programStage} | storedBy=${ev.storedBy || ''} | created=${ev.created || ''}`));
})();
