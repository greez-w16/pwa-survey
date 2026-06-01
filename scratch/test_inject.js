const fs = require('fs');
const { transformMetadata } = require('../src/utils/transformers.js');

if (!fs.existsSync('scratch/stage_sections_dump.json')) {
    console.log('stage_sections_dump.json not found');
    process.exit(1);
}

const dumpData = JSON.parse(fs.readFileSync('scratch/stage_sections_dump.json', 'utf8'));

// Build metadata object expected by transformMetadata
const metadata = {
    id: 'hup8BqEe7Mn',
    programStageSections: dumpData
};

const transformedGroups = transformMetadata(metadata);
const hospitalGroup = transformedGroups.find(g => g.id === 'HOSPITAL');
if (!hospitalGroup) {
    console.log('Hospital group not found');
    process.exit(1);
}

const se41Section = hospitalGroup.sections.find(s => s.id === 'SEC00000041');
if (!se41Section) {
    console.log('SE 41 Section not found');
    process.exit(1);
}

// Build criterionIndex
const config = JSON.parse(fs.readFileSync('src/assets/hospital_config.json', 'utf8'));
const activeConfigArray = config.hospital_full_configuration;

const index = {};
activeConfigArray.forEach(se => {
    (se.sections || []).forEach(section => {
        (section.standards || []).forEach(standard => {
            const stdId = (standard.standard_id || standard.standardId || '').trim();
            if (stdId && !index[stdId]) {
                index[stdId] = {
                    statement: standard.statement || '',
                    intent: standard.intent_tooltip || '',
                    is_critical: false,
                    severity: null,
                };
            }
            (standard.criteria || []).forEach(crit => {
                if (!crit || !crit.id) return;
                index[crit.id] = {
                    statement: standard.statement || '',
                    intent: standard.intent_tooltip || '',
                    description: crit.description || '',
                    is_critical: crit.is_critical || false,
                    severity: crit.severity || 1,
                };
            });
        });
    });
});

console.log('41.1.1 in index:', index['41.1.1']);

// Mock normalizeCriterionCode
const normalizeCriterionCode = (rawCode) => {
    if (!rawCode) return '';
    let code = String(rawCode).trim();
    const lastUnderscoreBeforeDigit = code.search(/_(?=\d)/);
    if (lastUnderscoreBeforeDigit !== -1) {
        const match = code.match(/.*_(?=\d)/);
        if (match) code = code.slice(match[0].length);
    } else if (code.startsWith('SE ')) {
        code = code.slice(3).trim();
    }
    code = code.replace(/-root\(.*\)$/, '');
    code = code.split(/\s+/)[0];
    return code;
};

// Run injectVirtualStandards
const injectVirtualStandards = (sections, criterionIndex) => {
    if (!Array.isArray(sections)) return [];
    return sections.map(section => {
        const fields = section.fields || [];
        const presentCodes = new Set();
        fields.forEach(f => {
            let norm = normalizeCriterionCode(f.code);
            if (!norm || !/\d/.test(norm)) {
                const match = (f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
                if (match) norm = match[0];
            }
            if (norm) presentCodes.add(norm);
        });

        const missingStandards = new Set();
        fields.forEach(f => {
            let norm = normalizeCriterionCode(f.code);
            if (!norm || !/\d/.test(norm)) {
                const match = (f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
                if (match) norm = match[0];
            }
            if (norm && /^\d+(\.\d+){3}$/.test(norm)) {
                const stdCode = norm.split('.').slice(0, 3).join('.');
                if (!presentCodes.has(stdCode)) {
                    missingStandards.add(stdCode);
                }
            }
        });

        console.log('presentCodes count:', presentCodes.size);
        console.log('missingStandards:', Array.from(missingStandards));

        const newFields = [];
        const injectedStandards = new Set();

        fields.forEach(f => {
            let norm = normalizeCriterionCode(f.code);
            if (!norm || !/\d/.test(norm)) {
                const match = (f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
                if (match) norm = match[0];
            }

            if (norm && /^\d+(\.\d+){3}$/.test(norm)) {
                const stdCode = norm.split('.').slice(0, 3).join('.');
                if (missingStandards.has(stdCode) && !injectedStandards.has(stdCode)) {
                    injectedStandards.add(stdCode);
                    const stdInfo = criterionIndex?.[stdCode] || {};
                    const statement = stdInfo.statement || `Standard ${stdCode}`;
                    newFields.push({
                        id: `virtual-std-${section.id}-${stdCode}`,
                        label: statement,
                        type: 'text',
                        code: stdCode,
                        isVirtualStandard: true,
                    });
                }
            }
            newFields.push(f);
        });

        return {
            ...section,
            fields: newFields
        };
    });
};

const res = injectVirtualStandards([se41Section], index)[0];
console.log('Total fields:', se41Section.fields.length, '-> after injection:', res.fields.length);
console.log('Virtual fields injected:', res.fields.filter(f => f.isVirtualStandard).map(f => ({code: f.code, label: f.label.substring(0, 50)})));
console.log('All fields normalized codes:', se41Section.fields.map(f => ({id: f.id, code: f.code, norm: normalizeCriterionCode(f.code)})));
