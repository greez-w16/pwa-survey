const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

const programId = 'G2gULe4jsfs';
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

function userLabel(u) {
  if (!u) return '';
  if (typeof u === 'string') return u;
  return u.username || u.displayName || u.name || u.id || '';
}

(async () => {
  const stagesRes = await get(`/api/programs/${programId}?fields=id,name,displayName,programStages[id,name,displayName,sortOrder,repeatable]`);
  const stagesJson = JSON.parse(stagesRes.body || '{}');
  const stageName = new Map((stagesJson.programStages || []).map(s => [s.id, s.displayName || s.name || s.id]));

  console.log('Program stages in Hospital program:');
  (stagesJson.programStages || [])
    .slice()
    .sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach(s => console.log(`  ${s.id}  ${stageName.get(s.id)}  repeatable=${s.repeatable}`));

  const fields = [
    'event','enrollment','program','programStage','orgUnit','status','eventDate',
    'created','lastUpdated','storedBy','createdBy[id,username,displayName]',
    'lastUpdatedBy[id,username,displayName]','dataValues[dataElement,value]'
  ].join(',');
  const eventsRes = await get(`/api/events?enrollment=${enrollmentId}&paging=false&fields=${encodeURIComponent(fields)}`);
  const eventsJson = JSON.parse(eventsRes.body || '{}');
  const events = eventsJson.events || [];

  const rows = events.map(ev => {
    const sys = (ev.dataValues || []).find(dv => dv.dataElement === sysTagDeId);
    return {
      event: ev.event,
      tag: sys && String(sys.value || '').trim(),
      stage: ev.programStage,
      stageName: stageName.get(ev.programStage) || ev.programStage,
      status: ev.status,
      eventDate: ev.eventDate,
      dvCount: (ev.dataValues || []).length,
      created: ev.created,
      lastUpdated: ev.lastUpdated,
      storedBy: ev.storedBy,
      createdBy: userLabel(ev.createdBy),
      lastUpdatedBy: userLabel(ev.lastUpdatedBy),
    };
  });

  const byStage = new Map();
  for (const r of rows) {
    const key = `${r.stage} ${r.stageName}`;
    if (!byStage.has(key)) byStage.set(key, { total: 0, unmapped: 0, mapped: 0 });
    const bucket = byStage.get(key);
    bucket.total += 1;
    if (r.tag) bucket.mapped += 1; else bucket.unmapped += 1;
  }

  console.log('\nCounts by program stage:');
  [...byStage.entries()].forEach(([key, v]) => console.log(`  ${key}: total=${v.total} mapped=${v.mapped} unmapped=${v.unmapped}`));

  console.log('\nCurrent unmapped event audit rows:');
  rows.filter(r => !r.tag).forEach(r => {
    console.log(`${r.event} | stage=${r.stageName} (${r.stage}) | status=${r.status} | date=${r.eventDate} | dvs=${r.dvCount} | created=${r.created || ''} | updated=${r.lastUpdated || ''} | storedBy=${r.storedBy || ''} | createdBy=${r.createdBy || ''} | updatedBy=${r.lastUpdatedBy || ''}`);
  });
})();
