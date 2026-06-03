const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const baseUrl = 'https://moh-qimsuat.gov.bw/qims';
const enrollmentId = 'WOPZY3WkOpH';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${path}`;
    https.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', (err) => reject(err));
  });
}

(async () => {
  try {
    // Standard DHIS2 legacy events endpoint
    const legacy = await fetchJson(`/api/events?enrollment=${enrollmentId}&paging=false&fields=event`);
    const legacyEvents = legacy.events || [];

    // Newer Tracker API endpoint
    const tracker = await fetchJson(`/api/tracker/events?enrollment=${enrollmentId}&paging=false&fields=event`);
    const trackerEvents = tracker.instances || tracker.events || [];

    console.log(`Standard API (/api/events):              ${legacyEvents.length} events`);
    console.log(`Tracker API (/api/tracker/events):       ${trackerEvents.length} events`);
    console.log(`Enrollment queried: ${enrollmentId}`);
  } catch (err) {
    console.error('Request failed:', err.message);
    process.exit(1);
  }
})();
