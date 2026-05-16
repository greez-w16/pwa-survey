import React, { useState, useMemo, useEffect } from 'react';
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
import './Dashboard.css';

export function Dashboard() {
	    const navigate = useNavigate();
	    const [searchParams] = useSearchParams();
	    const {
	        configuration,
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
    const [initPlanLoading, setInitPlanLoading] = useState(false);
    const [initMode, setInitMode] = useState('BASELINE'); // BASELINE | FOLLOWUP
    const [forceSelfOnly, setForceSelfOnly] = useState(false);
    const [lockType, setLockType] = useState(false);
    const [lockGroup, setLockGroup] = useState(false);
    const [initHasExistingBaseline, setInitHasExistingBaseline] = useState(false);
    const [initEditAssignmentsOnly, setInitEditAssignmentsOnly] = useState(false);
    const [initiatingAssessmentKey, setInitiatingAssessmentKey] = useState(null);

    const allSeAssigned = React.useMemo(() => {
        if (!initFacilityGroup || !initSeOptions || initSeOptions.length === 0) return false;
        for (const se of initSeOptions) {
            const arr = initAssignments[se.id] || [];
            if (!Array.isArray(arr) || arr.length === 0) return false;
        }
        return true;
    }, [initFacilityGroup, initSeOptions, initAssignments]);
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

    // Resolve the DataElement ID for "Type of Assessment" from loaded metadata
    const surveyTypeDeId = useMemo(() => {
        const ps = configuration?.programStage;
        if (!ps) return null;
        const candidates = (ps.programStageDataElements || []).map(psde => psde.dataElement || psde);
        const match = candidates.find(de => {
            const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
            return n.includes('type of assessment') || n.includes('assessment type');
        });
        return match?.id || null;
    }, [configuration]);

    const surveyTypeOptions = useMemo(() => {
        try {
            const ps = configuration?.programStage;
            const all = (ps?.programStageDataElements || []).map(psde => psde.dataElement || psde);
            const de = all.find(d => (d?.id || '') === surveyTypeDeId);
            const opts = de?.optionSet?.options || [];
            return opts
                .map(o => ({ value: o.code || o.displayName || o.name, label: o.displayName || o.name || o.code }))
                .filter(o => {
                    const text = `${o.value || ''} ${o.label || ''}`.toLowerCase().replace(/[_-]+/g, ' ');
                    return !(text.includes('supportive') || (text.includes('support') && text.includes('visit')));
                });
        } catch (_) { return []; }
    }, [configuration, surveyTypeDeId]);

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

    // Resolve the DataElement ID for "Assessment Group" from loaded metadata
    const surveyGroupDeId = useMemo(() => {
        const ps = configuration?.programStage;
        if (!ps) return null;
        const candidates = (ps.programStageDataElements || []).map(psde => psde.dataElement || psde);
        const byName = candidates.find(de => {
            const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
            return n.includes('assessment group') || n.includes('facility assessment group');
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

    // Build SE options for the selected Facility Group
    const buildSeOptions = (groupKey) => {
        try {
            const ns = String(groupKey || '').toUpperCase();
            let arr = [];
            if (ns === 'HOSPITAL') arr = hospitalConfig.hospital_full_configuration || [];
            else if (ns === 'CLINICS') arr = clinicsConfig.clinics_full_configuration || [];
            else if (ns === 'EMS') arr = emsConfig.ems_full_configuration || [];
            else if (ns === 'MORTUARY') arr = mortuaryConfig.mortuary_full_configuration || [];
            const seList = (arr || []).map(se => ({ id: String(se.se_id), label: `SE ${se.se_id} ${se.se_name || se.name || ''}`.trim() }));
            return seList;
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
    }, [toFacilityGroupKey]);

    const getFacilityGroupLabel = React.useCallback((facilityGroupKey) => {
        const labelMap = { HOSPITAL: 'Hospital', CLINICS: 'Clinics', EMS: 'EMS', MORTUARY: 'Mortuary' };
        return labelMap[String(facilityGroupKey).toUpperCase()] || String(facilityGroupKey || '');
    }, []);

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
        assessorUserId = null,
    } = {}) => {
        if (!assessmentDetailsFields.length) return [];

        const detailFieldIds = new Set(assessmentDetailsFields.map(field => field.id).filter(Boolean));
        const valuesByDe = new Map();
        const setValue = (dataElement, value) => {
            if (!dataElement || !detailFieldIds.has(dataElement)) return;
            if (value === undefined || value === null) return;
            const text = String(value).trim();
            if (text === '') return;
            valuesByDe.set(dataElement, { dataElement, value: value });
        };
        const hasValue = (dataElement) => valuesByDe.has(dataElement);

        const setupDataValues = Array.isArray(assessment?.setupEventDataValues) ? assessment.setupEventDataValues : [];
        setupDataValues.forEach(dv => setValue(dv?.dataElement, dv?.value));

        const facilityGroupLabel = getFacilityGroupLabel(facilityGroupKey);
        assessmentDetailsFields.forEach(field => {
            const fieldId = field?.id;
            const label = String(field?.displayName || field?.formName || field?.name || field?.shortName || '').toLowerCase();
            const code = String(field?.code || '').toUpperCase();

            if (fieldId === surveyTypeDeId || label.includes('type of assessment') || label.includes('assessment type')) {
                if (!hasValue(fieldId)) setValue(fieldId, surveyTypeValue);
                return;
            }
            if (fieldId === surveyGroupDeId || label.includes('assessment group') || label.includes('facility assessment group')) {
                if (!hasValue(fieldId)) setValue(fieldId, facilityGroupLabel);
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

    const finalizeProvisionedAssessmentOpen = React.useCallback(({ assessment, teiId, enrollmentId, eventIdMap, surveyType, facilityGroup, detailsDataValues = [] }) => {
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
        const withBaseline = {
            ...assessment,
            trackedEntityInstance: teiId,
            scheduleTeiId: teiId,
            baselineEventId: eventIdMap?.FINAL || null,
            preloadDataValues: preload,
	            // The just-created event map is authoritative. Replace any stale
	            // local draft map that may have been produced by an earlier failed
	            // readback/repair attempt.
	            preloadMode: 'REPLACE'
        };
        navigate(
            `/form?assessmentId=${assessment.eventId || eventIdMap?.FINAL || teiId}&baselineId=${eventIdMap?.FINAL || ''}`,
            { state: { selectedAssignment: withBaseline } }
        );
    }, [getFacilityGroupLabel, navigate, surveyGroupDeId, surveyTypeDeId]);

    const repairAssessmentBundle = React.useCallback(async ({ assessment, teiId, orgUnitId, enrollmentId = null, facilityGroup, surveyType, expectedTags = null, logLine = null }) => {
        if (!teiId || !orgUnitId) throw new Error('Assessment TEI or org unit is missing for repair.');
        const programId = configuration?.program?.id || 'G2gULe4jsfs';
        const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
        const planInfo = await findAssessmentPlanForTei({ teiId, preferredNs: facilityGroup });
        const resolvedGroup = toFacilityGroupKey(facilityGroup || planInfo?.plan?.facilityGroup || assessment?.parentGroupId || '');
        const resolvedType = surveyType || planInfo?.plan?.typeOfAssessment || '';
        const detailsDataValues = buildAssessmentDetailsDataValues(assessment, {
            teiId,
            enrollmentId: enrollmentId || null,
            surveyTypeValue: resolvedType,
            facilityGroupKey: resolvedGroup,
            assessorUserId: user?.id || null,
        });
        const tagsToExpect = Array.isArray(expectedTags) && expectedTags.length > 0 ? expectedTags : getExpectedTagsForGroup(resolvedGroup);
        if (!resolvedGroup || tagsToExpect.length <= 1) throw new Error('Could not determine the expected SE list for this assessment.');

        const beforeMap = await readSurveyTagMap({ teiId, orgUnitId, programId, stageId });
        let missingTags = tagsToExpect.filter(tag => !beforeMap[tag]);
        if (missingTags.length === 0) {
            logLine?.('No missing SYS_TAG events found.');
            return { tagMap: beforeMap, missingTags: [], facilityGroup: resolvedGroup, surveyType: resolvedType };
        }

        logLine?.(`Repairing missing SYS_TAG events: ${missingTags.join(', ')}`);
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
                logLine?.(`Repair verification ${attempt}/${totalAttempts}: ${visibleCount}/${tagsToExpect.length} tags visible${stillMissing.length ? `; still missing ${stillMissing.join(', ')}` : ''}.`);
            }
        });

        const mergedTagMap = { ...createdTagMap, ...verification.tagMap };
        missingTags = tagsToExpect.filter(tag => !mergedTagMap[tag]);
        if (missingTags.length > 0) {
            throw new Error(`Assessment repair incomplete. Missing DHIS2 events for: ${missingTags.join(', ')}`);
        }

        return { tagMap: mergedTagMap, missingTags: [], facilityGroup: resolvedGroup, surveyType: resolvedType };
    }, [buildAssessmentDetailsDataValues, configuration, findAssessmentPlanForTei, getExpectedTagsForGroup, pollForExpectedTags, readSurveyTagMap, toFacilityGroupKey, user?.id]);

    // (duplicate declarations removed)

    // State for success popup
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
	    const [isAssessmentsCollapsed, setIsAssessmentsCollapsed] = useState(true);
	    const [showSettings, setShowSettings] = useState(false);
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
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const teiId = assessment.trackedEntityInstance || assessment.scheduleTeiId || null;
            // Prefer facility orgUnit id for event lookup; fall back to program OU
            const orgUnitId = assessment.orgUnitId || assessment.programOrgUnitId || null;

            // fetch all survey events for this Org Unit (regardless of TEI) to capture both 
            // scheduled and self-initiated assessments in the history table.
            console.log('[AssocEvents] fetching for OrgUnit', { assocKey, programId, stageId, orgUnitId });
            const survey = await api
                .getSurveyEventsForOrgUnit({ orgUnitId, programId, stageId, fields: 'event,eventDate,status,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]' })
                .catch(() => []);
            console.log('[AssocEvents] fetched', { assocKey, count: Array.isArray(survey) ? survey.length : 0 });

            setAssociatedByEnrollment(prev => ({
                ...prev,
                [assocKey]: {
                    loading: false,
                    survey: (survey||[]).map(e => ({ ...e, _type: 'Survey' }))
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
	            const programId = configuration?.program?.id || 'G2gULe4jsfs';
	            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
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
	    }, [configuration]);

	    React.useEffect(() => {
	        if (assessmentsLoading) return;
	        const all = [...(pendingAssessments || []), ...(upcomingAssessments || [])];
	        const seen = new Set();
	        all.forEach(assessment => {
	            const assocKey = getAssocKey(assessment);
	            if (!assocKey || seen.has(assocKey)) return;
	            seen.add(assocKey);
	            const current = assessmentEventPresenceByKey?.[assocKey];
	            if (current && (current.loading || typeof current.hasAssessmentEvent === 'boolean')) return;
	            checkAssessmentEventPresence(assessment);
	        });
	    }, [assessmentsLoading, pendingAssessments, upcomingAssessments, assessmentEventPresenceByKey, checkAssessmentEventPresence]);

    const toggleExpandAssessment = async (assessment) => {
        const k = getAssocKey(assessment);
        setExpandedAssignments(prev => ({ ...prev, [k]: !prev[k] }));
        const alreadyLoaded = associatedByEnrollment[k] && !associatedByEnrollment[k].loading && Array.isArray(associatedByEnrollment[k].survey);
        if (!alreadyLoaded) {
            await loadAssociatedEvents(assessment);
        }
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

    // Open a specific main-survey event from the associated-events table for editing
    const openAssociatedSurvey = async (assessment, ev) => {
        if (!ev?.event) return;
        const withBaseline = { ...assessment, baselineEventId: ev.event };
        
        // New model: one TEI = one assessment. Prefer the bundled events if the
        // clicked row already represents an assessment bundle.
        const assocKey = getAssocKey(assessment);
        const allSurveyEvents = associatedByEnrollment[assocKey]?.survey || [];
        const relatedEvents = Array.isArray(ev._bundleEvents) && ev._bundleEvents.length > 0
            ? [...ev._bundleEvents]
            : allSurveyEvents.filter(e => {
                const sameTei = (e?.trackedEntityInstance || '') === (ev?.trackedEntityInstance || '');
                const sameDate = e?.eventDate && ev?.eventDate && e.eventDate.substring(0, 10) === ev.eventDate.substring(0, 10);
                return sameTei || sameDate;
            });
        if (relatedEvents.length === 0) relatedEvents.push(ev);
        const primaryEvent = relatedEvents.find(e => getSysTag(e) === 'FINAL') || ev;

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
        
        // Save the eventIdMap into preload so App.jsx can use it
        preload['eventIdMap_internal'] = JSON.stringify(eventIdMap);

        // The baseline assessment group comes from the primary (FINAL) event usually
        const ag = (primaryEvent.dataValues || []).find(d => d.dataElement === 'pzenrgsSny3');
        if (ag && ag.value !== undefined && String(ag.value).trim() !== '') {
            preload['pzenrgsSny3'] = ag.value;
        } else {
            // Fallback: resolve baseline Assessment Group from earliest event for this TEI
            try {
                const programId = configuration?.program?.id || 'G2gULe4jsfs';
                const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
                // Prefer TEI from the clicked event row; fall back to assignment
                const teiId = primaryEvent.trackedEntityInstance || ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || null;
                const orgUnitId = assessment.orgUnitId || (typeof assessment.orgUnit === 'string' ? assessment.orgUnit : assessment.orgUnit?.id) || null;
                if (teiId) {
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

        const selected = { ...withBaseline, baselineEventId: primaryEvent.event, preloadDataValues: preload, hydrateAll: true, preloadMode: 'REPLACE' };
        // Keep using the assignment's id in the URL for stable draft grouping
        const urlId = assessment.eventId || assessment.enrollment || primaryEvent.event || ev.event;
        navigate(`/form?assessmentId=${urlId}&baselineId=${primaryEvent.event || ev.event}`, { state: { selectedAssignment: selected } });
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
        if (!assessment || !surveyTypeDeId) return false;
        const programId = configuration?.program?.id || 'G2gULe4jsfs';
        const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
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
    }, [configuration, surveyTypeDeId, isBaselineSurveyType]);

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

    const handleOpenAssessment = async (assessment) => {
        try {
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const orgUnitId = resolveOrgUnitForAssessment(assessment);
            const teiId = resolveTeiForAssessment(assessment);

            if (!orgUnitId || !teiId) {
                navigate(`/form?assessmentId=${assessment.eventId}`, { state: { selectedAssignment: assessment } });
                return;
            }

            // New model: one TEI represents one assessment, so hydrate the full
            // assessment bundle (FINAL + all SE events) before opening the form.
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

            if (Array.isArray(surveyEvents) && surveyEvents.length > 0) {
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
                    preloadDataValues: preload,
                    hydrateAll: true,
                    preloadMode: 'REPLACE'
                };
                const urlId = assessment.eventId || assessment.enrollment || finalEventId;
                navigate(
                    `/form?assessmentId=${encodeURIComponent(urlId)}&baselineId=${encodeURIComponent(finalEventId || '')}&draftKey=${encodeURIComponent(finalEventId || urlId)}&assessmentTeiId=${encodeURIComponent(teiId)}`,
                    { state: { selectedAssignment: selected } }
                );
                return;
            }

            // No baseline exists yet. Only Team Lead may initiate.
            const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i,'').toUpperCase();
            const isLead = /LEAD|LEADER/.test(roleNorm);
            if (!isLead) {
                if (typeof showToast === 'function') {
                    showToast('Please contact the Team Lead to initiate the survey.', 'warning');
                }
                return;
            }

            // Prime Initiate Survey dialog with team and defaults
            try {
                const team = Array.isArray(assessment.team) ? assessment.team : [];
                const ids = [];
                team.forEach(m => { const raw = String(m.assignedUserId || '').trim(); if (raw) raw.split('|').forEach(p => ids.push(p.trim())); });
                const uniq = Array.from(new Set(ids));
                const map = await api.resolveUserDisplayNames(uniq);
                const resolved = team.map(m => {
                    const raw = String(m.assignedUserId || '').trim();
                    const keys = raw ? raw.split('|').map(s => s.trim()) : [];
                    const hit = keys.map(k => map[k]).find(Boolean);
                    return { id: raw, displayName: hit?.displayName || raw, role: m.teamRole };
                });
                // Order: Lead first, then alphabetical
                const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
                resolved.sort((a, b) => {
                    const ar = roleRank(a.role); const br = roleRank(b.role);
                    if (ar !== br) return ar - br;
                    return String(a.displayName||'').localeCompare(String(b.displayName||''));
                });
                setInitTeamOptions(resolved);
            } catch (_) { setInitTeamOptions([]); }
            const hasExistingBaseline = await assessmentHasBaselineSurvey(assessment);
            const baselineOpt = (baselineSurveyTypeOptions || [])[0];
            setInitHasExistingBaseline(hasExistingBaseline);
            setInitSurveyType(!hasExistingBaseline && baselineOpt ? baselineOpt.value : '');
            setInitFacilityGroup('');
            setInitSeOptions([]);
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
            setShowCreateBaselineDialog(true);
        } catch (err) {
            console.error('Error opening assessment:', err);
            navigate(`/form?assessmentId=${assessment.eventId}`, { state: { selectedAssignment: assessment } });
        }
    };

    // New explicit initiate handler: opens the Initiate dialog even if a
    // baseline already exists. In follow-up mode, Type is locked to Self
    // Assessment and Facility Group is locked to the baseline's group.
    const handleInitiateSurvey = async (assessment, { selfOnly = false } = {}) => {
        const actionKey = assessment?.eventId || assessment?.enrollment || assessment?.trackedEntityInstance || assessment?.scheduleTeiId || assessment?.orgUnitId || 'unknown';
        setInitiatingAssessmentKey(actionKey);
        const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i,'').toUpperCase();
        const isLead = /LEAD|LEADER/.test(roleNorm);
        if (!isLead) {
            showToast?.('Please contact the Team Lead to initiate the survey.', 'warning');
            setInitiatingAssessmentKey(null);
            return;
        }
        try {
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const orgUnitId = resolveOrgUnitForAssessment(assessment);
            const teiId = resolveTeiForAssessment(assessment);
            let latestEventId = null;
            try { latestEventId = await api.getLatestSurveyEventId({ programId, stageId, teiId, orgUnitId }); } catch (_) {}
            if (latestEventId) {
                // A baseline (or previous) event exists → open dialog in FOLLOWUP mode
                await openInitiateSurveyFollowUp(assessment, { selfOnly });
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
        try {
            // Build team options (same as in handleOpenAssessment)
            try {
                const team = Array.isArray(assessment.team) ? assessment.team : [];
                const ids = [];
                team.forEach(m => { const raw = String(m.assignedUserId || '').trim(); if (raw) raw.split('|').forEach(p => ids.push(p.trim())); });
                const uniq = Array.from(new Set(ids));
                const map = await api.resolveUserDisplayNames(uniq);
                const resolved = team.map(m => {
                    const raw = String(m.assignedUserId || '').trim();
                    const keys = raw ? raw.split('|').map(s => s.trim()) : [];
                    const hit = keys.map(k => map[k]).find(Boolean);
                    return { id: raw, displayName: hit?.displayName || raw, role: m.teamRole };
                });
                const roleRank = (r) => (/lead|leader/i.test(String(r || '')) ? 0 : 1);
                resolved.sort((a, b) => { const ar = roleRank(a.role); const br = roleRank(b.role); if (ar !== br) return ar - br; return String(a.displayName||'').localeCompare(String(b.displayName||'')); });
                setInitTeamOptions(resolved);
            } catch (_) { setInitTeamOptions([]); }

            const hasExistingBaseline = await assessmentHasBaselineSurvey(assessment);
            setInitHasExistingBaseline(hasExistingBaseline);

            // Determine baseline facility group and lock it
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const orgUnitId = resolveOrgUnitForAssessment(assessment);
            const teiId = resolveTeiForAssessment(assessment);
            let baselineGroupText = null;
            try { baselineGroupText = await api.getBaselineAssessmentGroup({ teiId, orgUnitId, programId, stageId }); } catch (_) {}
            const toGroupKey = (txt) => {
                const t = String(txt || '').toLowerCase();
                if (t.includes('hosp')) return 'HOSPITAL';
                if (t.includes('clinic')) return 'CLINICS';
                if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'EMS';
                if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
                return '';
            };
            const grp = toGroupKey(baselineGroupText) || (assessment.parentGroupId || '');
            if (grp) {
                setInitFacilityGroup(grp);
                setInitSeOptions(buildSeOptions(grp));
                setLockGroup(true);
            }

            if (selfOnly) {
                const selfOpt = (surveyTypeOptions || []).find(o => isSelfSurveyType(o.label || o.value) ) || (surveyTypeOptions || [])[0];
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
            setShowCreateBaselineDialog(true);
        } catch (e) {
            console.warn('openInitiateSurveyFollowUp failed', e);
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
            const seOpts = buildSeOptions(grp);
            setInitSeOptions(seOpts);
            const toCode = (val) => {
                const m = (surveyTypeOptions || []).find(o => o.value === val || o.label === val);
                return m ? m.value : val;
            };
            const previousType = toCode(found.typeOfAssessment || '');
            if (initMode === 'BASELINE' && !initHasExistingBaseline && !isBaselineSurveyType(previousType)) {
                const baselineOpt = (baselineSurveyTypeOptions || [])[0];
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
            const toSurveyTypeCode = (val) => {
                if (!val || val === '-') return '';
                const m = (surveyTypeOptions || []).find(o => o.value === val || o.label === val);
                return m ? m.value : val;
            };

            setInitFacilityGroup(groupKey);
            setInitSeOptions(buildSeOptions(groupKey));
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
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
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
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const trackedEntityTypeId = configuration?.program?.trackedEntityType?.id || 'uTTDt3fuXZK';
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
            if (!allSeAssigned) {
                showToast?.('Please assign at least one team member to every SE before proceeding.', 'error');
                setIsBaselineCreating(false);
                return;
            }

            const selectedTypeMeta = (surveyTypeOptions || []).find(o => o.value === initSurveyType);
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
            const isSelfSelected = /self/i.test(String(selectedTypeMeta?.label || selectedTypeMeta?.value || ''));
            const totalSteps = initSeOptions.length + 2;

            // New model: every Self Assessment gets its own assessment TEI.
            // Normal assessments reuse the selected authorised TEI, but receive a
            // fresh survey-program enrollment for this assessment instance.
            if (isSelfSelected) {
                updateCreateProgress(0, totalSteps, 'Creating assessment TEI and enrollment...');
                const created = await api.createAssessmentTei({ programId, orgUnitId, trackedEntityTypeId });
                teiId = created?.teiId || null;
                enrollmentId = created?.enrollmentId || null;
                if (!teiId) throw new Error('Failed to create a TEI for the new Self Assessment.');
                if (!enrollmentId) throw new Error('Failed to create an enrollment for the new Self Assessment.');
                setCreateDetails(prev => [...prev, `New assessment TEI created: ${teiId}`, `New enrollment created: ${enrollmentId}`]);
            } else if (!teiId) {
                throw new Error('Could not resolve the selected assessment TEI.');
            } else {
                updateCreateProgress(0, totalSteps, 'Creating assessment enrollment...');
                try {
                    const created = await api.createAssessmentEnrollment({ programId, orgUnitId, teiId, trackedEntityTypeId });
                    enrollmentId = created?.enrollmentId || null;
                    if (!enrollmentId) throw new Error('Failed to create a new enrollment for the selected assessment TEI.');
                    setCreateDetails(prev => [...prev, `New enrollment created for TEI ${teiId}: ${enrollmentId}`]);
                } catch (enrollErr) {
                    if (enrollErr?.message && enrollErr.message.includes('already has an active enrollment')) {
                        throw new Error('This facility already has an active assessment enrollment. You can only initiate a Self Assessment.');
                    }
                    throw enrollErr;
                }
            }

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
                assessorUserId: user?.id || null,
            });

            const baseStep = 1;
            updateCreateProgress(baseStep, totalSteps, 'Creating assessment events...');

            const provisionTaggedEvent = async (tag) => {
                try {
                    return await api.createSurveyEvent({
                        programId,
                        stageId,
                        orgUnitId,
                        teiId,
                        enrollmentId,
                        status: 'ACTIVE',
                        dataValues: [
                            ...assessmentDetailsDataValues,
                            { dataElement: SYS_TAG_DE_ID, value: String(tag) }
                        ],
                        notes: []
                    });
                } catch (e) {
                    const msg = e?.message || 'Unknown DHIS2 event creation failure';
                    setCreateDetails(prev => [...prev, `DHIS2 rejected ${tag}: ${msg}`]);
                    throw new Error(`DHIS2 rejected ${tag}: ${msg}`);
                }
            };

            // Create FINAL event (acts as the primary baseline event)
            const finalEventId = await provisionTaggedEvent('FINAL');

            // Create an event for each SE and track their IDs
            const eventIdMap = { 'FINAL': finalEventId };
            let step = baseStep + 1;
            for (const se of initSeOptions) {
                updateCreateProgress(step, totalSteps, `Provisioning ${se.label}...`);
                const seEventId = await provisionTaggedEvent(String(se.id));
                eventIdMap[se.id] = seEventId;
                step++;
            }

            // Verify that every expected SYS_TAG becomes visible in DHIS2.
            // Do NOT create duplicate repair events on a fast readback miss.
            const expectedTags = ['FINAL', ...initSeOptions.map(se => String(se.id))];
            const visibilityResult = await pollForExpectedTags({
                teiId,
                orgUnitId,
                programId,
                stageId,
                expectedTags,
                onAttempt: ({ attempt, totalAttempts, missingTags }) => {
                    if (attempt > 1) {
                        updateCreateProgress(step, totalSteps, `Waiting for DHIS2 to index assessment events (${attempt}/${totalAttempts})...`);
                    } else {
                        updateCreateProgress(step, totalSteps, 'Verifying assessment events in DHIS2...');
                    }
                    const visibleCount = expectedTags.length - missingTags.length;
                    setCreateDetails(prev => [...prev, `DHIS2 visibility check ${attempt}/${totalAttempts}: ${visibleCount}/${expectedTags.length} tags visible${missingTags.length ? `; still missing ${missingTags.join(', ')}` : ''}.`]);
                }
            });
	            const createdMapMissingTags = expectedTags.filter(tag => !eventIdMap[tag]);
	            if (createdMapMissingTags.length > 0) {
	                const failureInfo = {
	                    message: `Assessment provisioning incomplete. DHIS2 did not return event IDs for: ${createdMapMissingTags.join(', ')}`,
	                    missingTags: createdMapMissingTags,
	                    expectedCount: expectedTags.length,
	                    verifiedCount: expectedTags.length - createdMapMissingTags.length,
	                    teiId,
	                    orgUnitId,
	                    programId,
	                    stageId,
	                    facilityGroup: ns,
	                    surveyType: initSurveyType,
	                };
	                setCreateErrorInfo(failureInfo);
	                const error = new Error(failureInfo.message);
	                error.createErrorInfo = failureInfo;
	                throw error;
	            }

	            const readbackTagMap = visibilityResult.tagMap || {};
	            const readbackMissingTags = expectedTags.filter(tag => !readbackTagMap[tag]);
	            setCreateDetails(prev => [
	                ...prev,
	                `Created ${expectedTags.length}/${expectedTags.length} event mappings from DHIS2 create responses.`,
	                `Readback saw ${expectedTags.length - readbackMissingTags.length}/${expectedTags.length} SYS_TAGs${readbackMissingTags.length ? `; pending DHIS2 visibility for ${readbackMissingTags.join(', ')}` : ''}.`
	            ]);

	            Object.entries(readbackTagMap).forEach(([tag, readbackEventId]) => {
	                if (!expectedTags.includes(tag) || !readbackEventId) return;
	                if (eventIdMap[tag] && eventIdMap[tag] !== readbackEventId) {
	                    setCreateDetails(prev => [...prev, `SYS_TAG ${tag} readback returned ${readbackEventId}, but create response returned ${eventIdMap[tag]}; keeping create-response ID.`]);
	                }
	            });

	            try {
	                await api.upsertDataStoreItem(ns, teiId, {
	                    ...body,
	                    eventIdMap,
	                    eventIdMapSource: 'CREATE_RESPONSE',
	                    eventIdMapUpdatedAt: new Date().toISOString(),
	                });
	            } catch (e) {
	                console.warn('DataStore eventIdMap upsert failed (non-fatal)', e);
	            }
            updateCreateProgress(step, totalSteps, 'Finalizing setup...');

            setPendingProvisionedBundle(null);
            finalizeProvisionedAssessmentOpen({
                assessment: pendingOpenAssessment,
                teiId,
                enrollmentId,
                eventIdMap,
                surveyType: initSurveyType,
                facilityGroup: ns,
                detailsDataValues: assessmentDetailsDataValues,
            });
        } catch (err) {
            console.error('Failed to create baseline event:', err);
            const info = err?.createErrorInfo || (() => {
                const match = String(err?.message || '').match(/Missing DHIS2 events for:\s*(.*)$/i);
                const missingTags = match?.[1] ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
                return {
                    message: err?.message || 'Failed to initialize assessment.',
                    missingTags,
                    expectedCount: initSeOptions.length + 1,
                    verifiedCount: missingTags.length > 0 ? (initSeOptions.length + 1 - missingTags.length) : null,
                };
            })();
            setCreateErrorInfo(info);
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
            setCreateProgress({ current: 0, total: 1, message: 'Repairing missing assessment events...' });
            setCreateDetails(prev => [...prev, 'Starting assessment repair...']);
            const repaired = await repairAssessmentBundle({
                assessment: pendingProvisionedBundle.assessment,
                teiId: pendingProvisionedBundle.teiId,
                orgUnitId: pendingProvisionedBundle.orgUnitId,
                enrollmentId: pendingProvisionedBundle.enrollmentId,
                facilityGroup: pendingProvisionedBundle.facilityGroup,
                surveyType: pendingProvisionedBundle.surveyType,
                expectedTags: getExpectedTagsForGroup(pendingProvisionedBundle.facilityGroup),
                logLine: (line) => setCreateDetails(prev => [...prev, line])
            });
            const repairedEventMap = { ...(pendingProvisionedBundle.eventIdMap || {}), ...(repaired.tagMap || {}) };
            setPendingProvisionedBundle(null);
            showToast?.('Missing assessment events repaired successfully.', 'success');
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
                    assessorUserId: user?.id || null,
                }),
            });
        } catch (err) {
            const match = String(err?.message || '').match(/Missing DHIS2 events for:\s*(.*)$/i);
            const missingTags = match?.[1] ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
            setCreateErrorInfo({
                message: err?.message || 'Assessment repair failed.',
                missingTags,
                expectedCount: pendingProvisionedBundle?.facilityGroup ? getExpectedTagsForGroup(pendingProvisionedBundle.facilityGroup).length : null,
                verifiedCount: pendingProvisionedBundle?.facilityGroup && missingTags.length > 0 ? (getExpectedTagsForGroup(pendingProvisionedBundle.facilityGroup).length - missingTags.length) : null,
            });
            setCreateDetails(prev => [...prev, `Error: ${err?.message || 'Assessment repair failed.'}`]);
            showToast?.(err?.message || 'Assessment repair failed.', 'error');
        } finally {
            setIsBaselineCreating(false);
            setCreateProgress(null);
        }
    };

    const repairAssociatedAssessment = async (assessment, ev, facilityGroupValue, surveyTypeValue) => {
        const teiId = ev?.trackedEntityInstance || resolveTeiForAssessment(assessment);
        const orgUnitId = ev?.orgUnit || resolveOrgUnitForAssessment(assessment);
        if (!teiId || !orgUnitId) {
            showToast?.('Cannot repair this assessment because TEI or org unit is missing.', 'error');
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
            showToast?.(`Repaired missing events for assessment ${teiId}.`, 'success');
        } catch (err) {
            showToast?.(err?.message || 'Failed to repair assessment events.', 'error');
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
		            try {
		                localStorage.setItem('qims_config_bundles', JSON.stringify(nextBundles));
		            } catch (e) {
		                console.error('Failed to persist configuration bundles', e);
		            }
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
		            try {
		                localStorage.setItem('qims_config_bundles', JSON.stringify(next));
		            } catch (e) {
		                console.error('Failed to persist configuration bundles for new version', e);
		            }
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
                    <div className="stat-icon">[T]</div>
                    <div className="stat-content">
                        <h3>{dashboardStats.totalEvents}</h3>
                        <p>Total Surveys</p>
                    </div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-icon">⏱</div>
                    <div className="stat-content">
                        <h3>{dashboardStats.pendingEvents}</h3>
                        <p>Drafts</p>
                    </div>
                </div>
                <div className="stat-card upcoming">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                        <h3>{assessmentStats.upcoming}</h3>
                        <p>Upcoming Assessments</p>
                    </div>
                </div>
                <div className="stat-card urgent">
                    <div className="stat-icon">🔔</div>
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
                                const actionKey = assessment?.eventId || assessment?.enrollment || assessment?.trackedEntityInstance || assessment?.scheduleTeiId || assessment?.orgUnitId || 'unknown';
                                const isInitiating = initiatingAssessmentKey === actionKey;
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
                                                            </span>
                                                            <div style={{ marginTop: '6px' }}>
                                                                <button
                                                                    className="btn btn-secondary btn-sm"
                                                                    onClick={() => openTeamDialog(assessment)}
                                                                >
                                                                    Team ({Array.isArray(assessment.team) ? assessment.team.length : 0})
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="form-status success">ACCREDITATION</div>
                                            </div>
                                            <p>Enrollment: {assessment.enrollment}</p>
                                        </div>
                                        <div className="form-actions">
                                            <button
                                                className={`btn ${isSynced ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                                                disabled={isInitiating}
                                                onClick={() => handleInitiateSurvey(assessment, { selfOnly: false })}
                                            >
                                                {isInitiating ? 'Opening…' : 'Initiate Survey'}
                                            </button>
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
                                const seenIds = new Set();
                                [...pendingAssessments, ...upcomingAssessments].forEach(assessment => {
                                    if (!seenIds.has(assessment.eventId)) {
                                        allUniqueAssessments.push(assessment);
                                        seenIds.add(assessment.eventId);
                                    }
                                });

                                return allUniqueAssessments.map(assessment => {
                                    const draftId = `draft-assessment-${assessment.eventId}`;
                                    const existingDraft = events.find(e => e.event === draftId);
                                    const isSynced = existingDraft?.syncStatus === 'synced';
                                    const actionKey = assessment?.eventId || assessment?.enrollment || assessment?.trackedEntityInstance || assessment?.scheduleTeiId || assessment?.orgUnitId || 'unknown';
                                    const isInitiating = initiatingAssessmentKey === actionKey;

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
                                        <div key={assessment.eventId} className="form-item assessment-item">
                                            <div className="form-info">
                                                <div className="form-header-row">
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <h4>{assessment.orgUnitName}{displayId}</h4>
                                                        {assessment.parentOrgUnitName && (
                                                            <>
                                                                <span style={{ fontSize: '0.85em', color: '#666', marginTop: '-4px' }}>
                                                                    District: {assessment.parentOrgUnitName}
                                                                    {assessment.myTeamRole ? (
                                                                        <> {' \u2022 '} Role: {String(assessment.myTeamRole).replace(/^FAC_ASS_ROLE_/i,'').replace(/\s+/g,'_').replace(/_/g,' ').toUpperCase()}</>
                                                                    ) : null}
                                                                </span>
                                                                {assessment.isSelfAssessment && (
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
                                                                <div style={{ marginTop: '6px' }}>
                                                                    <button
                                                                        className="btn btn-secondary btn-sm"
                                                                        onClick={() => openTeamDialog(assessment)}
                                                                    >
                                                                        Team ({Array.isArray(assessment.team) ? assessment.team.length : 0})
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        {assessment.requiresResponse && (
                                                            <div className="form-status error">ACTION REQUIRED</div>
                                                        )}
                                                        {isSynced && (
                                                            <div className="form-status success">✓ SYNCED</div>
                                                        )}
                                                    </div>
                                                </div>
	                                            {(() => {
	                                                // Only show this initiation description when the authorised
	                                                // TEI does not yet have a main survey assessment event.
	                                                const assocKey = getAssocKey(assessment);
	                                                const presence = assessmentEventPresenceByKey?.[assocKey];
	                                                const needsInitiation = presence?.hasAssessmentEvent === false;
	                                                if (!needsInitiation) return null;

                                                // Compute latest authorised window from team events (per OU)
                                                const evs = Array.isArray(assessment.team) ? assessment.team : [];
                                                const parseDate = (d) => (d ? new Date(d) : null);
                                                const dates = evs
                                                    .map(e => parseDate(e.eventDate || e.occurredAt || e.completedDate || e.scheduledAt || e.updatedAt))
                                                    .filter(Boolean)
                                                    .sort((a,b) => a - b);
                                                const authStart = dates[0] ? dates[0].toISOString().slice(0,10) : (plannedDate || 'N/A');
                                                const authEnd = dates.length ? dates[dates.length-1].toISOString().slice(0,10) : (lastUpdated || 'N/A');
                                                const latestAuth = dates.length ? dates[dates.length-1].toISOString().slice(0,10) : (assessment.sortDate || 'N/A');
                                                return (
                                                    <p>
                                                        Date: {latestAuth}
                                                        {' '}| Authorised: {authStart} to {authEnd}
                                                        {' '}| OU: {assessment.orgUnit}
                                                        {' '}| Enr: {assessment.eventId}
                                                        {' '}| TEI: {assessment.scheduleTeiId || assessment.trackedEntityInstance}
                                                    </p>
                                                );
                                            })()}
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => toggleExpandAssessment(assessment)}>
                    {expandedAssignments[getAssocKey(assessment)] ? 'Hide Associated Assessments' : 'Show Associated Assessments'}
                </button>
            </div>
            {expandedAssignments[getAssocKey(assessment)] && (
                <div style={{ marginTop: '10px', width: '100%', background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px' }}>
                    {(() => {
                        const bundle = associatedByEnrollment[getAssocKey(assessment)];
                        if (!bundle || bundle.loading) return <div style={{ color: '#666' }}>Loading associated events...</div>;
                        const rawRows = [ ...(bundle.survey||[]) ];
                        const groupedByTei = rawRows.reduce((acc, ev) => {
                            const tei = ev?.trackedEntityInstance || 'unknown-tei';
                            if (!acc[tei]) acc[tei] = [];
                            acc[tei].push(ev);
                            return acc;
                        }, {});
                        let rows = Object.entries(groupedByTei).map(([tei, evs]) => {
                            const hasFinal = evs.some(ev => getSysTag(ev) === 'FINAL');
                            const finalEv = hasFinal
                                ? evs.find(ev => getSysTag(ev) === 'FINAL')
                                : null;
                            const latestWithTypeOrGroup = evs.find(ev => (ev.dataValues || []).some(d => d.dataElement === surveyTypeDeId || d.dataElement === surveyGroupDeId)) || null;
                            const latestEv = [...evs].sort((a, b) => new Date(b?.eventDate || 0) - new Date(a?.eventDate || 0))[0] || evs[0];
                            const representative = finalEv || latestWithTypeOrGroup || latestEv;
                            const earliestDate = evs.reduce((acc, cur) => {
                                if (!cur?.eventDate) return acc;
                                if (!acc) return cur.eventDate;
                                return new Date(cur.eventDate) < new Date(acc) ? cur.eventDate : acc;
                            }, null);
                            return {
                                ...representative,
                                trackedEntityInstance: tei,
                                _bundleEvents: evs,
                                _displayEventId: representative?.event || '-',
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
                                    {!isLead && (
                                        <span style={{ color: '#9A3412', fontSize: '0.9em' }}>
                                            Please contact the Team Lead to initiate the survey.
                                        </span>
                                    )}
                                </div>
                            );
                        }
                        const getTypeValue = (ev) => {
                            if (!surveyTypeDeId) return '-';
                            const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
                            const dv = sourceEvents
                                .flatMap(src => src.dataValues || [])
                                .find(d => d.dataElement === surveyTypeDeId && d.value !== undefined && String(d.value).trim() !== '');
                            return dv?.value || '-';
                        };
                        const getGroupValue = (ev) => {
                            if (!surveyGroupDeId) return '-';
                            const sourceEvents = Array.isArray(ev?._bundleEvents) ? ev._bundleEvents : [ev];
                            const dv = sourceEvents
                                .flatMap(src => src.dataValues || [])
                                .find(d => d.dataElement === surveyGroupDeId && d.value !== undefined && String(d.value).trim() !== '');
                            return dv?.value || '-';
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
                                                                                key={`survey-${ev.trackedEntityInstance || ev.event}`}
                                                                                onClick={() => openAssociatedSurvey(assessment, ev)}
                                                                                style={{ borderTop: '1px dashed #eee', cursor: 'pointer' }}
                                                                                title="Open this survey for editing"
                                                                            >
                                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev._displayEventId || ev.event || '-'}</td>
                                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ev.trackedEntityInstance || '-'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{ev._assessmentDate ? new Date(ev._assessmentDate).toLocaleDateString() : 'N/A'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{authDates.start || 'N/A'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#475569' }}>{authDates.end || 'N/A'}</td>
                                                                                <td style={{ padding: '6px 8px', color: '#334155' }}>{getTypeValue(ev)}</td>
                                                                                <td style={{ padding: '6px 8px', color: '#334155' }}>{getGroupValue(ev)}</td>
                                                                                <td style={{ padding: '6px 8px' }}>{ev.status || '-'}</td>
                                                                                <td style={{ padding: '6px 8px' }}>
                                                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                                                        <button
                                                                                            className="btn btn-secondary btn-xs"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const baselineDate = ev._baselineDate || null;
                                                                                                const ou = ev.orgUnit || assessment.orgUnitId || (typeof assessment.orgUnit === 'string' ? assessment.orgUnit : assessment.orgUnit?.id) || '';
                                                                                                const tei = ev.trackedEntityInstance || assessment.trackedEntityInstance || assessment.scheduleTeiId || '';
                                                                                                const q = new URLSearchParams({
                                                                                                    facilityId: ou || '',
                                                                                                    teiId: tei || '',
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
                                                                                                openEditSeAssignments(assessment, ev, getGroupValue(ev), getTypeValue(ev));
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

        </div>
                                            <div className="form-actions">
                                                {(() => {
	                                                    const assocKey = getAssocKey(assessment);
	                                                    const presence = assessmentEventPresenceByKey?.[assocKey];
	                                                    const presenceLoading = !presence || presence.loading;
	                                                    if (presenceLoading) {
	                                                        return (
	                                                            <button className="btn btn-secondary btn-sm" disabled>
	                                                                Checking assessment…
	                                                            </button>
	                                                        );
	                                                    }
                                                    const roleNorm = String(assessment.myTeamRole || '').replace(/^FAC_ASS_ROLE_/i,'').toUpperCase();
                                                    const isLead = /LEAD|LEADER/.test(roleNorm);
		                                                    const label = isSynced ? 'Update Survey' : (existingDraft ? 'Resume Survey' : 'Initiate Survey');
		                                                    if (label === 'Initiate Survey' && !isLead) return null;
	                                                    const onClick = () => {
	                                                        return label === 'Initiate Survey' ? handleInitiateSurvey(assessment, { selfOnly: false }) : handleOpenAssessment(assessment);
	                                                    };
                                                    return (
                                                        <button
		                                                            className={`btn ${isSynced ? 'btn-secondary' : 'btn-primary'} btn-sm`}
		                                                            disabled={label === 'Initiate Survey' && isInitiating}
                                                            onClick={onClick}
                                                        >
		                                                            {label === 'Initiate Survey' && isInitiating ? 'Opening…' : label}
                                                        </button>
                                                    );
                                                })()}
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
                        filteredEvents.map(event => (
                            <div key={event.event} className={`form-item ${event.syncStatus}`} onClick={() => handleEditForm(event)}>
                                <div className="form-info">
                                    <div className="form-header-row">
                                        <h4>{event._draftData?.formData?.facilityName_internal || 'Survey'} - {new Date(event.updatedAt).toLocaleDateString()}</h4>
                                        <div className={`form-status ${event.syncStatus === 'error' ? 'error' : event.syncStatus === 'synced' ? 'success' : 'warning'}`}>
                                            {event.syncStatus === 'error' ? 'Failed' : event.syncStatus === 'synced' ? 'Synced' : 'Draft'}
                                        </div>
                                    </div>
                                    <p>ID: {event.event} {event.syncError && <span className="error-msg">| Error: {event.syncError}</span>}</p>
                                </div>
                                <div className="form-actions">
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
                        ))
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
                maxWidth="md"
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
	                                    <p className="settings-subtitle" style={{ marginTop: '1rem' }}>Hospital Standards (SE 1 - SE 38)</p>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TextField
                            select
                            label="Type of Survey"
                            value={initSurveyType}
	                            onChange={async e => {
                                const next = e.target.value;
                                const opt = (surveyTypeOptions || []).find(o => o.value === next);
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
	                                const optionsForType = forceSelfOnly
	                                    ? surveyTypeOptions.filter(opt => isSelfSurveyType(opt.label || opt.value))
	                                    : (baselineOnly ? baselineSurveyTypeOptions : surveyTypeOptions);
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
                            onChange={e => { 
                                const v = e.target.value; 
                                setInitFacilityGroup(v); 
                                setInitSeOptions(buildSeOptions(v)); 
                                setInitAssignments({}); 
                                if (configSource === 'datastore' && isOnline) {
                                    loadRemoteConfig();
                                }
                            }}
                            size="small"
	                            disabled={isBaselineCreating || lockGroup}
                        >
                            <MenuItem value="">Select...</MenuItem>
                            <MenuItem value={'HOSPITAL'}>Hospital</MenuItem>
                            <MenuItem value={'CLINICS'}>Clinics</MenuItem>
                            <MenuItem value={'EMS'}>EMS</MenuItem>
                            <MenuItem value={'MORTUARY'}>Mortuary</MenuItem>
                        </TextField>
                    </div>
	                    {(isBaselineCreating && createProgress) || createDetails.length > 0 || createErrorInfo ? (
	                        <div style={{ marginTop: 16, padding: '0 8px' }}>
	                            {createProgress && (() => {
	                                const progressPercent = createProgress.total > 0
	                                    ? Math.min(100, Math.max(0, Math.round((createProgress.current / createProgress.total) * 100)))
	                                    : 0;
	                                const displayStep = createProgress.total > 0
	                                    ? Math.min(createProgress.total, Math.max(1, createProgress.current))
	                                    : createProgress.current;
	                                return (
	                                    <div style={{ padding: '14px 16px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
	                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
	                                            <div>
	                                                <div style={{ fontSize: '0.95rem', color: '#1e3a8a', fontWeight: 800 }}>
	                                                    {isBaselineCreating ? 'Creating assessment in DHIS2' : 'Assessment setup'}
	                                                </div>
	                                                <div style={{ fontSize: '0.9rem', color: '#1d4ed8', marginTop: 2 }}>
	                                                    {createProgress.message}
	                                                </div>
	                                            </div>
	                                            <div style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 700, whiteSpace: 'nowrap' }}>
	                                                {progressPercent}% · Step {displayStep} of {createProgress.total}
	                                            </div>
	                                        </div>
	                                        <LinearProgress variant="determinate" value={progressPercent} />
	                                        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#475569' }}>
	                                            Please keep this window open. The app is creating the enrollment, assessment events, and event map.
	                                        </div>
	                                    </div>
	                                );
	                            })()}

                            {createErrorInfo && (
                                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Provisioning issue</div>
                                    <div style={{ marginBottom: 6 }}>{createErrorInfo.message}</div>
                                    {Array.isArray(createErrorInfo.missingTags) && createErrorInfo.missingTags.length > 0 && (
                                        <div style={{ fontSize: '0.9rem' }}>
                                            <div><strong>Missing DHIS2 event tags:</strong> {createErrorInfo.missingTags.join(', ')}</div>
                                            {Number.isFinite(createErrorInfo.verifiedCount) && Number.isFinite(createErrorInfo.expectedCount) && (
                                                <div style={{ marginTop: 4 }}><strong>Verified:</strong> {createErrorInfo.verifiedCount} / {createErrorInfo.expectedCount}</div>
                                            )}
                                        </div>
                                    )}
                                    {pendingProvisionedBundle && (
                                        <div style={{ marginTop: 10 }}>
                                            <Button size="small" variant="outlined" color="error" onClick={handleRepairProvisionedBundle} disabled={isBaselineCreating}>
                                                {isBaselineCreating ? 'Repairing…' : 'Repair missing events & open'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

	                            {createDetails.length > 0 && (
                                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
	                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
	                                        <div style={{ fontWeight: 700, color: '#334155' }}>Live activity</div>
	                                        {isBaselineCreating && <div style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 700 }}>Running…</div>}
	                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#475569', maxHeight: 140, overflowY: 'auto' }}>
                                        {createDetails.map((line, idx) => (
                                            <li key={`create-detail-top-${idx}`}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
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
                            : (isBaselineCreating ? (pendingProvisionedBundle ? 'Repairing…' : 'Creating...') : (pendingProvisionedBundle ? 'Repair missing events & open' : 'Create & Open'))}
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
