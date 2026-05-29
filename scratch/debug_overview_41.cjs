const fs = require('fs');
const { transformMetadata } = require('../src/utils/transformers.js');
const metadata = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('src/assets/hospital_config.json', 'utf8'));

// Mock metadata structure expected by transformMetadata
const mockMetadata = {
    id: 'hup8BqEe7Mn',
    programStageSections: metadata
};

const transformed = transformMetadata(mockMetadata);
const hospitalGroup = transformed.find(g => g.id === 'HOSPITAL');
if (!hospitalGroup) {
    console.log('HOSPITAL group not found after transformation.');
    process.exit(1);
}

[41, 42, 43].forEach(seId => {
    const sec = hospitalGroup.sections.find(s => s.se_id === String(seId));
    if (!sec) {
        console.log(`❌ SE ${seId} section not found after transformation.`);
        return;
    }

    console.log(`\n--- Analyzing SE ${seId} ---`);
    console.log('Name:', sec.name);
    console.log('Code:', sec.code);
    console.log('se_id:', sec.se_id);

    // Run the matching logic inside seOverview
    const activeConfigArray = config.hospital_full_configuration;
    const rawName = (sec._originalName || sec.name || '').trim();
    const rawCode = (sec.code || '').trim();

    let hintedPiId = null;
    const piMatch = rawName.match(/\b\d+\.\d+\b/) || rawCode.match(/\b\d+\.\d+\b/);
    if (piMatch) {
        hintedPiId = piMatch[0];
    } else if (Array.isArray(sec.fields)) {
        for (const f of sec.fields) {
            const codeSrc = (f && (f.code || f.id)) ? String(f.code || f.id) : '';
            if (!codeSrc) continue;
            const codeMatch = codeSrc.match(/\d+\.\d+(?:\.\d+){1,2}\b/);
            if (!codeMatch) continue;
            const parts = codeMatch[0].split('.');
            if (parts.length >= 2) {
                hintedPiId = `${parts[0]}.${parts[1]}`;
                break;
            }
        }
    }

    console.log('hintedPiId derived:', hintedPiId);

    let matchedSe = null;
    let matchedSection = null;

    outer: for (const se of activeConfigArray) {
        const seSections = se.sections || [];
        for (const secConfig of seSections) {
            const secPi = (secConfig.section_pi_id || '').trim();
            const secTitle = (secConfig.title || '').trim();

            const numberMatches =
                !!secPi && (
                    secPi === hintedPiId ||
                    rawName.includes(secPi) ||
                    rawCode.includes(secPi)
                );

            const titleLc = secTitle.toLowerCase();
            const nameLc = rawName.toLowerCase();
            const titleMatches = titleLc && (nameLc.includes(titleLc) || titleLc.includes(nameLc));

            if (numberMatches || titleMatches) {
                matchedSe = se;
                matchedSection = secConfig;
                break outer;
            }
        }
    }

    if (!matchedSe || !matchedSection) {
        console.log('❌ FAILED to match any SE/section.');
    } else {
        console.log('✅ MATCHED:', {
            seId: matchedSe.se_id,
            seName: matchedSe.se_name,
            sectionPiId: matchedSection.section_pi_id,
            sectionTitle: matchedSection.title,
            standardsLength: matchedSection.standards ? matchedSection.standards.length : 0
        });
    }
});
