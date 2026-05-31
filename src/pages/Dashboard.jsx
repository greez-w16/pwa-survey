import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { api } from '../services/api';
import { useStorage } from '../hooks/useStorage';
	import { useUserAssessments } from '../hooks/useUserAssessments';
	import { SurveyPreview } from '../components/SurveyPreview.jsx';
	import indexedDBService from '../services/indexedDBService';
		import emsConfig from '../assets/ems_config.json';
		import mortuaryConfig from '../assets/mortuary_config.json';
		import clinicsConfig from '../assets/clinics_config.json';
		import hospitalConfig from '../assets/hospital_config.json';
import emsLinks from '../assets/ems_links.json';
import mortuaryLinks from '../assets/mortuary_links.json';
import clinicsLinks from '../assets/clinics_links.json';
import hospitalLinks from '../assets/hospital_links.json';
import { decorateHospitalLinksWithMatrixTags } from '../utils/hospitalMatrixTags';
		import hospitalComputeCriteria from '../assets/hospital_compute_criteria.json';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    Tooltip,
    Checkbox,
    TextField,
    MenuItem,
    Autocomplete,
    LinearProgress,
    FormControl,
    InputLabel,
    Select
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LogoutIcon from '@mui/icons-material/Logout';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import EditNoteIcon from '@mui/icons-material/EditNote';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import './Dashboard.css';

const SURVEY_ASSESSMENTS_PROGRAM_ID = 'G2gULe4jsfs';
const SURVEY_PROGRAM_STAGE_BY_GROUP = {
    HOSPITAL: 'hup8BqEe7Mn',
    CLINICS: 'cliStageU11',
    EMS: 'emsStageU11',
    MORTUARY: 'morStageU11',
};

