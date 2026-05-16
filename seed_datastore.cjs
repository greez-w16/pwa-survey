const fs = require('fs');
const https = require('https');
const http = require('http');

// Configuration
// You may need to change these to point to your target DHIS2 instance
// Defaulting to the proxy or local dev server if it supports DataStore
const DHIS2_URL = 'https://qimsdev.5am.co.bw/qims'; // Change to the actual DHIS2 URL if needed
const USERNAME = 'inspector1'; // Change if needed
const PASSWORD = 'Nomisr123$'; // Change if needed

const NAMESPACE = 'qims-config-assessment';

// Load local assets
const emsConfig = require('./src/assets/ems_config.json');
const mortuaryConfig = require('./src/assets/mortuary_config.json');
const clinicsConfig = require('./src/assets/clinics_config.json');
const hospitalConfig = require('./src/assets/hospital_config.json');
const hospitalComputeCriteria = require('./src/assets/hospital_compute_criteria.json');

const emsLinks = require('./src/assets/ems_links.json');
const mortuaryLinks = require('./src/assets/mortuary_links.json');
const clinicsLinks = require('./src/assets/clinics_links.json');
const hospitalLinks = require('./src/assets/hospital_links.json');

const payloads = {
    'hospital_bundle': {
        config: hospitalConfig,
        links: hospitalLinks,
        compute: hospitalComputeCriteria
    },
    'clinics_bundle': {
        config: clinicsConfig,
        links: clinicsLinks,
        compute: {}
    },
    'ems_bundle': {
        config: emsConfig,
        links: emsLinks,
        compute: {}
    },
    'mortuary_bundle': {
        config: mortuaryConfig,
        links: mortuaryLinks,
        compute: {}
    }
};

async function uploadToDataStore(key, data) {
    const dhisPath = DHIS2_URL.endsWith('/') ? DHIS2_URL.slice(0, -1) : DHIS2_URL;
    const url = new URL(`${dhisPath}/api/dataStore/${NAMESPACE}/${key}`);
    const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
        }
    };

    const protocol = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = protocol.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                // If it already exists (409 Conflict), try PUT instead
                if (res.statusCode === 409) {
                    console.log(`Key '${key}' already exists, updating via PUT...`);
                    options.method = 'PUT';
                    const putReq = protocol.request(url, options, (putRes) => {
                        let putBody = '';
                        putRes.on('data', chunk => putBody += chunk);
                        putRes.on('end', () => {
                            if (putRes.statusCode >= 200 && putRes.statusCode < 300) {
                                console.log(`✅ Successfully updated ${key}`);
                                resolve(putBody);
                            } else {
                                reject(new Error(`PUT failed for ${key}: ${putRes.statusCode} - ${putBody}`));
                            }
                        });
                    });
                    putReq.on('error', reject);
                    putReq.write(JSON.stringify(data));
                    putReq.end();
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Successfully created ${key}`);
                    resolve(body);
                } else {
                    reject(new Error(`POST failed for ${key}: ${res.statusCode} - ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function seed() {
    console.log(`Starting DataStore seeding for namespace: ${NAMESPACE}...`);
    for (const [key, data] of Object.entries(payloads)) {
        try {
            await uploadToDataStore(key, data);
        } catch (err) {
            console.error(`❌ Error uploading ${key}:`, err.message);
        }
    }
    console.log('Seeding complete.');
}

seed();
