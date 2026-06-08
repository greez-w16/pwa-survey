const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'src', 'assets', 'hospital', 'hospital_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function cleanStandardStatement(statement) {
    if (!statement) return '';
    let text = statement.trim();
    
    // Replace "Standard" prefix (case insensitive, optional spaces)
    text = text.replace(/^Standard\s+/i, '');
    
    // Find any 4-segment dot-separated code, like 22.11.4.1 or 24.11.4.1
    const match = text.match(/\b\d+\.\d+\.\d+\.\d+\b/);
    if (match) {
        // Split at the match index
        let prefix = text.substring(0, match.index).trim();
        
        // Remove trailing page numbers or bare numbers (e.g. "412", "489", "413")
        prefix = prefix.replace(/\s+\d+\s*$/, '').trim();
        
        // If the prefix is not empty, use it!
        if (prefix.length > 5) {
            text = prefix;
        }
    }
    
    // Strip trailing keywords like "Linked criterion", "Root criterion", "Compliance for", etc.
    text = text.replace(/\s*(?:Root|Linked)\s+criteri(?:on|a):?\s*$/gi, '');
    text = text.replace(/\s*Compliance\s+for\s+this\s+criterion\s+and\s+the\s+following\s+will\s+be\s+verified\s+during\s+the\s+patient\s+record\s+audit\.?\s*$/gi, '');
    text = text.replace(/\s*Compliance\s+of\s+the\s+following\s+criteria\s+will\s+be\s+verified\s+during\s+the\s+patient\s+record\s+audit\.?\s*$/gi, '');
    text = text.replace(/\s*Compliance\s+will\s+be\s+verified\s+during\s+the\s+patient\s+record\s+audit\.?\s*$/gi, '');
    
    // Clean up trailing/standalone Criterion Comments and Recommendations with newline handling
    text = text.replace(/[\s\r\n]*(?:Criterion\s+Comments|Recommendations|Criterion\s+Comments\s*[\r\n]+\s*Recommendations)\s*$/gi, '');
    
    return text.trim();
}

const standards = config.hospital_full_configuration || [];
let count = 0;

standards.forEach(se => {
    (se.sections || []).forEach(sec => {
        (sec.standards || []).forEach(std => {
            const original = std.statement || '';
            const cleaned = cleanStandardStatement(original);
            if (original !== cleaned) {
                count++;
                if (count <= 15) {
                    console.log(`Std: ${std.standard_id}`);
                    console.log(`  Original: "${original.substring(0, 120).replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
                    console.log(`  Cleaned:  "${cleaned.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
                    console.log('---');
                }
            }
        });
    });
});

console.log(`Total cleaned standard statements: ${count}`);
