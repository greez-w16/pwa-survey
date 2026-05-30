import re

with open('src/pages/Dashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace getSurveyTypeOptionsFromMetadata block (lines 209-220)
old_block = '''    const getSurveyTypeOptionsFromMetadata = React.useCallback((programStage) => {
        try {
            const de = findSurveyTypeDataElement(programStage);
            const opts = de?.optionSet?.options || [];
            return opts
                .map(o => ({ value: o.code || o.displayName || o.name, label: o.displayName || o.name || o.code }))
                .filter(o => {
                    const text = `${o.value || ''} ${o.label || ''}`.toLowerCase().replace(/[_-]+/g, ' ');
                    return !(text.includes('supportive') || (text.includes('support') && text.includes('visit')));
                });
        } catch (_) { return []; }
    }, [findSurveyTypeDataElement]);'''

new_block = '''    // Prefer API-loaded option-set options; fall back to metadata extraction
    const [surveyTypeOptionsList, setSurveyTypeOptionsList] = React.useState([]);

    React.useEffect(() => {
        let cancelled = false;
        api.getOptionSetOptions('whOJTh1cKwX')
            .then(opts => { if (!cancelled) setSurveyTypeOptionsList(opts || []); })
            .catch(() => { if (!cancelled) setSurveyTypeOptionsList([]); });
        return () => { cancelled = true; };
    }, []);

    const getSurveyTypeOptionsFromMetadata = React.useCallback((programStage) => {
        const apiOpts = (surveyTypeOptionsList || [])
            .filter(o => {
                const text = `${o.value || ''} ${o.label || ''}`.toLowerCase().replace(/[_-]+/g, ' ');
                return !(text.includes('supportive') || (text.includes('support') && text.includes('visit')));
            });
        if (apiOpts.length > 0) return apiOpts;
        try {
            const de = findSurveyTypeDataElement(programStage);
            const opts = de?.optionSet?.options || [];
            return opts
                .map(o => ({ value: o.code || o.displayName || o.name, label: o.displayName || o.name || o.code }))
                .filter(o => {
                    const text = `${o.value || ''} ${o.label || ''}`.toLowerCase().replace(/[_-]+/g, ' ');
                    return !(text.includes('supportive') || (text.includes('support') && text.includes('visit')));
                });
        } catch (_) { return []; }
    }, [findSurveyTypeDataElement, surveyTypeOptionsList]);'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print('Replaced getSurveyTypeOptionsFromMetadata block')
else:
    print('ERROR: Could not find getSurveyTypeOptionsFromMetadata block')

# 2. Replace assessmentHasBaselineSurvey block (lines 1612-1646)
old_baseline = '''		const assessmentHasBaselineSurvey = React.useCallback(async (assessment) => {
        if (!assessment || !surveyTypeDeId) return false;
		    const stageId = getAssignmentProgramStageId(assessment);
        const programId = getSurveyEventProgramIdForStage(stageId, assessment);
        const facilityOrgUnitId =
            assessment?.orgUnitId ||
            (typeof assessment?.orgUnit === 'string' ? assessment.orgUnit : assessment?.orgUnit?.id) ||
            assessment?.facilityId ||
            null;
        const teiId = resolveTeiForAssessment(assessment);
        if (!facilityOrgUnitId && !teiId) return false;

        const events = facilityOrgUnitId
            ? await api.getEventsList({
                programId,
                stageId,
                orgUnitId: facilityOrgUnitId,
                ouMode: 'DESCENDANTS',
                fields: 'event,orgUnit,trackedEntityInstance,dataValues[dataElement,value]'
            }).catch(() => [])
            : await api.getSurveyEventsForTeiByEventIds({
                teiId,
                orgUnitId: null,
                programId,
                stageId,
                listPageSize: 50,
                detailBatchSize: 5,
                fields: 'event,dataValues[dataElement,value]'
            }).catch(() => []);

        return (Array.isArray(events) ? events : []).some(ev => {
            const dv = (ev?.dataValues || []).find(d => d?.dataElement === surveyTypeDeId);
            return dv && isBaselineSurveyType(dv.value);
        });
    }, [configuration, surveyTypeDeId, isBaselineSurveyType]);'''

new_baseline = '''		const assessmentHasBaselineSurvey = React.useCallback(async (assessment) => {
        if (!assessment) return false;
        const facilityOrgUnitId =
            assessment?.orgUnitId ||
            (typeof assessment?.orgUnit === 'string' ? assessment.orgUnit : assessment?.orgUnit?.id) ||
            assessment?.facilityId ||
            null;
        if (!facilityOrgUnitId) return false;

        const data = await api.getTeisByOrgUnitForBaselineCheck({
            orgUnitId: facilityOrgUnitId,
            programId: 'G2gULe4jsfs'
        }).catch(() => null);

        if (!data || !Array.isArray(data.headers) || !Array.isArray(data.rows)) return false;
        const attrIndex = data.headers.findIndex(h =>
            (h.name && h.name === 'qrTQdWKRYMB') ||
            (h.column && h.column === 'qrTQdWKRYMB')
        );
        if (attrIndex < 0) return false;

        return data.rows.some(row => {
            const val = row[attrIndex];
            return String(val || '').trim().toLowerCase() === 'baseline assessment';
        });
    }, []);'''

if old_baseline in content:
    content = content.replace(old_baseline, new_baseline)
    print('Replaced assessmentHasBaselineSurvey block')
else:
    print('ERROR: Could not find assessmentHasBaselineSurvey block')

with open('src/pages/Dashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
