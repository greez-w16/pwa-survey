const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const orgUnit = 'Q363I00X4TY';
const program = 'G2gULe4jsfs';
const stage = 'HpHD6u6MV37';
const baseUrl = 'https://moh-qimsuat.gov.bw/qims';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

const url = `${baseUrl}/api/events?program=${program}&programStage=${stage}&orgUnit=${orgUnit}&ouMode=DESCENDANTS&paging=false&fields=event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]`;

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
            const events = json.events || [];
            console.log(`Total events fetched: ${events.length}`);
            
            // Apply grouping logic
            const groupedByTei = events.reduce((acc, ev) => {
                const tei = ev?.trackedEntityInstance;
                const key = tei && tei !== 'unknown-tei' ? tei : `event-${ev.event}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(ev);
                return acc;
            }, {});
            
            const rowsCount = Object.keys(groupedByTei).length;
            console.log(`Rows that should show (after grouping): ${rowsCount}`);
            
            console.log('Grouped keys:', Object.keys(groupedByTei));
            
            // Also print if any events have 'FINAL' tag
            const finalEvents = events.filter(ev => {
                const dvs = ev.dataValues || [];
                return dvs.some(dv => dv.dataElement === 'r8pqjX6Jtr0' && dv.value === 'FINAL');
            });
            console.log(`Events with FINAL tag: ${finalEvents.length}`);
            
        } catch (e) {
            console.error('Failed to parse JSON', e);
            console.log('Raw data:', data);
        }
    });
}).on('error', (err) => {
    console.error('Request failed', err);
});
