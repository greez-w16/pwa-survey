const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const baseUrl = 'https://moh-qimsuat.gov.bw/qims';
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
        console.log('--- Fetching Enrollment ywZv8NFK0GG ---');
        const enrollment = await get(`${baseUrl}/api/enrollments/ywZv8NFK0GG`);
        console.log(JSON.stringify(enrollment, null, 2));

        console.log('\n--- Fetching Event w1c7O7KOPRa ---');
        const event = await get(`${baseUrl}/api/events/w1c7O7KOPRa`);
        console.log(JSON.stringify(event, null, 2));
    } catch(e) {
        console.error(e);
    }
})();
