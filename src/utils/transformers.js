/**
 * Maps DHIS2 value types to our application's internal input types.
 */
const mapValueTypeToInputType = (vt, hasOpt) => {
    if (hasOpt) return 'select';
    switch (vt) {
        case 'NUMBER':
        case 'INTEGER':
        case 'INTEGER_POSITIVE':
        case 'INTEGER_ZERO_OR_POSITIVE': return 'number';
        case 'BOOLEAN':
        case 'TRUE_ONLY': return 'select';
        case 'DATE': return 'date';
        case 'LONG_TEXT': return 'textarea';
        default: return 'text';
    }
};

/**
 * Transforms DHIS2 Metadata into a grouped structure for the PWA.
 * Groups are currently organised into Mortuary (General), EMS, Clinics,
 * and (optionally) Hospital where the metadata uses the appropriate
 * SURV_/code prefixes.
 */
export const transformMetadata = (metadata) => {
    console.log("Transform: Starting metadata transformation...");
    if (!metadata || !metadata.programStageSections) {
        console.warn("Transform: No programStageSections found in metadata");
        return [];
    }

    // 1. Map Data Elements for quick lookup during section transformation
    const deMap = {};
    if (metadata.programStageDataElements) {
        metadata.programStageDataElements.forEach(psde => {
            const de = psde.dataElement || psde;
            if (de && de.id) deMap[de.id] = de;
        });
    }

    // Secondary pass to ensure all elements referenced in sections are hydrated
    if (metadata.programStageSections) {
        metadata.programStageSections.forEach(section => {
            const elements = section.dataElements || section.programStageDataElements || [];
            elements.forEach(rawDe => {
                const de = rawDe.dataElement || rawDe;
                if (de && de.id && !deMap[de.id]) {
                    if (de.displayName || de.formName || de.optionSet) deMap[de.id] = de;
                }
            });
        });
    }

    // Prefix helpers - identifies which group a section belongs to
    const detectPrefix = (sec) => {
        const code = (sec.code || '').toUpperCase();
        const name = (sec.name || '').toUpperCase();

        // Highest Priority: Explicit user-requested string for Mortuary
        if (name.includes('SURV_MORTUARY') || name.includes('SURV-MORTUARY') ||
            code.includes('MORTUARY')) {
            return 'MORTUARY';
        }

	        // Hospital detection (SURV_HOSPITAL, HOSPITAL_*, etc.)
	        if (name.includes('SURV_HOSPITAL') || name.includes('SURV-HOSPITAL') ||
	            code.includes('HOSPITAL') || code.startsWith('HOSP') ||
	            name.startsWith('HOSPITAL') || name.startsWith('HOSP')) {
	            return 'HOSPITAL';
	        }

	        // Standard EMS detection
        if (code.startsWith('EMS') || code.startsWith('SE') || name.startsWith('EMS')) {
            return 'SE';
        }

        // Generic prefix detection using shared patterns
        if (name.includes('SURV_') || name.includes('SURV-')) {
            const match = name.match(/SURV[_-]([A-Z0-9]+)/i);
            if (match && match[1]) return match[1].toUpperCase();
        }

        if (code.startsWith('SURV_') || code.startsWith('SURV-')) {
            const stripped = code.replace(/^SURV[-_]/, '');
            const part = stripped.split(/[_-]/)[0];
            if (part) return part.toUpperCase();
        }

        const fallbackParts = code.split(/[_-]/);
        if (fallbackParts.length > 1) return fallbackParts[0].toUpperCase();

        // One last try: if it starts with CLINIC, just return CLINICS
        if (code.startsWith('CLINIC') || name.startsWith('CLINIC')) return 'CLINICS';

        return null; // General section
    };

	    const PREFIX_NAME_MAP = {
	        'SE': 'EMS',
	        'MORTUARY': 'Mortuary',
	        'CLINICS': 'Clinics',
	        'CLINIC': 'Clinics',
	        'HOSPITAL': 'Hospital'
	    };

    // Strips prefixes for clean UI display
    const stripPrefix = (str, allowEmpty = true) => {
        if (!str) return '';

        let cleaned = str;

        // Remove common patterns aggressively, but STOP at "SE" or specific identifiers
        const patterns = [
            /^\s*SURV[-_]+MORTUARY[-_\d\s]*/i,
            /^\s*SURV[-_]+CLINIC[S]?[-_\d\s]*/i,
            /^\s*CLINIC[S]?[-_]+(?![SE|EMS|[\d]])/i, // Strip CLINIC_ but ONLY if not followed by SE or numbers
            /^\s*CLINIC[S]?\s+(?![SE|EMS|[\d]])/i,  // Strip CLINIC  but ONLY if not followed by SE or numbers
            /^\s*SURV[-_]+(?![SE|EMS|[\d]])/i
        ];

        let previous;
        let iterations = 0;
        do {
            previous = cleaned;
            // Never strip SE or EMS identifiers if we've already reached them
            if (cleaned.match(/^(SE|EMS)[\s-_\d]/i)) break;

            patterns.forEach(p => {
                cleaned = cleaned.replace(p, '').trim();
            });
            iterations++;
        } while (cleaned !== previous && iterations < 10);

        if (cleaned === '') {
            return allowEmpty ? '' : str;
        }
        return cleaned;
    };

	    // Normalizes field labels so that they show the criterion number and
	    // human-readable name, without technical SURV_/prefixes.
	    //
	    // Examples this is designed for:
	    //   "SURV_HOSP_SE7_7.2.2.1 Policies and/or procedures ..." ->
	    //         "7.2.2.1 Policies and/or procedures ..."
	    //   "SURV_EMS_1.1.1.1_The organisation has ..." ->
	    //         "1.1.1.1 The organisation has ..."
	    //   "FAC_ASS_ASSESSOR_USER_ID" -> "ASSESSOR USER ID" (fallback)
	    const normalizeFieldLabel = (raw) => {
	        if (!raw) return '';
	        let label = String(raw).trim();

	        // 1) If there is a 4-level criterion code, keep that code and
	        //    everything that follows it, stripping any prefixes.
	        const critMatch = label.match(/(\d+\.\d+\.\d+\.\d+)(.*)/);
	        if (critMatch) {
	            const code = critMatch[1];
	            let rest = critMatch[2] || '';
	            // Drop separators right after the code
	            rest = rest.replace(/^[_\-\s:]+/, ' ');
	            // Replace remaining underscores with spaces and normalize
	            rest = rest.replace(/_+/g, ' ');
	            rest = rest.replace(/\s+/g, ' ').trim();
	            return rest ? `${code} ${rest}`.trim() : code;
	        }

	        // 2) No explicit criterion code – strip anything up to and
	        //    including the first underscore (common for SURV_/FAC_ASS_).
	        const firstUnderscore = label.indexOf('_');
	        if (firstUnderscore !== -1) {
	            label = label.slice(firstUnderscore + 1).trim();
	        }

	        // 3) Replace remaining underscores with spaces and collapse
	        //    repeated whitespace.
	        label = label.replace(/_+/g, ' ');
	        label = label.replace(/\s+/g, ' ').trim();
	        // Present the Assessment field as "Type" in the UI, even though the
	        // underlying DE/metadata may still use the legacy "Group" wording.
	        label = label.replace(/facility assessment group/ig, 'Facility Assessment Type');
	        label = label.replace(/surv-\s*facility assessment group/ig, 'SURV-Facility Assessment Type');
	        return label;
	    };

    const transformedSections = metadata.programStageSections.map(section => {
        const fields = [];
        const sectionName = section.displayName || section.name || '';
        const sectionCode = section.code || '';
        
        // Only trust explicit SE/EMS/SEC markers here. Bare numeric section
        // names/codes like "151" are internal metadata, not SE numbers.
        const seMatch = String(sectionName).match(/(?:^|[_\s-])(SE|SEC|SECTION|EMS)\s*([0-9]+)/i)
            || String(sectionCode).match(/(?:^|[_\s-])(SE|SEC|SECTION|EMS)\s*([0-9]+)/i);

        let seId = seMatch ? seMatch[2] : null;

        let elements = section.dataElements || section.programStageDataElements || [];
        elements = [...elements].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        elements.forEach(rawDe => {
            let deId = rawDe.id || (rawDe.dataElement ? rawDe.dataElement.id : (typeof rawDe === 'string' ? rawDe : null));
            const de = deMap[deId] || rawDe.dataElement || rawDe;
            if (!de || (!de.id && !de.displayName)) return;

            const deName = de.formName || de.displayName || de.name || de.shortName;
            const isHeader = deName && (deName.includes('(--)') || deName.trim().endsWith('--'));

            if (isHeader) {
                fields.push({
                    id: de.id || deId || Math.random().toString(),
                    label: deName.replace(/\(--\)/g, '').replace(/--$/, '').trim(),
                    type: 'header',
                    code: de.code
                });
            } else {
                let options = [];
                const optionSet = de.optionSet || (deMap[deId] ? deMap[deId].optionSet : null);
                if (optionSet && optionSet.options) {
                    options = [...optionSet.options]
                        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                        .map(opt => ({ value: opt.code || opt.id, label: opt.displayName || opt.name }));
                }
                if (options.length === 0 && (de.valueType === 'BOOLEAN' || de.valueType === 'TRUE_ONLY')) {
                    options = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
                }
	                const isComment = deName && (deName.toLowerCase().endsWith('-comments') || deName.toLowerCase().endsWith('-comment'));
	                const finalLabel = isComment ? 'Comment' : normalizeFieldLabel(deName);
	                fields.push({
	                    id: de.id || deId,
	                    label: finalLabel,
                    type: mapValueTypeToInputType(de.valueType, options.length > 0),
                    options: options,
                    compulsory: sectionName.toLowerCase().includes('assessment details') ? true : de.compulsory,
                    isComment: isComment,
                    code: de.code
                });
            }
        });

        const prefix = detectPrefix({ name: sectionName, code: sectionCode });
        // DEBUG: console.log(`[Transform] Section: ${sectionName} (${sectionCode}) -> Prefix: ${prefix}`);
        const finalName = stripPrefix(sectionName, false);
        const finalCode = stripPrefix(sectionCode, true).replace(/^EMS/, 'SE');

        // Fallback: infer SE number from field codes/labels, e.g.
        // SURV_HOSP_SE2_2.1.1.1 or 2.1.1.1 ...
        if (!seId) {
            const fieldTexts = fields.flatMap(f => [f?.code, f?.label]).filter(Boolean).map(v => String(v));
            for (const txt of fieldTexts) {
                let m = txt.match(/(?:SE|SEC|SECTION|EMS)\s*([0-9]+)/i);
                if (m) { seId = m[1]; break; }
                m = txt.match(/(?:^|[^0-9])([0-9]+)\.[0-9]+\.[0-9]+\.[0-9]+/);
                if (m) { seId = m[1]; break; }
            }
        }

        return {
            id: section.id,
            name: finalName,
            code: finalCode,
	            se_id: seId,
            fields: fields,
            _prefix: prefix,
            _originalName: sectionName
        };
    });

    const generalSections = [];
    const prefixSectionsByPrefix = {};

    transformedSections.forEach(sec => {
        const prefix = sec._prefix;
        const nl = (sec._originalName || '').toLowerCase();
        const isAD = nl.includes('assessment details') || nl.includes('assessment_details');

	        // Determine group: SE/EMS, Clinics, and Hospital get specific groups.
	        // Everything else (Mortuary or untagged) goes to the general (Mortuary) group.
	        const groupKey =
	            (prefix === 'SE' || (prefix && prefix.startsWith('SE'))) ? 'SE' :
	            (prefix === 'CLINICS' || prefix === 'CLINIC' ? 'CLINICS' :
	            (prefix === 'HOSPITAL' || prefix === 'HOSP') ? 'HOSPITAL' : null);

        if (!groupKey) {
            // console.log(`[Transform] Grouping ${sec.name} into MORTUARY (prefix was ${prefix})`);
            sec.fields.forEach(f => { if (f.type !== 'header') f.compulsory = true; });
            generalSections.push(sec);
        } else {
            // console.log(`[Transform] Grouping ${sec.name} into ${groupKey} (prefix was ${prefix})`);
            if (!prefixSectionsByPrefix[groupKey]) prefixSectionsByPrefix[groupKey] = [];
            prefixSectionsByPrefix[groupKey].push(sec);
        }
    });

    const sharedSections = generalSections.filter(s => {
        const nl = (s._originalName || '').toLowerCase();
        return nl.includes('assessment details') || nl.includes('assessment_details');
    });

    const nonSharedGeneralSections = generalSections.filter(s => !sharedSections.includes(s));

    // Sort non-shared Mortuary sections based on any numbers in their names/codes (e.g. SE 1, SE 2)
    const sortedNonSharedMortuarySections = [...nonSharedGeneralSections].sort((a, b) => {
        const ex = (s) => (s && s.match(/\d+/) ? parseInt(s.match(/\d+/)[0], 10) : 999);
        return ex(a.code || a.name) - ex(b.code || b.name);
    });

    // Ensure sharedSections (Assessment Details) are always at the very beginning
    const finalMortuarySections = [...sharedSections, ...sortedNonSharedMortuarySections];

	    // Construct SE groups (EMS, Clinics, Hospital)
    const emsGroupSections = prefixSectionsByPrefix['SE'] || [];
    const clinicsGroupSections = prefixSectionsByPrefix['CLINICS'] || [];
	    const hospitalGroupSections = prefixSectionsByPrefix['HOSPITAL'] || [];

    const sortSections = (secs) => [...secs].sort((a, b) => {
        const ex = (s) => (s && s.match(/\d+/) ? parseInt(s.match(/\d+/)[0], 10) : 0);
        return ex(a.code || a.name) - ex(b.code || b.name);
    });

	    const sortedEmsSections = sortSections(emsGroupSections);
	    const sortedClinicsSections = sortSections(clinicsGroupSections);
	    const sortedHospitalSections = sortSections(hospitalGroupSections);

    const allGroups = [];

    // Always include Mortuary (General) group
    allGroups.push({
        id: 'GENERAL',
        name: PREFIX_NAME_MAP['MORTUARY'],
        sections: finalMortuarySections
    });

    // Add EMS group if sections exist
    if (sortedEmsSections.length > 0) {
        allGroups.push({
            id: 'SE',
            name: PREFIX_NAME_MAP['SE'],
            sections: [...sharedSections, ...sortedEmsSections]
        });
    }

	    // Add Hospital group if sections exist
	    if (sortedHospitalSections.length > 0) {
	        allGroups.push({
	            id: 'HOSPITAL',
	            name: PREFIX_NAME_MAP['HOSPITAL'],
	            sections: [...sharedSections, ...sortedHospitalSections]
	        });
	    }
	
    // Add Clinics group if sections exist
    if (sortedClinicsSections.length > 0) {
        allGroups.push({
            id: 'CLINICS',
            name: PREFIX_NAME_MAP['CLINICS'],
            sections: [...sharedSections, ...sortedClinicsSections]
        });
    }

    // Final pass for linking comments and questions
    allGroups.forEach(group => {
        group.sections.forEach(section => {
            const fields = section.fields || [];
            for (let i = 0; i < fields.length - 1; i++) {
                if (!fields[i].isComment && fields[i].type !== 'header' && fields[i + 1].isComment) {
                    fields[i].commentFieldId = fields[i + 1].id;
                    fields[i + 1].questionFieldId = fields[i].id;
                }
            }
        });
    });

    return allGroups;
};