export function Dashboard() {
	    const navigate = useNavigate();
	    const [searchParams] = useSearchParams();
	    const {
	        configuration,
		        setConfiguration,
	        stats,
	        pendingEvents,
	        isOnline,
	        syncEvents,
	        retryEvent,
	        deleteEvent,
	        clearAllSurveys,
	        showToast,
	        userAssignments,
	        user,
	        logout,
	        configVersions,
	        setConfigVersions,
	        activeConfigVersionId: activeVersionId,
	        setActiveConfigVersionId,
	        configBundles,
	        setConfigBundles,
            configSource,
            setConfigSource,
            loadRemoteConfig,
	    } = useApp();
    const storage = useStorage();
    const [searchTerm, setSearchTerm] = useState('');
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedFacilityId, setSelectedFacilityId] = useState(null);
    const [previewEvent, setPreviewEvent] = useState(null);
    const [mostRecentDraft, setMostRecentDraft] = useState(null);
    const [showCreateBaselineDialog, setShowCreateBaselineDialog] = useState(false);
    const [pendingOpenAssessment, setPendingOpenAssessment] = useState(null);
    const [isBaselineCreating, setIsBaselineCreating] = useState(false);
    const [createProgress, setCreateProgress] = useState(null);
    const [createDetails, setCreateDetails] = useState([]);
	    const [createElapsedSeconds, setCreateElapsedSeconds] = useState(0);
	    const createDetailsEndRef = useRef(null);
    const [createErrorInfo, setCreateErrorInfo] = useState(null);
    const [pendingProvisionedBundle, setPendingProvisionedBundle] = useState(null);
    const [repairingAssessments, setRepairingAssessments] = useState({});
    // Initiate Survey form state
    const [initSurveyType, setInitSurveyType] = useState('');
    const [initFacilityGroup, setInitFacilityGroup] = useState(''); // HOSPITAL|CLINICS|EMS|MORTUARY
    const [initTeamOptions, setInitTeamOptions] = useState([]); // [{id, displayName, role}]
    const [initTeamLoading, setInitTeamLoading] = useState(false);
    const [initAssessorLookupInfo, setInitAssessorLookupInfo] = useState(null);
    const [initSeOptions, setInitSeOptions] = useState([]); // [{id, label}]
    const [initAssignments, setInitAssignments] = useState({}); // { [seId]: [userIds] }
	    const [initMetadataLoading, setInitMetadataLoading] = useState(false);
		    const [initProgramStageMetadata, setInitProgramStageMetadata] = useState(null);
    const [initPlanLoading, setInitPlanLoading] = useState(false);
    const [initMode, setInitMode] = useState('BASELINE'); // BASELINE | FOLLOWUP
    const [forceSelfOnly, setForceSelfOnly] = useState(false);
    const [lockType, setLockType] = useState(false);
    const [lockGroup, setLockGroup] = useState(false);
    const [initHasExistingBaseline, setInitHasExistingBaseline] = useState(false);
    const [initEditAssignmentsOnly, setInitEditAssignmentsOnly] = useState(false);
    const [initiatingAssessmentKey, setInitiatingAssessmentKey] = useState(null);
    const [loadingSurveyRow, setLoadingSurveyRow] = useState(null);
    const [loadingSurveyInfo, setLoadingSurveyInfo] = useState(null);

    const allSeAssigned = React.useMemo(() => {
        if (!initFacilityGroup || !initSeOptions || initSeOptions.length === 0) return false;
        for (const se of initSeOptions) {
            const arr = initAssignments[se.id] || [];
            if (!Array.isArray(arr) || arr.length === 0) return false;
        }
        return true;
    }, [initFacilityGroup, initSeOptions, initAssignments]);

	    useEffect(() => {
	        if (!isBaselineCreating) {
	            setCreateElapsedSeconds(0);
	            return undefined;
	        }
	        const startedAt = Date.now();
	        const timer = window.setInterval(() => {
	            setCreateElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
	        }, 1000);
	        return () => window.clearInterval(timer);
	    }, [isBaselineCreating]);

	    useEffect(() => {
	        createDetailsEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	    }, [createDetails.length]);
  // Team dialog state
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamDialogData, setTeamDialogData] = useState({ orgUnitName: '', team: [], loading: false });
    // Collapsible associated events (main survey stage only) per assignment row
    const [expandedAssignments, setExpandedAssignments] = useState({}); // { [assocKey]: true }
    const [associatedByEnrollment, setAssociatedByEnrollment] = useState({}); // { [assocKey]: { loading, survey:[] } }
	    const [assessmentEventPresenceByKey, setAssessmentEventPresenceByKey] = useState({}); // { [assocKey]: { loading, hasAssessmentEvent } }

    // Stable key for each assignment row (works even if enrollment is missing)
    const getAssocKey = (a) => (
        a?.enrollment || a?.eventId ||
        (a?.trackedEntityInstance || a?.scheduleTeiId) ||
        (a?.orgUnitId || (typeof a?.orgUnit === 'string' ? a.orgUnit : a?.orgUnit?.id)) ||
        'unknown'
    );

    const SURVEY_PROGRAM_ATTRIBUTE_IDS = {
        assessmentTypeSelected: 'qrTQdWKRYMB',
        facilityType: 'ZAcSwTShzlN',
        facilityAssessmentStatus: 'SlXgujGsSqv',
        assessmentStartDate: 'ruhbCcyiOsP',
        assessmentGuidelineVersion: 'BHm7pKBQGtf',
        assessmentYear: 'SNxiLOr01tU',
        linkedSchedulingEnrollmentUid: 'NGUDA6wHnM5',
        assessmentType: 'Bw4PZ8NsYFd',
    };

    const getAttributeValue = (attributes, attributeId, displayNameIncludes = []) => {
        const normalizedNames = displayNameIncludes.map(name => String(name).replace(/\s+/g, ' ').toLowerCase());
        const attr = (attributes || []).find(a => {
            if (a?.attribute === attributeId) return true;
            const displayName = String(a?.displayName || '').replace(/\s+/g, ' ').toLowerCase();
            return normalizedNames.some(name => displayName.includes(name));
        });
        const value = attr?.value;
        return value === undefined || value === null || String(value).trim() === '' ? null : value;
    };

	    const getProgramStageDataElementDefinitions = React.useCallback((programStage) => {
	        const fromStage = (programStage?.programStageDataElements || []).map(psde => psde?.dataElement || psde).filter(Boolean);
	        const fromSections = (programStage?.programStageSections || [])
	            .flatMap(section => section?.dataElements || section?.programStageDataElements || [])
	            .map(raw => raw?.dataElement || raw)
	            .filter(Boolean);
	        const byId = new Map();
	        [...fromStage, ...fromSections].forEach(de => {
	            const id = de?.id;
	            if (!id) return;
	            const existing = byId.get(id);
	            byId.set(id, existing?.optionSet && !de?.optionSet ? existing : de);
	        });
	        return Array.from(byId.values());
	    }, []);

	    const findSurveyTypeDataElement = React.useCallback((programStage) => {
	        const candidates = getProgramStageDataElementDefinitions(programStage);
	        return candidates.find(de => {
	            const n = (de?.displayName || de?.displayFormName || de?.formName || de?.name || de?.shortName || '').toLowerCase();
	            const code = String(de?.code || '').toLowerCase();
	            return n.includes('type of assessment')
	                || (n.includes('assessment type') && !n.includes('facility assessment'))
	                || n.includes('survey type')
	                || n.includes('type of survey')
	                || code.includes('type_of_assessment')
	                || code.includes('assessment_type_selected');
	        }) || null;
	    }, [getProgramStageDataElementDefinitions]);

	    // Prefer API-loaded option-set options; fall back to metadata extraction
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
	        let metaOpts = [];
	        try {
	            const de = findSurveyTypeDataElement(programStage);
	            const opts = de?.optionSet?.options || [];
	            metaOpts = opts
	                .map(o => ({ value: o.code || o.displayName || o.name, label: o.displayName || o.name || o.code }))
	                .filter(o => {
	                    const text = `${o.value || ''} ${o.label || ''}`.toLowerCase().replace(/[_-]+/g, ' ');
	                    return !(text.includes('supportive') || (text.includes('support') && text.includes('visit')));
	                });
	        } catch (_) { /* ignore */ }
	        // Merge both sources and deduplicate by label (prefer API value if conflict)
	        const mergedMap = new Map();
	        [...metaOpts, ...apiOpts].forEach(o => {
	            const key = String(o.label || o.value || '').trim().toLowerCase();
	            if (key && !mergedMap.has(key)) mergedMap.set(key, o);
	        });
	        return Array.from(mergedMap.values());
	    }, [findSurveyTypeDataElement, surveyTypeOptionsList]);

	    // Resolve the DataElement ID for "Type of Assessment" from loaded metadata
	    const surveyTypeDeId = useMemo(
	        () => findSurveyTypeDataElement(configuration?.programStage)?.id || null,
	        [configuration, findSurveyTypeDataElement]
	    );

	    const surveyTypeOptions = useMemo(
	        () => getSurveyTypeOptionsFromMetadata(configuration?.programStage),
	        [configuration, getSurveyTypeOptionsFromMetadata]
	    );

    const isSupportiveSurveyType = React.useCallback((val) => {
        const text = String(val || '').toLowerCase().replace(/[_-]+/g, ' ');
        return text.includes('supportive') || (text.includes('support') && text.includes('visit'));
    }, []);

    const isSelfSurveyType = React.useCallback((val) => /self/i.test(String(val || '')), []);

    const isBaselineSurveyType = React.useCallback((value) => {
        if (value === undefined || value === null) return false;
        const raw = String(value);
        if (raw === 'Baseline Assessment ') return true;
        const text = raw.trim().toLowerCase();
        return text === 'baseline' ||
            text === 'baseline assessment' ||
            text === 'base-line' ||
            text === 'fac_ass_baseline' ||
            text === 'baseline_assessment' ||
            text === 'baseline_survey' ||
            text.includes('baseline');
    }, []);

    const baselineSurveyTypeOptions = useMemo(
        () => (surveyTypeOptions || []).filter(opt => isBaselineSurveyType(opt.label || opt.value)),
        [surveyTypeOptions, isBaselineSurveyType]
    );

	    const initSurveyTypeOptions = useMemo(() => {
	        const initOptions = getSurveyTypeOptionsFromMetadata(initProgramStageMetadata);
	        return initOptions.length > 0 ? initOptions : surveyTypeOptions;
	    }, [getSurveyTypeOptionsFromMetadata, initProgramStageMetadata, surveyTypeOptions]);

	    const initBaselineSurveyTypeOptions = useMemo(
	        () => (initSurveyTypeOptions || []).filter(opt => isBaselineSurveyType(opt.label || opt.value)),
	        [initSurveyTypeOptions, isBaselineSurveyType]
	    );

    // Resolve the DataElement ID for "Assessment Group" from loaded metadata
    const surveyGroupDeId = useMemo(() => {
        const ps = configuration?.programStage;
        if (!ps) return null;
        const candidates = (ps.programStageDataElements || []).map(psde => psde.dataElement || psde);
        const byName = candidates.find(de => {
            const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
            return n.includes('assessment group') || n.includes('facility assessment group') || n.includes('facility assessment type');
        });
        const byKnownId = candidates.find(de => (de?.id || '') === 'pzenrgsSny3');
        return byName?.id || byKnownId?.id || null;
    }, [configuration]);

    const SYS_TAG_DE_ID = 'r8pqjX6Jtr0';
    const getSysTag = (ev) => {
	        const dataValues = Array.isArray(ev?.dataValues) ? ev.dataValues : [];
	        for (const dv of dataValues) {
	            if (dv?.dataElement !== SYS_TAG_DE_ID) continue;
	            const value = dv?.value === undefined || dv?.value === null ? '' : String(dv.value).trim();
	            if (value) return value;
	            break;
	        }
	        return null;
    };

	    const isAssessmentDetailsStageSection = (section) => {
	        const text = `${section?.displayName || ''} ${section?.name || ''} ${section?.code || ''}`.toLowerCase();
	        return text.includes('assessment details') || text.includes('assessment_details') || text.includes('facility details') || text.includes('facility_details');
	    };

	    const isDedicatedHospitalProgramStage = (programStage) => {
	        return programStage?.id === 'hup8BqEe7Mn';
	    };

	    const extractStageSectionSeId = (section) => {
	        const fieldCandidates = (section?.dataElements || section?.programStageDataElements || [])
	            .flatMap(raw => {
	                const de = raw?.dataElement || raw;
	                return [de?.code, de?.displayName, de?.name];
	            });
	        const candidates = [section?.displayName, section?.name, section?.code, section?.id, ...fieldCandidates]
	            .filter(Boolean)
	            .map(v => String(v));
	        for (const candidate of candidates) {
	            const match = candidate.match(/(?:^|[_\s-])(SE|SEC|SECTION|EMS)\s*([0-9]+)(?=$|[_\s:-])/i);
	            if (match) return String(parseInt(match[2], 10));
	            const prefixedNumberMatch = candidate.match(/(?:HOSP(?:ITAL)?|CLINICS?|MORTUARY|SURV)[_\s-]+(?:SE[_\s-]*)?([0-9]+)(?=$|[_.\s:-])/i);
	            if (prefixedNumberMatch) return String(parseInt(prefixedNumberMatch[1], 10));
	        }
	        return null;
	    };

	    const stageSectionMatchesFacilityGroup = (section, groupKey, programStage = null) => {
	        const rawNs = String(groupKey || '').toUpperCase();
	        const ns = rawNs === 'SE' ? 'EMS' : (rawNs === 'GENERAL' ? 'MORTUARY' : rawNs);
	        const text = `${section?.displayName || ''} ${section?.name || ''} ${section?.code || ''}`.toUpperCase();
	        if (isAssessmentDetailsStageSection(section)) return false;
	        if (ns === 'HOSPITAL') return isDedicatedHospitalProgramStage(programStage) || text.includes('HOSP') || text.includes('HOSPITAL');
	        if (ns === 'CLINICS') return text.includes('CLINIC') || text.includes('CLINICS');
	        if (ns === 'EMS') return text.includes('SURV_EMS') || text.includes('SURV-EMS') || /^\s*(EMS|SE)([_\s-]|$)/.test(text);
	        if (ns === 'MORTUARY') return text.includes('MORTUARY') || text.includes('SURV_MORTUARY') || text.includes('SURV-MORTUARY');
	        return false;
	    };

		    const buildMetadataSeOptions = (groupKey, programStageOverride = null) => {
		        const programStage = programStageOverride || configuration?.programStage;
		        const sections = programStage?.programStageSections || [];
	        const optionsById = new Map();
	        sections.forEach(section => {
	            if (!stageSectionMatchesFacilityGroup(section, groupKey, programStage)) return;
	            const seId = extractStageSectionSeId(section);
	            if (!seId || optionsById.has(seId)) return;
	            const rawName = section?.displayName || section?.name || section?.code || '';
	            const label = String(rawName)
	                .replace(/^\s*(SURV[-_])?(HOSPITAL|HOSP|CLINICS?|EMS|MORTUARY)[-_\s]*/i, '')
	                .replace(/^\s*SE\s*([0-9]+)[-_\s:]*/i, '')
	                .trim();
	            optionsById.set(seId, { id: seId, label: `SE ${seId} ${label || ''}`.trim() });
	        });
	        return Array.from(optionsById.values()).sort((a, b) => Number(a.id) - Number(b.id));
	    };

	    // Build SE options for the selected Facility Group. Prefer the live DHIS2
	    // program-stage sections because those are the sections the form renders.
	    // Static JSON config is only a fallback if metadata is not available yet.
		    const buildSeOptions = (groupKey, programStageOverride = null) => {
	        try {
	            const rawNs = String(groupKey || '').toUpperCase();
	            const ns = rawNs === 'SE' ? 'EMS' : (rawNs === 'GENERAL' ? 'MORTUARY' : rawNs);
		            const metadataSeList = buildMetadataSeOptions(ns, programStageOverride);
	            if (metadataSeList.length > 0) return metadataSeList;

	            let arr = [];
	            if (ns === 'HOSPITAL') arr = hospitalConfig.hospital_full_configuration || [];
	            else if (ns === 'CLINICS') arr = clinicsConfig.clinics_full_configuration || [];
	            else if (ns === 'EMS') arr = emsConfig.ems_full_configuration || [];
	            else if (ns === 'MORTUARY') arr = mortuaryConfig.mortuary_full_configuration || [];
	            const seList = (arr || []).map(se => ({ id: String(se.se_id), label: `SE ${se.se_id} ${se.se_name || se.name || ''}`.trim() }));
	            return seList.sort((a, b) => Number(a.id) - Number(b.id));
	        } catch (_) { return []; }
	    };

    const toFacilityGroupKey = React.useCallback((txt) => {
        const t = String(txt || '').toLowerCase();
        if (t.includes('hosp')) return 'HOSPITAL';
        if (t.includes('clinic')) return 'CLINICS';
        if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'EMS';
        if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
        return String(txt || '').toUpperCase().trim();
    }, []);

	    const getExpectedTagsForGroup = React.useCallback((groupKey) => {
	        const ns = toFacilityGroupKey(groupKey);
	        return ['FINAL', ...buildSeOptions(ns).map(se => String(se.id))];
	    }, [configuration, toFacilityGroupKey]);

    const getFacilityGroupLabel = React.useCallback((facilityGroupKey) => {
        const labelMap = { HOSPITAL: 'Hospital', CLINICS: 'Clinics', EMS: 'EMS', MORTUARY: 'Mortuary' };
        return labelMap[String(facilityGroupKey).toUpperCase()] || String(facilityGroupKey || '');
    }, []);

	    const getSurveyProgramStageIdForGroup = React.useCallback((facilityGroupKey) => {
	        const normalizedGroup = toFacilityGroupKey(facilityGroupKey);
	        return SURVEY_PROGRAM_STAGE_BY_GROUP[normalizedGroup] || '';
	    }, [toFacilityGroupKey]);

	    const ensureSurveyMetadataForGroup = React.useCallback(async (facilityGroupKey) => {
	        const targetStageId = getSurveyProgramStageIdForGroup(facilityGroupKey);
	        if (!targetStageId) return configuration?.programStage || null;
		        const shouldRefreshDedicatedStageMetadata = Object.values(SURVEY_PROGRAM_STAGE_BY_GROUP).includes(targetStageId);
		        if (!shouldRefreshDedicatedStageMetadata && configuration?.programStage?.id === targetStageId) return configuration.programStage;

	        const metadata = await api.getFormMetadata(targetStageId);
	        setConfiguration?.({
	            programStage: metadata,
	            program: metadata?.program || configuration?.program || { id: 'G2gULe4jsfs', displayName: 'MOH Survey Dashboard' },
	            organisationUnits: configuration?.organisationUnits || []
	        });
	        return metadata;
	    }, [configuration, getSurveyProgramStageIdForGroup, setConfiguration]);

    const assessmentDetailsFields = useMemo(() => {
        const ps = configuration?.programStage;
        const sections = Array.isArray(ps?.programStageSections) ? ps.programStageSections : [];
        const seen = new Set();
        const fields = [];

        sections.forEach(section => {
            const name = String(section?.displayName || section?.name || '').toLowerCase().trim();
            if (!(name.includes('assessment details') || name.includes('assessment_details') || name.includes('facility details') || name.includes('facility_details'))) {
                return;
            }
            const elements = section?.dataElements || section?.programStageDataElements || [];
            elements.forEach(raw => {
                const de = raw?.dataElement || raw;
                if (de?.id && !seen.has(de.id)) {
                    seen.add(de.id);
                    fields.push(de);
                }
            });
        });

        return fields;
    }, [configuration]);

    const buildAssessmentDetailsDataValues = React.useCallback((assessment, {
        teiId = null,
        enrollmentId = null,
        surveyTypeValue = '',
        facilityGroupKey = '',
	        programStageId = null,
        assessorUserId = null,
	        allowedDataElementIds = null,
		        excludedDataElementIds = [],
	        programStageMetadata = null,
    } = {}) => {
	        const detailFields = (() => {
	            if (!programStageMetadata) return assessmentDetailsFields;
	            const sections = Array.isArray(programStageMetadata?.programStageSections) ? programStageMetadata.programStageSections : [];
	            const seen = new Set();
	            const fields = [];
	            sections.forEach(section => {
	                const name = String(section?.displayName || section?.name || '').toLowerCase().trim();
	                if (!(name.includes('assessment details') || name.includes('assessment_details') || name.includes('facility details') || name.includes('facility_details'))) return;
	                (section?.dataElements || section?.programStageDataElements || []).forEach(raw => {
	                    const de = raw?.dataElement || raw;
	                    if (de?.id && !seen.has(de.id)) {
	                        seen.add(de.id);
	                        fields.push(de);
	                    }
	                });
	            });
	            return fields;
	        })();
	        if (!detailFields.length) return [];

	        const detailFieldIds = new Set(detailFields.map(field => field.id).filter(Boolean));
	        const allowedIds = allowedDataElementIds ? new Set(allowedDataElementIds) : null;
	        const excludedIds = new Set(excludedDataElementIds || []);
        const valuesByDe = new Map();
        const setValue = (dataElement, value) => {
            if (!dataElement || !detailFieldIds.has(dataElement)) return;
	            if (allowedIds && !allowedIds.has(dataElement)) return;
		            if (excludedIds.has(dataElement)) return;
            if (value === undefined || value === null) return;
            const text = String(value).trim();
            if (text === '') return;
            valuesByDe.set(dataElement, { dataElement, value: value });
        };
        const hasValue = (dataElement) => valuesByDe.has(dataElement);

        const setupDataValues = Array.isArray(assessment?.setupEventDataValues) ? assessment.setupEventDataValues : [];
        setupDataValues.forEach(dv => setValue(dv?.dataElement, dv?.value));

        const facilityGroupLabel = getFacilityGroupLabel(facilityGroupKey);
	        detailFields.forEach(field => {
            const fieldId = field?.id;
            const label = String(field?.displayName || field?.formName || field?.name || field?.shortName || '').toLowerCase();
            const code = String(field?.code || '').toUpperCase();

            const isTypeOfAssessmentField = fieldId === surveyTypeDeId
                || label.includes('type of assessment')
                || (label.includes('assessment type') && !label.includes('facility assessment'));
            const isFacilityAssessmentTypeField = fieldId === surveyGroupDeId
                || label.includes('assessment group')
                || label.includes('facility assessment group')
                || label.includes('facility assessment type');

            if (isTypeOfAssessmentField) {
                if (!hasValue(fieldId)) setValue(fieldId, surveyTypeValue);
                return;
            }
            if (isFacilityAssessmentTypeField) {
                if (!hasValue(fieldId)) setValue(fieldId, facilityGroupLabel);
                return;
            }
	            if ((label.includes('program stage') && label.includes('id')) || code.includes('PROGRAM_STAGE')) {
	                setValue(fieldId, programStageId);
	                return;
	            }
            if (label.includes('tei id')) {
                setValue(fieldId, teiId);
                return;
            }
            if (label.includes('enrollment')) {
                // Do not derive this from the assignment/scheduling enrollment.
                // In practice that can belong to a different program than the
                // main survey events. Only stamp a survey enrollment here when
                // it is explicitly known in the current provisioning flow.
                setValue(fieldId, enrollmentId || null);
                return;
            }
            if (code.includes('FAC_ASS_ASSESSOR_USER_ID') || label.includes('assessor user id')) {
                setValue(fieldId, assessorUserId);
                return;
            }
            if (label.includes('facility id')) {
                setValue(fieldId, assessment?.facilityId || assessment?.orgUnitId || null);
                return;
            }
            if (label.includes('district')) {
                setValue(fieldId, assessment?.parentOrgUnitName || null);
                return;
            }
            if (label.includes('facility name') || label.includes('organisation unit') || label.includes('organization unit')) {
                setValue(fieldId, assessment?.orgUnitName || null);
            }
        });

        return Array.from(valuesByDe.values());
		    }, [assessmentDetailsFields, getFacilityGroupLabel, surveyGroupDeId, surveyTypeDeId]);

    const findAssessmentPlanForTei = React.useCallback(async ({ teiId, preferredNs = null }) => {
        if (!teiId) return { plan: null, nsKey: null };
        const candidates = [];
        const preferred = toFacilityGroupKey(preferredNs);
        if (preferred) candidates.push(preferred);
        ['HOSPITAL', 'CLINICS', 'EMS', 'MORTUARY'].forEach(ns => { if (!candidates.includes(ns)) candidates.push(ns); });
        for (const ns of candidates) {
            try {
                const value = await api.getDataStoreItem(ns, teiId);
                if (value && value.teiId) return { plan: value, nsKey: ns };
            } catch (_) { /* continue probing */ }
        }
        return { plan: null, nsKey: null };
    }, [toFacilityGroupKey]);

	    const readSurveyTagMap = React.useCallback(async ({ teiId, orgUnitId, programId, stageId }) => {
        if (!teiId || !orgUnitId) return {};
        const tagMap = {};
	        const surveyEvents = await api.getSurveyEventsForTeiByEventIds({
	            teiId,
	            orgUnitId,
	            programId,
	            stageId,
	            listPageSize: 50,
	            detailBatchSize: 5,
	            fields: 'event,eventDate,status,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]'
	        }).catch(() => []);

	        (surveyEvents || []).forEach(ev => {
	            const tag = getSysTag(ev);
	            if (tag && !tagMap[tag]) tagMap[tag] = ev.event;
	        });

        return tagMap;
    }, []);

    const pollForExpectedTags = React.useCallback(async ({ teiId, orgUnitId, programId, stageId, expectedTags, pollDelaysMs = [0, 400, 1200, 2500, 4000], onAttempt }) => {
        let latestTagMap = {};
        for (let attempt = 0; attempt < pollDelaysMs.length; attempt++) {
            const delayMs = pollDelaysMs[attempt];
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
		            latestTagMap = await readSurveyTagMap({ teiId, orgUnitId, programId, stageId });
            const missingTags = expectedTags.filter(tag => !latestTagMap[tag]);
            await onAttempt?.({ attempt: attempt + 1, totalAttempts: pollDelaysMs.length, latestTagMap, missingTags });
            if (missingTags.length === 0) break;
        }
        return {
            tagMap: latestTagMap,
            missingTags: expectedTags.filter(tag => !latestTagMap[tag]),
        };
    }, [readSurveyTagMap]);

	    const finalizeProvisionedAssessmentOpen = React.useCallback(({ assessment, teiId, enrollmentId, eventIdMap, surveyType, facilityGroup, programStageId = null, detailsDataValues = [] }) => {
        const preload = {};
        (Array.isArray(detailsDataValues) ? detailsDataValues : []).forEach(dv => {
            if (dv?.dataElement && dv?.value !== undefined && dv?.value !== null) {
                preload[dv.dataElement] = dv.value;
            }
        });
        if (surveyTypeDeId && surveyType && preload[surveyTypeDeId] === undefined) preload[surveyTypeDeId] = surveyType;
        if (surveyGroupDeId && facilityGroup && preload[surveyGroupDeId] === undefined) {
            preload[surveyGroupDeId] = getFacilityGroupLabel(facilityGroup);
        }
        preload['eventIdMap_internal'] = JSON.stringify(eventIdMap || {});
        preload['teiId_internal'] = teiId;
        if (enrollmentId) preload['enrollmentId_internal'] = enrollmentId;

        setShowCreateBaselineDialog(false);
        setPendingOpenAssessment(null);
        const finalEventId = eventIdMap?.FINAL || null;
        const formIdentityId = finalEventId || enrollmentId || teiId;
        const withBaseline = {
            ...assessment,
            eventId: finalEventId || assessment?.eventId,
            enrollment: enrollmentId || assessment?.enrollment,
            trackedEntityInstance: teiId,
            scheduleTeiId: teiId,
            baselineEventId: finalEventId,
	            programStageId: programStageId || assessment?.programStageId || getSurveyProgramStageIdForGroup(facilityGroup),
	            eventIdMap: eventIdMap || {},
	            parentGroupId: facilityGroup || assessment?.parentGroupId,
            preloadDataValues: preload,
	            hydrateAll: true,
	            // The just-created event map is authoritative. Replace any stale
	            // local draft map that may have been produced by an earlier failed
	            // readback/repair attempt.
	            preloadMode: 'REPLACE'
        };
	        const targetProgramStageId = withBaseline.programStageId || '';
        navigate(
	            `/form?assessmentId=${encodeURIComponent(formIdentityId || '')}&baselineId=${encodeURIComponent(finalEventId || '')}&draftKey=${encodeURIComponent(formIdentityId || '')}&assessmentTeiId=${encodeURIComponent(teiId || '')}${enrollmentId ? `&enrollmentId=${encodeURIComponent(enrollmentId)}` : ''}${targetProgramStageId ? `&programStageId=${encodeURIComponent(targetProgramStageId)}` : ''}`,
            { state: { selectedAssignment: withBaseline } }
        );
	    }, [getFacilityGroupLabel, getSurveyProgramStageIdForGroup, navigate, surveyGroupDeId, surveyTypeDeId]);

		    const repairAssessmentBundle = React.useCallback(async ({ assessment, teiId, orgUnitId, enrollmentId = null, facilityGroup, surveyType, expectedTags = null, logLine = null, programStageMetadata = null, allowedDataElementIds = null, excludedDataElementIds = [] }) => {
        if (!teiId || !orgUnitId) throw new Error('Assessment TEI or org unit is missing for repair.');
		            const scheduleFacilityGroup =
		                assessment?.schedule?.facilityGroup ||
		                assessment?.schedule?.parentGroupId ||
		                assessment?.schedule?.attributes?.find?.(attr => attr?.attribute === SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityType)?.value ||
		                '';
			            const resolvedFacilityGroup =
			                facilityGroup ||
			                assessment?.parentGroupId ||
		                assessment?.facilityGroup ||
		                scheduleFacilityGroup ||
		                '';
			            const groupStageId = resolvedFacilityGroup
			                ? getSurveyProgramStageIdForGroup(resolvedFacilityGroup)
			                : '';
		            const stageId =
			                programStageMetadata?.id ||
			                groupStageId ||
			                assessment?.programStageId ||
		                configuration?.programStage?.id ||
		                '';
			    const programId = programStageMetadata?.program?.id || getSurveyEventProgramIdForStage(stageId, assessment);
        const planInfo = await findAssessmentPlanForTei({ teiId, preferredNs: facilityGroup });
        const resolvedGroup = toFacilityGroupKey(facilityGroup || planInfo?.plan?.facilityGroup || assessment?.parentGroupId || '');
        const resolvedType = surveyType || planInfo?.plan?.typeOfAssessment || '';
	        const effectiveProgramStageMetadata = programStageMetadata || (configuration?.programStage?.id === stageId ? configuration.programStage : null);
	        const effectiveAllowedDataElementIds = allowedDataElementIds || (() => {
	            const ids = (effectiveProgramStageMetadata?.programStageDataElements || [])
	                .map(psde => psde?.dataElement?.id || psde?.id)
	                .filter(Boolean);
	            return ids.length > 0 ? ids : null;
	        })();
        const detailsDataValues = buildAssessmentDetailsDataValues(assessment, {
            teiId,
            enrollmentId: enrollmentId || null,
            surveyTypeValue: resolvedType,
            facilityGroupKey: resolvedGroup,
	            programStageId: stageId,
            assessorUserId: user?.id || null,
	            allowedDataElementIds: effectiveAllowedDataElementIds,
	            excludedDataElementIds,
	            programStageMetadata: effectiveProgramStageMetadata,
        });
        const tagsToExpect = Array.isArray(expectedTags) && expectedTags.length > 0 ? expectedTags : getExpectedTagsForGroup(resolvedGroup);
        if (!resolvedGroup || tagsToExpect.length <= 1) throw new Error('Could not determine the expected SE list for this assessment.');

        const beforeMap = await readSurveyTagMap({ teiId, orgUnitId, programId, stageId });
        let missingTags = tagsToExpect.filter(tag => !beforeMap[tag]);
        if (missingTags.length === 0) {
            logLine?.('No missing SYS_TAG events found.');
            return { tagMap: beforeMap, missingTags: [], facilityGroup: resolvedGroup, surveyType: resolvedType };
        }

        logLine?.(`Preparing remaining assessment sections: ${missingTags.join(', ')}`);
        const createdTagMap = {};
        for (const tag of missingTags) {
            const dataValues = [
                ...detailsDataValues,
                { dataElement: SYS_TAG_DE_ID, value: String(tag) }
            ];
            createdTagMap[tag] = await api.createSurveyEvent({
                programId,
                stageId,
                orgUnitId,
                teiId,
	                enrollmentId: enrollmentId || planInfo?.plan?.enrollmentId || null,
                status: 'ACTIVE',
                dataValues,
                notes: []
            });
        }

        const verification = await pollForExpectedTags({
            teiId,
            orgUnitId,
            programId,
            stageId,
            expectedTags: tagsToExpect,
            pollDelaysMs: [0, 800, 1800, 3200, 5000],
            onAttempt: ({ attempt, totalAttempts, missingTags: stillMissing, latestTagMap }) => {
                const visibleCount = tagsToExpect.length - stillMissing.length;
                logLine?.(`Setup check ${attempt}/${totalAttempts}: ${visibleCount}/${tagsToExpect.length} sections ready${stillMissing.length ? `; still preparing ${stillMissing.join(', ')}` : ''}.`);
            }
        });

        const mergedTagMap = { ...createdTagMap, ...verification.tagMap };
        missingTags = tagsToExpect.filter(tag => !mergedTagMap[tag]);
        if (missingTags.length > 0) {
            throw new Error(`Assessment setup is taking a little longer. Some sections are still not available in DHIS2: ${missingTags.join(', ')}`);
        }

	        try {
	            await api.upsertDataStoreItem(resolvedGroup, teiId, {
	                ...(planInfo?.plan || {}),
	                teiId,
	                orgUnitId,
	                enrollmentId: enrollmentId || planInfo?.plan?.enrollmentId || null,
	                facilityGroup: resolvedGroup,
	                typeOfAssessment: resolvedType,
	                eventIdMap: mergedTagMap,
	                eventIdMapSource: 'REPAIR_DHIS2_READBACK',
	                eventIdMapUpdatedAt: new Date().toISOString(),
	            });
	        } catch (e) {
	            console.warn('Repair: DataStore eventIdMap upsert failed (non-fatal)', e);
	        }

        return { tagMap: mergedTagMap, missingTags: [], facilityGroup: resolvedGroup, surveyType: resolvedType };
	    }, [buildAssessmentDetailsDataValues, configuration, findAssessmentPlanForTei, getExpectedTagsForGroup, getSurveyProgramStageIdForGroup, pollForExpectedTags, readSurveyTagMap, toFacilityGroupKey, user?.id]);

    // (duplicate declarations removed)

    // State for success popup
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
	    const [isAssessmentsCollapsed, setIsAssessmentsCollapsed] = useState(true);
	    const [showSettings, setShowSettings] = useState(false);
				    const [expandedFacs, setExpandedFacs] = useState({});
		    const [selectedSE, setSelectedSE] = useState(null);
		    const [isEditingJson, setIsEditingJson] = useState(false);
		    const [editedJson, setEditedJson] = useState('');
			    const [jsonError, setJsonError] = useState(null);
	    const [isEditingLinks, setIsEditingLinks] = useState(false);
	    const [editedLinksJson, setEditedLinksJson] = useState('');
	    const [showLinksEditor, setShowLinksEditor] = useState(false);
		    const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
		    const [newVersionName, setNewVersionName] = useState('');
		    const [newVersionDescription, setNewVersionDescription] = useState('');
		    // Full-screen editor for Hospital "Criteria and Sub Criteria for
		    // Computation" for the active configuration version.
		    const [showComputeEditor, setShowComputeEditor] = useState(false);
		    const [selectedComputeSeId, setSelectedComputeSeId] = useState(null);
		    const [draftComputeConfig, setDraftComputeConfig] = useState(null);

  // Accreditation Assignments (separate programme)
  const [isAccredAssessmentsCollapsed, setIsAccredAssessmentsCollapsed] = useState(true);
  const [accredAssignments, setAccredAssignments] = useState([]);
  const [accredLoading, setAccredLoading] = useState(false);

    // Integrated Hook for new scheduling-based assignments. When this hook
    // is unavailable or fails, we gracefully fall back to the legacy
    // userAssignments loaded in AppContext from api.getAssignments.
			    const assessmentHook = useUserAssessments();
			    const {
			        upcoming: hookUpcoming = [],
			        pending: hookPending = [],
			        stats: hookStats = null,
			        loading: hookLoading = false,
				        error: hookError = null,
				        debug: hookDebug = null,
			        respondToAssignment,
			    } = assessmentHook || {};

			    // Legacy fallback: if the hook hasn't provided any assignments yet
			    // but AppContext has userAssignments (from api.getAssignments), use
			    // those as simple "pending" assignments so the UI still shows
			    // something useful.
			    const hasHookData = (hookUpcoming.length + hookPending.length) > 0;
			    const upcomingAssessments = hasHookData ? hookUpcoming : [];
			    const pendingAssessments = hasHookData ? hookPending : userAssignments || [];
			    const assessmentStats = hookStats || {
			        total: pendingAssessments.length,
			        upcoming: 0,
			        pending: pendingAssessments.length,
			        completed: 0,
			        declined: 0,
			    };
			    const assessmentsLoading = hookLoading;

  // Load Accreditation assignments for current user from accreditation programme
  useEffect(() => {
    const fetchAccred = async () => {
      if (!user || !user.id) { setAccredAssignments([]); return; }
      try {
        setAccredLoading(true);
        // Programme/Stage provided by user: use as programme id for assignments API
        const ACCRED_PROGRAM_ID = 'LdC7RuQVGF5';
        const list = await api.getAssignments(ACCRED_PROGRAM_ID, user.id).catch(() => []);
        setAccredAssignments(Array.isArray(list) ? list : []);
      } finally {
        setAccredLoading(false);
      }
    };
    fetchAccred();
  }, [user]);

    const handleLogout = async () => {
        const confirmed = window.confirm('Logout now? Unsynced drafts will be lost.');
        if (!confirmed) return;
        try {
            await logout();
            navigate('/login');
        } catch (e) {
            console.error('Error during logout from dashboard:', e);
        }
    };

    const handleConfirmClear = async () => {
        const success = await clearAllSurveys();
        if (success) {
            setEvents([]);
            setMostRecentDraft(null);
        }
        setShowClearConfirm(false);
    };

    const loadAssociatedEvents = async (assessment) => {
        const assocKey = getAssocKey(assessment);
        setAssociatedByEnrollment(prev => ({ ...prev, [assocKey]: { ...(prev[assocKey]||{}), loading: true } }));
				        try {
				            const stageId = getAssignmentProgramStageId(assessment);
				            const programId = SURVEY_ASSESSMENTS_PROGRAM_ID;
            // Prefer facility orgUnit id for event lookup; fall back to program OU
	            const orgUnitId = resolveOrgUnitForAssessment(assessment);

	            if (!orgUnitId) {
	                showToast?.('Could not resolve the facility org unit for associated assessments.', 'warning');
	                setAssociatedByEnrollment(prev => ({
	                    ...prev,
	                    [assocKey]: { loading: false, survey: [] }
	                }));
	                return;
	            }

            // fetch all survey events for this Org Unit (regardless of TEI) to capture both
            // scheduled and self-initiated assessments in the history table.
            console.log('[AssocEvents] fetching for OrgUnit', { assocKey, programId, stageId, orgUnitId });
            const enrollments = await (api.getProgramEnrollments
                ? api.getProgramEnrollments(programId, orgUnitId, ['ACTIVE', 'COMPLETED'])
                : api.getActiveEnrollments(programId, orgUnitId)
            ).catch(() => []);
            console.log('[AssocEvents] fetched enrollments', { assocKey, count: Array.isArray(enrollments) ? enrollments.length : 0 });

            setAssociatedByEnrollment(prev => ({
                ...prev,
                [assocKey]: {
                    loading: false,
                    survey: (enrollments||[]).map(e => {
	                        const assessmentStartDate = getAttributeValue(
	                            e.attributes,
	                            SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentStartDate,
	                            ['assessment start date']
	                        );
                        return {
                            ...e,
                            _type: 'Enrollment',
	                            event: e.enrollmentId,
	                            enrollment: e.enrollmentId,
                            trackedEntityInstance: e.teiId,
		                            eventDate: assessmentStartDate || e.enrollmentDate
                        };
                    })
                }
            }));

        } catch (e) {
            console.warn('Failed to load associated events for enrollment', assessment.enrollment, e);
            setAssociatedByEnrollment(prev => ({ ...prev, [getAssocKey(assessment)]: { loading: false, survey: [] }}));
        } finally {
            // Safety: ensure loading flag is cleared even if something failed early
            setAssociatedByEnrollment(prev => {
                const k = getAssocKey(assessment);
                const b = prev[k];
                if (b && b.loading) {
                    return { ...prev, [k]: { loading: false, survey: b.survey || [] } };
                }
                return prev;
            });
        }
    };

		    const checkAssessmentEventPresence = React.useCallback(async (assessment) => {
	        const assocKey = getAssocKey(assessment);
	        const teiId = assessment.trackedEntityInstance || assessment.scheduleTeiId || null;
	        if (!teiId) {
	            setAssessmentEventPresenceByKey(prev => ({
	                ...prev,
	                [assocKey]: { loading: false, hasAssessmentEvent: false }
	            }));
	            return;
	        }

	        setAssessmentEventPresenceByKey(prev => ({
	            ...prev,
	            [assocKey]: { ...(prev[assocKey] || {}), loading: true }
	        }));

				        try {
				            const stageId = getAssignmentProgramStageId(assessment);
				            const programId = getSurveyEventProgramIdForStage(stageId, assessment);
	            // Intentionally check by authorised TEI only. The purpose here is
	            // not to hydrate the row, but to know whether an assessment event
	            // already exists for this authorised assessment TEI.
	            const survey = await api.getSurveyEventsForTei({
	                teiId,
	                orgUnitId: null,
	                programId,
	                stageId,
	                fields: 'event,trackedEntityInstance'
	            }).catch(() => []);
	            const hasAssessmentEvent = (Array.isArray(survey) ? survey : []).some(ev =>
	                ev?.event && String(ev?.trackedEntityInstance || '').trim() === String(teiId).trim()
	            );
	            setAssessmentEventPresenceByKey(prev => ({
	                ...prev,
	                [assocKey]: { loading: false, hasAssessmentEvent }
	            }));
	        } catch (e) {
	            console.warn('Failed to check assessment event presence', { assocKey, teiId, error: e });
	            setAssessmentEventPresenceByKey(prev => ({
	                ...prev,
	                [assocKey]: { loading: false, hasAssessmentEvent: false }
	            }));
	        }
		    }, [configuration, getSurveyProgramStageIdForGroup]);

		    React.useEffect(() => {
		        if (assessmentsLoading) return;
		        const all = [...(pendingAssessments || []), ...(upcomingAssessments || []), ...(accredAssignments || [])];
	        const seen = new Set();
	        all.forEach(assessment => {
	            const assocKey = getAssocKey(assessment);
	            if (!assocKey || seen.has(assocKey)) return;
	            seen.add(assocKey);
	            const current = assessmentEventPresenceByKey?.[assocKey];
	            if (current && (current.loading || typeof current.hasAssessmentEvent === 'boolean')) return;
	            checkAssessmentEventPresence(assessment);
	        });
		    }, [assessmentsLoading, pendingAssessments, upcomingAssessments, accredAssignments, assessmentEventPresenceByKey, checkAssessmentEventPresence]);

	    const toggleExpandAssessment = async (assessment) => {
	        if (!supportsAssociatedAssessments(assessment)) {
	            if (typeof showToast === 'function') {
		                showToast('Could not resolve the facility org unit for associated assessments.', 'warning');
	            }
	            return;
	        }
        const k = getAssocKey(assessment);
        setExpandedAssignments(prev => ({ ...prev, [k]: !prev[k] }));
        const alreadyLoaded = associatedByEnrollment[k] && !associatedByEnrollment[k].loading && Array.isArray(associatedByEnrollment[k].survey);
        if (!alreadyLoaded) {
            await loadAssociatedEvents(assessment);
        }
    };

    const getAssessmentActionKey = (assessment) => (
        assessment?.scheduleTeiId ||
        assessment?.trackedEntityInstance ||
        assessment?.enrollment ||
        assessment?.eventId ||
        assessment?.orgUnitId ||
        (typeof assessment?.orgUnit === 'string' ? assessment.orgUnit : assessment?.orgUnit?.id) ||
        'unknown'
    );

	const getAssessmentUiState = (assessment) => {
	    const draftId = `draft-assessment-${assessment?.eventId}`;
	    const existingDraft = events.find(e => e.event === draftId);
	    const isSynced = existingDraft?.syncStatus === 'synced';
	    const actionKey = getAssessmentActionKey(assessment);
	    const isInitiating = initiatingAssessmentKey === actionKey;
	    const assocKey = getAssocKey(assessment);
	    const presence = assessmentEventPresenceByKey?.[assocKey];
	    const hasAssessmentEvent = presence?.hasAssessmentEvent === true;
	    const isCheckingPresence = !presence || presence.loading;
	    const roleNorm = String(assessment?.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i, '').toUpperCase();
	    const isLead = /LEAD|LEADER/.test(roleNorm);
	    const roleLabel = roleNorm ? roleNorm.replace(/\s+/g, '_').replace(/_/g, ' ') : '';
		    const label = 'Initiate Survey';
	    const plannedDate = assessment?.scheduledAt ? assessment.scheduledAt.slice(0, 10) : 'N/A';
	    const lastUpdated = assessment?.updatedAt ? assessment.updatedAt.slice(0, 10) : 'N/A';
	    const evs = Array.isArray(assessment?.team) ? assessment.team : [];
	    const parseDate = (d) => (d ? new Date(d) : null);
	    const dates = evs
	        .map(e => parseDate(e.eventDate || e.occurredAt || e.completedDate || e.scheduledAt || e.updatedAt))
	        .filter(Boolean)
	        .sort((a, b) => a - b);
	    const authStart = dates[0] ? dates[0].toISOString().slice(0, 10) : plannedDate;
	    const authEnd = dates.length ? dates[dates.length - 1].toISOString().slice(0, 10) : lastUpdated;
	    const latestAuth = dates.length ? dates[dates.length - 1].toISOString().slice(0, 10) : (assessment?.sortDate || plannedDate);
	    return {
	        existingDraft,
	        isSynced,
	        actionKey,
	        isInitiating,
	        assocKey,
	        presence,
	        hasAssessmentEvent,
	        isCheckingPresence,
	        isLead,
	        roleLabel,
	        label,
	        plannedDate,
	        lastUpdated,
	        authStart,
	        authEnd,
	        latestAuth,
	    };
	};

			const getFacilityGroupKeyFromProgramStageId = (stageId) => {
			    const id = String(stageId || '').trim();
			    if (!id) return '';
			    const entry = Object.entries(SURVEY_PROGRAM_STAGE_BY_GROUP).find(([, value]) => value === id);
			    return entry?.[0] || '';
			};

			const getAssignmentFacilityGroupRawValue = (assessment) => (
			    assessment?.parentGroupId
			    || assessment?.facilityGroup
			    || assessment?.schedule?.parentGroupId
			    || assessment?.schedule?.facilityGroup
			    || getAttributeValue(assessment?.schedule?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityType, ['assessment facility type'])
			    || getAttributeValue(assessment?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityType, ['assessment facility type'])
			    || ''
			);

			const getAssessmentFacilityGroupKey = (assessment) => {
			    const raw = getAssignmentFacilityGroupRawValue(assessment);
			    const key = toFacilityGroupKey(raw);
			    if (key && key !== '-') return key;
			    return getFacilityGroupKeyFromProgramStageId(
			        assessment?.programStageId
			        || assessment?.schedule?.programStageId
			        || assessment?.schedule?.enrollments?.[0]?.programStage
			    );
			};

			const getAssignmentFacilityGroupValue = (assessment) => {
			    const raw = getAssignmentFacilityGroupRawValue(assessment);
			    const key = getAssessmentFacilityGroupKey(assessment);
			    return key ? getFacilityGroupLabel(key) : (raw || '-');
			};

		const getAssignmentTypeValue = (assessment) => (
		    assessment?.typeOfAssessment
		    || assessment?.assessmentType
		    || getAttributeValue(assessment?.schedule?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentTypeSelected, ['assessment type of assessment selected'])
		    || getAttributeValue(assessment?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentTypeSelected, ['assessment type of assessment selected'])
		    || getAttributeValue(assessment?.schedule?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentType, ['assessment type'])
		    || '-'
		);

		const getAssignmentProgramId = (assessment) => (
		    assessment?.program
		    || assessment?.programId
		    || assessment?.schedule?.enrollments?.[0]?.program
			    || configuration?.program?.id
			    || SURVEY_ASSESSMENTS_PROGRAM_ID
		);

				const ASSOCIATED_ASSESSMENTS_PROGRAM_ID = SURVEY_ASSESSMENTS_PROGRAM_ID;
			const supportsAssociatedAssessments = (assessment) => Boolean(resolveOrgUnitForAssessment(assessment));

			const getAssignmentProgramStageId = (assessment) => {
			    const facilityGroup = getAssessmentFacilityGroupKey(assessment) || getAssignmentFacilityGroupValue(assessment);
		    return assessment?.programStageId
		        || getSurveyProgramStageIdForGroup(facilityGroup)
		        || configuration?.programStage?.id
		        || '';
		};

			const getSurveyEventProgramIdForStage = (stageId, assessment = null) => {
			    const normalizedStageId = String(stageId || '').trim();
			    const isSurveyStage = Object.values(SURVEY_PROGRAM_STAGE_BY_GROUP).includes(normalizedStageId);
			    return isSurveyStage
			        ? SURVEY_ASSESSMENTS_PROGRAM_ID
			        : (configuration?.program?.id || getAssignmentProgramId(assessment) || SURVEY_ASSESSMENTS_PROGRAM_ID);
			};
		const formatAssignmentStatusLabel = (value) => {
		    const raw = String(value || '').trim();
		    const map = {
		        FAC_ASS_ASSIGN_ACCEPTED: 'Accepted',
		        FAC_ASS_ASSIGN_PENDING: 'Pending',
		        FAC_ASS_ASSIGN_DECLINED: 'Declined',
		        FAC_ASS_ASSIGN_CANCELLED: 'Cancelled',
		        FAC_ASS_ASSIGN_COMPLETED: 'Completed',
		        FAC_ASS_ASSIGN_REPLACED: 'Replaced',
		    };
		    return map[raw] || raw || '-';
		};

		const canOpenAssessmentFromUiState = (uiState, { allowWhileChecking = false } = {}) => {
		    if (!uiState) return false;
		    if (!allowWhileChecking && uiState.isCheckingPresence) return false;
		    return true;
		};

		const openAssessmentFromUiState = (assessment, uiState, { allowWhileChecking = false } = {}) => {
		    if (!canOpenAssessmentFromUiState(uiState, { allowWhileChecking })) return;
	    return uiState.label === 'Initiate Survey'
	        ? handleOpenAssessment(assessment, { forceDialog: true })
	        : handleOpenAssessment(assessment);
	};

	const renderAssessmentActionButton = (assessment, uiState) => {
	    if (uiState.isCheckingPresence) {
	        return (
	            <button className="btn btn-secondary btn-sm" disabled>
	                Checking assessment…
	            </button>
	        );
	    }

	
	    return (
	        <button
	            className={`btn ${uiState.label === 'Initiate Survey' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
	            disabled={uiState.isInitiating}
	            onClick={(e) => {
	                e.stopPropagation();
	                openAssessmentFromUiState(assessment, uiState);
	            }}
	        >
	            {uiState.isInitiating ? 'Opening…' : uiState.label}
	        </button>
	    );
	};

	const renderAssociatedAssessmentsPanel = (assessment, isLead) => {
	    const bundle = associatedByEnrollment[getAssocKey(assessment)];
	    if (!bundle || bundle.loading) return <div style={{ color: '#666' }}>Loading associated events...</div>;
	    const rawRows = [ ...(bundle.survey || []) ];
	    const groupedByAssessment = rawRows.reduce((acc, ev) => {
	        const enrollmentKey = ev?._type === 'Enrollment'
	            ? (ev.enrollmentId || ev.enrollment || ev.event)
	            : null;
	        const tei = ev?.trackedEntityInstance;
	        const key = enrollmentKey
	            ? `enrollment-${enrollmentKey}`
	            : (tei && tei !== 'unknown-tei' ? tei : `event-${ev.event}`);
	        if (!acc[key]) acc[key] = [];
	        acc[key].push(ev);
	        return acc;
	    }, {});
	    const rows = Object.entries(groupedByAssessment).map(([key, evs]) => {
	        const hasFinal = evs.some(ev => getSysTag(ev) === 'FINAL');
	        const finalEv = hasFinal ? evs.find(ev => getSysTag(ev) === 'FINAL') : null;
	        const latestWithTypeOrGroup = evs.find(ev => (ev.dataValues || []).some(d => d.dataElement === surveyTypeDeId || d.dataElement === surveyGroupDeId)) || null;
	        const latestEv = [...evs].sort((a, b) => new Date(b?.eventDate || 0) - new Date(a?.eventDate || 0))[0] || evs[0];
	        const representative = finalEv || latestWithTypeOrGroup || latestEv;
	        const representativeTei = representative?.trackedEntityInstance
	            || evs.find(ev => ev?.trackedEntityInstance)?.trackedEntityInstance
	            || (key.startsWith('event-') ? 'unknown-tei' : key);
	        const earliestDate = evs.reduce((acc, cur) => {
	            if (!cur?.eventDate) return acc;
	            if (!acc) return cur.eventDate;
	            return new Date(cur.eventDate) < new Date(acc) ? cur.eventDate : acc;
	        }, null);
	        return {
	            ...representative,
	            trackedEntityInstance: representativeTei,
	            _bundleEvents: evs,
	            _displayEventId: representative?.enrollmentId || representative?.event || '-',
	            _baselineDate: earliestDate,
	            _assessmentDate: representative?.eventDate || latestEv?.eventDate || earliestDate,
	        };
	    }).sort((a, b) => new Date(b?._assessmentDate || 0) - new Date(a?._assessmentDate || 0));

	    if (rows.length === 0) {
	        return (
	            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
	                <span style={{ color: '#334155' }}>No baseline survey found</span>
	                <span style={{
	                    display: 'inline-block',
	                    fontSize: '0.75em',
	                    fontWeight: 700,
	                    color: '#9a3412',
	                    background: '#ffedd5',
	                    border: '1px solid #fdba74',
	                    padding: '2px 8px',
	                    borderRadius: '9999px'
	                }}>NO BASELINE</span>
	            </div>
	        );
	    }

	    const getTypeValue = (ev) => {
	        if (ev._type === 'Enrollment') {
	            return getAttributeValue(
	                ev.attributes,
	                SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentTypeSelected,
	                ['assessment type of assessment selected']
	            ) || '-';
	        }
	        if (!surveyTypeDeId) return '-';
	        const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
	        const dv = sourceEvents
	            .flatMap(src => src.dataValues || [])
	            .find(d => d.dataElement === surveyTypeDeId && d.value !== undefined && String(d.value).trim() !== '');
	        return dv?.value || '-';
	    };
	    const getGroupValue = (ev) => {
	        if (ev._type === 'Enrollment') {
	            return getAttributeValue(
	                ev.attributes,
	                SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityType,
	                ['assessment facility type']
	            ) || '-';
	        }
	        if (!surveyGroupDeId) return '-';
	        const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
	        const dv = sourceEvents
	            .flatMap(src => src.dataValues || [])
	            .find(d => d.dataElement === surveyGroupDeId && d.value !== undefined && String(d.value).trim() !== '');
	        return dv?.value || '-';
	    };
	    const formatAssessmentStatusLabel = (value) => {
	        const raw = String(value || '').trim();
	        if (!raw) return '-';
	        if (raw === 'FAC_ASS_STATUS_IN_PROGRESS') return 'In Progress';
	        return raw;
	    };
	    const getStatusValue = (ev) => {
	        if (ev._type === 'Enrollment') {
	            return formatAssessmentStatusLabel(
	                getAttributeValue(
	                    ev.attributes,
	                    SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityAssessmentStatus,
	                    ['facility assessment status']
	                ) || ev.status || '-'
	            );
	        }
	        return formatAssessmentStatusLabel(ev.status || '-');
	    };

	    const authDates = (() => {
	        const evsAuth = Array.isArray(assessment.team) ? assessment.team : [];
	        const parseD = (d) => (d ? new Date(d) : null);
	        const ds = evsAuth.map(e => parseD(e.eventDate || e.occurredAt || e.completedDate || e.scheduledAt || e.updatedAt)).filter(Boolean).sort((a, b) => a - b);
	        const start = ds[0] ? ds[0].toISOString().slice(0, 10) : '';
	        const end = ds.length ? ds[ds.length - 1].toISOString().slice(0, 10) : '';
	        return { start, end };
	    })();

	    return (
	        <div style={{ overflowX: 'auto' }}>
	            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
	                <thead>
	                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
	                        <th style={{ padding: '6px 8px' }}>Assessment_ID</th>
	                        <th style={{ padding: '6px 8px' }}>Program</th>
	                        <th style={{ padding: '6px 8px' }}>TEI</th>
	                        <th style={{ padding: '6px 8px' }}>Assessment date</th>
	                        <th style={{ padding: '6px 8px' }}>Authorised start</th>
	                        <th style={{ padding: '6px 8px' }}>Authorised end</th>
	                        <th style={{ padding: '6px 8px' }}>Type of assessment</th>
	                        <th style={{ padding: '6px 8px' }}>Facility type</th>
	                        <th style={{ padding: '6px 8px' }}>Status</th>
	                        <th style={{ padding: '6px 8px' }}>Actions</th>
	                    </tr>
	                </thead>
	                <tbody>
	                    {rows.map(ev => (
	                        <tr
	                            className={`associated-assessment-row ${loadingSurveyRow === (ev.event || ev.enrollmentId || ev.enrollment || ev.trackedEntityInstance || '') ? 'loading' : ''}`}
	                            key={`survey-${ev.enrollmentId || ev.enrollment || ev.event || ev.trackedEntityInstance}`}
	                            onClick={() => openAssociatedSurvey(assessment, ev)}
	                            style={{ borderTop: '1px dashed #eee', cursor: 'pointer' }}
	                            title="Open this survey for editing"
	                        >
	                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev._displayEventId || ev.event || '-'}</td>
	                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev.programId || '-'}</td>
	                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev.trackedEntityInstance || '-'}</td>
	                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{ev._assessmentDate ? new Date(ev._assessmentDate).toLocaleDateString() : 'N/A'}</td>
	                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{authDates.start || 'N/A'}</td>
	                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{authDates.end || 'N/A'}</td>
	                            <td style={{ padding: '6px 8px', color: '#334155' }}>{getTypeValue(ev)}</td>
		                            <td style={{ padding: '6px 8px', color: '#334155' }}>{getAssociatedAssessmentGroupValue(ev)}</td>
	                            <td style={{ padding: '6px 8px' }}>{getStatusValue(ev)}</td>
	                            <td style={{ padding: '6px 8px' }}>
	                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
	                                    <button
	                                        className="btn btn-secondary btn-xs"
	                                        onClick={(e) => {
	                                            e.stopPropagation();
	                                            const baselineDate = ev._baselineDate || null;
	                                            const ou = ev.orgUnit || assessment.orgUnitId || (typeof assessment.orgUnit === 'string' ? assessment.orgUnit : assessment.orgUnit?.id) || '';
	                                            const tei = ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || '';
			                                            const facilityGroup = getAssociatedAssessmentGroupValue(ev);
		                                            const reportProgramStageId = ev.programStage || ev.programStageId || getSurveyProgramStageIdForGroup(facilityGroup);
	                                            const q = new URLSearchParams({
	                                                facilityId: ou || '',
	                                                teiId: tei || '',
		                                                programId: ev.programId || getSurveyEventProgramIdForStage(reportProgramStageId, assessment),
		                                                programStageId: reportProgramStageId || '',
		                                                facilityGroup: facilityGroup || '',
	                                                start: baselineDate || '',
	                                                end: ev._assessmentDate || ev.eventDate || '',
	                                                eventId: ev._displayEventId || ev.event || ''
	                                            }).toString();
	                                            navigate(`/report?${q}`);
	                                        }}
	                                    >
	                                        View Report
	                                    </button>
	                                    <button
	                                        className="btn btn-secondary btn-xs"
	                                        onClick={(e) => {
	                                            e.stopPropagation();
		                                            openEditSeAssignments(assessment, ev, getAssociatedAssessmentGroupValue(ev), getTypeValue(ev));
	                                        }}
	                                    >
	                                        Edit SE Assignments
	                                    </button>
                                    <button
                                        className="btn btn-secondary btn-xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openAssociatedSurvey(assessment, ev);
                                        }}
                                    >
                                        Update Survey
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openTeamDialog(assessment);
                                        }}
                                    >
                                        Team ({Array.isArray(assessment.team) ? assessment.team.length : 0})
                                    </button>
	                                </div>
	                            </td>
	                        </tr>
	                    ))}
	                </tbody>
	            </table>
	        </div>
	    );
	};

	  // Open a modal to show team members for an assignment
  const openTeamDialog = async (assessment) => {
    const team = Array.isArray(assessment.team) ? assessment.team : [];
    const label = assessment.orgUnitName || assessment.facilityId || assessment.orgUnitId || '';
    setTeamDialogData({ orgUnitName: label, team, loading: true });
    setTeamDialogOpen(true);

    try {
      // Build list of identifiers (support composite values like "id|username")
      const ids = [];
      team.forEach(m => {
        const raw = String(m.assignedUserId || '').trim();
        if (!raw) return;
        raw.split('|').forEach(part => { const k = String(part || '').trim(); if (k) ids.push(k); });
      });
      const uniq = Array.from(new Set(ids));
      const map = await api.resolveUserDisplayNames(uniq);
      const enriched = team.map(m => {
        const raw = String(m.assignedUserId || '').trim();
        const keys = raw ? raw.split('|').map(s => s.trim()) : [];
        const hit = keys.map(k => map[k]).find(Boolean);
        return { ...m, displayName: hit?.displayName || raw };
      });
      const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
      enriched.sort((a, b) => {
        const ar = roleRank(a.teamRole);
        const br = roleRank(b.teamRole);
        if (ar !== br) return ar - br;
        const an = String(a.displayName || '').toLowerCase();
        const bn = String(b.displayName || '').toLowerCase();
        return an.localeCompare(bn);
      });
      setTeamDialogData({ orgUnitName: label, team: enriched, loading: false });
    } catch (e) {
      console.warn('Failed to resolve user display names (non-fatal)', e);
      setTeamDialogData(prev => ({ ...prev, loading: false }));
    }
  };

	    const getAssociatedAssessmentGroupValue = (ev) => {
	        if (ev?._type === 'Enrollment') {
	            return getAttributeValue(
	                ev.attributes,
	                SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityType,
	                ['assessment facility type']
	            ) || '-';
	        }
	        if (!surveyGroupDeId) return '-';
	        const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
	        const dv = sourceEvents
	            .flatMap(src => src?.dataValues || [])
	            .find(d => d.dataElement === surveyGroupDeId && d.value !== undefined && String(d.value).trim() !== '');
	        return dv?.value || '-';
	    };

    // Open a specific main-survey event from the associated-events table for editing
    const openAssociatedSurvey = async (assessment, ev) => {
        if (!ev?.event) return;
        const rowKey = ev.event || ev.enrollmentId || ev.enrollment || ev.trackedEntityInstance || '';
        setLoadingSurveyRow(rowKey);
        const withBaseline = { ...assessment, baselineEventId: ev.event };

        const assocKey = getAssocKey(assessment);
        let relatedEvents = [];
	        const clickedEnrollmentId = ev.enrollmentId || ev.enrollment || (ev._type === 'Enrollment' ? ev.event : null);
		        const clickedFacilityGroup = getAssociatedAssessmentGroupValue(ev);
	        const resolvedFacilityGroup = clickedFacilityGroup && clickedFacilityGroup !== '-'
	            ? clickedFacilityGroup
	            : (assessment?.parentGroupId || assessment?.facilityGroup || getAssessmentFacilityGroupKey(assessment) || '');
		        let resolvedProgramStageId = ev.programStage
	            || ev.programStageId
	            || getSurveyProgramStageIdForGroup(resolvedFacilityGroup)
	            || assessment?.programStageId
	            || configuration?.programStage?.id
	            || '';

        // The table now loads enrollments, which lack dataValues. Treat the clicked
        // enrollment as the pointer to the assessment bundle and fetch its actual
        // survey events only when the row is opened.
        const isEnrollmentRow = ev._type === 'Enrollment' || !Array.isArray(ev.dataValues);
	        if (isEnrollmentRow) {
            const teiId = ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || null;
            const orgUnitId = ev.orgUnit || assessment.orgUnitId || (typeof assessment.orgUnit === 'string' ? assessment.orgUnit : assessment.orgUnit?.id) || null;
	            const programId = ev.programId || getSurveyEventProgramIdForStage(resolvedProgramStageId, assessment);
	            const stageId = resolvedProgramStageId || configuration?.programStage?.id || '';

            if (clickedEnrollmentId) {
                try {
                    setLoadingSurveyInfo('Loading survey events…');
                    const fetched = await api.getEventsList({
                        programId,
                        enrollmentId: clickedEnrollmentId,
	                        fields: 'event,eventDate,status,program,programStage,orgUnit,trackedEntityInstance,enrollment,notes[note,value],dataValues[dataElement,value]'
                    });
                    relatedEvents = Array.isArray(fetched) ? fetched : [];
	                    const eventWithStage = relatedEvents.find(e => getSysTag(e) === 'FINAL' && e?.programStage)
	                        || relatedEvents.find(e => e?.programStage);
	                    if (eventWithStage?.programStage) {
	                        resolvedProgramStageId = eventWithStage.programStage;
	                    }
                } catch (e) {
                    console.warn('[openAssociatedSurvey] Failed to fetch events for clicked enrollment', clickedEnrollmentId, e);
                }
            }

            if (relatedEvents.length === 0 && teiId) {
                try {
                    setLoadingSurveyInfo('Fetching survey details…');
                    const fetched = await api.getSurveyEventsForTei({
                        teiId,
                        orgUnitId,
                        programId,
                        stageId,
                        fields: 'event,eventDate,status,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]'
                    });
                    relatedEvents = Array.isArray(fetched) ? fetched : [];
                } catch (e) {
                    console.warn('[openAssociatedSurvey] Fallback TEI event fetch failed for clicked enrollment', teiId, e);
                }
            }

            if (relatedEvents.length === 0) {
                showToast?.('No survey events found for this enrollment yet.', 'warning');
                setLoadingSurveyRow(null);
                setLoadingSurveyInfo(null);
                return;
            }
        }

        if (relatedEvents.length === 0) {
            // Fallback to old path when the row already contains actual event data.
            const allSurveyEvents = associatedByEnrollment[assocKey]?.survey || [];
            relatedEvents = Array.isArray(ev._bundleEvents) && ev._bundleEvents.length > 0
                ? [...ev._bundleEvents]
                : allSurveyEvents.filter(e => {
                    const sameTei = (e?.trackedEntityInstance || '') === (ev?.trackedEntityInstance || '');
                    const sameDate = e?.eventDate && ev?.eventDate && e.eventDate.substring(0, 10) === ev.eventDate.substring(0, 10);
                    return sameTei || sameDate;
                });
            if (relatedEvents.length === 0) relatedEvents.push(ev);
        }
        const primaryEvent = relatedEvents.find(e => getSysTag(e) === 'FINAL') || relatedEvents[0] || ev;

        // Preload ALL DE values from ALL related events so the form can render and score with complete context
        const preload = {};

        // Build the eventIdMap to know which event handles which SE
        const eventIdMap = {};

        relatedEvents.forEach(relatedEv => {
            const dvList = Array.isArray(relatedEv.dataValues) ? relatedEv.dataValues : [];
            dvList.forEach(dv => {
                if (dv && dv.dataElement) preload[dv.dataElement] = dv.value ?? '';
            });

            // Map the event ID based on its SYS_TAG data value
            const tag = getSysTag(relatedEv);
            if (tag) eventIdMap[tag] = relatedEv.event;
        });
	        if (primaryEvent?.event && !eventIdMap.FINAL) {
	            eventIdMap.FINAL = primaryEvent.event;
	        }

        // Save the eventIdMap into preload so App.jsx can use it
        preload['eventIdMap_internal'] = JSON.stringify(eventIdMap);
        if (clickedEnrollmentId) preload['enrollmentId_internal'] = clickedEnrollmentId;

        // The baseline assessment group comes from the primary (FINAL) event usually
        const ag = (primaryEvent.dataValues || []).find(d => d.dataElement === 'pzenrgsSny3');
        if (ag && ag.value !== undefined && String(ag.value).trim() !== '') {
            preload['pzenrgsSny3'] = ag.value;
        } else {
            // Fallback: resolve baseline Assessment Group from earliest event for this TEI
            try {
	                const programId = getSurveyEventProgramIdForStage(resolvedProgramStageId, assessment);
	                const stageId = resolvedProgramStageId || configuration?.programStage?.id || '';
                // Prefer TEI from the clicked event row; fall back to assignment
                const teiId = primaryEvent.trackedEntityInstance || ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || null;
                const orgUnitId = assessment.orgUnitId || (typeof assessment.orgUnit === 'string' ? assessment.orgUnit : assessment.orgUnit?.id) || null;
                if (teiId) {
                    setLoadingSurveyInfo('Resolving baseline group…');
                    const baselineGroup = await api.getBaselineAssessmentGroup({ teiId, orgUnitId, programId, stageId });
                    if (baselineGroup && String(baselineGroup).trim() !== '') {
                        preload['pzenrgsSny3'] = baselineGroup;
                    }
                }
            } catch (e) {
                console.warn('[AssocEvents] Could not resolve baseline Assessment Group (non-fatal)', e);
            }
        }
        if (surveyTypeDeId) {
            const tv = (primaryEvent.dataValues || []).find(d => d.dataElement === surveyTypeDeId);
            if (tv && tv.value !== undefined && String(tv.value).trim() !== '') {
                preload[surveyTypeDeId] = tv.value; // preload concrete value from server
            } else {
                // Explicitly clear any stale local value if server event has no Type of Assessment
                preload[surveyTypeDeId] = '';
            }
        }
        // Carry TEI so PUT can include trackedEntityInstance if needed
        if (primaryEvent.trackedEntityInstance || ev.trackedEntityInstance) preload['teiId_internal'] = primaryEvent.trackedEntityInstance || ev.trackedEntityInstance;

        const groupKey = toFacilityGroupKey(resolvedFacilityGroup);
        if (groupKey && !preload['pzenrgsSny3']) {
            preload['pzenrgsSny3'] = groupKey;
        }

	        const selected = {
	            ...withBaseline,
	            enrollment: clickedEnrollmentId || withBaseline.enrollment,
	            baselineEventId: primaryEvent.event,
	            programStageId: resolvedProgramStageId,
	            parentGroupId: groupKey,
	            facilityGroup: groupKey,
	            preloadDataValues: preload,
	            hydrateAll: true,
	            preloadMode: 'REPLACE'
	        };
        // Use the clicked enrollment/event as the form identity. Using the parent
        // assignment id here can reopen an older local draft bucket.
        const urlId = clickedEnrollmentId || primaryEvent.event || ev.event;
        const teiForUrl = primaryEvent.trackedEntityInstance || ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || '';
        setLoadingSurveyInfo('Preparing form…');
	        navigate(`/form?assessmentId=${encodeURIComponent(urlId || '')}&baselineId=${encodeURIComponent(primaryEvent.event || ev.event || '')}&draftKey=${encodeURIComponent(urlId || '')}&assessmentTeiId=${encodeURIComponent(teiForUrl)}${clickedEnrollmentId ? `&enrollmentId=${encodeURIComponent(clickedEnrollmentId)}` : ''}${resolvedProgramStageId ? `&programStageId=${encodeURIComponent(resolvedProgramStageId)}` : ''}${groupKey ? `&parentGroupId=${encodeURIComponent(groupKey)}&facilityGroup=${encodeURIComponent(groupKey)}` : ''}`, { state: { selectedAssignment: selected } });
    };

    const resolveOrgUnitForAssessment = (assessment) => {
        return (
            assessment?.orgUnitId ||
            (typeof assessment?.orgUnit === 'string' ? assessment.orgUnit : assessment?.orgUnit?.id) ||
            assessment?.facilityId ||
            assessment?.programOrgUnitId ||
            null
        );
    };

    const resolveTeiForAssessment = (assessment) => {
        return assessment?.trackedEntityInstance || assessment?.scheduleTeiId || null;
    };

		const assessmentHasBaselineSurvey = React.useCallback(async (assessment) => {
	        if (!assessment) return false;
		    const facilityOrgUnitId = resolveOrgUnitForAssessment(assessment);
	        if (!facilityOrgUnitId) return false;

	        // 1. Check enrollment attribute via TEI lookup (preferred)
	        const data = await api.getTeisByOrgUnitForBaselineCheck({
	            orgUnitId: facilityOrgUnitId,
	            programId: 'G2gULe4jsfs'
	        }).catch(() => null);

	        const hasBaselineFromTeis = data && Array.isArray(data.trackedEntityInstances) &&
	            data.trackedEntityInstances.some(tei => {
	                const attrs = tei.attributes || tei.enrollments?.[0]?.attributes || [];
	                return attrs.some(attr =>
	                    attr.attribute === 'qrTQdWKRYMB' &&
	                    String(attr.value || '').trim().toLowerCase() === 'baseline assessment'
	                );
	            });

	        if (hasBaselineFromTeis) return true;

	        // 2. Fallback: old event-based check for backward compatibility
	        if (!surveyTypeDeId) return false;
		    const stageId = getAssignmentProgramStageId(assessment);
	        const programId = getSurveyEventProgramIdForStage(stageId, assessment);
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
	    }, [surveyTypeDeId, isBaselineSurveyType]);

    const loadSelfAssessmentAssessors = React.useCallback(async (assessment) => {
        const orgUnitId = assessment?.facilityId || assessment?.orgUnitId || resolveOrgUnitForAssessment(assessment);
        setInitAssessorLookupInfo(null);
        if (!orgUnitId) {
            setInitTeamOptions([]);
            setInitAssignments({});
            setInitAssessorLookupInfo({ orgUnitId: null, userCount: 0, reason: 'No facility/orgUnit ID could be resolved.' });
            showToast?.('Could not resolve the selected facility for Self Assessment assessor lookup.', 'error');
            return [];
        }
        setInitTeamLoading(true);
        try {
            const userIds = await api.qimsTrackerEvents({ orgUnitId });
            const isUsableUserIdentifier = (value) => {
                const v = String(value || '').trim();
                if (!v) return false;
                const lower = v.toLowerCase();
                if (['active', 'completed', 'scheduled', 'cancelled', 'skipped', 'true', 'false', 'null', 'undefined'].includes(lower)) return false;
                return /^[A-Za-z][A-Za-z0-9]{10}$/.test(v) || /^[A-Za-z0-9._@-]{3,80}$/.test(v);
            };
            const uniqueIds = Array.from(new Set((userIds || []).map(v => String(v || '').trim()).filter(isUsableUserIdentifier)));
            if (uniqueIds.length === 0) {
                setInitTeamOptions([]);
                setInitAssignments({});
                setInitAssessorLookupInfo({ orgUnitId, userCount: 0, reason: 'No events matched WmnMQhFIaMu = active with uJCFQsE2Z4W user IDs.' });
                showToast?.('No Self Assessment assessors were found for this facility.', 'warning');
                return [];
            }
            let usersById = {};
            try {
                usersById = await api.resolveUsers(uniqueIds);
            } catch (adminResolveError) {
                console.warn('Admin resolver failed for Self Assessment assessors', adminResolveError);
                setInitTeamOptions([]);
                setInitAssignments({});
                setInitAssessorLookupInfo({
                    orgUnitId,
                    userCount: 0,
                    reason: `Could not call /email2/api/admin/resolve-users for: ${uniqueIds.join(', ')}`
                });
                showToast?.('Could not resolve Self Assessment assessor display names using the admin resolver.', 'error');
                return [];
            }
            const unresolvedAfterLookup = uniqueIds.filter(id => !usersById?.[id]);
            const resolved = uniqueIds.map(id => {
                const userInfo = usersById?.[id] || {};
                const displayName = userInfo.displayName || userInfo.username || '';
                if (!displayName) return null;
                return {
                    id: userInfo.id || id,
                    displayName,
                    role: 'Self Assessment'
                };
            }).filter(Boolean).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
            if (resolved.length === 0) {
                setInitTeamOptions([]);
                setInitAssignments({});
                setInitAssessorLookupInfo({
                    orgUnitId,
                    userCount: 0,
                    reason: `Found assessor identifier(s), but none resolved to DHIS2 users: ${uniqueIds.join(', ')}`
                });
                showToast?.('Self Assessment assessor IDs were found, but no display names could be resolved.', 'error');
                return [];
            }
            setInitTeamOptions(resolved);
            setInitAssignments({});
            setInitAssessorLookupInfo({
                orgUnitId,
                userCount: resolved.length,
                reason: unresolvedAfterLookup.length > 0 ? `Unresolved assessor ID(s): ${unresolvedAfterLookup.join(', ')}` : ''
            });
            if (unresolvedAfterLookup.length > 0) {
                showToast?.(`${resolved.length} assessor(s) loaded. ${unresolvedAfterLookup.length} unresolved ID(s) were skipped.`, 'warning');
            }
            showToast?.(`Loaded ${resolved.length} Self Assessment assessor${resolved.length === 1 ? '' : 's'} for this facility.`, 'success');
            return resolved;
        } catch (e) {
            console.warn('Self Assessment assessor lookup failed', e);
            setInitTeamOptions([]);
            setInitAssignments({});
            setInitAssessorLookupInfo({ orgUnitId, userCount: 0, reason: e?.message || 'Lookup failed.' });
            showToast?.('Failed to load Self Assessment assessors for this facility.', 'error');
            return [];
        } finally {
            setInitTeamLoading(false);
        }
    }, [showToast]);

			    const handleOpenAssessment = async (assessment, { forceDialog = false } = {}) => {
		        const actionKey = getAssessmentActionKey(assessment);
		        setInitiatingAssessmentKey(actionKey);
		        setLoadingSurveyInfo('Initiating survey....');
		        try {
		            const resolvedFacilityGroup = getAssessmentFacilityGroupKey(assessment)
		                || toFacilityGroupKey(getAssignmentFacilityGroupValue(assessment));
		            const stageId = getAssignmentProgramStageId(assessment);
			            const programId = getSurveyEventProgramIdForStage(stageId, assessment);
            const orgUnitId = resolveOrgUnitForAssessment(assessment);
            const teiId = resolveTeiForAssessment(assessment);

            if (!orgUnitId || !teiId) {
	                const selected = {
	                    ...assessment,
	                    programStageId: stageId,
	                    parentGroupId: assessment?.parentGroupId || resolvedFacilityGroup || assessment?.facilityGroup,
	                };
	                navigate(
	                    `/form?assessmentId=${encodeURIComponent(assessment.eventId || '')}${stageId ? `&programStageId=${encodeURIComponent(stageId)}` : ''}`,
	                    { state: { selectedAssignment: selected } }
	                );
                return;
            }

            // New model: one TEI represents one assessment, so hydrate the full
            // assessment bundle (FINAL + all SE events) before opening the form.
            setLoadingSurveyInfo('Checking for existing surveys...');
            let surveyEvents = [];
            try {
                surveyEvents = await api.getSurveyEventsForTei({
                    teiId,
                    orgUnitId,
                    programId,
                    stageId,
                    fields: 'event,eventDate,status,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]'
                });
            } catch (e) {
                console.warn('[Dashboard] Could not fetch assessment event bundle', e);
            }

            if (!forceDialog && Array.isArray(surveyEvents) && surveyEvents.length > 0) {
                const preload = {};
                const eventIdMap = {};
                let finalEventId = null;

                surveyEvents.forEach(ev => {
                    const dvList = Array.isArray(ev.dataValues) ? ev.dataValues : [];
                    dvList.forEach(dv => {
                        if (dv && dv.dataElement) preload[dv.dataElement] = dv.value ?? '';
                    });

                    const tag = getSysTag(ev);
                    if (tag) {
                        eventIdMap[tag] = ev.event;
                        if (tag === 'FINAL') finalEventId = ev.event;
                    }
                });

                if (!finalEventId) {
                    finalEventId = eventIdMap.FINAL || surveyEvents[0]?.event || null;
                }
	                if (finalEventId && !eventIdMap.FINAL) {
	                    eventIdMap.FINAL = finalEventId;
	                }

                if (Object.keys(eventIdMap).length > 0) {
                    preload['eventIdMap_internal'] = JSON.stringify(eventIdMap);
                }
                preload['teiId_internal'] = teiId;

                // Carry concrete Assessment Details values when present
                const finalEvent = surveyEvents.find(ev => ev.event === finalEventId) || surveyEvents[0];
                if (finalEvent && surveyTypeDeId) {
                    const tv = (finalEvent.dataValues || []).find(d => d.dataElement === surveyTypeDeId);
                    if (tv && tv.value !== undefined) preload[surveyTypeDeId] = tv.value;
                }
                const ag = (finalEvent?.dataValues || []).find(d => d.dataElement === 'pzenrgsSny3');
                if (ag && ag.value !== undefined && String(ag.value).trim() !== '') {
                    preload['pzenrgsSny3'] = ag.value;
                }

                const selected = {
                    ...assessment,
                    trackedEntityInstance: teiId,
                    scheduleTeiId: teiId,
                    baselineEventId: finalEventId,
	                    programStageId: stageId,
	                    parentGroupId: assessment?.parentGroupId || resolvedFacilityGroup || assessment?.facilityGroup,
                    preloadDataValues: preload,
                    hydrateAll: true,
                    preloadMode: 'REPLACE'
                };
                const urlId = assessment.eventId || assessment.enrollment || finalEventId;
                navigate(
	                    `/form?assessmentId=${encodeURIComponent(urlId)}&baselineId=${encodeURIComponent(finalEventId || '')}&draftKey=${encodeURIComponent(finalEventId || urlId)}&assessmentTeiId=${encodeURIComponent(teiId)}&programStageId=${encodeURIComponent(stageId)}`,
                    { state: { selectedAssignment: selected } }
                );
                return;
            }

            const team = (assessment.teamAssignments || [])
                .filter(m => m && m.assignedUserId)
                .map(m => ({ ...m }));

            const ids = team.map(m => String(m.assignedUserId || '').trim()).filter(Boolean);
            const uniq = Array.from(new Set(ids));
            const scheduledTypeValue = getAssignmentTypeValue(assessment);
            const scheduledGroupKey = toFacilityGroupKey(resolvedFacilityGroup || getAssignmentFacilityGroupValue(assessment));
            setLoadingSurveyInfo('Loading assessment data...');
            // Fetch baseline status, team names and metadata in parallel
            const [mapResult, hasExistingBaseline, selectedMetadata] = await Promise.all([
                api.resolveUserDisplayNames(uniq).catch(() => ({}))
                    .then(map => {
                        const resolved = team.map(m => {
                            const raw = String(m.assignedUserId || '').trim();
                            const keys = raw ? raw.split('|').map(s => s.trim()) : [];
                            const hit = keys.map(k => map[k]).find(Boolean);
                            return { id: raw, displayName: hit?.displayName || raw, role: m.teamRole };
                        });
                        const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
                        resolved.sort((a, b) => {
                            const ar = roleRank(a.role); const br = roleRank(b.role);
                            if (ar !== br) return ar - br;
                            return String(a.displayName||'').localeCompare(String(b.displayName||''));
                        });
                        return resolved;
                    })
                    .catch(() => []),
                assessmentHasBaselineSurvey(assessment).catch(() => false),
                Object.keys(SURVEY_PROGRAM_STAGE_BY_GROUP).includes(scheduledGroupKey) ? ensureSurveyMetadataForGroup(scheduledGroupKey).catch(() => null) : ensureSurveyMetadataForGroup(Object.keys(SURVEY_PROGRAM_STAGE_BY_GROUP)[0] || 'HOSPITAL').catch(() => null)
            ]);

            setInitTeamOptions(mapResult);
            if (selectedMetadata) setInitProgramStageMetadata(selectedMetadata);
            else setInitProgramStageMetadata(null);
		            const effectiveTypeOptions = getSurveyTypeOptionsFromMetadata(selectedMetadata).length > 0
		                ? getSurveyTypeOptionsFromMetadata(selectedMetadata)
		                : surveyTypeOptions;
		            const baselineOpt = (effectiveTypeOptions || []).find(opt => isBaselineSurveyType(opt.label || opt.value));
		            const firstSurveyType = baselineOpt?.value
		                || (isBaselineSurveyType(scheduledTypeValue) ? scheduledTypeValue : '');
	            setInitHasExistingBaseline(hasExistingBaseline);
	            setInitSurveyType(!hasExistingBaseline ? firstSurveyType : '');
	            const validGroupKeys = Object.keys(SURVEY_PROGRAM_STAGE_BY_GROUP);
	            const safeGroupKey = validGroupKeys.includes(scheduledGroupKey) ? scheduledGroupKey : '';
	            setInitFacilityGroup(safeGroupKey);
	            if (safeGroupKey) {
		                setInitSeOptions(buildSeOptions(safeGroupKey, selectedMetadata));
	            } else {
	                setInitSeOptions([]);
	            }
            setInitAssignments({});
            setInitTeamLoading(false);
            setInitAssessorLookupInfo(null);

            setPendingOpenAssessment(assessment);
            setInitMode('BASELINE');
            setInitEditAssignmentsOnly(false);
            setLockType(false); setLockGroup(false);
            setPendingProvisionedBundle(null);
            setCreateErrorInfo(null);
            setCreateDetails([]);
            setLoadingSurveyInfo('Preparing survey dialog...');
            setShowCreateBaselineDialog(true);
        } catch (err) {
            console.error('Error opening assessment:', err);
            showToast?.('Could not open assessment. Please try again.', 'error');
        } finally {
            setInitiatingAssessmentKey(null);
            setLoadingSurveyInfo(null);
        }
    };

	    // New explicit initiate handler. Non-self assessment TEIs are single-use:
        // if the scheduling TEI already has a survey event, open that survey instead
        // of offering another initiation on the same TEI. Self Assessment can still
        // create its own new TEI from the dialog when explicitly requested.
    const handleInitiateSurvey = async (assessment, { selfOnly = false } = {}) => {
	        const actionKey = getAssessmentActionKey(assessment);
        setInitiatingAssessmentKey(actionKey);
			        try {
			            const stageId = getAssignmentProgramStageId(assessment);
			            const programId = getSurveyEventProgramIdForStage(stageId, assessment);
            const orgUnitId = resolveOrgUnitForAssessment(assessment);
            const teiId = resolveTeiForAssessment(assessment);
            let latestEventId = null;
	            try { latestEventId = await api.getLatestSurveyEventId({ programId, stageId, teiId, orgUnitId: null }); } catch (_) {}
            if (latestEventId) {
	                if (selfOnly) {
	                    await openInitiateSurveyFollowUp(assessment, { selfOnly: true });
	                    return;
	                }
	                showToast?.('This scheduled TEI already has a survey. Non-self survey types require a new TEI from the scheduling program.', 'warning');
	                await handleOpenAssessment(assessment);
                return;
            }
            // Else, use the baseline initiation path from handleOpenAssessment
            await handleOpenAssessment(assessment);
        } catch (e) {
            console.warn('handleInitiateSurvey failed', e);
        } finally {
            setInitiatingAssessmentKey(null);
        }
    };

    // Allow initiating a new survey even if a baseline already exists (Lead only).
    // In this follow-up mode, we lock Facility Group to the baseline's group. Type of
    // Survey is left open unless selfOnly=true, in which case we lock to Self Assessment
    // and only allow Self in the dialog.
    const openInitiateSurveyFollowUp = async (assessment, { selfOnly = false } = {}) => {
        const actionKey = getAssessmentActionKey(assessment);
        setInitiatingAssessmentKey(actionKey);
        setLoadingSurveyInfo(selfOnly ? 'Opening self-assessment setup\u2026' : 'Preparing follow-up survey\u2026');
        try {
            const team = Array.isArray(assessment.team) ? assessment.team : [];
            const ids = [];
            team.forEach(m => { const raw = String(m.assignedUserId || '').trim(); if (raw) raw.split('|').forEach(p => ids.push(p.trim())); });
            const uniq = Array.from(new Set(ids));

            // Parallel: team names, baseline check, and baseline group lookup
            const [mapResult, hasExistingBaseline, baselineGroupText] = await Promise.all([
                api.resolveUserDisplayNames(uniq).catch(() => ({}))
                    .then(map => {
                        const resolved = team.map(m => {
                            const raw = String(m.assignedUserId || '').trim();
                            const keys = raw ? raw.split('|').map(s => s.trim()) : [];
                            const hit = keys.map(k => map[k]).find(Boolean);
                            return { id: raw, displayName: hit?.displayName || raw, role: m.teamRole };
                        });
                        const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
                        resolved.sort((a, b) => { const ar = roleRank(a.role); const br = roleRank(b.role); if (ar !== br) return ar - br; return String(a.displayName||'').localeCompare(String(b.displayName||'')); });
                        return resolved;
                    })
                    .catch(() => []),
                assessmentHasBaselineSurvey(assessment),
                api.getBaselineAssessmentGroup({ teiId: resolveTeiForAssessment(assessment), orgUnitId: resolveOrgUnitForAssessment(assessment), programId: getSurveyEventProgramIdForStage(getAssignmentProgramStageId(assessment), assessment), stageId: getAssignmentProgramStageId(assessment) }).catch(() => null)
            ]);

            setInitTeamOptions(mapResult);
            setInitHasExistingBaseline(hasExistingBaseline);

            const toGroupKey = (txt) => {
                const t = String(txt || '').toLowerCase();
                if (t.includes('hosp')) return 'HOSPITAL';
                if (t.includes('clinic')) return 'CLINICS';
                if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'EMS';
                if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
                return '';
            };
            const grp = toGroupKey(baselineGroupText)
                || getAssessmentFacilityGroupKey(assessment)
                || toFacilityGroupKey(getAssignmentFacilityGroupValue(assessment));
            let selectedMetadata = null;
            if (grp) {
                setInitFacilityGroup(grp);
                setLoadingSurveyInfo('Loading assessment metadata\u2026');
                selectedMetadata = await ensureSurveyMetadataForGroup(grp);
                setInitProgramStageMetadata(selectedMetadata);
                setInitSeOptions(buildSeOptions(grp, selectedMetadata));
                setLockGroup(true);
            } else {
                setInitProgramStageMetadata(null);
            }
            if (selfOnly) {
		                const loadedTypeOptions = getSurveyTypeOptionsFromMetadata(selectedMetadata);
		                const effectiveTypeOptions = loadedTypeOptions.length > 0
		                    ? loadedTypeOptions
	                    : surveyTypeOptions;
	                const selfOpt = (effectiveTypeOptions || []).find(o => isSelfSurveyType(o.label || o.value) ) || (effectiveTypeOptions || [])[0];
                if (selfOpt) setInitSurveyType(selfOpt.value);
                await loadSelfAssessmentAssessors(assessment);
                setLockType(true);
                setForceSelfOnly(true);
            } else {
                // Leave Type of Survey open in follow-up mode
                setInitSurveyType('');
                setLockType(false);
                setForceSelfOnly(false);
            }

            setInitAssignments({});
            setInitTeamLoading(false);
            if (!selfOnly) setInitAssessorLookupInfo(null);
            setPendingOpenAssessment(assessment);
            setInitMode('FOLLOWUP');
            setInitEditAssignmentsOnly(false);
            setPendingProvisionedBundle(null);
            setCreateErrorInfo(null);
            setCreateDetails([]);
            setLoadingSurveyInfo('Preparing survey dialog...');
            setShowCreateBaselineDialog(true);
        } catch (e) {
            console.warn('openInitiateSurveyFollowUp failed', e);
        } finally {
            setInitiatingAssessmentKey(null);
            setLoadingSurveyInfo(null);
        }
    };

    const loadPreviousPlan = async () => {
        if (!pendingOpenAssessment) return;
        try {
            setInitPlanLoading(true);
            const teiId = resolveTeiForAssessment(pendingOpenAssessment);
            // Try selected group first, else probe all
            const candidates = [];
            if (initFacilityGroup) candidates.push(String(initFacilityGroup).toUpperCase());
            ['HOSPITAL','CLINICS','EMS','MORTUARY'].forEach(ns => { if (!candidates.includes(ns)) candidates.push(ns); });
            let found = null; let nsHit = null;
            for (const ns of candidates) {
                try {
                    const v = await api.getDataStoreItem(ns, teiId);
                    if (v && v.teiId) { found = v; nsHit = ns; break; }
                } catch (_) { /* continue */ }
            }
            if (!found) {
                showToast?.('No previous plan found for this assessment.', 'info');
                return;
            }
            // Set survey details
            const grp = String(found.facilityGroup || nsHit || '').toUpperCase();
            setInitFacilityGroup(grp);
		            const metadata = await ensureSurveyMetadataForGroup(grp);
		            setInitProgramStageMetadata(metadata);
	            const seOpts = buildSeOptions(grp, metadata);
            setInitSeOptions(seOpts);
	            const loadedTypeOptions = getSurveyTypeOptionsFromMetadata(metadata);
	            const effectiveTypeOptions = loadedTypeOptions.length > 0 ? loadedTypeOptions : surveyTypeOptions;
	            const toCode = (val) => {
	                const m = (effectiveTypeOptions || []).find(o => o.value === val || o.label === val);
                return m ? m.value : val;
            };
            const previousType = toCode(found.typeOfAssessment || '');
            if (initMode === 'BASELINE' && !initHasExistingBaseline && !isBaselineSurveyType(previousType)) {
	                const baselineOpt = (effectiveTypeOptions || []).find(opt => isBaselineSurveyType(opt.label || opt.value));
                setInitSurveyType(baselineOpt?.value || '');
                showToast?.('No Baseline exists yet, so only Baseline Assessment can be used for first-time initiation.', 'warning');
            } else if (isSupportiveSurveyType(previousType)) {
                setInitSurveyType('');
                showToast?.('Previous plan used Supportive, but Supportive is no longer available. Please choose another Type of Survey.', 'warning');
            } else if (initHasExistingBaseline && isBaselineSurveyType(previousType)) {
                setInitSurveyType('');
                showToast?.('Previous plan used Baseline, but this facility already has a Baseline. Please choose another Type of Survey.', 'warning');
            } else {
                setInitSurveyType(previousType);
            }
            setInitAssignments(found.seAssignments || {});
            // Merge team from plan with current options
            const cur = Array.isArray(initTeamOptions) ? initTeamOptions : [];
            const planTeam = Array.isArray(found.team) ? found.team.map(t => ({ id: t.userId || t.id, displayName: t.displayName || t.userId || t.id, role: t.role })) : [];
            const byId = new Map(cur.map(t => [t.id, t]));
            planTeam.forEach(t => { if (t && t.id && !byId.has(t.id)) byId.set(t.id, t); });
            // Keep Lead first
            const merged = Array.from(byId.values());
            const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
            merged.sort((a, b) => { const ar = roleRank(a.role); const br = roleRank(b.role); if (ar !== br) return ar - br; return String(a.displayName||'').localeCompare(String(b.displayName||'')); });
            setInitTeamOptions(merged);
            showToast?.('Previous plan loaded.', 'success');
        } catch (e) {
            console.warn('Load previous plan failed', e);
            showToast?.('Failed to load previous plan.', 'error');
        } finally {
            setInitPlanLoading(false);
        }
    };

    const randomizeSeAssignments = () => {
        try {
            const teamIds = (initTeamOptions || []).map(t => t.id).filter(Boolean);
            const seList = initSeOptions || [];
            if (teamIds.length === 0 || seList.length === 0) {
	                showToast?.('Add team members and select a Facility Type (to load SEs) before randomizing.', 'warning');
                return;
            }
            // Shuffle team for fairness (Fisher–Yates)
            const shuffled = [...teamIds];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const next = {};
            seList.forEach((se, idx) => {
                const assignee = shuffled[idx % shuffled.length];
                next[se.id] = [assignee]; // one assignee per SE by default
            });
            setInitAssignments(next);
            showToast?.('SE assignments randomized across team.', 'success');
        } catch (e) {
            console.warn('Randomize assignments failed', e);
        }
    };

    const openEditSeAssignments = async (assessment, ev, facilityGroupValue = '', surveyTypeValue = '') => {
        try {
            setIsBaselineCreating(false);
            setCreateProgress(null);
            setCreateErrorInfo(null);
            setCreateDetails([]);
            setPendingProvisionedBundle(null);
            setInitPlanLoading(true);

            const teiId = ev?.trackedEntityInstance || resolveTeiForAssessment(assessment);
            const orgUnitId = ev?.orgUnit || resolveOrgUnitForAssessment(assessment);
            if (!teiId) {
                showToast?.('Could not resolve the assessment TEI for assignment editing.', 'error');
                return;
            }

            const preferredGroup = toFacilityGroupKey(facilityGroupValue || assessment?.parentGroupId || '');
            const { plan, nsKey } = await findAssessmentPlanForTei({ teiId, preferredNs: preferredGroup });
            const groupKey = toFacilityGroupKey(plan?.facilityGroup || nsKey || preferredGroup);
            if (!groupKey) {
                showToast?.('Could not determine the Facility Type for this assessment.', 'error');
                return;
            }

            const team = Array.isArray(assessment.team) ? assessment.team : [];
            const ids = [];
            team.forEach(m => { const raw = String(m.assignedUserId || '').trim(); if (raw) raw.split('|').forEach(p => ids.push(p.trim())); });
            const uniq = Array.from(new Set(ids));
            const map = await api.resolveUserDisplayNames(uniq).catch(() => ({}));
            const currentTeam = team.map(m => {
                const raw = String(m.assignedUserId || '').trim();
                const keys = raw ? raw.split('|').map(s => s.trim()) : [];
                const hit = keys.map(k => map[k]).find(Boolean);
                return { id: raw, displayName: hit?.displayName || raw, role: m.teamRole };
            }).filter(t => t.id);
            const planTeam = Array.isArray(plan?.team)
                ? plan.team.map(t => ({ id: t.userId || t.id, displayName: t.displayName || t.userId || t.id, role: t.role }))
                : [];
            const byId = new Map();
            [...currentTeam, ...planTeam].forEach(t => { if (t?.id && !byId.has(t.id)) byId.set(t.id, t); });
            const mergedTeam = Array.from(byId.values());
            const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
            mergedTeam.sort((a, b) => { const ar = roleRank(a.role); const br = roleRank(b.role); if (ar !== br) return ar - br; return String(a.displayName||'').localeCompare(String(b.displayName||'')); });

            setPendingOpenAssessment({ ...assessment, trackedEntityInstance: teiId, orgUnitId });
            setInitMode('EDIT_ASSIGNMENTS');
            setInitEditAssignmentsOnly(true);
            setInitHasExistingBaseline(false);
            setInitFacilityGroup(groupKey);
		            const metadata = await ensureSurveyMetadataForGroup(groupKey);
		            setInitProgramStageMetadata(metadata);
	            const loadedTypeOptions = getSurveyTypeOptionsFromMetadata(metadata);
	            const effectiveTypeOptions = loadedTypeOptions.length > 0 ? loadedTypeOptions : surveyTypeOptions;
	            const toSurveyTypeCode = (val) => {
	                if (!val || val === '-') return '';
	                const m = (effectiveTypeOptions || []).find(o => o.value === val || o.label === val);
	                return m ? m.value : val;
	            };
	            setInitSeOptions(buildSeOptions(groupKey, metadata));
            setInitSurveyType(toSurveyTypeCode(plan?.typeOfAssessment || surveyTypeValue || ''));
            setInitAssignments(plan?.seAssignments || {});
            setInitTeamOptions(mergedTeam);
            setLockType(true);
            setLockGroup(true);
            setForceSelfOnly(false);
            setShowCreateBaselineDialog(true);
        } catch (e) {
            console.warn('openEditSeAssignments failed', e);
            showToast?.('Failed to load SE assignments for editing.', 'error');
        } finally {
            setInitPlanLoading(false);
        }
    };

    const saveEditedSeAssignments = async () => {
        if (!pendingOpenAssessment) { setShowCreateBaselineDialog(false); return; }
        try {
            setIsBaselineCreating(true);
	            const stageId = getSurveyProgramStageIdForGroup(initFacilityGroup) || configuration?.programStage?.id || '';
	            const programId = getSurveyEventProgramIdForStage(stageId, pendingOpenAssessment);
            const orgUnitId = resolveOrgUnitForAssessment(pendingOpenAssessment);
            const teiId = resolveTeiForAssessment(pendingOpenAssessment);
            const ns = toFacilityGroupKey(initFacilityGroup);

            if (!teiId || !ns) {
                showToast?.('Could not resolve this assessment for assignment saving.', 'error');
                return;
            }
            if (!allSeAssigned) {
                showToast?.('Please assign at least one team member to every SE before saving.', 'error');
                return;
            }

            let existingPlan = null;
            try { existingPlan = await api.getDataStoreItem(ns, teiId); } catch (_) {}
            const body = {
                ...(existingPlan && typeof existingPlan === 'object' ? existingPlan : {}),
                teiId,
                orgUnitId,
                programId,
                stageId,
                facilityGroup: ns,
                typeOfAssessment: initSurveyType || existingPlan?.typeOfAssessment || '',
                team: initTeamOptions.map(t => ({ userId: t.id, displayName: t.displayName, role: t.role })),
                seAssignments: initAssignments,
                updatedBy: user?.id || null,
                updatedByName: user?.displayName || user?.username || null,
                updatedAt: new Date().toISOString(),
                createdBy: existingPlan?.createdBy || user?.id || null,
                createdByName: existingPlan?.createdByName || user?.displayName || user?.username || null,
                createdAt: existingPlan?.createdAt || new Date().toISOString(),
            };
            await api.upsertDataStoreItem(ns, teiId, body);
            showToast?.('SE assignments updated. Existing assessment events were not recreated.', 'success');
            cancelCreateBaseline();
        } catch (e) {
            console.warn('saveEditedSeAssignments failed', e);
            showToast?.('Failed to save SE assignments.', 'error');
        } finally {
            setIsBaselineCreating(false);
        }
    };

    const confirmCreateBaseline = async () => {
        if (!pendingOpenAssessment) { setShowCreateBaselineDialog(false); return; }
        try {
            setIsBaselineCreating(true);
            setCreateErrorInfo(null);
            setCreateDetails([]);
            setPendingProvisionedBundle(null);
		            let programId = SURVEY_ASSESSMENTS_PROGRAM_ID;
	            let stageId = configuration?.programStage?.id || '';
	            let trackedEntityTypeId = configuration?.program?.trackedEntityType?.id || 'uTTDt3fuXZK';
            const orgUnitId = resolveOrgUnitForAssessment(pendingOpenAssessment);
            let teiId = resolveTeiForAssessment(pendingOpenAssessment);
            let enrollmentId = null;
            const updateCreateProgress = (current, total, message, extra = null) => {
                setCreateProgress({ current, total, message });
                setCreateDetails(prev => {
                    const next = [...prev];
                    if (!next.length || next[next.length - 1] !== message) next.push(message);
                    if (extra) next.push(extra);
                    return next;
                });
            };
            if (!initSurveyType || !initFacilityGroup) {
	                showToast?.('Please select Type of Survey and Facility Type.', 'error');
                setIsBaselineCreating(false);
                return;
            }

		            const selectedStageMetadata = await ensureSurveyMetadataForGroup(initFacilityGroup);
		            programId = selectedStageMetadata?.program?.id || programId;
		            stageId = selectedStageMetadata?.id || getSurveyProgramStageIdForGroup(initFacilityGroup);
		            trackedEntityTypeId = selectedStageMetadata?.program?.trackedEntityType?.id || trackedEntityTypeId;
			            const selectedStageDataElementIds = (selectedStageMetadata?.programStageDataElements || [])
			                .map(psde => psde?.dataElement?.id || psde?.id)
			                .filter(Boolean);
			            const allowedAssessmentDetailDataElementIds = selectedStageDataElementIds.length > 0
			                ? selectedStageDataElementIds
			                : null;
			            const excludedAssessmentDetailDataElementIds = stageId === 'hup8BqEe7Mn'
			                ? ['pzenrgsSny3']
			                : [];
		            const provisioningSeOptions = buildSeOptions(initFacilityGroup, selectedStageMetadata);
	            if (provisioningSeOptions.length === 0) {
	                showToast?.('No SE sections were found for this Facility Type. Survey initialization was blocked.', 'error');
	                setIsBaselineCreating(false);
	                return;
	            }
	            const currentSeIds = (initSeOptions || []).map(se => String(se.id)).join('|');
	            const provisioningSeIds = provisioningSeOptions.map(se => String(se.id)).join('|');
	            if (currentSeIds !== provisioningSeIds) {
	                setInitSeOptions(provisioningSeOptions);
	                setCreateDetails(prev => [...prev, `SE list refreshed from live metadata: ${provisioningSeOptions.map(se => se.id).join(', ')}`]);
	            }
	            const unassignedSeOptions = provisioningSeOptions.filter(se => {
	                const assignedUsers = initAssignments[se.id] || [];
	                return !Array.isArray(assignedUsers) || assignedUsers.length === 0;
	            });
	            if (unassignedSeOptions.length > 0) {
	                showToast?.(`Please assign at least one team member to every SE before proceeding. Missing: ${unassignedSeOptions.map(se => se.id).join(', ')}`, 'error');
                setIsBaselineCreating(false);
                return;
            }

	            const selectedTypeMeta = (initSurveyTypeOptions || []).find(o => o.value === initSurveyType);
            if (initMode === 'BASELINE' && !initHasExistingBaseline && !isBaselineSurveyType(selectedTypeMeta?.label || selectedTypeMeta?.value || initSurveyType)) {
                showToast?.('First-time survey initiation must use Baseline Assessment.', 'error');
                setIsBaselineCreating(false);
                return;
            }
            if (isSupportiveSurveyType(selectedTypeMeta?.label || selectedTypeMeta?.value || initSurveyType)) {
                showToast?.('Supportive is no longer available as a Type of Survey. Please choose another Type of Survey.', 'error');
                setIsBaselineCreating(false);
                return;
            }
            const isBaselineSelected = isBaselineSurveyType(selectedTypeMeta?.label || selectedTypeMeta?.value || initSurveyType);
            const hasExistingBaselineNow = isBaselineSelected
                ? (initHasExistingBaseline || await assessmentHasBaselineSurvey(pendingOpenAssessment))
                : false;
            if (isBaselineSelected && hasExistingBaselineNow) {
                setInitHasExistingBaseline(true);
                showToast?.('A Baseline survey already exists for this facility. Please choose a different Type of Survey.', 'error');
                setIsBaselineCreating(false);
                return;
            }
	            const isSelfSelected = isSelfSurveyType(selectedTypeMeta?.label || selectedTypeMeta?.value || initSurveyType);
	            if (!isSelfSelected && teiId) {
	                const [existingEventId, existingSurveyEnrollments] = await Promise.all([
	                    api.getLatestSurveyEventId({ programId, stageId, teiId, orgUnitId: null }).catch(() => null),
	                    api.getEnrollmentsForTei(teiId, programId).catch(() => [])
	                ]);
	                const hasExistingSurveyEnrollment = (existingSurveyEnrollments || []).some(enr => enr?.enrollment && !enr?.deleted);
	                if (existingEventId || hasExistingSurveyEnrollment) {
	                    const message = 'This scheduled TEI has already been used for a survey. Non-self survey types can only be initiated from a newly scheduled TEI.';
	                    setCreateDetails(prev => [...prev, message]);
	                    showToast?.(message, 'error');
	                    setIsBaselineCreating(false);
	                    return;
	                }
	            }
	            const totalSteps = 3;

            const extraAttributes = [
                { attribute: 'qrTQdWKRYMB', value: initSurveyType || '' },
                { attribute: 'ZAcSwTShzlN', value: initFacilityGroup || '' },
                { attribute: 'SlXgujGsSqv', value: 'FAC_ASS_STATUS_IN_PROGRESS' }
            ];

	            // New model: every Self Assessment gets its own assessment TEI.
	            // Non-self assessments use the TEI issued by the scheduling program,
	            // and that scheduled TEI is single-use for survey initiation.
            const generateDhis2Uid = () => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                let result = chars.charAt(Math.floor(Math.random() * 52)); // Start with letter
                for (let i = 0; i < 10; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            };

            const existingResolvedTeiId = teiId;
            let isNewTei = false;
            if (isSelfSelected) {
                teiId = generateDhis2Uid();
                isNewTei = true;
                if (existingResolvedTeiId) {
                    setCreateDetails(prev => [...prev, `Self assessment will use a new TEI instead of existing TEI: ${existingResolvedTeiId}`]);
                }
                setCreateDetails(prev => [...prev, `Generated assessment TEI: ${teiId}`]);
            } else if (!teiId) {
                throw new Error('Could not resolve the selected assessment TEI.');
            }

            // DHIS2 permits only one ACTIVE enrollment per TEI/program. Before
            // creating a fresh assessment enrollment, close any existing active
            // survey-program enrollment so each assessment can still map to its
            // own enrollment/event bundle.
            if (teiId && !isNewTei) {
                const existingSurveyEnrollments = await api.getEnrollmentsForTei(teiId, programId).catch(() => []);
                const activeSurveyEnrollments = (existingSurveyEnrollments || []).filter(enr =>
                    enr?.enrollment &&
                    !enr?.deleted &&
                    String(enr.status || '').toUpperCase() === 'ACTIVE'
                );
                for (const activeEnrollment of activeSurveyEnrollments) {
                    await api.completeEnrollment(activeEnrollment.enrollment);
                    setCreateDetails(prev => [...prev, `Completed previous active enrollment: ${activeEnrollment.enrollment}`]);
                }
            }

            // Each newly initiated assessment must have its own survey-program
            // enrollment so the associated table row maps to one event bundle.
            enrollmentId = generateDhis2Uid();
            setCreateDetails(prev => [...prev, `Generated enrollment: ${enrollmentId}`]);

            // Persist SE assignment plan in DataStore under namespace={facilityGroup} key={teiId}
            const ns = String(initFacilityGroup).toUpperCase();
            let existingPlan = null;
            try {
                existingPlan = await api.getDataStoreItem(ns, teiId);
            } catch (e) {
                console.warn('DataStore read before overwrite check failed (non-fatal)', e);
            }
            const hasExistingPlan = !!(existingPlan && typeof existingPlan === 'object' && Object.keys(existingPlan).length > 0);
            if (hasExistingPlan) {
                const overwriteConfirmed = window.confirm(
                    'Assigned sections already exist for this assessment. Do you want to overwrite the existing assignments?'
                );
                if (!overwriteConfirmed) {
                    showToast?.('Overwrite cancelled. Existing assigned sections were kept.', 'info');
                    return;
                }
            }
            const body = {
                teiId, enrollmentId, orgUnitId, programId, stageId,
                facilityGroup: ns,
                typeOfAssessment: initSurveyType,
                team: initTeamOptions.map(t => ({ userId: t.id, displayName: t.displayName, role: t.role })),
                seAssignments: initAssignments,
                createdBy: user?.id || null,
                createdByName: user?.displayName || user?.username || null,
                createdAt: new Date().toISOString(),
            };
            try { await api.upsertDataStoreItem(ns, teiId, body); } catch (e) { console.warn('DataStore upsert failed (non-fatal)', e); }

            // Prepare Assessment/Facility Details values to stamp onto every created event.
            const assessmentDetailsDataValues = buildAssessmentDetailsDataValues(pendingOpenAssessment, {
                teiId,
                enrollmentId,
                surveyTypeValue: initSurveyType,
                facilityGroupKey: initFacilityGroup,
	                programStageId: stageId,
                assessorUserId: user?.id || null,
	                allowedDataElementIds: allowedAssessmentDetailDataElementIds,
		                excludedDataElementIds: excludedAssessmentDetailDataElementIds,
	                programStageMetadata: selectedStageMetadata,
            });

            const eventsPayload = [];
            const eventIdMap = {};
			const expectedTags = ['FINAL', ...provisioningSeOptions.map(se => String(se.id))];

            // FINAL event
            const finalEventId = generateDhis2Uid();
            eventIdMap['FINAL'] = finalEventId;
            eventsPayload.push({
                uid: finalEventId,
                status: 'ACTIVE',
                dataValues: [
                    ...assessmentDetailsDataValues,
                    { dataElement: SYS_TAG_DE_ID, value: 'FINAL' }
                ]
            });

	            // SE events. This list comes from the live rendered metadata, so a
	            // visible section like HOSP_SE28 must always receive a backing event.
	            for (const se of provisioningSeOptions) {
                const seEventId = generateDhis2Uid();
                eventIdMap[se.id] = seEventId;
                eventsPayload.push({
                    uid: seEventId,
                    status: 'ACTIVE',
                    dataValues: [
                        ...assessmentDetailsDataValues,
                        { dataElement: SYS_TAG_DE_ID, value: String(se.id) }
                    ]
                });
            }

	            updateCreateProgress(1, totalSteps, 'Sending assessment bundle to DHIS2...');

			let createResult = null;
			try {
				createResult = await api.createAssessmentBundle({
                    programId,
                    stageId,
                    orgUnitId,
                    teiId,
                    enrollmentId,
                    trackedEntityTypeId,
                    extraAttributes,
                    events: eventsPayload
                });
            } catch (bundleErr) {
                console.error('❌ createAssessmentBundle failed:', bundleErr);
                throw bundleErr;
            }

			const responseEventIds = Array.isArray(createResult?.eventIds) ? createResult.eventIds : [];
			const responseEventIdMap = {};
			expectedTags.forEach((tag, idx) => {
				if (responseEventIds[idx]) responseEventIdMap[tag] = responseEventIds[idx];
			});

	            updateCreateProgress(2, totalSteps, 'Verifying assessment events in DHIS2...');

            // Verify that every expected SYS_TAG becomes visible in DHIS2.
			// Do NOT open the form with only locally generated event IDs; they must
			// be confirmed by DHIS2 readback so later PUTs do not hit Invalid Event ID.
            const visibilityResult = await pollForExpectedTags({
                teiId,
                orgUnitId,
                programId,
                stageId,
                expectedTags,
                onAttempt: ({ attempt, totalAttempts, missingTags }) => {
                    if (attempt > 1) {
                        updateCreateProgress(2, totalSteps, `Waiting for DHIS2 to index assessment events (${attempt}/${totalAttempts})...`);
                    } else {
                        updateCreateProgress(2, totalSteps, 'Verifying assessment events in DHIS2...');
                    }
                    const visibleCount = expectedTags.length - missingTags.length;
                    setCreateDetails(prev => [...prev, `DHIS2 setup check ${attempt}/${totalAttempts}: ${visibleCount}/${expectedTags.length} sections ready${missingTags.length ? `; still preparing ${missingTags.join(', ')}` : ''}.`]);
                }
            });
			const readbackTagMap = visibilityResult.tagMap || {};
			const readbackMissingTags = expectedTags.filter(tag => !readbackTagMap[tag]);
			setCreateDetails(prev => [
	                ...prev,
				`DHIS2 create response returned ${Object.keys(responseEventIdMap).length}/${expectedTags.length} event IDs.`,
				`DHIS2 confirmed ${expectedTags.length - readbackMissingTags.length}/${expectedTags.length} sections are ready${readbackMissingTags.length ? `; still preparing ${readbackMissingTags.join(', ')}` : ''}.`
	            ]);

				if (readbackMissingTags.length > 0) {
						updateCreateProgress(3, totalSteps, 'Completing setup: preparing any remaining assessment sections automatically...');
						setCreateDetails(prev => [...prev, `Automatic setup completion started for sections still pending in DHIS2: ${readbackMissingTags.join(', ')}`]);

					try {
						const repaired = await repairAssessmentBundle({
							assessment: pendingOpenAssessment,
							teiId,
							orgUnitId,
							enrollmentId,
							facilityGroup: ns,
							surveyType: initSurveyType,
							expectedTags,
								logLine: (line) => setCreateDetails(prev => [...prev, line]),
								programStageMetadata: selectedStageMetadata,
								allowedDataElementIds: allowedAssessmentDetailDataElementIds,
								excludedDataElementIds: excludedAssessmentDetailDataElementIds
						});
						const repairedEventIdMap = { ...responseEventIdMap, ...readbackTagMap, ...(repaired.tagMap || {}) };
						try {
							await api.upsertDataStoreItem(ns, teiId, {
								...body,
								eventIdMap: repairedEventIdMap,
								eventIdMapSource: 'DHIS2_READBACK_AUTO_REPAIR',
								eventIdMapUpdatedAt: new Date().toISOString(),
							});
						} catch (e) {
							console.warn('DataStore eventIdMap auto-repair upsert failed (non-fatal)', e);
						}
						setPendingProvisionedBundle(null);
						updateCreateProgress(3, totalSteps, 'Setup complete. Opening assessment...');
						finalizeProvisionedAssessmentOpen({
							assessment: pendingOpenAssessment,
							teiId,
							enrollmentId,
							eventIdMap: repairedEventIdMap,
							surveyType: repaired.surveyType || initSurveyType,
							facilityGroup: repaired.facilityGroup || ns,
								programStageId: stageId,
							detailsDataValues: assessmentDetailsDataValues,
						});
						return;
					} catch (repairErr) {
						const manualRepairBundle = {
							assessment: pendingOpenAssessment,
							teiId,
							orgUnitId,
							enrollmentId,
							facilityGroup: ns,
							surveyType: initSurveyType,
								programStageId: stageId,
							eventIdMap: readbackTagMap,
								allowedDataElementIds: allowedAssessmentDetailDataElementIds,
								excludedDataElementIds: excludedAssessmentDetailDataElementIds,
						};
						setPendingProvisionedBundle(manualRepairBundle);
						const failureInfo = {
							message: repairErr?.message || `Assessment setup is taking a little longer. Some sections are still not available in DHIS2: ${readbackMissingTags.join(', ')}`,
							missingTags: readbackMissingTags,
							expectedCount: expectedTags.length,
							verifiedCount: expectedTags.length - readbackMissingTags.length,
							teiId,
							orgUnitId,
							programId,
							stageId,
							facilityGroup: ns,
							surveyType: initSurveyType,
						};
						const error = new Error(failureInfo.message);
						error.createErrorInfo = failureInfo;
						throw error;
					}
				}

			const verifiedEventIdMap = { ...responseEventIdMap, ...readbackTagMap };

	            Object.entries(readbackTagMap).forEach(([tag, readbackEventId]) => {
	                if (!expectedTags.includes(tag) || !readbackEventId) return;
	                if (eventIdMap[tag] && eventIdMap[tag] !== readbackEventId) {
					setCreateDetails(prev => [...prev, `Section ${tag} is now available in DHIS2; using the confirmed event ID.`]);
	                }
	            });

	            try {
	                await api.upsertDataStoreItem(ns, teiId, {
	                    ...body,
					eventIdMap: verifiedEventIdMap,
					eventIdMapSource: 'DHIS2_READBACK',
	                    eventIdMapUpdatedAt: new Date().toISOString(),
	                });
	            } catch (e) {
	                console.warn('DataStore eventIdMap upsert failed (non-fatal)', e);
	            }
            updateCreateProgress(2, totalSteps, 'Finalizing setup...');

            setPendingProvisionedBundle(null);
            finalizeProvisionedAssessmentOpen({
                assessment: pendingOpenAssessment,
                teiId,
                enrollmentId,
				eventIdMap: verifiedEventIdMap,
                surveyType: initSurveyType,
                facilityGroup: ns,
	                programStageId: stageId,
                detailsDataValues: assessmentDetailsDataValues,
            });
        } catch (err) {
            console.error('Failed to create baseline event:', err);
            const info = err?.createErrorInfo || (() => {
                const match = String(err?.message || '').match(/(?:Missing DHIS2 events for:|not available in DHIS2:)\s*(.*)$/i);
                const missingTags = match?.[1] ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
                return {
                    message: err?.message || 'Failed to initialize assessment.',
                    missingTags,
                    expectedCount: initSeOptions.length + 1,
                    verifiedCount: missingTags.length > 0 ? (initSeOptions.length + 1 - missingTags.length) : null,
                };
            })();
            setCreateErrorInfo({
                ...info,
                payload: err.payload,
                data: err.data
            });
            setCreateDetails(prev => [...prev, `Error: ${err?.message || 'Failed to initialize assessment.'}`]);
            showToast?.(err?.message || 'Failed to initialize assessment.', 'error');
        } finally {
            setIsBaselineCreating(false);
            setCreateProgress(null);
        }
    };

    const handleRepairProvisionedBundle = async () => {
        if (!pendingProvisionedBundle) return;
        try {
            setIsBaselineCreating(true);
            setCreateErrorInfo(null);
            setCreateProgress({ current: 0, total: 1, message: 'Completing remaining setup steps...' });
            setCreateDetails(prev => [...prev, 'Continuing assessment setup...']);
            const repaired = await repairAssessmentBundle({
                assessment: pendingProvisionedBundle.assessment,
                teiId: pendingProvisionedBundle.teiId,
                orgUnitId: pendingProvisionedBundle.orgUnitId,
                enrollmentId: pendingProvisionedBundle.enrollmentId,
                facilityGroup: pendingProvisionedBundle.facilityGroup,
                surveyType: pendingProvisionedBundle.surveyType,
                expectedTags: getExpectedTagsForGroup(pendingProvisionedBundle.facilityGroup),
		                logLine: (line) => setCreateDetails(prev => [...prev, line]),
		                allowedDataElementIds: pendingProvisionedBundle.allowedDataElementIds || null,
		                excludedDataElementIds: pendingProvisionedBundle.excludedDataElementIds || []
            });
            const repairedEventMap = { ...(pendingProvisionedBundle.eventIdMap || {}), ...(repaired.tagMap || {}) };
            setPendingProvisionedBundle(null);
            showToast?.('Assessment setup completed successfully.', 'success');
            finalizeProvisionedAssessmentOpen({
                assessment: pendingProvisionedBundle.assessment,
                teiId: pendingProvisionedBundle.teiId,
                enrollmentId: pendingProvisionedBundle.enrollmentId,
                eventIdMap: repairedEventMap,
                surveyType: repaired.surveyType || pendingProvisionedBundle.surveyType,
                facilityGroup: repaired.facilityGroup || pendingProvisionedBundle.facilityGroup,
                detailsDataValues: buildAssessmentDetailsDataValues(pendingProvisionedBundle.assessment, {
                    teiId: pendingProvisionedBundle.teiId,
                    enrollmentId: pendingProvisionedBundle.enrollmentId,
                    surveyTypeValue: repaired.surveyType || pendingProvisionedBundle.surveyType,
                    facilityGroupKey: repaired.facilityGroup || pendingProvisionedBundle.facilityGroup,
	                    programStageId: pendingProvisionedBundle.programStageId || getSurveyProgramStageIdForGroup(repaired.facilityGroup || pendingProvisionedBundle.facilityGroup),
                    assessorUserId: user?.id || null,
	                    allowedDataElementIds: pendingProvisionedBundle.allowedDataElementIds || null,
		                    excludedDataElementIds: pendingProvisionedBundle.excludedDataElementIds || [],
                }),
            });
        } catch (err) {
            const match = String(err?.message || '').match(/(?:Missing DHIS2 events for:|not available in DHIS2:)\s*(.*)$/i);
            const missingTags = match?.[1] ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
            setCreateErrorInfo({
                message: err?.message || 'Assessment setup could not be completed yet.',
                missingTags,
                expectedCount: pendingProvisionedBundle?.facilityGroup ? getExpectedTagsForGroup(pendingProvisionedBundle.facilityGroup).length : null,
                verifiedCount: pendingProvisionedBundle?.facilityGroup && missingTags.length > 0 ? (getExpectedTagsForGroup(pendingProvisionedBundle.facilityGroup).length - missingTags.length) : null,
            });
            setCreateDetails(prev => [...prev, `Notice: ${err?.message || 'Assessment setup could not be completed yet.'}`]);
            showToast?.(err?.message || 'Assessment setup could not be completed yet.', 'warning');
        } finally {
            setIsBaselineCreating(false);
            setCreateProgress(null);
        }
    };

    const repairAssociatedAssessment = async (assessment, ev, facilityGroupValue, surveyTypeValue) => {
        const teiId = ev?.trackedEntityInstance || resolveTeiForAssessment(assessment);
        const orgUnitId = ev?.orgUnit || resolveOrgUnitForAssessment(assessment);
        if (!teiId || !orgUnitId) {
            showToast?.('Cannot continue setup for this assessment because TEI or org unit is missing.', 'error');
            return;
        }
        setRepairingAssessments(prev => ({ ...prev, [teiId]: true }));
        try {
            await repairAssessmentBundle({
                assessment,
                teiId,
                orgUnitId,
                facilityGroup: facilityGroupValue,
                surveyType: surveyTypeValue,
            });
            await loadAssociatedEvents(assessment);
            showToast?.(`Completed remaining setup steps for assessment ${teiId}.`, 'success');
        } catch (err) {
            showToast?.(err?.message || 'Failed to complete the remaining setup steps for this assessment.', 'error');
        } finally {
            setRepairingAssessments(prev => ({ ...prev, [teiId]: false }));
        }
    };

    const cancelCreateBaseline = () => {
        setShowCreateBaselineDialog(false);
        setPendingOpenAssessment(null);
        setCreateProgress(null);
        setCreateDetails([]);
        setCreateErrorInfo(null);
        setPendingProvisionedBundle(null);
        setInitHasExistingBaseline(false);
        setInitEditAssignmentsOnly(false);
        setInitSurveyType('');
        setInitFacilityGroup('');
        setInitTeamOptions([]);
        setInitTeamLoading(false);
        setInitAssessorLookupInfo(null);
        setInitSeOptions([]);
	        setInitProgramStageMetadata(null);
        setInitAssignments({});
    };

    // Check for most recent draft on load
    useEffect(() => {
        // Placeholder logic for most recent draft until indexedDBService has this specific method
        // Or we implement it in the service
        const checkDraft = async () => {
            // implementation depends on service update
        };
        checkDraft();
    }, [user]);

    // Get facility filter from URL parameters
    useEffect(() => {
        const facilityId = searchParams.get('facility');
        if (facilityId) {
            setSelectedFacilityId(facilityId);
        }
    }, [searchParams]);

    // Load events from storage
    const loadEvents = async () => {
        if (!storage.isReady) return;
        try {
            setIsLoading(true);

            // Load auto-saved drafts
            console.log("Dashboard: Loading drafts...");
            // Pass current user to ensure we get their drafts
            const autoSavedDrafts = await indexedDBService.getAllDrafts(user);
            console.log("Dashboard: Drafts loaded raw:", autoSavedDrafts);

            // Convert drafts to event format for display
            const convertedAutoSavedDrafts = autoSavedDrafts
                .map(draft => {
                    // console.log("Dashboard: Converting draft:", draft.eventId, draft);
                    return {
                        event: draft.eventId,
                        orgUnit: draft.formData?.orgUnit,
                        eventDate: draft.formData?.eventDate || new Date(draft.createdAt).toISOString().split('T')[0],
                        status: draft.syncStatus || 'draft',
                        syncStatus: draft.syncStatus || 'draft',
                        syncError: draft.syncError,
                        createdAt: draft.createdAt,
                        updatedAt: draft.lastUpdated,
                        isDraft: draft.metadata?.isDraft,
                        isAutoSaved: true,
                        dataValues: [], // Will need to map this for preview
                        _draftData: draft
                    };
                });

            console.log("Dashboard: Converted drafts:", convertedAutoSavedDrafts);

            // In a real app, we would merge with "submitted/synced" events here
            const allEvents = [...convertedAutoSavedDrafts];
            setEvents(allEvents);
        } catch (error) {
            console.error('Failed to load events:', error);
            showToast('Failed to load events', 'error');
        } finally {
            setIsLoading(false);
        }
    };

	    useEffect(() => {
	        loadEvents();
	    }, [storage.isReady, user]);

		    // Resolve the currently active configuration bundle for display and
		    // editing. Falls back to on-disk JSON if bundles are not yet
		    // initialised.
		    const activeBundle = useMemo(() => {
		        if (!configBundles || !activeVersionId) return null;
		        return configBundles[activeVersionId] || null;
		    }, [configBundles, activeVersionId]);

		    const currentConfig = useMemo(() => {
		        if (activeBundle && activeBundle.config) {
		            return activeBundle.config;
		        }
		        return { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };
		    }, [activeBundle]);

            const currentLinks = useMemo(() => {
                // Start from active bundle or fall back to on-disk assets
                const base = (activeBundle && activeBundle.links)
                    ? activeBundle.links
                    : {
                        ems: emsLinks,
                        mortuary: mortuaryLinks,
                        clinics: clinicsLinks,
                        hospital: hospitalLinks,
                    };

                // Decorate Hospital links with -G / -B visual tags as per matrix.json
                const decoratedHospital = decorateHospitalLinksWithMatrixTags(base.hospital || []);
                return { ...base, hospital: decoratedHospital };
            }, [activeBundle]);

		    const currentComputeCriteria = useMemo(() => {
		        if (activeBundle && activeBundle.compute) {
		            return activeBundle.compute;
		        }
		        return hospitalComputeCriteria;
		    }, [activeBundle]);

		    const hospitalComputeServiceElements = (currentComputeCriteria?.hospital_standards_config?.service_elements) || [];

		    const activeVersion = useMemo(() => {
		        return configVersions.find(v => v.id === activeVersionId) || configVersions[0] || null;
		    }, [configVersions, activeVersionId]);

		    const persistVersions = (versions, activeId) => {
		        const payload = { activeVersionId: activeId, versions };
		        setConfigVersions(versions);
		        setActiveConfigVersionId(activeId);
		        try {
		            localStorage.setItem('qims_config_versions', JSON.stringify(payload));
		        } catch (e) {
		            console.error('Failed to persist configuration versions', e);
		        }
		    };

		    const updateActiveConfigBundle = (updater) => {
		        setConfigBundles((prevBundles) => {
		            const bundles = { ...(prevBundles || {}) };
		            const activeId = activeVersionId || (activeVersion && activeVersion.id);
		            if (!activeId) return prevBundles;
		            const existingBundle = bundles[activeId] || {
		                config: { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig },
		                links: {
		                    ems: emsLinks,
		                    mortuary: mortuaryLinks,
		                    clinics: clinicsLinks,
		                    hospital: hospitalLinks,
		                },
		                compute: hospitalComputeCriteria,
		            };
		            const updated = updater(existingBundle);
		            if (!updated) return prevBundles;
		            const nextBundles = { ...bundles, [activeId]: updated };
		            return nextBundles;
		        });
		    };

		    const handleOpenComputeEditor = () => {
		        if (!currentComputeCriteria || !hospitalComputeServiceElements.length) {
		            showToast('No Hospital computation mapping is available to configure.', 'warning');
		            return;
		        }
		        // Start from the active version's current compute config.
		        const cloned = JSON.parse(JSON.stringify(currentComputeCriteria));
		        setDraftComputeConfig(cloned);
		        const firstSe = hospitalComputeServiceElements[0];
		        setSelectedComputeSeId(firstSe ? firstSe.se_id : null);
		        setShowComputeEditor(true);
		    };

		    const handleCloseComputeEditor = () => {
		        setShowComputeEditor(false);
		        setDraftComputeConfig(null);
		        setSelectedComputeSeId(null);
		        setJsonError(null);
		    };

		    const getHospitalCriteriaForSe = (seIdLabel) => {
		        // seIdLabel is like "SE 7"; hospital_config se_id is numeric.
		        if (!currentConfig || !currentConfig.hospital_full_configuration) return [];
		        const numericId = parseInt(String(seIdLabel).replace(/[^0-9]/g, ''), 10);
		        const seConfig = (currentConfig.hospital_full_configuration || []).find(se => Number(se.se_id) === numericId);
		        if (!seConfig) return [];
		        const sections = seConfig.sections || [];
		        const allCriteria = [];
		        sections.forEach(section => {
		            (section.standards || []).forEach(std => {
		                (std.criteria || []).forEach(c => {
		                    allCriteria.push(c);
		                });
		            });
		        });
		        return allCriteria.sort((a, b) => {
		            const idA = String(a.id || '');
		            const idB = String(b.id || '');
		            return idA.localeCompare(idB, undefined, { numeric: true });
		        });
		    };

		    const handleToggleSubCriterion = (seIdLabel, rootId, criterionId, checked) => {
		        setDraftComputeConfig(prev => {
		            if (!prev) return prev;
		            const next = JSON.parse(JSON.stringify(prev));
		            const seList = (next.hospital_standards_config && next.hospital_standards_config.service_elements) || [];
		            const se = seList.find(se => se.se_id === seIdLabel);
		            if (!se) return prev;
		            const root = (se.root_criteria || []).find(rc => rc.id === rootId);
		            if (!root) return prev;
		            let subs = Array.isArray(root.sub_criteria) ? [...root.sub_criteria] : [];
		            const idx = subs.indexOf(criterionId);
		            if (checked) {
		                if (idx === -1) subs.push(criterionId);
		            } else if (idx !== -1) {
		                subs.splice(idx, 1);
		            }
		            root.sub_criteria = subs;
		            return next;
		        });
		    };

		    const handleResetComputeForSe = (seIdLabel) => {
		        const defaultSeList = (hospitalComputeCriteria?.hospital_standards_config?.service_elements) || [];
		        const defaultSe = defaultSeList.find(se => se.se_id === seIdLabel);
		        if (!defaultSe) {
		            showToast('Default computation mapping not found for this SE.', 'error');
		            return;
		        }
		        setDraftComputeConfig(prev => {
		            if (!prev) return prev;
		            const next = JSON.parse(JSON.stringify(prev));
		            if (!next.hospital_standards_config) {
		                next.hospital_standards_config = { service_elements: [JSON.parse(JSON.stringify(defaultSe))] };
		                return next;
		            }
		            const seList = next.hospital_standards_config.service_elements || [];
		            const idx = seList.findIndex(se => se.se_id === seIdLabel);
		            if (idx === -1) {
		                seList.push(JSON.parse(JSON.stringify(defaultSe)));
		            } else {
		                seList[idx] = JSON.parse(JSON.stringify(defaultSe));
		            }
		            next.hospital_standards_config.service_elements = seList;
		            return next;
		        });
		        showToast('Computation mapping for this SE reset to default.', 'info');
		    };

		    const handleToggleSeActive = (programme, se, checked) => {
		        const typeToKeyMap = {
		            ems: 'ems_full_configuration',
		            hospital: 'hospital_full_configuration',
		            mortuary: 'mortuary_full_configuration',
		            clinics: 'clinics_full_configuration',
		        };
		        const key = typeToKeyMap[programme];
		        if (!key) return;
		        const defaultSourceMap = {
		            ems: emsConfig,
		            hospital: hospitalConfig,
		            mortuary: mortuaryConfig,
		            clinics: clinicsConfig,
		        };
		        const defaultSource = defaultSourceMap[programme];
		        if (!defaultSource) return;
		        const defaultList = defaultSource[key] || [];
		        const seId = se.se_id;
		        updateActiveConfigBundle((bundle) => {
		            const newConfig = { ...(bundle.config || {}) };
		            const list = Array.isArray(newConfig[key]) ? [...newConfig[key]] : [];
		            const idx = list.findIndex(x => x.se_id === seId);
		            if (checked) {
		                if (idx === -1) {
		                    const baseline = defaultList.find(x => x.se_id === seId);
		                    if (!baseline) {
		                        return bundle;
		                    }
		                    list.push(JSON.parse(JSON.stringify(baseline)));
		                }
		            } else if (idx !== -1) {
		                list.splice(idx, 1);
		            }
		            newConfig[key] = list;
		            return { ...bundle, config: newConfig };
		        });
		    };

		    const handleCreateNewVersion = () => {
		        const trimmedName = (newVersionName || '').trim();
		        const trimmedDesc = (newVersionDescription || '').trim();
		        if (!trimmedName) {
		            showToast('Please enter a version name.', 'warning');
		            return;
		        }
		        const idBase = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'version';
		        let uniqueId = idBase;
		        let counter = 2;
		        while (configVersions.some(v => v.id === uniqueId)) {
		            uniqueId = `${idBase}-${counter}`;
		            counter += 1;
		        }
		        const newVersion = {
		            id: uniqueId,
		            name: trimmedName,
		            description: trimmedDesc || 'No description provided.',
		            status: 'ACTIVE',
		            createdAt: new Date().toISOString(),
		        };
		        const nextVersions = [...configVersions, newVersion];
		        const updatedVersions = nextVersions.map(v => ({
		            ...v,
		            status: v.id === newVersion.id ? 'ACTIVE' : (v.status || 'DRAFT'),
		        }));
		        persistVersions(updatedVersions, newVersion.id);

		        // Clone the currently active bundle (or baseline) into the new
		        // version so that it starts as "same as current".
		        const sourceBundle = activeBundle || {
		            config: { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig },
		            links: {
		                ems: emsLinks,
		                mortuary: mortuaryLinks,
		                clinics: clinicsLinks,
		                hospital: hospitalLinks,
		            },
		            compute: hospitalComputeCriteria,
		        };
		        const clonedBundle = JSON.parse(JSON.stringify(sourceBundle));
		        setConfigBundles(prev => {
		            const next = { ...(prev || {}), [newVersion.id]: clonedBundle };
		            return next;
		        });
		        setShowNewVersionDialog(false);
		        setNewVersionName('');
		        setNewVersionDescription('');
		        showToast('New configuration version created and set as active for editing.', 'success');
		    };

		    const handleSelectVersion = (versionId) => {
		        const target = configVersions.find(v => v.id === versionId);
		        if (!target) return;
		        const updatedVersions = configVersions.map(v => ({
		            ...v,
		            status: v.id === versionId ? 'ACTIVE' : (v.status === 'ACTIVE' ? 'DRAFT' : (v.status || 'DRAFT')),
		        }));
		        persistVersions(updatedVersions, versionId);
		        showToast(`Active configuration version set to "${target.name}".`, 'info');
		    };

    // Filter events
    const filteredEvents = useMemo(() => {
        let filtered = events;
        if (selectedFacilityId) {
            // Filter by facility if implemented in draft data
            // Drafts might not have orgUnit set yet if it's in formData
        }
        if (searchTerm.trim()) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(event => {
                const eventDate = new Date(event.eventDate).toLocaleDateString().toLowerCase();
                return eventDate.includes(search) ||
                    (event.status || event.syncStatus || '').toLowerCase().includes(search);
            });
        }
        return filtered;
    }, [events, searchTerm, selectedFacilityId, configuration]);

    // Calculate dashboard stats
    const dashboardStats = useMemo(() => {
        return {
            totalEvents: events.length,
            pendingEvents: events.filter(e => e.status === 'draft').length,
            syncedEvents: 0,
            errorEvents: 0
        };
    }, [events]);

    const getRecentSurveyMeta = React.useCallback((event) => {
        const eventId = String(event?.event || '');
        const groupCode = (eventId.match(/group-([A-Z_]+)/i)?.[1] || event?._draftData?.metadata?.groupId || 'SURVEY').toUpperCase();
        const groupLabels = {
            HOSPITAL: 'Hospital',
            CLINICS: 'Clinics',
            EMS: 'EMS',
            SE: 'EMS',
            MORTUARY: 'Mortuary',
            GENERAL: 'Mortuary',
        };
        const groupLabel = groupLabels[groupCode] || groupCode;
        const typeLabel = eventId.startsWith('draft-assessment-')
            ? 'Assessment bundle'
            : eventId.startsWith('draft-facility-')
                ? 'Facility draft'
                : 'Survey draft';
        const updatedDate = event?.updatedAt ? new Date(event.updatedAt) : (event?.eventDate ? new Date(event.eventDate) : null);
        const dateLabel = updatedDate && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toLocaleDateString() : 'No date';
        const shortId = eventId.length > 18 ? eventId.slice(-18) : eventId;
        return { groupCode, groupLabel, typeLabel, dateLabel, shortId };
    }, []);

    const handleEditForm = (event) => {
        // Resume drafts or failed submissions
        if (event.syncStatus === 'draft' || event.syncStatus === 'pending' || event.syncStatus === 'error') {
            // Check if it has an assessmentId in metadata or draftId
            const assessmentId = event._draftData?.metadata?.assessmentId || event._draftData?.eventId;
            if (assessmentId) {
                navigate(`/form?assessmentId=${assessmentId}`);
            } else {
                navigate(`/form`);
            }
        }
    };

    const handleSync = async () => {
        await syncEvents();
        await loadEvents();
    };

    const handleDeleteEvent = async (eventId) => {
        // Implement delete
    };

    return (
        <div className="home-page dashboard-container">
            {loadingSurveyInfo && (
                <div className="dashboard-loading-overlay">
                    <div className="dashboard-loading-card">
                        <div className="dashboard-loading-spinner" />
                        <div className="dashboard-loading-message">{loadingSurveyInfo}</div>
                    </div>
                </div>
            )}
            {/* Program Header */}
	            <div className="program-header">
	                <div className="program-info">
	                    <h1 className="program-title">
	                        {(configuration?.program?.displayName && configuration.program.displayName !== 'Facility Assessment Data Manifest Version')
	                            ? configuration.program.displayName
	                            : 'MOH Survey Dashboard'}
	                    </h1>
	                </div>
                <div className="quick-actions">
                    <Tooltip title="Refresh/Sync Data">
                        <IconButton onClick={handleSync} color="primary" className="action-icon-btn">
                            <CloudSyncIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Report">
                        <IconButton onClick={() => navigate('/report')} color="primary" className="action-icon-btn">
                            <AssessmentIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="App Settings">
                        <IconButton onClick={() => setShowSettings(true)} color="primary" className="action-icon-btn">
                            <SettingsIcon />
                        </IconButton>
                    </Tooltip>
	                    <Tooltip title="Logout">
	                        <IconButton onClick={handleLogout} color="primary" className="action-icon-btn">
	                            <LogoutIcon />
	                        </IconButton>
	                    </Tooltip>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-dashboard">
                <div className="stat-card total">
	                    <div className="stat-icon"><FactCheckIcon fontSize="inherit" /></div>
                    <div className="stat-content">
                        <h3>{dashboardStats.totalEvents}</h3>
                        <p>Total Surveys</p>
                    </div>
                </div>
                <div className="stat-card pending">
	                    <div className="stat-icon"><EditNoteIcon fontSize="inherit" /></div>
                    <div className="stat-content">
                        <h3>{dashboardStats.pendingEvents}</h3>
                        <p>Drafts</p>
                    </div>
                </div>
                <div className="stat-card upcoming">
	                    <div className="stat-icon"><EventAvailableIcon fontSize="inherit" /></div>
                    <div className="stat-content">
                        <h3>{assessmentStats.upcoming}</h3>
                        <p>Upcoming Assessments</p>
                    </div>
                </div>
                <div className="stat-card urgent">
	                    <div className="stat-icon"><NotificationsActiveIcon fontSize="inherit" /></div>
                    <div className="stat-content">
                        <h3>{assessmentStats.pending}</h3>
                        <p>Pending Actions</p>
                    </div>
                </div>
            </div>
            {/* Accreditation Assessments List */}
            <div className={`forms-section assessments-section ${isAccredAssessmentsCollapsed ? 'collapsed' : ''}`}>
                <div className="section-header" onClick={() => setIsAccredAssessmentsCollapsed(!isAccredAssessmentsCollapsed)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ transform: isAccredAssessmentsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
                        <h3>Assigned Accreditation Assessments</h3>
                    </div>
                </div>
                {!isAccredAssessmentsCollapsed && (
                    <div className="forms-list">
                        {accredLoading ? (
                            <div className="loading">Loading Accreditation Assessments...</div>
                        ) : accredAssignments.length === 0 ? (
                            <div className="empty-state">No accreditation assessments assigned</div>
                        ) : (
                            accredAssignments.map((assessment) => {
                                const facilityId = assessment.facilityId || assessment.orgUnitId || assessment.orgUnit || '';
                                const displayId = facilityId && facilityId !== 'N/A' ? ` (${facilityId})` : '';
                                const isSynced = false;
	                                const actionKey = getAssessmentActionKey(assessment);
                                const isInitiating = initiatingAssessmentKey === actionKey;
	                                const assocKey = getAssocKey(assessment);
	                                const presence = assessmentEventPresenceByKey?.[assocKey];
	                                const hasAssessmentEvent = presence?.hasAssessmentEvent === true;
	                                const isCheckingPresence = !presence || presence.loading;
		                                const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i, '').toUpperCase();
		                                const isLead = /LEAD|LEADER/.test(roleNorm);
                                return (
                                    <div key={`accred-${assessment.enrollment || assessment.eventId || assessment.trackedEntityInstance}`} className="form-item assessment-item">
                                        <div className="form-info">
                                            <div className="form-header-row">
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <h4>{assessment.orgUnitName}{displayId}</h4>
                                                    {assessment.parentOrgUnitName && (
                                                        <>
                                                            <span style={{ fontSize: '0.85em', color: '#666', marginTop: '-4px' }}>
                                                                District: {assessment.parentOrgUnitName}
                                                                {assessment.myTeamRole ? (
                                                                    <> {' \u2022 '} Role: {String(assessment.myTeamRole).replace(/^FAC_ASS_ROLE_/i,'').replace(/\s+/g,'_').replace(/_/g,' ').toUpperCase()} </>
                                                                ) : null}
                                                                {(isCheckingPresence || !hasAssessmentEvent) && (
                                                                    <button
                                                                        className="btn btn-primary btn-xs"
                                                                        disabled={isCheckingPresence || isInitiating}
                                                                        onClick={() => handleOpenAssessment(assessment, { forceDialog: true })}
                                                                    >
                                                                        {isCheckingPresence ? 'Checking assessment\u2026' : (isInitiating ? 'Opening\u2026' : 'Initiate Survey')}
                                                                    </button>
                                                                )}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="form-status success">ACCREDITATION</div>
                                            </div>
                                            <p>Enrollment: {assessment.enrollment}</p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Assessments List */}
            <div className={`forms-section assessments-section ${isAssessmentsCollapsed ? 'collapsed' : ''}`}>
                <div className="section-header" onClick={() => setIsAssessmentsCollapsed(!isAssessmentsCollapsed)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            transform: isAssessmentsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                            display: 'inline-block'
                        }}>▼</span>
                        <h3>Assigned Assessments</h3>
                    </div>

                </div>
		                {!isAssessmentsCollapsed && (
		                    <div style={{ fontSize: '0.8rem', color: '#666', padding: '0.25rem 1rem' }}>
		                        <strong>User:</strong> {user?.username || 'unknown'} ({user?.id || 'no-id'})
		                    </div>
		                )}
                {!isAssessmentsCollapsed && (
                    <div className="forms-list">
	                        {hookError && (
	                            <div style={{ margin: '0 1rem 0.75rem', padding: '8px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}>
	                                Failed to load assigned assessments: {hookError.message || String(hookError)}
	                            </div>
	                        )}
	                        {!hookError && hookDebug && hookDebug.teamEventsCount === 0 && (
	                            <div style={{ margin: '0 1rem 0.75rem', padding: '8px 10px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.85rem' }}>
	                                No accepted team-assignment events were found for {user?.username || user?.id || 'this user'}.
	                            </div>
	                        )}
	                        {assessmentsLoading ? (
                            <div className="loading">Loading Assessments...</div>
                        ) : (upcomingAssessments.length === 0 && pendingAssessments.length === 0) ? (
                            <div className="empty-state">No assessments assigned</div>
                        ) : (
                            (() => {
		                                const allUniqueAssessments = [];
		                                const seenFacilities = new Map();
	                                [...pendingAssessments, ...upcomingAssessments].forEach(assessment => {
		                                    const facilityKey =
		                                        assessment?.facilityId ||
		                                        assessment?.orgUnitId ||
		                                        (typeof assessment?.orgUnit === 'string' ? assessment.orgUnit : assessment?.orgUnit?.id) ||
		                                        assessment?.orgUnitName ||
		                                        getAssessmentActionKey(assessment);
		                                    if (!seenFacilities.has(facilityKey)) {
	                                        const newItem = { ...assessment, _duplicates: [assessment] };
	                                        allUniqueAssessments.push(newItem);
		                                        seenFacilities.set(facilityKey, newItem);
	                                    } else {
		                                        const existing = seenFacilities.get(facilityKey);
	                                        if (existing) {
	                                            existing._duplicates.push(assessment);
	                                        }
	                                    }
	                                });

                                return allUniqueAssessments.map(assessment => {
                                    const draftId = `draft-assessment-${assessment.eventId}`;
                                    const existingDraft = events.find(e => e.event === draftId);
                                    const isSynced = existingDraft?.syncStatus === 'synced';
	                                    const actionKey = getAssessmentActionKey(assessment);
                                    const isInitiating = initiatingAssessmentKey === actionKey;
	                                    const assocKey = getAssocKey(assessment);
	                                    const presence = assessmentEventPresenceByKey?.[assocKey];
	                                    const hasAssessmentEvent = presence?.hasAssessmentEvent === true;
	                                    const isCheckingPresence = !presence || presence.loading;
	                                    const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i,'').toUpperCase();
	                                    const isLead = /LEAD|LEADER/.test(roleNorm);
	                                    const singleAssessmentUiState = {
	                                        hasAssessmentEvent,
	                                        isCheckingPresence,
	                                        isLead,
	                                        isInitiating,
		                                        label: 'Initiate Survey',
	                                    };
	                                    const groupedSchedules = assessment._duplicates?.length > 1
	                                        ? (() => {
	                                            const uniqueSchedules = [];
	                                            const seenScheduleKeys = new Map();
	                                            (assessment._duplicates || []).forEach(item => {
	                                                const scheduleKey = getAssessmentActionKey(item);
	                                                const existingSchedule = seenScheduleKeys.get(scheduleKey);
	                                                if (existingSchedule) {
	                                                    existingSchedule._duplicates.push(item);
	                                                    return;
	                                                }
	                                                const scheduleItem = { ...item, _duplicates: [item] };
	                                                uniqueSchedules.push(scheduleItem);
	                                                seenScheduleKeys.set(scheduleKey, scheduleItem);
	                                            });
	                                            return uniqueSchedules;
	                                        })()
	                                        : [];
		                                    const cardOpenTarget = groupedSchedules.find(item => canOpenAssessmentFromUiState(getAssessmentUiState(item), { allowWhileChecking: true }))
	                                        || groupedSchedules[0]
	                                        || assessment;
	                                    const cardOpenUiState = cardOpenTarget === assessment
	                                        ? singleAssessmentUiState
	                                        : getAssessmentUiState(cardOpenTarget);

                                    // Robust Facility ID display
                                    const facilityId = assessment.facilityId || assessment.orgUnitId || assessment.orgUnit || '';
                                    const displayId = (facilityId && facilityId !== 'N/A')
                                        ? ` (${facilityId})`
                                        : '';

		                                    const plannedDate = assessment.scheduledAt
		                                        ? (assessment.scheduledAt.slice(0, 10))
		                                        : 'N/A';
		                                    const lastUpdated = assessment.updatedAt
		                                        ? (assessment.updatedAt.slice(0, 10))
		                                        : 'N/A';

                                    return (
	                                        <div
	                                            key={assessment.eventId}
	                                            className="form-item assessment-item"
		                                            onClick={() => openAssessmentFromUiState(cardOpenTarget, cardOpenUiState, { allowWhileChecking: true })}
	                                            onKeyDown={(e) => {
	                                                if (e.key === 'Enter' || e.key === ' ') {
	                                                    e.preventDefault();
		                                                    openAssessmentFromUiState(cardOpenTarget, cardOpenUiState, { allowWhileChecking: true });
	                                                }
	                                            }}
	                                            role="button"
	                                            tabIndex={0}
		                                            style={{ cursor: canOpenAssessmentFromUiState(cardOpenUiState, { allowWhileChecking: true }) ? 'pointer' : 'default' }}
	                                        >
                                            <div className="form-info">
                                                <div className="form-header-row">
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <h4>{assessment.orgUnitName}{displayId}</h4>
                                                        {assessment.parentOrgUnitName && (
                                                            <>
                                                                <span style={{ fontSize: '0.85em', color: '#666', marginTop: '-4px' }}>
                                                                    District: {assessment.parentOrgUnitName}
	                                                                    {assessment._duplicates?.length <= 1 && assessment.myTeamRole ? (
                                                                        <> {' \u2022 '} Role: {String(assessment.myTeamRole).replace(/^FAC_ASS_ROLE_/i,'').replace(/\s+/g,'_').replace(/_/g,' ').toUpperCase()}</>
                                                                    ) : null}
                                                                </span>
	                                                                {assessment._duplicates?.length <= 1 && assessment.isSelfAssessment && (
                                                                    <div style={{ marginTop: '4px' }}>
                                                                        <span style={{
                                                                            fontSize: '0.7em',
                                                                            fontWeight: 800,
                                                                            color: '#1e40af',
                                                                            background: '#dbeafe',
                                                                            padding: '2px 8px',
                                                                            borderRadius: '4px',
                                                                            textTransform: 'uppercase'
                                                                        }}>
                                                                            Self Assessment
                                                                        </span>
                                                                    </div>
                                                                )}

                                                            </>
                                                        )}
                                                    </div>
	                                                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
	                                                        {assessment._duplicates?.length > 1 ? (
	                                                            <div className="form-status success">{new Set((assessment._duplicates || []).map(item => getAssessmentActionKey(item))).size} UNIQUE SCHEDULES</div>
	                                                        ) : (
	                                                            <>
	                                                                {assessment.requiresResponse && (
	                                                                    <div className="form-status error">ACTION REQUIRED</div>
	                                                                )}
		                                                            <div className={`form-status ${hasAssessmentEvent ? 'success' : 'warning'}`}>
		                                                                {isCheckingPresence ? 'CHECKING TEI' : hasAssessmentEvent ? 'SURVEY EXISTS' : 'NEW SCHEDULED TEI'}
		                                                            </div>
	                                                                {isSynced && (
	                                                                    <div className="form-status success">✓ SYNCED</div>
	                                                                )}
	                                                            </>
	                                                        )}
                                                        {renderAssessmentActionButton(assessment, singleAssessmentUiState)}
	                                                    </div>
                                                </div>
		                                            {assessment._duplicates?.length > 1 ? (
		                                                (() => {
		                                                    const uniqueSchedules = groupedSchedules;
			                                                    const facilityIsLead = uniqueSchedules.some(item => {
			                                                        const roleNorm = String(item.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i, '').toUpperCase();
			                                                        return /LEAD|LEADER/.test(roleNorm);
			                                                    });
		                                                    return (
			                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px', minWidth: 0, width: '100%' }}>
		                                                            {uniqueSchedules
                                                                .filter(scheduledAssessment => {
                                                                    const ui = getAssessmentUiState(scheduledAssessment);
                                                                    return ui.isCheckingPresence || !ui.hasAssessmentEvent;
                                                                })
                                                                .map((scheduledAssessment, scheduleIndex) => {
		                                                                const scheduleUi = getAssessmentUiState(scheduledAssessment);
		                                                                return (
		                                                                    <div
		                                                                        key={`${scheduleUi.actionKey}-${scheduleIndex}`}
			                                                                        className="assessment-schedule-card"
		                                                                        onClick={(e) => {
		                                                                            e.stopPropagation();
		                                                                            openAssessmentFromUiState(scheduledAssessment, scheduleUi, { allowWhileChecking: true });
		                                                                        }}
	                                                                        onKeyDown={(e) => {
	                                                                            if (e.key === 'Enter' || e.key === ' ') {
	                                                                                e.preventDefault();
		                                                                                e.stopPropagation();
		                                                                                openAssessmentFromUiState(scheduledAssessment, scheduleUi, { allowWhileChecking: true });
	                                                                            }
	                                                                        }}
	                                                                        role="button"
	                                                                        tabIndex={0}
		                                                                        style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px', background: '#f8fafc', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', cursor: canOpenAssessmentFromUiState(scheduleUi, { allowWhileChecking: true }) ? 'pointer' : 'default' }}
		                                                                    >
			                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', minWidth: 0 }}>
			                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
		                                                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
		                                                                                    <div className="form-status success">SCHEDULE {scheduleIndex + 1}</div>
		                                                                                    {scheduledAssessment.requiresResponse && (
		                                                                                        <div className="form-status error">ACTION REQUIRED</div>
		                                                                                    )}
		                                                                                    <div className={`form-status ${scheduleUi.hasAssessmentEvent ? 'success' : 'warning'}`}>
		                                                                                        {scheduleUi.isCheckingPresence ? 'CHECKING TEI' : scheduleUi.hasAssessmentEvent ? 'SURVEY EXISTS' : 'NEW SCHEDULED TEI'}
		                                                                                    </div>
		                                                                                    {scheduledAssessment.isSelfAssessment && (
		                                                                                        <div className="form-status success">SELF ASSESSMENT</div>
		                                                                                    )}
		                                                                                    {scheduleUi.isSynced && (
		                                                                                        <div className="form-status success">✓ SYNCED</div>
		                                                                                    )}
		                                                                                </div>
		                                                                                <div style={{ fontSize: '0.85em', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
		                                                                                    {scheduleUi.roleLabel ? <>Role: {scheduleUi.roleLabel}</> : 'Role: N/A'}
		                                                                                {renderAssessmentActionButton(scheduledAssessment, scheduleUi)}
		                                                                                </div>
		                                                                            </div>

		                                                                            <div className="form-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
		                                                                                <button
		                                                                                    className="btn btn-secondary btn-sm"
	                                                                                    onClick={(e) => {
	                                                                                        e.stopPropagation();
	                                                                                        openTeamDialog(scheduledAssessment);
	                                                                                    }}
		                                                                                >
		                                                                                    Team ({Array.isArray(scheduledAssessment.team) ? scheduledAssessment.team.length : 0})
		                                                                                </button>
		                                                                            </div>
		                                                                        </div>

				                                                                        {!scheduleUi.hasAssessmentEvent && (
                                                                        <p className="assessment-details-line" style={{ margin: '10px 0 0', color: '#475569' }}>
			                                                                            Assessment ID: {scheduledAssessment.enrollment || scheduledAssessment.eventId || '-'}
			                                                                            {' '}| Program: {getAssignmentProgramId(scheduledAssessment)}
			                                                                            {' '}| Stage: {getAssignmentProgramStageId(scheduledAssessment)}
			                                                                            {' '}| TEI: {scheduledAssessment.scheduleTeiId || scheduledAssessment.trackedEntityInstance || '-'}
			                                                                            {' '}| Date: {scheduleUi.latestAuth}
			                                                                            {' '}| Authorised: {scheduleUi.authStart} to {scheduleUi.authEnd}
			                                                                            {' '}| Facility type: {getAssignmentFacilityGroupValue(scheduledAssessment)}
			                                                                            {' '}| Type: {getAssignmentTypeValue(scheduledAssessment)}
			                                                                            {' '}| Status: {formatAssignmentStatusLabel(scheduledAssessment.statusCode || scheduledAssessment.status)}
			                                                                            {' '}| OU: {scheduledAssessment.orgUnit || '-'}
				                                                                        </p>
				                                                                        )}

		                                                                    </div>
		                                                                );
		                                                            })}
			                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
			                                                                <button
			                                                                    type="button"
			                                                                    className="btn btn-secondary btn-sm"
				                                                                    title={supportsAssociatedAssessments(assessment) ? undefined : 'Could not resolve the facility org unit for associated assessments'}
			                                                                    onClick={(e) => {
			                                                                        e.stopPropagation();
			                                                                        toggleExpandAssessment(assessment);
			                                                                    }}
			                                                                >
			                                                                    {expandedAssignments[getAssocKey(assessment)] ? 'Hide Associated Assessments' : 'Show Associated Assessments'}
			                                                                </button>
			                                                            </div>
			                                                            {supportsAssociatedAssessments(assessment) && expandedAssignments[getAssocKey(assessment)] && (
				                                                                <div
				                                                                    className="associated-assessments-panel"
				                                                                    onClick={(e) => e.stopPropagation()}
				                                                                    style={{ width: '100%', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px' }}
				                                                                >
			                                                                    {renderAssociatedAssessmentsPanel(assessment, facilityIsLead)}
			                                                                </div>
			                                                            )}
		                                                        </div>
		                                                    );
		                                                })()
		                                            ) : (
		                                                <>
				                                            {!hasAssessmentEvent && (
                                                <p className="assessment-details-line">
				                                                Assessment ID: {assessment.enrollment || assessment.eventId || '-'}
				                                                {' '}| Program: {getAssignmentProgramId(assessment)}
				                                                {' '}| Stage: {getAssignmentProgramStageId(assessment)}
				                                                {' '}| TEI: {assessment.scheduleTeiId || assessment.trackedEntityInstance || '-'}
				                                                {' '}| Date: {singleAssessmentUiState.latestAuth}
				                                                {' '}| Authorised: {singleAssessmentUiState.authStart} to {singleAssessmentUiState.authEnd}
				                                                {' '}| Facility type: {getAssignmentFacilityGroupValue(assessment)}
				                                                {' '}| Type: {getAssignmentTypeValue(assessment)}
				                                                {' '}| Status: {formatAssignmentStatusLabel(assessment.statusCode || assessment.status)}
				                                                {' '}| OU: {assessment.orgUnit || '-'}
				                                            </p>
				                                            )}
	                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
	                                                <button
	                                                    className="btn btn-secondary btn-sm"
		                                                    title={supportsAssociatedAssessments(assessment) ? undefined : 'Could not resolve the facility org unit for associated assessments'}
	                                                    onClick={(e) => { e.stopPropagation(); toggleExpandAssessment(assessment); }}
	                                                >
	                                                    {expandedAssignments[getAssocKey(assessment)] ? 'Hide Associated Assessments' : 'Show Associated Assessments'}
	                                                </button>
	                                            </div>
	            {supportsAssociatedAssessments(assessment) && expandedAssignments[getAssocKey(assessment)] && (
	                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '10px', width: '100%', background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px' }}>
                    {assessment._duplicates && assessment._duplicates.length > 1 && (
                        <div style={{ marginBottom: '10px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                            <div style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                Grouped Assignments ({assessment._duplicates.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {assessment._duplicates.map(d => (
                                    <div key={d.eventId} style={{ fontSize: '13px', color: '#4b5563' }}>
                                        • Status: <span style={{ fontWeight: 500 }}>{d.statusCode === 'FAC_ASS_ASSIGN_ACCEPTED' ? 'Accepted' : 'Pending'}</span> | Date: {d.sortDate} | ID: {d.eventId} | Enr: {d.enrollment || d.schedule?.enrollments?.[0]?.enrollment || 'N/A'} | Prog: {d.program || d.schedule?.enrollments?.[0]?.program || 'N/A'} | TEI: {d.trackedEntityInstance || d.scheduleTeiId || 'N/A'} | Start: {d.scheduledAt ? d.scheduledAt.slice(0,10) : 'N/A'} | End: {d.updatedAt ? d.updatedAt.slice(0,10) : 'N/A'}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {(() => {
                        const bundle = associatedByEnrollment[getAssocKey(assessment)];
                        if (!bundle || bundle.loading) return <div style={{ color: '#666' }}>Loading associated events...</div>;
                        const rawRows = [ ...(bundle.survey||[]) ];
	                        const groupedByAssessment = rawRows.reduce((acc, ev) => {
	                            const enrollmentKey = ev?._type === 'Enrollment'
	                                ? (ev.enrollmentId || ev.enrollment || ev.event)
	                                : null;
	                            const tei = ev?.trackedEntityInstance;
	                            const key = enrollmentKey
	                                ? `enrollment-${enrollmentKey}`
	                                : (tei && tei !== 'unknown-tei' ? tei : `event-${ev.event}`);
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(ev);
                            return acc;
                        }, {});
	                        let rows = Object.entries(groupedByAssessment).map(([key, evs]) => {
                            const hasFinal = evs.some(ev => getSysTag(ev) === 'FINAL');
                            const finalEv = hasFinal
                                ? evs.find(ev => getSysTag(ev) === 'FINAL')
                                : null;
                            const latestWithTypeOrGroup = evs.find(ev => (ev.dataValues || []).some(d => d.dataElement === surveyTypeDeId || d.dataElement === surveyGroupDeId)) || null;
                            const latestEv = [...evs].sort((a, b) => new Date(b?.eventDate || 0) - new Date(a?.eventDate || 0))[0] || evs[0];
                            const representative = finalEv || latestWithTypeOrGroup || latestEv;
	                            const representativeTei = representative?.trackedEntityInstance
	                                || evs.find(ev => ev?.trackedEntityInstance)?.trackedEntityInstance
	                                || (key.startsWith('event-') ? 'unknown-tei' : key);
                            const earliestDate = evs.reduce((acc, cur) => {
                                if (!cur?.eventDate) return acc;
                                if (!acc) return cur.eventDate;
                                return new Date(cur.eventDate) < new Date(acc) ? cur.eventDate : acc;
                            }, null);
                            return {
                                ...representative,
	                                trackedEntityInstance: representativeTei,
                                _bundleEvents: evs,
	                                _displayEventId: representative?.enrollmentId || representative?.event || '-',
                                _baselineDate: earliestDate,
                                _assessmentDate: representative?.eventDate || latestEv?.eventDate || earliestDate,
                            };
                        }).sort((a, b) => new Date(b?._assessmentDate || 0) - new Date(a?._assessmentDate || 0));
                        if (rows.length === 0) {
                            const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i,'').toUpperCase();
                            const isLead = /LEAD|LEADER/.test(roleNorm);
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ color: '#334155' }}>No baseline survey found</span>
                                    <span style={{
                                        display: 'inline-block',
                                        fontSize: '0.75em',
                                        fontWeight: 700,
                                        color: '#9a3412',
                                        background: '#ffedd5',
                                        border: '1px solid #fdba74',
                                        padding: '2px 8px',
                                        borderRadius: '9999px'
                                    }}>NO BASELINE</span>
                                </div>
                            );
                        }
                        const getTypeValue = (ev) => {
                            if (ev._type === 'Enrollment') {
	                                return getAttributeValue(
	                                    ev.attributes,
	                                    SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentTypeSelected,
	                                    ['assessment type of assessment selected']
	                                ) || '-';
                            }
                            if (!surveyTypeDeId) return '-';
                            const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
                            const dv = sourceEvents
                                .flatMap(src => src.dataValues || [])
                                .find(d => d.dataElement === surveyTypeDeId && d.value !== undefined && String(d.value).trim() !== '');
                            return dv?.value || '-';
                        };
                        const getGroupValue = (ev) => {
                            if (ev._type === 'Enrollment') {
	                                return getAttributeValue(
	                                    ev.attributes,
	                                    SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityType,
	                                    ['assessment facility type']
	                                ) || '-';
                            }
                            if (!surveyGroupDeId) return '-';
                            const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
                            const dv = sourceEvents
                                .flatMap(src => src.dataValues || [])
                                .find(d => d.dataElement === surveyGroupDeId && d.value !== undefined && String(d.value).trim() !== '');
                            return dv?.value || '-';
                        };
                        const formatAssessmentStatusLabel = (value) => {
                            const raw = String(value || '').trim();
                            if (!raw) return '-';
                            if (raw === 'FAC_ASS_STATUS_IN_PROGRESS') return 'In Progress';
                            return raw;
                        };
                        const getStatusValue = (ev) => {
                            if (ev._type === 'Enrollment') {
	                                return formatAssessmentStatusLabel(
	                                    getAttributeValue(
	                                        ev.attributes,
	                                        SURVEY_PROGRAM_ATTRIBUTE_IDS.facilityAssessmentStatus,
	                                        ['facility assessment status']
	                                    ) || ev.status || '-'
	                                );
                            }
                            return formatAssessmentStatusLabel(ev.status || '-');
                        };

                        // Authorised window for this OU (from team events)
                        const authDates = (() => {
                            const evsAuth = Array.isArray(assessment.team) ? assessment.team : [];
                            const parseD = (d) => (d ? new Date(d) : null);
                            const ds = evsAuth.map(e => parseD(e.eventDate || e.occurredAt || e.completedDate || e.scheduledAt || e.updatedAt)).filter(Boolean).sort((a,b)=>a-b);
                            const start = ds[0] ? ds[0].toISOString().slice(0,10) : '';
                            const end = ds.length ? ds[ds.length-1].toISOString().slice(0,10) : '';
                            return { start, end };
                        })();
                        return (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                            <th style={{ padding: '6px 8px' }}>Assessment_ID</th>
                                            <th style={{ padding: '6px 8px' }}>Program</th>
                                            <th style={{ padding: '6px 8px' }}>TEI</th>
                                            <th style={{ padding: '6px 8px' }}>Assessment date</th>
                                            <th style={{ padding: '6px 8px' }}>Authorised start</th>
                                            <th style={{ padding: '6px 8px' }}>Authorised end</th>
                                            <th style={{ padding: '6px 8px' }}>Type of assessment</th>
	                                            <th style={{ padding: '6px 8px' }}>Facility type</th>
                                            <th style={{ padding: '6px 8px' }}>Status</th>
                                            <th style={{ padding: '6px 8px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
	                                                                        {rows.map(ev => (
                                                                            <tr
	                                                                                className={`associated-assessment-row ${loadingSurveyRow === (ev.event || ev.enrollmentId || ev.enrollment || ev.trackedEntityInstance || '') ? 'loading' : ''}`}
	                                                                                key={`survey-${ev.enrollmentId || ev.enrollment || ev.event || ev.trackedEntityInstance}`}
                                                                                onClick={() => openAssociatedSurvey(assessment, ev)}
                                                                                style={{ borderTop: '1px dashed #eee', cursor: 'pointer' }}
                                                                                title="Open this survey for editing"
                                                                            >
	                                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev._displayEventId || ev.event || '-'}</td>
	                                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev.programId || '-'}</td>
	                                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev.trackedEntityInstance || '-'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{ev._assessmentDate ? new Date(ev._assessmentDate).toLocaleDateString() : 'N/A'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{authDates.start || 'N/A'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{authDates.end || 'N/A'}</td>
                                                                                <td style={{ padding: '6px 8px', color: '#334155' }}>{getTypeValue(ev)}</td>
	                                                                                <td style={{ padding: '6px 8px', color: '#334155' }}>{getAssociatedAssessmentGroupValue(ev)}</td>
                                                                                <td style={{ padding: '6px 8px' }}>{getStatusValue(ev)}</td>
                                                                                <td style={{ padding: '6px 8px' }}>
                                                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                                                        <button
                                                                                            className="btn btn-secondary btn-xs"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const baselineDate = ev._baselineDate || null;
                                                                                                const ou = ev.orgUnit || assessment.orgUnitId || (typeof assessment.orgUnit === 'string' ? assessment.orgUnit : assessment.orgUnit?.id) || '';
                                                                                                const tei = ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || '';
		                                                                                                const facilityGroup = getAssociatedAssessmentGroupValue(ev);
	                                                                                                const reportProgramStageId = ev.programStage || ev.programStageId || getSurveyProgramStageIdForGroup(facilityGroup);
                                                                                                const q = new URLSearchParams({
                                                                                                    facilityId: ou || '',
                                                                                                    teiId: tei || '',
	                                                                                                    programId: ev.programId || getSurveyEventProgramIdForStage(reportProgramStageId, assessment),
	                                                                                                    programStageId: reportProgramStageId || '',
	                                                                                                    facilityGroup: facilityGroup || '',
                                                                                                    start: baselineDate || '',
                                                                                                    end: ev._assessmentDate || ev.eventDate || '',
                                                                                                    eventId: ev._displayEventId || ev.event || ''
                                                                                                }).toString();
                                                                                                navigate(`/report?${q}`);
                                                                                            }}
                                                                                        >
                                                                                            View Report
                                                                                        </button>
                                                                                        <button
                                                                                            className="btn btn-secondary btn-xs"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
	                                                                                                openEditSeAssignments(assessment, ev, getAssociatedAssessmentGroupValue(ev), getTypeValue(ev));
                                                                                            }}
                                                                                        >
                                                                                            Edit SE Assignments
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}
                                            {false && (
                                                (() => {
		                                                    if (isCheckingPresence) {
	                                                        return (
	                                                            <button className="btn btn-secondary btn-sm" disabled>
	                                                                Checking assessment…
	                                                            </button>
	                                                        );
	                                                    }
	                                                    const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i,'').toUpperCase();
	                                                    const isLead = /LEAD|LEADER/.test(roleNorm);
		                                                    const label = hasAssessmentEvent ? 'Update Survey' : (isSynced ? 'Update Survey' : (existingDraft ? 'Resume Survey' : 'Initiate Survey'));
		                                                    const selfOnly = hasAssessmentEvent && label === 'Initiate Survey';
	                                                    const onClick = () => {
		                                                        return label === 'Initiate Survey' ? handleInitiateSurvey(assessment, { selfOnly }) : handleOpenAssessment(assessment);
	                                                    };
                                                    return (
                                                        <button
			                                                            className={`btn ${label === 'Initiate Survey' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
		                                                            disabled={label === 'Initiate Survey' && isInitiating}
	                                                            onClick={(e) => {
	                                                                e.stopPropagation();
	                                                                onClick();
	                                                            }}
                                                        >
		                                                            {label === 'Initiate Survey' && isInitiating ? 'Opening…' : label}
                                                        </button>
                                                    );
                                                })()
                                            )}
	                                            </>
	                                            )}

	                                        </div>

                                        </div>
                                    );
                                });
                            })()
                        )}
                    </div>
                )}
            </div>

            {/* Forms List */}
            <div className="forms-section">
                <div className="section-header">
                    <h3>Recent Surveys</h3>
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="forms-list">
                    {isLoading ? (
                        <div className="loading">Loading...</div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="empty-state">No Survey found</div>
	                    ) : (
	                        filteredEvents.map(event => {
                                const meta = getRecentSurveyMeta(event);
                                return (
	                            <div key={event.event} className={`form-item recent-survey-card ${event.syncStatus} group-${meta.groupCode.toLowerCase()}`} onClick={() => handleEditForm(event)}>
	                                <div className="form-info recent-survey-info">
	                                    <div className="form-header-row recent-survey-header">
	                                        <div>
	                                            <div className="recent-survey-eyebrow">{meta.typeLabel}</div>
	                                            <h4>{event._draftData?.formData?.facilityName_internal || 'Survey'}</h4>
	                                        </div>
	                                        <div className="recent-survey-badges">
	                                            <span className={`survey-group-chip group-${meta.groupCode.toLowerCase()}`}>{meta.groupLabel}</span>
	                                            <span className="survey-date-chip">{meta.dateLabel}</span>
	                                            <div className={`form-status ${event.syncStatus === 'error' ? 'error' : event.syncStatus === 'synced' ? 'success' : 'warning'}`}>
	                                                {event.syncStatus === 'error' ? 'Failed' : event.syncStatus === 'synced' ? 'Synced' : 'Draft'}
	                                            </div>
	                                        </div>
	                                    </div>
	                                    <div className="recent-survey-meta">
	                                        <span>Short ID: <strong>{meta.shortId || 'N/A'}</strong></span>
	                                        <span className="recent-survey-id-full">Full ID: {event.event}</span>
	                                        {event.syncError && <span className="error-msg">Error: {event.syncError}</span>}
	                                    </div>
	                                </div>
	                                <div className="form-actions recent-survey-actions">
                                    {event.syncStatus === 'error' && (
                                        <button
                                            className="btn btn-warning btn-sm"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setIsLoading(true);
                                                await retryEvent(event.event);
                                                await loadEvents();
                                                setIsLoading(false);
                                            }}
                                            style={{ marginRight: '8px' }}
                                        >
                                            Retry Sync
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={(e) => { e.stopPropagation(); setPreviewEvent(event); }}
                                    >
                                        Preview
                                    </button>
                                </div>
                            </div>
	                                );
                            })
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <Dialog open={showClearConfirm} onClose={() => setShowClearConfirm(false)}>
                <DialogTitle>Confirm Data Wipe</DialogTitle>
                <DialogContent>Are you sure you want to delete all data?</DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowClearConfirm(false)}>Cancel</Button>
                    <Button onClick={handleConfirmClear} color="error">Delete All</Button>
                </DialogActions>
            </Dialog>

            {/* Settings Dialog */}
            <Dialog
                open={showSettings}
                onClose={() => { setShowSettings(false); setSelectedSE(null); }}
                maxWidth="xl"
                fullWidth
            >
                <DialogTitle>
                    {selectedSE ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Button onClick={() => setSelectedSE(null)} size="small">← Back</Button>
                            <span>SE {selectedSE.se_id}: {selectedSE.se_name}</span>
                        </div>
                    ) : showLinksEditor ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Button onClick={() => setShowLinksEditor(false)} size="small">← Back</Button>
                            <span>Criteria Linking Configuration</span>
                        </div>
                    ) : 'App Settings'}
                </DialogTitle>
                <DialogContent dividers>
                    <div className="settings-content">
	                        {!selectedSE && !showLinksEditor ? (
	                            <>
                                    <div className="settings-section" style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                                        <h4 style={{ color: '#1e40af' }}>Configuration Strategy (Testing)</h4>
                                        <p className="settings-subtitle">
                                            Switch between using the <strong>In-App hardcoded assets</strong> and the <strong>Remote DHIS2 DataStore</strong>.
                                            This allows you to verify that configurations pulled from DHIS2 match the expected application behavior.
                                        </p>
                                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '10px' }}>
                                            <FormControl size="small" style={{ minWidth: '200px' }}>
                                                <InputLabel>Source Strategy</InputLabel>
                                                <Select
                                                    value={configSource}
                                                    label="Source Strategy"
                                                    onChange={(e) => setConfigSource(e.target.value)}
                                                >
                                                    <MenuItem value="local">Local Assets (In-App)</MenuItem>
                                                    <MenuItem value="datastore">DHIS2 DataStore (Remote)</MenuItem>
                                                </Select>
                                            </FormControl>

                                            {configSource === 'datastore' && (
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    onClick={() => loadRemoteConfig()}
                                                    startIcon={<CloudSyncIcon />}
                                                >
                                                    Fetch from DataStore
                                                </Button>
                                            )}
                                        </div>
                                        {configSource === 'datastore' && (
                                            <div style={{ marginTop: '8px', fontSize: '0.8em', color: '#666' }}>
                                                <span>Namespace: <code>qims-config</code> | Keys: <code>hospital, clinics, ems, mortuary, links, compute</code></span>
                                            </div>
                                        )}
                                    </div>

		                                <div className="settings-section">
		                                    <h4>Configuration Versions</h4>
		                                    <p className="settings-subtitle">
		                                        Each version bundles together the Service Elements, Criteria Linkages and
		                                        Computation rules. Non-technical users can name and describe versions
		                                        without editing JSON.
		                                    </p>
		                                    <div className="version-header-row">
		                                        <span style={{ fontSize: '0.9em', color: '#4a5568' }}>
		                                            Active version:
		                                        </span>{' '}
		                                        <span style={{ fontWeight: 600 }}>
		                                            {activeVersion ? activeVersion.name : 'V1 \\u2013 Baseline configuration'}
		                                        </span>
		                                    </div>
		                                    <div className="version-actions-row" style={{ marginTop: '8px', marginBottom: '8px' }}>
		                                        <Button
		                                            variant="outlined"
		                                            size="small"
		                                            onClick={() => setShowNewVersionDialog(true)}
		                                        >
		                                            Create new version
		                                        </Button>
		                                    </div>
		                                    <div className="version-list" style={{ maxHeight: '160px', overflowY: 'auto' }}>
		                                        {configVersions.map(v => (
		                                            <div
		                                                key={v.id}
		                                                className="version-item"
		                                                style={{
		                                                    padding: '6px 8px',
		                                                    borderBottom: '1px solid #e2e8f0',
		                                                    display: 'flex',
		                                                    justifyContent: 'space-between',
		                                                    alignItems: 'center',
		                                                    cursor: 'pointer',
		                                                    backgroundColor: activeVersion && v.id === activeVersion.id ? '#edf2f7' : 'transparent',
		                                                }}
		                                                onClick={() => handleSelectVersion(v.id)}
		                                            >
		                                                <div>
		                                                    <div style={{ fontWeight: 600 }}>{v.name}</div>
		                                                    <div style={{ fontSize: '0.8em', color: '#4a5568' }}>
		                                                        {v.description}
		                                                    </div>
		                                                </div>
		                                                <div style={{ textAlign: 'right' }}>
		                                                    <div className={v.status === 'ACTIVE' ? 'config-status-tag success' : 'config-status-tag'}>
		                                                        {v.status}
		                                                    </div>
		                                                    <div style={{ fontSize: '0.7em', color: '#718096' }}>
		                                                        {new Date(v.createdAt).toLocaleDateString()}
		                                                    </div>
		                                                    {(!activeVersion || v.id !== activeVersion.id) && (
		                                                        <Button
		                                                            size="small"
		                                                            variant="text"
		                                                            onClick={(e) => {
		                                                                e.stopPropagation();
		                                                                handleSelectVersion(v.id);
		                                                            }}
		                                                            style={{ marginTop: 4 }}
		                                                        >
		                                                            Set active
		                                                        </Button>
		                                                    )}
		                                                </div>
		                                            </div>
		                                        ))}
		                                        {configVersions.length === 0 && (
		                                            <div style={{ fontSize: '0.85em', color: '#718096' }}>
		                                                No versions defined yet. The current on-disk configuration is treated as V1.
		                                            </div>
		                                        )}
		                                    </div>
		                                </div>
	                                <div className="settings-section">
	                                    <h4>Service Element Configuration</h4>
	                                    <p className="settings-subtitle">EMS Standards (SE 1 - SE 10)</p>
	                                    <div className="se-config-list">
	                                        {(emsConfig.ems_full_configuration || []).map(se => {
	                                            const activeList = currentConfig.ems_full_configuration || [];
	                                            const versionSe = activeList.find(x => x.se_id === se.se_id);
	                                            const isActive = Boolean(versionSe);
	                                            const displaySe = versionSe || se;
	                                            return (
	                                                <div
	                                                    key={`ems-${se.se_id}`}
	                                                    className="se-config-item clickable"
	                                                    onClick={() => {
	                                                        setSelectedSE({ ...displaySe, _type: 'ems' });
	                                                        setEditedJson(JSON.stringify(displaySe, null, 2));
	                                                        setIsEditingJson(false);
	                                                    }}
	                                                >
	                                                    <Checkbox
	                                                        size="small"
	                                                        checked={isActive}
	                                                        onClick={(e) => e.stopPropagation()}
	                                                        onChange={(e) => handleToggleSeActive('ems', se, e.target.checked)}
	                                                        style={{ padding: 0, marginRight: 6 }}
	                                                    />
	                                                    <span className="se-id-badge">SE {se.se_id}</span>
	                                                    <span className="se-name-text">{se.se_name}</span>
	                                                    <span className="chevron-right">›</span>
	                                                </div>
	                                            );
	                                        })}
	                                    </div>
	                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Hospital Standards (SE 1 - SE 45)</p>
	                                    <div className="se-config-list">
	                                        {(hospitalConfig.hospital_full_configuration || []).map(se => {
	                                            const activeList = currentConfig.hospital_full_configuration || [];
	                                            const versionSe = activeList.find(x => x.se_id === se.se_id);
	                                            const isActive = Boolean(versionSe);
	                                            const displaySe = versionSe || se;
	                                            return (
	                                                <div
	                                                    key={`hospital-${se.se_id}`}
	                                                    className="se-config-item clickable"
	                                                    onClick={() => {
	                                                        setSelectedSE({ ...displaySe, _type: 'hospital' });
	                                                        setEditedJson(JSON.stringify(displaySe, null, 2));
	                                                        setIsEditingJson(false);
	                                                    }}
	                                                >
	                                                    <Checkbox
	                                                        size="small"
	                                                        checked={isActive}
	                                                        onClick={(e) => e.stopPropagation()}
	                                                        onChange={(e) => handleToggleSeActive('hospital', se, e.target.checked)}
	                                                        style={{ padding: 0, marginRight: 6 }}
	                                                    />
	                                                    <span className="se-id-badge">SE {se.se_id}</span>
	                                                    <span className="se-name-text">{se.se_name}</span>
	                                                    <span className="chevron-right">›</span>
	                                                </div>
	                                            );
	                                        })}
	                                    </div>
	                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Mortuary Standards (SE 1 - SE 6)</p>
	                                    <div className="se-config-list">
	                                        {(mortuaryConfig.mortuary_full_configuration || []).map(se => {
	                                            const activeList = currentConfig.mortuary_full_configuration || [];
	                                            const versionSe = activeList.find(x => x.se_id === se.se_id);
	                                            const isActive = Boolean(versionSe);
	                                            const displaySe = versionSe || se;
	                                            return (
	                                                <div
	                                                    key={`mort-${se.se_id}`}
	                                                    className="se-config-item clickable"
	                                                    onClick={() => {
	                                                        setSelectedSE({ ...displaySe, _type: 'mortuary' });
	                                                        setEditedJson(JSON.stringify(displaySe, null, 2));
	                                                        setIsEditingJson(false);
	                                                    }}
	                                                >
	                                                    <Checkbox
	                                                        size="small"
	                                                        checked={isActive}
	                                                        onClick={(e) => e.stopPropagation()}
	                                                        onChange={(e) => handleToggleSeActive('mortuary', se, e.target.checked)}
	                                                        style={{ padding: 0, marginRight: 6 }}
	                                                    />
	                                                    <span className="se-id-badge">SE {se.se_id}</span>
	                                                    <span className="se-name-text">{se.se_name}</span>
	                                                    <span className="chevron-right">›</span>
	                                                </div>
	                                            );
	                                        })}
	                                    </div>
	                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Clinics Standards (SE 1 - SE 13)</p>
	                                    <div className="se-config-list">
	                                        {(clinicsConfig.clinics_full_configuration || []).map(se => {
	                                            const activeList = currentConfig.clinics_full_configuration || [];
	                                            const versionSe = activeList.find(x => x.se_id === se.se_id);
	                                            const isActive = Boolean(versionSe);
	                                            const displaySe = versionSe || se;
	                                            return (
	                                                <div
	                                                    key={`clinics-${se.se_id}`}
	                                                    className="se-config-item clickable"
	                                                    onClick={() => {
	                                                        setSelectedSE({ ...displaySe, _type: 'clinics' });
	                                                        setEditedJson(JSON.stringify(displaySe, null, 2));
	                                                        setIsEditingJson(false);
	                                                    }}
	                                                >
	                                                    <Checkbox
	                                                        size="small"
	                                                        checked={isActive}
	                                                        onClick={(e) => e.stopPropagation()}
	                                                        onChange={(e) => handleToggleSeActive('clinics', se, e.target.checked)}
	                                                        style={{ padding: 0, marginRight: 6 }}
	                                                    />
	                                                    <span className="se-id-badge">SE {se.se_id}</span>
	                                                    <span className="se-name-text">{se.se_name}</span>
	                                                    <span className="chevron-right">›</span>
	                                                </div>
	                                            );
	                                        })}
	                                    </div>
	                                    <div className="config-status-tag success" style={{ marginTop: '10px' }}>STABLE</div>
	                                </div>
                                <div className="settings-section">
                                    <h4>Criteria Linking Configuration</h4>
                                    <p className="settings-subtitle">EMS Criteria dependencies and associations</p>
                                    <div
                                        className="se-config-item clickable"
                                        onClick={() => {
                                            setShowLinksEditor('ems');
                                            setEditedLinksJson(JSON.stringify(currentLinks.ems || currentLinks, null, 2));
                                            setIsEditingLinks(false);
                                        }}
                                    >
                                        <span className="se-id-badge">EMS LINKS</span>
                                        <span className="se-name-text">View/Edit EMS Linked Criteria Map</span>
                                        <span className="chevron-right">›</span>
                                    </div>
	                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Hospital Criteria dependencies and associations</p>
	                                    <div
	                                        className="se-config-item clickable"
	                                        onClick={() => {
	                                            setShowLinksEditor('hospital');
	                                            setEditedLinksJson(JSON.stringify(currentLinks.hospital || currentLinks, null, 2));
	                                            setIsEditingLinks(false);
	                                        }}
		                                    >
		                                        <span className="se-id-badge">HOSP LINKS</span>
		                                        <span className="se-name-text">View/Edit Hospital Linked Criteria Map</span>
		                                        <span className="chevron-right">›</span>
		                                    </div>
	                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Mortuary Criteria dependencies and associations</p>
                                    <div
                                        className="se-config-item clickable"
                                        onClick={() => {
                                            setShowLinksEditor('mortuary');
                                            setEditedLinksJson(JSON.stringify(currentLinks.mortuary || currentLinks, null, 2));
                                            setIsEditingLinks(false);
                                        }}
                                    >
                                        <span className="se-id-badge">MORT LINKS</span>
                                        <span className="se-name-text">View/Edit Mortuary Linked Criteria Map</span>
                                        <span className="chevron-right">›</span>
                                    </div>
                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Clinics Criteria dependencies and associations</p>
                                    <div
                                        className="se-config-item clickable"
                                        onClick={() => {
                                            setShowLinksEditor('clinics');
                                            setEditedLinksJson(JSON.stringify(currentLinks.clinics || currentLinks, null, 2));
                                            setIsEditingLinks(false);
                                        }}
                                    >
                                        <span className="se-id-badge">CLINIC LINKS</span>
                                        <span className="se-name-text">View/Edit Clinics Linked Criteria Map</span>
                                        <span className="chevron-right">›</span>
                                    </div>
		                                </div>
		                                <div className="settings-section">
		                                    <h4>Criteria and Sub Criteria for Computation</h4>
		                                    <p className="settings-subtitle">Hospital root criteria and their sub-criteria used for computation helpers.</p>
	                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
	                                        <span style={{ fontSize: '0.85em', color: '#4a5568' }}>
	                                            Editing for version: <strong>{activeVersion ? activeVersion.name : 'Baseline configuration'}</strong>
	                                        </span>
	                                        <Button
	                                            variant="outlined"
	                                            size="small"
	                                            onClick={handleOpenComputeEditor}
	                                        >
	                                            Configure for active version
	                                        </Button>
	                                    </div>
		                                    <div className="se-config-list">
		                                        {hospitalComputeServiceElements.map(se => (
		                                            <div key={se.se_id} className="se-config-item">
		                                                <span className="se-id-badge">{se.se_id}</span>
		                                                <span className="se-name-text">{se.name}</span>
		                                            </div>
		                                        ))}
		                                    </div>
		                                    <div className="raw-json-container" style={{ marginTop: '10px', maxHeight: '240px', overflowY: 'auto' }}>
		                                        {hospitalComputeServiceElements.map(se => (
		                                            <div key={`${se.se_id}-detail`} style={{ marginBottom: '12px' }}>
		                                                <strong>{se.se_id} – {se.name}</strong>
		                                                <ul style={{ marginTop: '4px', paddingLeft: '18px' }}>
		                                                    {se.root_criteria.map(rc => (
		                                                        <li key={rc.id}>
		                                                            <div><strong>{rc.id}</strong>: {rc.description}</div>
		                                                            <div style={{ fontSize: '0.85em', marginLeft: '4px' }}>
		                                                                Sub-criteria: {rc.sub_criteria.join(', ')}
		                                                            </div>
		                                                        </li>
		                                                    ))}
		                                                </ul>
		                                            </div>
		                                        ))}
		                                    </div>
		                                </div>
									<div className="settings-section">
										<h4>Facility Type — SE Criteria Overview</h4>
										<p className="settings-subtitle">Expand a facility type to view its criteria.</p>
										{(() => {
											const FACILITY_CONFIGS = [
												{ type: 'Hospital', config: hospitalConfig, key: 'hospital_full_configuration' },
												{ type: 'Clinics', config: clinicsConfig, key: 'clinics_full_configuration' },
												{ type: 'EMS', config: emsConfig, key: 'ems_full_configuration' },
												{ type: 'Mortuary', config: mortuaryConfig, key: 'mortuary_full_configuration' },
											];
											const toggleFac = (type) => {
												setExpandedFacs(prev => ({ ...prev, [type]: !prev[type] }));
											};
											return FACILITY_CONFIGS.map(({ type, config, key }) => {
												const seList = config?.[key] || [];
												let totalCriteria = 0;
												seList.forEach(se => {
													(se.sections || []).forEach(section => {
														(section.standards || []).forEach(standard => {
															totalCriteria += (standard.criteria || []).length;
														});
													});
												});
												const isExpanded = !!expandedFacs[type];
												return (
													<div key={type} style={{ marginBottom: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
														<div
															onClick={() => toggleFac(type)}
															style={{
																padding: '10px 16px',
																background: isExpanded ? '#ebf8ff' : '#f7fafc',
																cursor: 'pointer',
																display: 'flex',
																justifyContent: 'space-between',
																alignItems: 'center',
																fontWeight: 600,
																fontSize: '0.95em',
																userSelect: 'none',
															}}
															>
																<span>{type} <span style={{ color: '#718096', fontWeight: 400, fontSize: '0.85em' }}>({seList.length} SEs, {totalCriteria} criteria)</span></span>
																<span style={{ fontSize: '0.8em', color: '#718096' }}>{isExpanded ? '▲ Collapse' : '▼ Expand'}</span>
															</div>
															{isExpanded && (
																<div style={{ padding: '8px', maxHeight: '55vh', overflowY: 'auto', overflowX: 'auto' }}>
																	<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' }}>
																		<thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
																			<tr style={{ background: '#edf2f7', textAlign: 'left' }}>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '55px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>SE Number</th>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '70px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Standard</th>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '80px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Criterion</th>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '50px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Root</th>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '110px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Critical / Non-Critical</th>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '180px', position: 'sticky', top: 0, background: '#edf2f7' }}>Linked Criteria</th>
																				<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '180px', position: 'sticky', top: 0, background: '#edf2f7' }}>Sub-Criteria</th>
																			</tr>
																		</thead>
																		<tbody>
																			{seList.flatMap(se => {
																				const allStandardIds = [];
																				const rootMap = {};
																				(hospitalComputeCriteria?.hospital_standards_config?.service_elements || []).forEach(cse => {
																				    (cse.root_criteria || []).forEach(root => {
																				        if (root.id) rootMap[root.id] = root.sub_criteria || [];
																				    });
																				});
																				const rows = [];
																				(se.sections || []).forEach(section => {
																					(section.standards || []).forEach(standard => {
																						if (standard.standard_id) allStandardIds.push(standard.standard_id);
																						const standardCriteriaIds = (standard.criteria || []).map(c => c.id).filter(Boolean);
																						(standard.criteria || []).forEach(c => {
																							rows.push({
																								seId: se.se_id,
																								standardId: standard.standard_id,
																								criterionId: c.id,
																								isCritical: c.is_critical,
																								linkedCriteria: standardCriteriaIds,
																								isRoot: !!rootMap[c.id],
																								subCriteria: rootMap[c.id] || [],
																							});
																						});
																					});
																				});
																				const standardIdsUnique = [...new Set(allStandardIds)];
																				return rows.map((row, idx) => (
																					<tr key={`${type}-se-${row.seId}-st-${row.standardId}-c-${row.criterionId}-${idx}`}>
																						<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{row.seId}</td>
																						<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'monospace' }}>{row.standardId}</td>
																						<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'monospace' }}>{row.criterionId}</td>
																						<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600, color: row.isRoot ? '#2b6cb0' : '#718096' }}>{row.isRoot ? 'Yes' : 'No'}</td>
																						<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
																							<span style={{
																								color: row.isCritical ? '#c53030' : '#2f855a',
																								fontWeight: 600,
																								background: row.isCritical ? '#fff5f5' : '#f0fff4',
																								padding: '2px 8px',
																								borderRadius: '4px',
																								fontSize: '0.85em',
																							}}>
																								{row.isCritical ? 'Critical' : 'Non-Critical'}
																							</span>
																						</td>
																						<td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>
																							<div style={{ maxHeight: '60px', overflowY: 'auto', fontSize: '0.8em', fontFamily: 'monospace' }}>
																								{row.linkedCriteria.length > 0 ? row.linkedCriteria.map((id, i) => (
																										<span key={id} style={{ color: id === row.criterionId ? '#c53030' : '#276749' }}>
																											{id}{i < row.linkedCriteria.length - 1 ? ', ' : ''}
																										</span>
																									)) : '—'}
																								</div>
																						</td>
																								<td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>
																									<div style={{ maxHeight: '60px', overflowY: 'auto', fontSize: '0.8em', fontFamily: 'monospace' }}>
																										{row.isRoot ? (row.subCriteria.length > 0 ? row.subCriteria.join(', ') : 'None') : '—'}
																									</div>
																								</td>
																					</tr>
																				));
																			})}
																		</tbody>
																	</table>
																</div>
															)}
														</div>
													);
												});
											})()}
											</div>
                                <div className="settings-section">
                                    <h4>User Info</h4>
                                    <p>Logged in as: <strong>{user?.username || 'Guest'}</strong></p>
                                </div>
                                <div className="settings-section">
                                    <h4>Troubleshooting</h4>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        onClick={() => { setShowSettings(false); setShowClearConfirm(true); }}
                                        size="small"
                                        style={{ marginTop: '10px' }}
                                    >
                                        Reset Local Data
                                    </Button>
                                </div>
                            </>
                        ) : selectedSE ? (
                            <div className="se-details-view raw-json-container">
                                <div className="json-header-actions">
                                    {isEditingJson ? (
                                        <>
                                            {jsonError && <span className="error-text json-error-msg">{jsonError}</span>}
                                            <Button
                                                size="small"
                                                variant="contained"
                                                color="success"
                                                onClick={() => {
		                                                    try {
		                                                        const parsed = JSON.parse(editedJson);
		                                                        const typeToKeyMap = {
		                                                            ems: 'ems_full_configuration',
		                                                            mortuary: 'mortuary_full_configuration',
		                                                            clinics: 'clinics_full_configuration',
		                                                            hospital: 'hospital_full_configuration',
		                                                        };
		                                                        const key = typeToKeyMap[selectedSE._type] || 'ems_full_configuration';

		                                                        updateActiveConfigBundle((bundle) => {
		                                                            const newConfig = { ...(bundle.config || {}) };
		                                                            const list = Array.isArray(newConfig[key]) ? [...newConfig[key]] : [];
		                                                            const index = list.findIndex(se => se.se_id === selectedSE.se_id);
		                                                            if (index === -1) {
		                                                                return bundle;
		                                                            }
		                                                            list[index] = parsed;
		                                                            newConfig[key] = list;
		                                                            return { ...bundle, config: newConfig };
		                                                        });

		                                                        setSelectedSE({ ...parsed, _type: selectedSE._type });
		                                                        setIsEditingJson(false);
		                                                        setJsonError(null);
		                                                        showToast('Configuration saved successfully!', 'success');
		                                                    } catch (e) {
		                                                        setJsonError('Invalid JSON format');
		                                                    }
                                                }}
                                                style={{ marginRight: '10px' }}
                                            >
                                                Save Changes
                                            </Button>
	                                            <Button
	                                                size="small"
	                                                variant="outlined"
	                                                onClick={() => {
	                                                    setIsEditingJson(false);
	                                                    setEditedJson(JSON.stringify(selectedSE, null, 2));
	                                                    setJsonError(null);
	                                                }}
	                                            >
	                                                Cancel
	                                            </Button>
                                        </>
                                    ) : (
                                        <>
	                                            <Button
	                                                size="small"
	                                                variant="outlined"
	                                                onClick={() => setIsEditingJson(true)}
	                                                style={{ marginRight: '10px' }}
	                                            >
	                                                Edit Mode
	                                            </Button>
	                                            <Button
	                                                size="small"
	                                                variant="outlined"
	                                                onClick={() => {
	                                                    navigator.clipboard.writeText(JSON.stringify(selectedSE, null, 2));
	                                                    showToast('JSON copied to clipboard!', 'success');
	                                                }}
	                                                style={{ marginRight: '10px' }}
	                                            >
	                                                Copy JSON
	                                            </Button>
	                                            <Button
	                                                size="small"
	                                                variant="outlined"
	                                                color="error"
	                                                onClick={() => {
	                                                    if (window.confirm('Are you sure you want to reset this SE to default?')) {
	                                                        const typeToKeyMap = {
	                                                            ems: 'ems_full_configuration',
	                                                            mortuary: 'mortuary_full_configuration',
	                                                            clinics: 'clinics_full_configuration',
	                                                            hospital: 'hospital_full_configuration',
	                                                        };
	                                                        const key = typeToKeyMap[selectedSE._type] || 'ems_full_configuration';
	                                                        const defaultSourceMap = {
	                                                            ems: emsConfig,
	                                                            mortuary: mortuaryConfig,
	                                                            clinics: clinicsConfig,
	                                                            hospital: hospitalConfig,
	                                                        };
	                                                        const defaultSource = defaultSourceMap[selectedSE._type] || emsConfig;
	                                                        const defaultListKey = key;
	                                                        const defaultConfig = (defaultSource[defaultListKey] || []).find(se => se.se_id === selectedSE.se_id);

	                                                        if (!defaultConfig) {
	                                                            showToast('Default configuration not found for this SE.', 'error');
	                                                            return;
	                                                        }

	                                                        updateActiveConfigBundle((bundle) => {
	                                                            const newConfig = { ...(bundle.config || {}) };
	                                                            const list = Array.isArray(newConfig[key]) ? [...newConfig[key]] : [];
	                                                            const index = list.findIndex(se => se.se_id === selectedSE.se_id);
	                                                            if (index === -1) {
	                                                                return bundle;
	                                                            }
	                                                            list[index] = defaultConfig;
	                                                            newConfig[key] = list;
	                                                            return { ...bundle, config: newConfig };
	                                                        });

	                                                        setSelectedSE({ ...defaultConfig, _type: selectedSE._type });
	                                                        setEditedJson(JSON.stringify(defaultConfig, null, 2));
	                                                        showToast('Reset to default', 'info');
	                                                    }
	                                                }}
	                                            >
	                                                Reset
	                                            </Button>
                                        </>
                                    )}
                                </div>
                                {isEditingJson ? (
                                    <textarea
                                        className="raw-json-editor"
                                        value={editedJson}
                                        onChange={(e) => setEditedJson(e.target.value)}
                                        spellCheck="false"
                                    />
                                ) : (
                                    <pre className="raw-json-viewer">
                                        {JSON.stringify(selectedSE, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ) : showLinksEditor ? (
                            <div className="se-details-view raw-json-container">
                                <div className="json-header-actions">
                                    {isEditingLinks ? (
                                        <>
                                            {jsonError && <span className="error-text json-error-msg">{jsonError}</span>}
                                            <Button
                                                size="small"
                                                variant="contained"
                                                color="success"
                                                onClick={() => {
		                                                    try {
		                                                        const parsed = JSON.parse(editedLinksJson);
		                                                        updateActiveConfigBundle((bundle) => {
		                                                            const newLinks = { ...(bundle.links || {}) };
		                                                            newLinks[showLinksEditor] = parsed;
		                                                            return { ...bundle, links: newLinks };
		                                                        });
		                                                        setIsEditingLinks(false);
		                                                        setJsonError(null);
		                                                        showToast(`${showLinksEditor.toUpperCase()} linking configuration saved!`, 'success');
		                                                    } catch (e) {
		                                                        setJsonError('Invalid JSON format');
		                                                    }
                                                }}
                                                style={{ marginRight: '10px' }}
                                            >
                                                Save Changes
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    setIsEditingLinks(false);
	                                                    setEditedLinksJson(JSON.stringify(currentLinks, null, 2));
                                                    setJsonError(null);
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => setIsEditingLinks(true)}
                                                style={{ marginRight: '10px' }}
                                            >
                                                Edit Mode
                                            </Button>
	                                            <Button
	                                                size="small"
	                                                variant="outlined"
	                                                onClick={() => {
	                                                    navigator.clipboard.writeText(JSON.stringify(currentLinks, null, 2));
	                                                    showToast('Links JSON copied!', 'success');
	                                                }}
	                                                style={{ marginRight: '10px' }}
	                                            >
	                                                Copy JSON
	                                            </Button>
	                                            <Button
	                                                size="small"
	                                                variant="outlined"
	                                                color="error"
	                                                onClick={() => {
	                                                    if (window.confirm('Reset linking configuration to default?')) {
	                                                        const defaultLinksMap = {
	                                                            ems: emsLinks,
	                                                            hospital: hospitalLinks,
	                                                            mortuary: mortuaryLinks,
	                                                            clinics: clinicsLinks,
	                                                        };
	                                                        const defaultForType = defaultLinksMap[showLinksEditor] || emsLinks;

	                                                        updateActiveConfigBundle((bundle) => {
	                                                            const newLinks = { ...(bundle.links || {}) };
	                                                            newLinks[showLinksEditor] = defaultForType;
	                                                            return { ...bundle, links: newLinks };
	                                                        });

	                                                        setEditedLinksJson(JSON.stringify(defaultForType, null, 2));
	                                                        showToast('Reset to default', 'info');
	                                                    }
	                                                }}
	                                            >
	                                                Reset
	                                            </Button>
                                        </>
                                    )}
                                </div>
                                {isEditingLinks ? (
                                    <textarea
                                        className="raw-json-editor"
                                        value={editedLinksJson}
                                        onChange={(e) => setEditedLinksJson(e.target.value)}
                                        spellCheck="false"
                                        style={{ minHeight: '400px' }}
                                    />
                                ) : (
                                    <pre className="raw-json-viewer" style={{ minHeight: '400px' }}>
                                        {JSON.stringify(currentLinks, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ) : null}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setShowSettings(false);
                        setSelectedSE(null);
                        setShowLinksEditor(false);
                    }}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Initiate Survey Dialog */}
            <Dialog open={showCreateBaselineDialog} onClose={cancelCreateBaseline} fullWidth maxWidth="md">
                <DialogTitle>{initEditAssignmentsOnly ? 'Edit SE Assignments' : 'Initiate Survey'}</DialogTitle>
                <DialogContent dividers>
                    {initEditAssignmentsOnly && (
                        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
                            Update the SE assignees for this assessment. Existing DHIS2 assessment events will not be recreated.
                        </div>
                    )}
	                    {!initEditAssignmentsOnly && !forceSelfOnly && (
	                        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155' }}>
	                            Non-self survey types can only be initiated from a new TEI created by the scheduling programme. Existing TEIs can be opened or resumed, but not reused for another non-self survey.
	                        </div>
	                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TextField
                            select
                            label="Type of Survey"
                            value={initSurveyType}
	                            onChange={async e => {
                                const next = e.target.value;
	                                const opt = (initSurveyTypeOptions || []).find(o => o.value === next);
	                                if (isSupportiveSurveyType(opt?.label || opt?.value || next)) {
	                                    showToast?.('Supportive is no longer available as a Type of Survey. Please choose another Type of Survey.', 'error');
	                                    return;
	                                }
                                if (initHasExistingBaseline && isBaselineSurveyType(opt?.label || opt?.value || next)) {
                                    showToast?.('A Baseline survey already exists for this facility. Please choose a different Type of Survey.', 'error');
                                    return;
                                }
                                setInitSurveyType(next);
	                                if (isSelfSurveyType(opt?.label || opt?.value || next)) {
	                                    await loadSelfAssessmentAssessors(pendingOpenAssessment);
	                                }
                            }}
	                            size="small"
	                            disabled={isBaselineCreating || (lockType && !forceSelfOnly)}
                        >
	                            {(() => {
	                                const baselineOnly = initMode === 'BASELINE' && !initHasExistingBaseline;
		                                const optionsForTypeBase = forceSelfOnly
		                                    ? initSurveyTypeOptions.filter(opt => isSelfSurveyType(opt.label || opt.value))
		                                    : (baselineOnly ? initBaselineSurveyTypeOptions : initSurveyTypeOptions);
		                                const optionsForType = initSurveyType && !optionsForTypeBase.some(opt => opt.value === initSurveyType)
		                                    ? [{ value: initSurveyType, label: initSurveyType }, ...optionsForTypeBase]
		                                    : optionsForTypeBase;
	                                const menuItems = optionsForType.map(opt => {
	                                    const blockedBaseline = initHasExistingBaseline && isBaselineSurveyType(opt.label || opt.value);
	                                    return (
	                                        <MenuItem key={opt.value} value={opt.value} disabled={blockedBaseline}>
	                                            {opt.label}{blockedBaseline ? ' (already exists)' : ''}
	                                        </MenuItem>
	                                    );
	                                });
	                                if (!forceSelfOnly && !baselineOnly) {
	                                    menuItems.unshift(<MenuItem key="__empty" value="">Select...</MenuItem>);
	                                }
	                                return menuItems;
	                            })()}
                        </TextField>
                        <TextField
                            select
	                            label="Facility Type"
                            value={initFacilityGroup}
	                            onChange={async e => {
	                                const v = e.target.value;
	                                setInitFacilityGroup(v);
	                                setInitAssignments({});
	                                setInitMetadataLoading(true);
	                                try {
		                                    const metadata = await ensureSurveyMetadataForGroup(v);
		                                    setInitProgramStageMetadata(metadata);
		                                    setInitSeOptions(buildSeOptions(v, metadata));
	                                    if (initMode === 'BASELINE' && !initHasExistingBaseline && !initSurveyType) {
	                                        const loadedOptions = getSurveyTypeOptionsFromMetadata(metadata);
	                                        const baselineOpt = (loadedOptions.length > 0 ? loadedOptions : surveyTypeOptions)
	                                            .find(opt => isBaselineSurveyType(opt.label || opt.value));
	                                        if (baselineOpt) {
	                                            setInitSurveyType(baselineOpt.value);
	                                        }
	                                    }
	                                    if (configSource === 'datastore' && isOnline) {
	                                        loadRemoteConfig();
	                                    }
	                                } catch (err) {
	                                    console.error('Failed to load metadata for selected facility type', err);
		                                    showToast?.('Failed to load survey questions for the selected Facility Type.', 'error');
		                                    setInitProgramStageMetadata(null);
		                                    setInitSeOptions(buildSeOptions(v));
	                                } finally {
	                                    setInitMetadataLoading(false);
	                                }
	                            }}
                            size="small"
		                            disabled={isBaselineCreating || initMetadataLoading || lockGroup}
                        >
                            <MenuItem value="">Select...</MenuItem>
                            <MenuItem value={'HOSPITAL'}>Hospital</MenuItem>
                            <MenuItem value={'CLINICS'}>Clinics</MenuItem>
                            <MenuItem value={'EMS'}>EMS</MenuItem>
                            <MenuItem value={'MORTUARY'}>Mortuary</MenuItem>
                        </TextField>
                    </div>
	                  	                    {(isBaselineCreating && createProgress) || createDetails.length > 0 || createErrorInfo ? (
		                        <div className="create-progress-overlay">
		                            <div className={`create-progress-card ${isBaselineCreating ? 'is-running' : ''}`}>
	                                {createProgress && (() => {
	                                    const progressPercent = createProgress.total > 0
	                                        ? Math.min(100, Math.max(0, Math.round((createProgress.current / createProgress.total) * 100)))
	                                        : 0;
	                                    const displayStep = createProgress.total > 0
	                                        ? Math.min(createProgress.total, Math.max(1, createProgress.current))
	                                        : createProgress.current;
				                                    const progressMessage = String(createProgress.message || 'Working...');
				                                    const isFinalizingSetup =
				                                        displayStep >= 3 ||
				                                        /setup check|remaining setup|still preparing|setup complete|automatic setup completion|not available in dhis2/i.test(`${progressMessage} ${createDetails.join(' ')}`);
		                                    const latestDetail = createDetails[createDetails.length - 1] || progressMessage;
		                                    const elapsedLabel = createElapsedSeconds >= 60
		                                        ? `${Math.floor(createElapsedSeconds / 60)}m ${createElapsedSeconds % 60}s`
		                                        : `${createElapsedSeconds}s`;
				                                    const phaseLabel = isFinalizingSetup
				                                        ? 'Preparing remaining assessment sections'
		                                        : progressPercent >= 67
		                                            ? 'Verifying DHIS2 event visibility'
		                                            : 'Creating enrollment and event bundle';
	                                    return (
		                                        <div className="create-progress-main">
		                                            <div className="create-progress-header">
		                                                <div className="create-progress-title-wrap">
		                                                    <div className="create-progress-spinner" aria-hidden="true" />
		                                                    <div>
		                                                        <div className="create-progress-title">
		                                                            {isBaselineCreating ? 'Creating assessment in DHIS2' : 'Assessment setup'}
		                                                        </div>
		                                                        <div className="create-progress-message">
		                                                            {progressMessage}
		                                                        </div>
		                                                    </div>
		                                                </div>
		                                                <div className="create-progress-badge">
		                                                    <span className="create-progress-live-dot" />
		                                                    {progressPercent}% · Step {displayStep} of {createProgress.total}
		                                                </div>
		                                            </div>
		                                            <LinearProgress
		                                                variant="determinate"
		                                                value={progressPercent}
		                                                className={`create-progress-bar ${isBaselineCreating ? 'is-running' : ''}`}
		                                            />
		                                            <div className="create-progress-meta-grid">
		                                                <div className="create-progress-meta-card">
		                                                    <span>Current phase</span>
		                                                    <strong>{phaseLabel}</strong>
		                                                </div>
		                                                <div className="create-progress-meta-card">
		                                                    <span>Elapsed time</span>
		                                                    <strong>{elapsedLabel}</strong>
		                                                </div>
		                                            </div>
		                                            <div className="create-progress-latest">
		                                                <span className="create-progress-latest-label">Latest update</span>
		                                                <span>{latestDetail}</span>
		                                            </div>
		                                            <div className="create-progress-hint">
		                                                Please keep this window open. DHIS2 can take a moment to index events; the app is still working and will open the assessment automatically.
		                                            </div>
	                                        </div>
	                                    );
	                                })()}

		                                {createErrorInfo && (
		                                    <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
		                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Setup needs a little longer</div>
	                                        <div style={{ marginBottom: 6 }}>{createErrorInfo.message}</div>
	                                        {Array.isArray(createErrorInfo.missingTags) && createErrorInfo.missingTags.length > 0 && (
	                                            <div style={{ fontSize: '0.9rem' }}>
		                                                <div><strong>Sections still being prepared:</strong> {createErrorInfo.missingTags.join(', ')}</div>
	                                                {Number.isFinite(createErrorInfo.verifiedCount) && Number.isFinite(createErrorInfo.expectedCount) && (
		                                                    <div style={{ marginTop: 4 }}><strong>Ready so far:</strong> {createErrorInfo.verifiedCount} / {createErrorInfo.expectedCount}</div>
	                                                )}
	                                            </div>
	                                        )}
	                                        {createErrorInfo.payload && (
	                                            <div style={{ marginTop: 10 }}>
	                                                <div style={{ fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>Payload:</div>
	                                                <pre style={{ margin: 0, padding: 8, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.75rem', overflowX: 'auto', color: '#334155', maxHeight: '150px' }}>
	                                                    {JSON.stringify(createErrorInfo.payload, null, 2)}
	                                                </pre>
	                                            </div>
	                                        )}
	                                        {createErrorInfo.data && (
	                                            <div style={{ marginTop: 10 }}>
	                                                <div style={{ fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>Response Data:</div>
	                                                <pre style={{ margin: 0, padding: 8, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.75rem', overflowX: 'auto', color: '#334155', maxHeight: '150px' }}>
	                                                    {JSON.stringify(createErrorInfo.data, null, 2)}
	                                                </pre>
	                                            </div>
	                                        )}
	                                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
		                                            {pendingProvisionedBundle && (
		                                                <Button size="small" variant="outlined" color="primary" onClick={handleRepairProvisionedBundle} disabled={isBaselineCreating}>
		                                                    {isBaselineCreating ? 'Finishing setup…' : 'Continue setup & open'}
	                                                </Button>
	                                            )}
	                                            <Button size="small" variant="outlined" style={{ color: '#64748b', borderColor: '#cbd5e1' }} onClick={() => { setIsBaselineCreating(false); setCreateErrorInfo(null); setCreateDetails([]); }}>
	                                                Close
	                                            </Button>
	                                        </div>
	                                    </div>
	                                )}

		                                {createDetails.length > 0 && (
		                                    <div className="create-progress-activity">
		                                        <div className="create-progress-activity-header">
		                                            <div>Live activity</div>
		                                            {isBaselineCreating && (
		                                                <div className="create-progress-running-label">
		                                                    <span className="create-progress-live-dot" /> Running<span className="create-progress-dots">...</span>
		                                                </div>
		                                            )}
		                                        </div>
		                                        <div className="create-progress-log" role="log" aria-live="polite">
		                                            {createDetails.slice(-80).map((line, idx) => (
		                                                <div className="create-progress-log-line" key={`create-detail-top-${idx}`}>
		                                                    <span className="create-progress-log-bullet" />
		                                                    <span>{line}</span>
		                                                </div>
		                                            ))}
		                                            <div ref={createDetailsEndRef} />
		                                        </div>
		                                    </div>
		                                )}
	                            </div>
	                        </div>
	                    ) : null}
                    {initFacilityGroup && initSeOptions.length > 0 && (
                        <div style={{ marginTop: 16 }}>
	                            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 8 }}>
	                                Assign Sections (SE) to Team Members{initTeamLoading ? ' — loading Self Assessment assessors…' : ''}
	                            </div>
	                            {initAssessorLookupInfo && initTeamOptions.length === 0 && (
	                                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.85rem' }}>
	                                    No Self Assessment assessors loaded for OU {initAssessorLookupInfo.orgUnitId || 'unknown'}.
	                                    {initAssessorLookupInfo.reason ? ` ${initAssessorLookupInfo.reason}` : ''}
	                                </div>
	                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {initSeOptions.map(se => {
                                    const assigned = Array.isArray(initAssignments[se.id]) && initAssignments[se.id].length > 0;
                                    const bg = assigned ? '#ecfdf5' : '#fef2f2';
                                    const fg = assigned ? '#065f46' : '#991b1b';
                                    const bd = assigned ? '#10b981' : '#ef4444';
                                    return (
                                    <div key={se.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ minWidth: 220, padding: '4px 8px', borderRadius: 4, backgroundColor: bg, color: fg, border: `1px solid ${bd}` }}>
                                            {se.label}
                                        </div>
                                        <Autocomplete
                                            multiple
                                            options={initTeamOptions}
	                                            disabled={isBaselineCreating || initTeamLoading}
                                            getOptionLabel={(o) => o.displayName || o.id}
                                            onChange={(e, newVal) => setInitAssignments(prev => ({ ...prev, [se.id]: newVal.map(v => v.id) }))}
                                            renderInput={(params) => <TextField {...params} size="small" label="Assignees" placeholder="Select" />}
                                            value={(initAssignments[se.id] || []).map(id => initTeamOptions.find(t => t.id === id)).filter(Boolean)}
                                        />
                                    </div>
                                );})}
                            </div>
                        </div>
                    )}
                </DialogContent>
                <DialogActions>
	                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
	                        <Button onClick={randomizeSeAssignments} disabled={isBaselineCreating || initTeamLoading || (initTeamOptions.length===0 || initSeOptions.length===0)}>
	                            Randomize assignments
	                        </Button>
	                        {(initTeamOptions.length === 0 || initSeOptions.length === 0 || initTeamLoading) && (
	                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
	                                {initTeamLoading
	                                    ? 'Loading assessors…'
	                                    : initTeamOptions.length === 0
	                                        ? `No assessors loaded${initAssessorLookupInfo?.orgUnitId ? ` for OU ${initAssessorLookupInfo.orgUnitId}` : ''}.`
	                                        : 'Select a Facility Type to load SEs.'}
	                            </span>
	                        )}
	                    </div>
                    {!initEditAssignmentsOnly && <Button onClick={loadPreviousPlan} disabled={isBaselineCreating || initPlanLoading}>
                        {initPlanLoading ? 'Loading…' : 'Load previous plan'}
                    </Button>}
                    <Button onClick={cancelCreateBaseline} disabled={isBaselineCreating}>Cancel</Button>
                    <Button
                        onClick={initEditAssignmentsOnly ? saveEditedSeAssignments : (pendingProvisionedBundle ? handleRepairProvisionedBundle : confirmCreateBaseline)}
                        color="primary"
	                        disabled={isBaselineCreating || initTeamLoading || (!pendingProvisionedBundle && (!initFacilityGroup || !allSeAssigned || (!initEditAssignmentsOnly && !initSurveyType)))}
                    >
                        {initEditAssignmentsOnly
                            ? (isBaselineCreating ? 'Saving…' : 'Save Assignments')
	                            : (isBaselineCreating ? (pendingProvisionedBundle ? 'Finishing setup…' : 'Creating...') : (pendingProvisionedBundle ? 'Continue setup & open' : 'Create & Open'))}
                    </Button>
                </DialogActions>
            </Dialog>

  {/* Team Members Modal */}
  <Dialog open={teamDialogOpen} onClose={() => setTeamDialogOpen(false)}>
    <DialogTitle>Team for {teamDialogData.orgUnitName || 'Facility'}</DialogTitle>
    <DialogContent dividers>
      {teamDialogData.loading ? (
        <div style={{ color: '#4b5563' }}>Loading team...</div>
      ) : (!teamDialogData.team || teamDialogData.team.length === 0) ? (
        <div style={{ color: '#4b5563' }}>No team members found for this assessment.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {teamDialogData.team.map((m, idx) => {
            const roleRaw = String(m.teamRole || 'Member').trim();
            const roleClean = roleRaw.replace(/^FAC_ASS_ROLE_/i, '').replace(/\s+/g, '_');
            const roleText = roleClean.replace(/_/g, ' ').toUpperCase();
            return (
              <li key={`team-${idx}`} style={{ marginBottom: 6 }}>
                <strong>{m.displayName || m.assignedUserId || 'Unknown user'}</strong>
                {`, Role: ${roleText}`}
              </li>
            );
          })}
        </ul>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={() => setTeamDialogOpen(false)}>Close</Button>
    </DialogActions>
  </Dialog>
	            {/* Hospital computation mapping editor for the active configuration version */}
	            <Dialog
	                open={showComputeEditor}
	                onClose={handleCloseComputeEditor}
	                fullScreen
	            >
	                <DialogTitle>Configure Hospital computation mapping for active version</DialogTitle>
	                <DialogContent dividers>
	                    {draftComputeConfig ? (
	                        <div style={{ display: 'flex', height: '100%', gap: '16px' }}>
	                            {/* Left: Service Elements list */}
	                            <div style={{ width: '260px', borderRight: '1px solid #e2e8f0', paddingRight: '12px', overflowY: 'auto' }}>
	                                <h4 style={{ marginTop: 0 }}>Service Elements</h4>
	                                {hospitalComputeServiceElements.map(se => {
	                                    const isSelected = (selectedComputeSeId || (hospitalComputeServiceElements[0] && hospitalComputeServiceElements[0].se_id)) === se.se_id;
	                                    return (
	                                        <div
	                                            key={`compute-se-${se.se_id}`}
	                                            onClick={() => setSelectedComputeSeId(se.se_id)}
	                                            style={{
	                                                padding: '6px 8px',
	                                                marginBottom: '4px',
	                                                cursor: 'pointer',
	                                                borderRadius: '4px',
	                                                backgroundColor: isSelected ? '#edf2f7' : 'transparent',
	                                            }}
	                                        >
	                                            <div style={{ fontWeight: 600 }}>{se.se_id}</div>
	                                            <div style={{ fontSize: '0.8em', color: '#4a5568' }}>{se.name}</div>
	                                        </div>
	                                    );
	                                })}
	                                {hospitalComputeServiceElements.length === 0 && (
	                                    <div style={{ fontSize: '0.85em', color: '#718096' }}>
	                                        No Hospital computation configuration found.
	                                    </div>
	                                )}
	                            </div>

	                            {/* Right: Root criteria and sub-criteria checkboxes */}
	                            <div style={{ flex: 1, overflowY: 'auto' }}>
	                                {(() => {
	                                    const effectiveSeId = selectedComputeSeId || (hospitalComputeServiceElements[0] && hospitalComputeServiceElements[0].se_id);
	                                    const seList = (draftComputeConfig.hospital_standards_config?.service_elements) || [];
	                                    const selectedSe = seList.find(se => se.se_id === effectiveSeId) || null;
	                                    if (!effectiveSeId || !selectedSe) {
	                                        return (
	                                            <div style={{ fontSize: '0.9em', color: '#718096' }}>
	                                                Select a Service Element on the left to configure its root criteria.
	                                            </div>
	                                        );
	                                    }
	                                    const candidateCriteria = getHospitalCriteriaForSe(effectiveSeId);
	                                    return (
	                                        <div>
	                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
	                                                <div>
	                                                    <h4 style={{ margin: 0 }}>{effectiveSeId} – {selectedSe.name}</h4>
	                                                    <p style={{ margin: 0, fontSize: '0.85em', color: '#4a5568' }}>
	                                                        Tick which criteria under this SE should be included in the helper average for each root criterion.
	                                                    </p>
	                                                </div>
	                                                <Button
	                                                    size="small"
	                                                    variant="outlined"
	                                                    color="error"
	                                                    onClick={() => handleResetComputeForSe(effectiveSeId)}
	                                                >
	                                                    Reset this SE to default
	                                                </Button>
	                                            </div>
	                                            {(selectedSe.root_criteria || []).map(root => {
	                                                const selectedSet = new Set(root.sub_criteria || []);
	                                                return (
	                                                    <div key={root.id} style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 10px', marginBottom: '10px' }}>
	                                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
	                                                            {root.id}: {root.description}
	                                                        </div>
	                                                        <div style={{ fontSize: '0.8em', color: '#4a5568', marginBottom: '4px' }}>
	                                                            Select sub-criteria to include in the average for this root.
	                                                        </div>
	                                                        <div style={{ maxHeight: '220px', overflowY: 'auto', paddingLeft: '4px' }}>
	                                                            {candidateCriteria.length === 0 && (
	                                                                <div style={{ fontSize: '0.85em', color: '#718096' }}>
	                                                                    No criteria found for this Service Element in the Hospital config.
	                                                                </div>
	                                                            )}
	                                                            {candidateCriteria.map(c => {
	                                                                const critId = c.id;
	                                                                const isChecked = selectedSet.has(critId);
	                                                                return (
	                                                                    <label
	                                                                        key={`${root.id}-${critId}`}
	                                                                        style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', fontSize: '0.85em', marginBottom: '2px' }}
	                                                                    >
	                                                                        <Checkbox
	                                                                            size="small"
	                                                                            checked={isChecked}
	                                                                            onChange={(e) => handleToggleSubCriterion(effectiveSeId, root.id, critId, e.target.checked)}
	                                                                        />
	                                                                        <span>
	                                                                            <strong>{critId}</strong> – {c.description}
	                                                                        </span>
	                                                                    </label>
	                                                                );
	                                                            })}
	                                                        </div>
	                                                    </div>
	                                                );
	                                            })}
	                                        </div>
	                                    );
	                                })()}
	                            </div>
	                        </div>
	                    ) : (
	                        <div style={{ fontSize: '0.9em', color: '#718096' }}>
	                            Loading computation configuration...
	                        </div>
	                    )}
	                </DialogContent>
	                <DialogActions>
	                    <Button onClick={handleCloseComputeEditor}>Cancel</Button>
	                    <Button
	                        onClick={() => {
	                            if (!draftComputeConfig) {
	                                handleCloseComputeEditor();
	                                return;
	                            }
	                            updateActiveConfigBundle((bundle) => ({
	                                ...bundle,
	                                compute: draftComputeConfig,
	                            }));
	                            showToast('Hospital computation mapping updated for active version.', 'success');
	                            handleCloseComputeEditor();
	                        }}
	                        variant="contained"
	                        color="primary"
	                    >
	                        Save
	                    </Button>
	                </DialogActions>
	            </Dialog>
	            {/* New Configuration Version Dialog */}
	            <Dialog
	                open={showNewVersionDialog}
	                onClose={() => setShowNewVersionDialog(false)}
	                fullScreen
	            >
	                <DialogTitle>Create new configuration version</DialogTitle>
	                <DialogContent dividers>
	                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
	                        <div>
	                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9em' }}>Version name</label>
	                            <input
	                                type="text"
	                                value={newVersionName}
	                                onChange={e => setNewVersionName(e.target.value)}
	                                placeholder="e.g. V2 \\u2013 2026 update"
	                                style={{ width: '100%', padding: '6px 8px', marginTop: '4px' }}
	                            />
	                        </div>
	                        <div>
	                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9em' }}>Description</label>
	                            <textarea
	                                value={newVersionDescription}
	                                onChange={e => setNewVersionDescription(e.target.value)}
	                                placeholder="Short explanation of what this version changes or focuses on."
	                                rows={3}
	                                style={{ width: '100%', padding: '6px 8px', marginTop: '4px', resize: 'vertical' }}
	                            />
	                        </div>
	                        <div style={{ fontSize: '0.85em', color: '#4a5568' }}>
	                            This version will include:
	                            <ul style={{ marginTop: '4px', paddingLeft: '18px' }}>
	                                <li>Service Element Configuration</li>
	                                <li>Criteria Linkage Configuration</li>
	                                <li>Criteria and Sub Criteria for Computation</li>
	                            </ul>
	                            In future, these versions will be loaded from DHIS2 dataStore and can be
	                            activated per assessment programme.
	                        </div>
	                    </div>
	                </DialogContent>
	                <DialogActions>
	                    <Button onClick={() => setShowNewVersionDialog(false)}>Cancel</Button>
	                    <Button onClick={handleCreateNewVersion} variant="contained" color="primary">
	                        Create draft version
	                    </Button>
	                </DialogActions>
	            </Dialog>

            {/* Preview Modal */}
            {
                previewEvent && (
                    <SurveyPreview event={previewEvent} onClose={() => setPreviewEvent(null)} />
                )
            }
        </div>
    );
}
