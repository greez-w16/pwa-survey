const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const baseUrl = 'https://qimsdev.5am.co.bw/qims';
const teiId = 'rFnLMiNE8GZ';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

const options = {
    headers: {
        'Authorization': `Basic ${auth}`
    }
};

const url = `${baseUrl}/api/trackedEntityInstances/${teiId}?fields=trackedEntityInstance,attributes[attribute,value]`;

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('TEI Details:', json);
        } catch (e) {
            console.error('Failed to parse JSON', e);
            console.log('Raw data:', data);
        }
    });
}).on('error', (err) => {
    console.error('Request failed', err);
});
