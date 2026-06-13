/**
 * Utility function to dynamically construct a baseline configuration
 * (matching the service_elements -> sections -> standards -> criteria hierarchy)
 * from a static matrix JSON array.
 */
export function buildConfigFromMatrix(serviceName, matrixData) {
    if (!matrixData || !Array.isArray(matrixData)) {
        return { service: serviceName, service_elements: [] };
    }
    const seMap = new Map();

    matrixData.forEach(item => {
        const id = item.criteria;
        if (!id) return;
        const parts = id.split('.');
        if (parts.length < 4) return;
        
        const se_id = parseInt(parts[0], 10);
        const section_pi_id = parts.slice(0, 2).join('.');
        const standard_id = parts.slice(0, 3).join('.');
        
        if (!seMap.has(se_id)) {
            seMap.set(se_id, {
                se_id,
                se_name: `Service Element ${se_id}`,
                sectionsMap: new Map()
            });
        }
        const se = seMap.get(se_id);
        
        if (!se.sectionsMap.has(section_pi_id)) {
            se.sectionsMap.set(section_pi_id, {
                section_pi_id,
                title: `Section ${section_pi_id}`,
                standardsMap: new Map()
            });
        }
        const section = se.sectionsMap.get(section_pi_id);
        
        if (!section.standardsMap.has(standard_id)) {
            section.standardsMap.set(standard_id, {
                standard_id,
                statement: `Standard statement for ${standard_id}`,
                intent_tooltip: "",
                criteria: []
            });
        }
        const standard = section.standardsMap.get(standard_id);
        
        // Check if this criterion already exists to avoid duplicates
        if (!standard.criteria.some(c => c.id === id)) {
            standard.criteria.push({
                id: id,
                category: "",
                severity: null,
                description: item.description || "",
                is_critical: false,
                guideline: ""
            });
        }
    });

    const service_elements = Array.from(seMap.values()).map(se => {
        const sections = Array.from(se.sectionsMap.values()).map(sec => {
            const standards = Array.from(sec.standardsMap.values()).map(std => {
                // sort criteria
                std.criteria.sort((a, b) => {
                    const aParts = a.id.split('.').map(Number);
                    const bParts = b.id.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const aVal = aParts[i] || 0;
                        const bVal = bParts[i] || 0;
                        if (aVal !== bVal) return aVal - bVal;
                    }
                    return 0;
                });
                return std;
            });
            // sort standards
            standards.sort((a, b) => {
                const aParts = a.standard_id.split('.').map(Number);
                const bParts = b.standard_id.split('.').map(Number);
                for (let i = 0; i < 3; i++) {
                    const aVal = aParts[i] || 0;
                    const bVal = bParts[i] || 0;
                    if (aVal !== bVal) return aVal - bVal;
                }
                return 0;
            });
            return {
                section_pi_id: sec.section_pi_id,
                title: sec.title,
                standards
            };
        });
        // sort sections
        sections.sort((a, b) => {
            const aParts = a.section_pi_id.split('.').map(Number);
            const bParts = b.section_pi_id.split('.').map(Number);
            for (let i = 0; i < 2; i++) {
                const aVal = aParts[i] || 0;
                const bVal = bParts[i] || 0;
                if (aVal !== bVal) return aVal - bVal;
            }
            return 0;
        });
        return {
            se_id: se.se_id,
            se_name: se.se_name,
            sections
        };
    });
    // sort service elements
    service_elements.sort((a, b) => a.se_id - b.se_id);

    return {
        service: serviceName,
        service_elements
    };
}
