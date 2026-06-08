const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'src', 'assets', 'hospital', 'hospital_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const issues = [];
const standards = config.hospital_full_configuration || [];

standards.forEach(se => {
    (se.sections || []).forEach(sec => {
        (sec.standards || []).forEach(std => {
            const statement = std.statement || '';
            // Match any 4-level digit pattern (like 22.11.4.1) or "Root criterion" or "Linked criterion"
            const matchDigit = statement.match(/\b\d+\.\d+\.\d+\.\d+\b/);
            const containsKeywords = statement.includes('Root criterion') || statement.includes('Linked criterion') || statement.includes('Compliance for this');
            
            if (matchDigit || containsKeywords || statement.length > 200) {
                issues.push({
                    se_id: se.se_id,
                    section_pi_id: sec.section_pi_id,
                    standard_id: std.standard_id,
                    statement: statement,
                    matchDigit: matchDigit ? matchDigit[0] : null,
                    length: statement.length
                });
            }
        });
    });
});

console.log(`Found ${issues.length} standards with potential statement corruption:`);
issues.forEach(issue => {
    console.log(`- Std: ${issue.standard_id} (SE ${issue.se_id}) | Length: ${issue.length} | Match: ${issue.matchDigit || 'keywords'}`);
    console.log(`  Text: "${issue.statement.substring(0, 120)}..."`);
    console.log('---');
});
