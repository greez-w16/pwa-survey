import fs from 'fs';
import path from 'path';

const configId = '1g96UiMetwNLgp-XY2wMOm2S3by09RKi5';
const linksId = '1r5P27w02Dpdhcnj00YQ0ggNlKy-RyXUF';

const baseDir = 'c:/Users/SK/Documents/qims/pwa-bots-final-App 2/Survey 2';
const assetsDir = path.join(baseDir, 'src/assets');

async function downloadFile(id, destPath) {
    const url = `https://docs.google.com/uc?export=download&id=${id}`;
    console.log(`Downloading ID ${id} to ${destPath}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const text = await res.text();
    // Verify it is JSON
    try {
        JSON.parse(text);
    } catch (e) {
        // Sometimes Google Drive shows a virus scan warning or HTML page
        if (text.includes('confirm=')) {
            // Find the confirm token
            const tokenMatch = text.match(/confirm=([a-zA-Z0-9_]+)/);
            if (tokenMatch) {
                const token = tokenMatch[1];
                const confirmUrl = `https://docs.google.com/uc?export=download&confirm=${token}&id=${id}`;
                console.log(`Downloading with confirmation token: ${token}...`);
                const confirmRes = await fetch(confirmUrl);
                const confirmText = await confirmRes.text();
                JSON.parse(confirmText); // verify it's JSON
                fs.writeFileSync(destPath, confirmText, 'utf8');
                console.log(`Successfully downloaded to ${destPath}`);
                return;
            }
        }
        console.error('Fetched content is not valid JSON! Content snippet:', text.slice(0, 1000));
        throw new Error('Downloaded content is not valid JSON.');
    }
    fs.writeFileSync(destPath, text, 'utf8');
    console.log(`Successfully downloaded to ${destPath}`);
}

async function run() {
    try {
        // 1. Backups
        const configPath = path.join(assetsDir, 'mortuary_config.json');
        const configBackupPath = path.join(assetsDir, 'mortuary_config_backup.json');
        if (fs.existsSync(configPath)) {
            fs.copyFileSync(configPath, configBackupPath);
            console.log(`Backed up ${configPath} to ${configBackupPath}`);
        }

        const linksPath = path.join(assetsDir, 'mortuary_links.json');
        const linksBackupPath = path.join(assetsDir, 'mortuary_links_backup.json');
        if (fs.existsSync(linksPath)) {
            fs.copyFileSync(linksPath, linksBackupPath);
            console.log(`Backed up ${linksPath} to ${linksBackupPath}`);
        }

        const rootConfigPath = path.join(baseDir, 'mortuary_config_utf8.json');
        const rootConfigBackupPath = path.join(baseDir, 'mortuary_config_utf8_backup.json');
        if (fs.existsSync(rootConfigPath)) {
            fs.copyFileSync(rootConfigPath, rootConfigBackupPath);
            console.log(`Backed up ${rootConfigPath} to ${rootConfigBackupPath}`);
        }

        // 2. Download and Replace
        await downloadFile(configId, configPath);
        await downloadFile(linksId, linksPath);

        // Copy the new config to root as well
        fs.copyFileSync(configPath, rootConfigPath);
        console.log(`Copied new config to ${rootConfigPath}`);

        console.log('Done!');
    } catch (e) {
        console.error('Error during execution:', e);
        process.exit(1);
    }
}

run();
