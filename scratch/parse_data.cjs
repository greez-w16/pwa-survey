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
        console.log('--- Checking event w1c7O7KOPRa dataValues ---');
        const event = await get(`${baseUrl}/api/events/w1c7O7KOPRa`);
        if (event && event.dataValues) {
            const groupVal = event.dataValues.find(d => d.dataElement === 'pzenrgsSny3');
            console.log('pzenrgsSny3 (Group) value:', groupVal);
            
            const sysTag = event.dataValues.find(d => d.dataElement === 'r8pqjX6Jtr0');
            console.log('r8pqjX6Jtr0 (SYS_TAG) value:', sysTag);

            console.log('Total dataValues count:', event.dataValues.length);
        } else {
            console.log('Event not found or has no dataValues');
        }
    } catch(e) {
        console.error(e);
    }
})();
