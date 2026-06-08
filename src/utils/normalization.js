/**
 * Normalizes a raw criterion code by removing common prefixes and suffixes.
 * E.g., "EMS_1.1.1.1" -> "1.1.1.1", "SE 1.1.1.1 extra" -> "1.1.1.1"
 * @param {string} rawCode 
 * @returns {string}
 */
export const normalizeCriterionCode = (rawCode) => {
    if (!rawCode) return '';
    let code = String(rawCode).trim();

    // General rule: strip everything up to (and including) the last '_' that is
    // immediately followed by a digit.  This handles any prefix pattern:
    //   EMS_1.2.3.4        → 1.2.3.4
    //   SURV-MORTUARY_1.2  → 1.2
    //   GENERAL_2.1.1      → 2.1.1
    //   SE_3.4.5           → 3.4.5
    const lastUnderscoreBeforeDigit = code.search(/_(?=\d)/);
    if (lastUnderscoreBeforeDigit !== -1) {
        // Find the LAST such occurrence
        const match = code.match(/.*_(?=\d)/);
        if (match) {
            code = code.slice(match[0].length);
        }
    } else if (code.startsWith('SE ')) {
        // Legacy fallback: "SE 1.2.3.4" format (space-separated)
        code = code.slice(3).trim();
    }

    // Strip circular link root tags appended by the scoring engine
    code = code.replace(/-root\(.*\)$/, '');
    // If spaces remain, take first token only (e.g. "1.1.1.1 extra" → "1.1.1.1")
    code = code.split(/\s+/)[0];
    return code;
};


/**
 * Compares two criterion codes (e.g. "1.2.1.4" and "1.2.1.1")
 * Returns -1 if A < B, 1 if A > B, 0 if equal.
 * Compares segment by segment numerically.
 */
export const compareCriterionCodes = (codeA, codeB) => {
    const a = normalizeCriterionCode(codeA) || '';
    const b = normalizeCriterionCode(codeB) || '';
    if (a === b) return 0;

    const partsA = a.split('.').map(n => parseInt(n, 10));
    const partsB = b.split('.').map(n => parseInt(n, 10));

    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const valA = partsA[i] || 0;
        const valB = partsB[i] || 0;
        if (valA < valB) return -1;
        if (valA > valB) return 1;
    }
    return 0;
};

/**
 * Sanitizes a standard statement text by removing nested criterion codes,
 * guidelines, page numbers, and trailing keywords.
 * @param {string} statement 
 * @returns {string}
 */
export const cleanStandardStatement = (statement) => {
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
};

