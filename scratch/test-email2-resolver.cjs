const https = require('https');

const RESOLVER_URL = 'https://moh-qimsuat.gov.bw/email2/api/admin/resolve-users';
const IDENTIFIERS = ['XY0hDxFTjrf'];

async function testResolver() {
    const url = new URL(RESOLVER_URL);
    const bodyData = JSON.stringify({ identifiers: IDENTIFIERS });

    const options = {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyData)
        }
    };

    return new Promise((resolve) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        });

        req.on('error', (err) => {
            resolve({ status: 'ERROR', error: err.message });
        });

        req.write(bodyData);
        req.end();
    });
}

async function run() {
    console.log('Sending POST to:', RESOLVER_URL);
    console.log('Payload:', JSON.stringify({ identifiers: IDENTIFIERS }));
    const res = await testResolver();
    console.log('Status code:', res.status);
    console.log('Headers:', JSON.stringify(res.headers));
    console.log('Body:', res.body || '(empty)');
}

run();
