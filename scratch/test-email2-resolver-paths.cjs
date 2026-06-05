const https = require('https');

const BASE_HOST = 'moh-qimsuat.gov.bw';
const IDENTIFIERS = ['XY0hDxFTjrf'];

async function testPath(path) {
    const url = new URL(`https://${BASE_HOST}${path}`);
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
        const timeout = setTimeout(() => {
            resolve({ status: 'TIMEOUT', body: '' });
        }, 5000);

        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                resolve({ status: res.statusCode, contentType: res.headers['content-type'], body });
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ status: 'ERROR', error: err.message });
        });

        req.write(bodyData);
        req.end();
    });
}

async function run() {
    const paths = [
        '/email2/api/admin/resolve-users',
        '/email2/api/resolve-users',
        '/email2/admin/resolve-users',
        '/email2/resolve-users',
        '/email2/api/users/resolve',
        '/email2/api/admin/users/resolve'
    ];

    for (const path of paths) {
        console.log(`\nTesting Path: ${path}`);
        const res = await testPath(path);
        console.log(`Status: ${res.status} | Content-Type: ${res.contentType}`);
        console.log(`Body (truncated): ${res.body ? res.body.slice(0, 150) : '(empty)'}`);
    }
}

run();
