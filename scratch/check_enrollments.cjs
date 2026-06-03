const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const baseUrl = 'https://moh-qimsuat.gov.bw/qims';
const teiId = 'XzN6svVGGEb';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

const options = {
    headers: {
        'Authorization': `Basic ${auth}`
    }
};

const programId = 'G2gULe4jsfs';
const url = `${baseUrl}/api/programs/${programId}?fields=id,displayName,programTrackedEntityAttributes[trackedEntityAttribute[id,displayName]]`;

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Program Details:', JSON.stringify(json, null, 2));
        } catch (e) {
            console.error('Failed to parse JSON', e);
            console.log('Raw data:', data);
        }
    });
}).on('error', (err) => {
    console.error('Request failed', err);
});
