const https = require('https');

const username = 'admin';
const password = '5Am53808053@';
const orgUnit = 'Q363I00X4TY';
const program = 'G2gULe4jsfs';
const stage = 'HpHD6u6MV37';
const baseUrl = 'https://qimsdev.5am.co.bw/qims';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

const url = `${baseUrl}/api/events?program=${program}&programStage=${stage}&orgUnit=${orgUnit}&ouMode=DESCENDANTS&paging=false&fields=event,eventDate,status,trackedEntityInstance,enrollment,dataValues[dataElement,value]`;

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
            
            Object.entries(groupedByTei).forEach(([key, evs]) => {
                console.log(`\nGroup: ${key} (${evs.length} events)`);
                const enrollments = [...new Set(evs.map(ev => ev.enrollment).filter(Boolean))];
                console.log('  Enrollments found in events:', enrollments);
            });
            
        } catch (e) {
            console.error('Failed to parse JSON', e);
            console.log('Raw data:', data);
        }
    });
}).on('error', (err) => {
    console.error('Request failed', err);
});
