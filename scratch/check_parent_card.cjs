const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const baseUrl = 'https://qimsdev.5am.co.bw/qims';
const auth = Buffer.from(`${username}:${password}`).toString('base64');

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('--- Fetching Event EE9O6Uho3q1 ---');
        const event = await get(`${baseUrl}/api/events/EE9O6Uho3q1`);
        console.log(JSON.stringify(event, null, 2));
    } catch(e) {
        console.error(e);
    }
})();
