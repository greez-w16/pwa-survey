const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const orgUnit = 'Q363I00X4TY';
const baseUrl = 'https://moh-qimsuat.gov.bw/qims';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

const url = `${baseUrl}/api/organisationUnits/${orgUnit}?fields=id,name,parent[id,name]`;

const options = {
    headers: {
        'Authorization': `Basic ${auth}`
    }
};

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('OrgUnit Details:', json);
        } catch (e) {
            console.error('Failed to parse JSON', e);
        }
    });
}).on('error', (err) => {
    console.error('Request failed', err);
});
