const fs = require('fs');
const https = require('https');

const source = fs.readFileSync('scratch/check_events.cjs', 'utf8');
const username = (source.match(/const username = '([^']+)'/) || [])[1];
const password = (source.match(/const password = '([^']+)'/) || [])[1];
const baseUrl = (source.match(/const baseUrl = '([^']+)'/) || [])[1];
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const eventId = 'pdACZvxyq7f';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(new URL(baseUrl + path), {
      headers: { Authorization: auth, Accept: 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ path, status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

(async () => {
  const paths = [
    `/api/events/${eventId}?fields=event,deleted,status,programStage`,
    `/api/tracker/events/${eventId}?fields=event,deleted,status,programStage`,
    `/api/events?event=${eventId}&paging=false&fields=event,deleted,status,programStage`,
    `/api/tracker/events?events=${eventId}&paging=false&fields=event,deleted,status,programStage`
  ];

  for (const path of paths) {
    const res = await get(path);
    console.log(`PATH ${path}`);
    console.log(`HTTP ${res.status}`);
    console.log(res.body);
  }
})();
