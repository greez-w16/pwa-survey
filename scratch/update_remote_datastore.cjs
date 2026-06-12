const fs = require('fs');
const https = require('https');
const http = require('http');

const DHIS2_URL = 'https://moh-qimsuat.gov.bw/qims';
const USERNAME = 'inspector1';
const PASSWORD = 'Nomisr123$';

const rebuiltConfig = require('../hospital_config_rebuilt.json');
const hospitalLinks = require('../src/assets/hospital/hospital_links.json');
const hospitalComputeCriteria = require('../src/assets/hospital/hospital_compute_criteria.json');

// 1. Update hospital_full_configuration in qims-survey-configs namespace (raw array of SEs)
const surveyConfigsPayload = rebuiltConfig.hospital_full_configuration;

// 2. Update hospital_bundle in qims-config-assessment namespace (wrapped bundle)
const configAssessmentPayload = {
    config: rebuiltConfig,
    links: hospitalLinks,
    compute: hospitalComputeCriteria
};

async function uploadToDataStore(namespace, key, data) {
    const dhisPath = DHIS2_URL.endsWith('/') ? DHIS2_URL.slice(0, -1) : DHIS2_URL;
    const url = new URL(`${dhisPath}/api/dataStore/${namespace}/${key}`);
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
                if (res.statusCode === 409) {
                    console.log(`[${namespace}] Key '${key}' already exists, updating via PUT...`);
                    options.method = 'PUT';
                    const putReq = protocol.request(url, options, (putRes) => {
                        let putBody = '';
                        putRes.on('data', chunk => putBody += chunk);
                        putRes.on('end', () => {
                            if (putRes.statusCode >= 200 && putRes.statusCode < 300) {
                                console.log(`✅ Successfully updated ${namespace}/${key}`);
                                resolve(putBody);
                            } else {
                                reject(new Error(`PUT failed for ${namespace}/${key}: ${putRes.statusCode} - ${putBody}`));
                            }
                        });
                    });
                    putReq.on('error', reject);
                    putReq.write(JSON.stringify(data));
                    putReq.end();
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Successfully created ${namespace}/${key}`);
                    resolve(body);
                } else {
                    reject(new Error(`POST failed for ${namespace}/${key}: ${res.statusCode} - ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function run() {
    console.log('Starting remote DataStore update...');
    try {
        console.log('Uploading to qims-survey-configs/hospital_full_configuration...');
        await uploadToDataStore('qims-survey-configs', 'hospital_full_configuration', surveyConfigsPayload);

        console.log('Uploading to qims-config-assessment/hospital_bundle...');
        await uploadToDataStore('qims-config-assessment', 'hospital_bundle', configAssessmentPayload);

        console.log('All updates completed successfully!');
    } catch (err) {
        console.error('❌ Error during update:', err);
    }
}

run();
