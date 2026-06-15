import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import Login from './pages/Login/Login';
import Layout from './components/Layout/Layout';
import FormArea from './components/FormArea/FormArea';
import { Dashboard } from './pages/Dashboard';
import { AppProvider, useApp } from './contexts/AppContext';
import { api } from './services/api';
import { transformMetadata } from './utils/transformers';
import { useIncrementalSave } from './hooks/useIncrementalSave';
import { normalizeCriterionCode } from './utils/normalization';
import { useAssessmentScoring } from './hooks/useAssessmentScoring';
import { setHospitalSubcriteriaConfig } from './utils/scoring';
import emsConfig from './assets/ems/ems_config.json';
import mortuaryConfig from './assets/mortuary/mortuary_config.json';
import clinicsConfig from './assets/clinics/clinics_config.json';
import hospitalConfig from './assets/hospital/hospital_config.json';
import emsLinks from './assets/ems/ems_links.json';
import mortuaryLinks from './assets/mortuary/mortuary_links.json';
import clinicsLinks from './assets/clinics/clinics_links.json';
import hospitalLinks from './assets/hospital/hospital_links.json';

import obstericsGynoMatrix from './assets/obsterics-gyno/obsterics_gyno_matrix.json';
import physiotheraphyMatrix from './assets/physiotheraphy/physiotheraphy_matrix.json';
import radiologyMatrix from './assets/radiology/radiology_matrix.json';
import generalPracticeMatrix from './assets/general-practice/general_practice_matrix.json';
import privateDiabeticMatrix from './assets/private-diabetic/private_diabetic_matrix.json';
import oralMatrix from './assets/oral/oral_matrix.json';
import privateOncologyMatrix from './assets/private-oncology/private_oncology_matrix.json';
import paediatricMatrix from './assets/paediatric/paediatric_matrix.json';

// Import remaining 8 facility matrices and matrixConfig parser
import { buildConfigFromMatrix } from './utils/matrixConfig';
import privateMedicalLabMatrix from './assets/private-medical-lab/private_medical_lab_matrix.json';
import mentalHealthMatrix from './assets/mental-health/mental_health_matrix.json';
import eyeMatrix from './assets/eye/eye_matrix.json';
import hospiceMatrix from './assets/hospice/hospice_matrix.json';
import occupationalHealthMatrix from './assets/occupational-health/occupational_health_matrix.json';
import urologyMatrix from './assets/urology/urology_matrix.json';
import childhoodIllnessMatrix from './assets/childhood-illness/childhood_illness_matrix.json';
import emergencyManagementMatrix from './assets/emergency-management/emergency_management_matrix.json';

// Parse baseline configs from matrices
const privateMedicalLabConfig = buildConfigFromMatrix('private_medical_lab', privateMedicalLabMatrix.private_medical_lab);
const mentalHealthConfig = buildConfigFromMatrix('mental_health', mentalHealthMatrix.mental_health);
const eyeConfig = buildConfigFromMatrix('eye', eyeMatrix.eye);
const hospiceConfig = buildConfigFromMatrix('hospice', hospiceMatrix.hospice);
const occupationalHealthConfig = buildConfigFromMatrix('occupational_health', occupationalHealthMatrix.occupational_health);
const urologyConfig = buildConfigFromMatrix('urology', urologyMatrix.urology);
const childhoodIllnessConfig = buildConfigFromMatrix('childhood_illness', childhoodIllnessMatrix.childhood_illness);
const emergencyManagementConfig = buildConfigFromMatrix('emergency_management', emergencyManagementMatrix.emergency_management);
const radiologyConfig = buildConfigFromMatrix('radiology', radiologyMatrix.radiology);
const obstericsGynoConfig = buildConfigFromMatrix('obsterics_gyno', obstericsGynoMatrix.obsterics_gyno);
const physiotheraphyConfig = buildConfigFromMatrix('physiotheraphy', physiotheraphyMatrix.physiotheraphy);
const generalPracticeConfig = buildConfigFromMatrix('general_practice', generalPracticeMatrix.general_practice);
const privateDiabeticConfig = buildConfigFromMatrix('private_diabetic', privateDiabeticMatrix.private_diabetic);
const oralConfig = buildConfigFromMatrix('oral', oralMatrix.oral);
const privateOncologyConfig = buildConfigFromMatrix('private_oncology', privateOncologyMatrix.private_oncology);
const paediatricConfig = buildConfigFromMatrix('paediatric', paediatricMatrix.paediatric);

import { decorateHospitalLinksWithMatrixTags } from './utils/hospitalMatrixTags';
import './App.css';
import Report from './pages/Report';
import Admin from './pages/Admin';
import DevConfigExport from './pages/DevConfigExport';

const SURVEY_PROGRAM_STAGE_BY_GROUP = {
  HOSPITAL: 'hup8BqEe7Mn',
  CLINICS: 'cliStageU11',
  EMS: 'emsStageU11',
  MORTUARY: 'morStageU11',
  OBGYN: 'obgStageU11',
  PHYSIOTHERAPY: 'phyStageU11',
  RADIOLOGY: 'radStageU11',
  PRIVATE_LAB: 'prlStageU11',
  GENERAL_PRACTICE: 'gepStageU11',
  PRIVATE_DIETETIC: 'prdStageU11',
  MENTAL_HEALTH: 'mehStageU11',
  EYE: 'eyeStageU11',
  HOSPICE_PALLIATIVE: 'hopStageU11',
  OCCUPATIONAL_HEALTH: 'ochStageU11',
  UROLOGY_NEPHR: 'urnStageU11',
  ORAL: 'oraStageU11',
  IMCI: 'imcStageU11',
  EMONC: 'emoStageU11',
  ONCOLOGY: 'oncStageU11',
  PAEDIATRIC: 'paeStageU11'
};

const ALL_CANDIDATE_NAMESPACES = [
  'HOSPITAL', 'CLINICS', 'EMS', 'MORTUARY', 'OBGYN', 'PHYSIOTHERAPY',
  'RADIOLOGY', 'PRIVATE_LAB', 'GENERAL_PRACTICE', 'PRIVATE_DIETETIC',
  'MENTAL_HEALTH', 'EYE', 'HOSPICE_PALLIATIVE', 'OCCUPATIONAL_HEALTH',
  'UROLOGY_NEPHR', 'ORAL', 'IMCI', 'EMONC', 'ONCOLOGY', 'PAEDIATRIC',
  'GENERAL', 'DENTAL', 'PHARMACY', 'LABORATORY'
];


// Map a free-text Assessment Group value to an internal group id
const resolveGroupIdFromText = (text) => {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (t.includes('general practice') || t.includes('general_practice') || t.includes('gep')) return 'GENERAL_PRACTICE';
  if (t.includes('hospice') || t.includes('palliative') || t.includes('hop')) return 'HOSPICE_PALLIATIVE';
  if (t.includes('hosp')) return 'HOSPITAL';
  if (t.includes('clinic')) return 'CLINICS';
  if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'SE';
  if (t.includes('mortu') || t.includes('general')) return 'GENERAL';
  if (t.includes('obg')) return 'OBGYN';
  // New facility types
  if (t.includes('physio')) return 'PHYSIOTHERAPY';
  if (t.includes('radiology') || t.includes('rad')) return 'RADIOLOGY';
  if (t.includes('private lab') || t.includes('private_lab') || t.includes('medical lab') || t.includes('medical_lab') || t.includes('prl')) return 'PRIVATE_LAB';
  if (t.includes('private dietetic') || t.includes('private_dietetic') || t.includes('prd') || t.includes('diabet')) return 'PRIVATE_DIETETIC';
  if (t.includes('mental health') || t.includes('mental_health') || t.includes('meh')) return 'MENTAL_HEALTH';
  if (t.includes('eye')) return 'EYE';
  if (t.includes('occupational health') || t.includes('occupational_health') || t.includes('och')) return 'OCCUPATIONAL_HEALTH';
  if (t.includes('urology') || t.includes('nephrology') || t.includes('urology_nephrology') || t.includes('urn')) return 'UROLOGY_NEPHR';
  if (t.includes('oral')) return 'ORAL';
  if (t.includes('imci')) return 'IMCI';
  if (t.includes('emonc') || t.includes('emo')) return 'EMONC';
  if (t.includes('oncology') || t.includes('onc')) return 'ONCOLOGY';
  if (t.includes('paediatric') || t.includes('pae') || t.includes('pediatric') || t.includes('ped')) return 'PAEDIATRIC';
  return null;
};

const getProgrammeTypeFromGroup = (group) => {
  if (!group) return 'ems';
  const id = String(group.id || '').trim().toUpperCase();
  const name = String(group.name || '').trim().toLowerCase();
  
  if (id === 'HOSPITAL' || name.includes('hospital')) return 'hospital';
  if (id === 'CLINICS' || name.includes('clinic')) return 'clinics';
  if (id === 'EMS' || name.includes('ems')) return 'ems';
  if (id === 'GENERAL' || id === 'MORTUARY' || name.includes('mortu')) return 'mortuary';
  if (id === 'OBGYN' || name.includes('obg')) return 'obgyn';
  if (id === 'PHYSIOTHERAPY' || name.includes('physio')) return 'physiotherapy';
  if (id === 'RADIOLOGY' || name.includes('radio')) return 'radiology';
  if (id === 'PRIVATE_LAB' || name.includes('private lab') || name.includes('private_lab') || name.includes('medical lab') || name.includes('medical_lab')) return 'private_lab';
  if (id === 'GENERAL_PRACTICE' || name.includes('general practice') || name.includes('general_practice')) return 'general_practice';
  if (id === 'PRIVATE_DIETETIC' || name.includes('diabet') || name.includes('dietet') || name.includes('prd')) return 'private_diabetic';
  if (id === 'MENTAL_HEALTH' || name.includes('mental')) return 'mental_health';
  if (id === 'EYE' || name.includes('eye')) return 'eye';
  if (id === 'HOSPICE_PALLIATIVE' || name.includes('hospice') || name.includes('palliative')) return 'hospice_palliative';
  if (id === 'OCCUPATIONAL_HEALTH' || name.includes('occupational')) return 'occupational_health';
  if (id === 'UROLOGY_NEPHR' || name.includes('urology') || name.includes('nephr')) return 'urology_nephrology';
  if (id === 'ORAL' || name.includes('oral')) return 'oral';
  if (id === 'IMCI' || name.includes('imci') || name.includes('childhood')) return 'imci';
  if (id === 'EMONC' || name.includes('emonc') || name.includes('emergency')) return 'emonc';
  if (id === 'ONCOLOGY' || name.includes('oncology') || name.includes('onc')) return 'oncology';
  if (id === 'PAEDIATRIC' || name.includes('paediatric') || name.includes('pae') || name.includes('pediatric')) return 'paediatric';
  
  return 'ems';
};

const getSurveyProgramStageIdForGroupText = (text) => {
  const key = resolveGroupIdFromText(text);
  return key && SURVEY_PROGRAM_STAGE_BY_GROUP[key] ? SURVEY_PROGRAM_STAGE_BY_GROUP[key] : '';
};

const isAssessmentDetailsName = (value) => {
  const name = String(value || '').toLowerCase().trim();
  return name === 'ad' || name === 'assessment_details' || name === 'assessment-details' || name.includes('assessment details');
};

// Helper to build scoring metadata (links + severity + critical) for each programme
// type. The actual programmeScoringMeta object is built inside AppContent so
// that it can react to configuration version changes.
const buildScoringMeta = (config, configKey, links) => {
  const linksDataLookup = {};
  (links || []).forEach(linkObj => {
    if (!linkObj || !linkObj.criteria) return;
    const val = {
      roots: linkObj.root || [],
      linked_criteria: linkObj.linked_criteria || []
    };
    linksDataLookup[linkObj.criteria] = val;
    const normKey = normalizeCriterionCode(linkObj.criteria);
    if (normKey && normKey !== linkObj.criteria) {
      linksDataLookup[normKey] = val;
    }
  });

  const severityLookup = {};
  const criticalLookup = {};
  try {
    (config?.[configKey] || []).forEach(se => {
      (se.sections || []).forEach(section => {
        (section.standards || []).forEach(standard => {
          (standard.criteria || []).forEach(crit => {
            if (crit && crit.id) {
              severityLookup[crit.id] = crit.severity || 1;
              criticalLookup[crit.id] = Boolean(crit.is_critical);
            }
          });
        });
      });
    });
  } catch (e) {
    console.error('App: Error building severity lookup for', configKey, e);
  }

  return { linksDataLookup, severityLookup, criticalLookup };
};

const PrivateRoute = ({ children }) => {
	  const { user, authInitializing } = useApp();
	  const location = useLocation();

	  // While we're still checking for an existing session (e.g. after a
	  // refresh with stored auth), render a lightweight loading state rather
	  // than redirecting to /login immediately.
	  if (authInitializing) {
	    return <div className="loading-screen">Checking session...</div>;
	  }

	  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

	const AppContent = () => {
		  const {
		    user,
		    setUser,
		    setConfiguration,
		    setUserAssignments,
		    configuration,
		    showToast,
		    configBundles,
		    activeConfigVersionId,
		    configSource,
		    loadRemoteConfig,
		  } = useApp();
	  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [formLoadingDepth, setFormLoadingDepth] = useState(0);
  const [formLoadingMessage, setFormLoadingMessage] = useState('Loading survey…');

  const enterFormLoading = React.useCallback(() => setFormLoadingDepth(d => d + 1), []);
  const leaveFormLoading = React.useCallback(() => setFormLoadingDepth(d => Math.max(0, d - 1)), []);

  // Navigation State
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeSection, setActiveSection] = useState(null);

	  // Data State
		  const [assignments, setAssignments] = useState([]);
	  const [selectedFacility, setSelectedFacility] = useState(null);

	  // Data element ID for "SURV-Facility Assessment Group"
		  const FACILITY_GROUP_DE_ID = 'pzenrgsSny3';
		  const TYPE_OF_ASSESSMENT_DE_ID = 'LNszX9xHx8s';
			  const SYS_TAG_DE_ID = 'r8pqjX6Jtr0';

		  const typeOfAssessmentDeId = React.useMemo(() => {
		    const ps = configuration?.programStage;
		    const list = (ps?.programStageDataElements || []).map(psde => psde.dataElement || psde);
		    const match = list.find(de => {
		      const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
		      return n.includes('type of assessment') || (n.includes('assessment type') && !n.includes('facility assessment'));
		    });
		    return match?.id || TYPE_OF_ASSESSMENT_DE_ID;
		  }, [configuration]);

	  const getGroupLabelForStorage = (group) => {
	    if (!group) return '';
	    // Prefer human-readable name for clarity in the Assessment Details section
	    return group.name || group.id || '';
	  };



	  const resolveAssessmentNamespaceFromText = React.useCallback((text) => {
	    const t = String(text || '').toLowerCase();
	    if (t.includes('hosp')) return 'HOSPITAL';
	    if (t.includes('clinic')) return 'CLINICS';
	    if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'EMS';
	    if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
	    return String(text || '').toUpperCase().trim() || null;
	  }, []);

	  // Generate Event ID safely - unique per assessment *and group*
	  // so each (assessment, group) gets its own draft/event.
	  const activeEventId = React.useMemo(() => {
	    const assessmentId = searchParams.get('assessmentId');
	    const draftKey = searchParams.get('draftKey');
	    const groupKey = activeGroup?.id || 'no-group';

	    if (draftKey || assessmentId) return `draft-assessment-${draftKey || assessmentId}-group-${groupKey}`;

	    if (!selectedFacility || (!selectedFacility.trackedEntityInstance && !selectedFacility.orgUnit)) return null;
	    const identifier = selectedFacility.trackedEntityInstance || selectedFacility.orgUnit;
	    return `draft-facility-${identifier}-group-${groupKey}`;
	  }, [selectedFacility, searchParams, activeGroup]);

	  // Unified Incremental Save (Moved from FormArea)
	  const [isScoringPending, setIsScoringPending] = React.useState(false);
		  const {
	    formData,
	    setFormData,
	    saveField: baseSaveField,
	    loadFormData,
	    isSaving,
	    lastSaved
	  } = useIncrementalSave(activeEventId, {
	    user,
	    onSaveSuccess: (details) => console.log('✅ App: Saved field:', details),
	    onSaveError: (error) => {
	      console.error('❌ App: Save failed:', error);
	      if (!error) return;

	      // Friendly messaging for local storage limits / draft limits.
	      if (error.code === 'DRAFT_LIMIT_EXCEEDED') {
	        showToast(
	          'You already have 5 offline drafts stored for this user. Please sync your existing assessments from the Dashboard, then use Settings → Reset Local Data to clear space.',
	          'warning'
	        );
	      } else if (
	        error.code === 'LOCAL_QUOTA_EXCEEDED' ||
	        error.name === 'QuotaExceededError' ||
	        /quota/i.test(error.message || '')
	      ) {
	        showToast(
	          'Local storage is full in this browser. Please sync your drafts from the Dashboard, then use Settings → Reset Local Data to free up space.',
	          'error'
	        );
	      }
	    }
	  });

		  const [localScoringOverrides, setLocalScoringOverrides] = React.useState({});
		  const [serverAssessmentData, setServerAssessmentData] = React.useState({});
		  const [dataStoreScoringEventIdMap, setDataStoreScoringEventIdMap] = React.useState({});
		  const [serverScoringRefreshTick, setServerScoringRefreshTick] = React.useState(0);

		  const handleCriterionChange = React.useCallback((fieldId, fieldValue) => {
		    setIsScoringPending(true);
		    if (fieldId) {
		      setLocalScoringOverrides(prev => ({ ...prev, [fieldId]: fieldValue }));
		    }
		  }, []);

		  const locallyEditedFieldIdsRef = React.useRef(new Set());

		  const saveField = React.useCallback((fieldKey, fieldValue) => {
		    console.log(`[App Debug] saveField called: key="${fieldKey}"`);
		    if (fieldKey) locallyEditedFieldIdsRef.current.add(fieldKey);
		    baseSaveField(fieldKey, fieldValue);
		  }, [baseSaveField]);

		  useEffect(() => {
		    setLocalScoringOverrides({});
		    setServerAssessmentData({});
		    setDataStoreScoringEventIdMap({});
			    locallyEditedFieldIdsRef.current = new Set();
		  }, [activeEventId]);

		  useEffect(() => {
		    if (user) return;
		    setAssignments([]);
		    setSelectedFacility(null);
		    setFormData({});
		    setLocalScoringOverrides({});
		    setServerAssessmentData({});
		    setDataStoreScoringEventIdMap({});
		    setServerScoringRefreshTick(0);
		  }, [user, setFormData]);

		  const parseEventIdMap = React.useCallback((raw) => {
		    try {
		      if (!raw) return {};
		      if (typeof raw === 'string') return JSON.parse(raw) || {};
		      return typeof raw === 'object' ? raw : {};
		    } catch (_) {
		      return {};
		    }
		  }, []);

	  // Always store a friendly facility name in the draft so the
	  // Dashboard and Survey Preview can display it instead of
	  // falling back to "Unknown Facility".
		  const facilityNameInternal = formData?.facilityName_internal;
	  useEffect(() => {
	    if (!selectedFacility) return;

	    const targetName =
	      selectedFacility.orgUnitName ||
	      selectedFacility.name ||
	      selectedFacility.facilityId ||
	      selectedFacility.orgUnitId ||
	      (typeof selectedFacility.orgUnit === 'string'
	        ? selectedFacility.orgUnit
	        : selectedFacility.orgUnit?.id) ||
	      'Unknown Facility';

	    if (facilityNameInternal === targetName) return;

	    console.log('📝 App: Storing facilityName_internal:', targetName);
	    saveField('facilityName_internal', targetName);
	  }, [selectedFacility, facilityNameInternal, saveField]);

  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);

  // Load data when activeEventId changes, and show loader during hydration
  useEffect(() => {
    if (!activeEventId) return;
    let cancelled = false;
    setHasLoadedDraft(false);
    // The draft key is group-specific. When activeEventId changes (for example,
    // after we switch from the default group to the actual assessment group),
    // allow navigation preloads to be applied again for the new draft bucket.
    preloadAppliedRef.current = null;
    (async () => {
      try {
        enterFormLoading();
        setFormLoadingMessage('Restoring saved answers…');
        await loadFormData();
      } finally {
        leaveFormLoading();
        if (!cancelled) {
            setHasLoadedDraft(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeEventId, loadFormData, enterFormLoading, leaveFormLoading]);

		  const location = useLocation();
	  const assessmentIdParam = searchParams.get('assessmentId');

  const programmeType = getProgrammeTypeFromGroup(activeGroup);

  // Auto-load remote configuration when on the form page and configSource is 'datastore'
  useEffect(() => {
    if (location.pathname === '/form' && configSource === 'datastore' && programmeType) {
      console.log(`[App] Auto-loading remote configuration for ${programmeType}...`);
      loadRemoteConfig(programmeType).catch(err => {
        console.warn('[App] Failed to auto-load remote configuration', err);
      });
    }
  }, [location.pathname, configSource, programmeType, loadRemoteConfig]);

		  // Build programme-specific scoring metadata (links + severity) based on
		  // the currently active configuration version. Falls back to on-disk JSON
		  // when versioned bundles are not yet initialised.
		  const programmeScoringMeta = React.useMemo(() => {
		    const bundle =
		      configBundles && activeConfigVersionId
		        ? configBundles[activeConfigVersionId]
		        : null;

		    const sourceConfig = bundle && bundle.config
		      ? bundle.config
		      : {
		          ...emsConfig,
		          ...mortuaryConfig,
		          ...clinicsConfig,
		          ...hospitalConfig,
		          obsterics_gyno_full_configuration: obstericsGynoConfig.service_elements,
		          obgyn_full_configuration: obstericsGynoConfig.service_elements,
		          physiotheraphy_full_configuration: physiotheraphyConfig.service_elements,
		          physiotherapy_full_configuration: physiotheraphyConfig.service_elements,
		          radiology_full_configuration: radiologyConfig.service_elements,
		          general_practice_full_configuration: generalPracticeConfig.service_elements,
		          private_diabetic_full_configuration: privateDiabeticConfig.service_elements,
		          private_dietetic_full_configuration: privateDiabeticConfig.service_elements,
		          oral_full_configuration: oralConfig.service_elements,
		          private_oncology_full_configuration: privateOncologyConfig.service_elements,
		          oncology_full_configuration: privateOncologyConfig.service_elements,
		          paediatric_full_configuration: paediatricConfig.service_elements,
		          private_medical_lab_full_configuration: privateMedicalLabConfig.service_elements,
		          private_lab_full_configuration: privateMedicalLabConfig.service_elements,
		          mental_health_full_configuration: mentalHealthConfig.service_elements,
		          eye_full_configuration: eyeConfig.service_elements,
		          hospice_full_configuration: hospiceConfig.service_elements,
		          hospice_palliative_full_configuration: hospiceConfig.service_elements,
		          occupational_health_full_configuration: occupationalHealthConfig.service_elements,
		          urology_full_configuration: urologyConfig.service_elements,
		          urology_nephrology_full_configuration: urologyConfig.service_elements,
		          childhood_illness_full_configuration: childhoodIllnessConfig.service_elements,
		          imci_full_configuration: childhoodIllnessConfig.service_elements,
		          emergency_management_full_configuration: emergencyManagementConfig.service_elements,
		          emonc_full_configuration: emergencyManagementConfig.service_elements,
		      };

    const baseLinks = bundle && bundle.links
      ? bundle.links
      : {
          ems: emsLinks,
          mortuary: mortuaryLinks,
          clinics: clinicsLinks,
          hospital: hospitalLinks,
          obgyn: obstericsGynoMatrix.obsterics_gyno,
          obsterics_gyno: obstericsGynoMatrix.obsterics_gyno,
          physiotherapy: physiotheraphyMatrix.physiotheraphy,
          physiotheraphy: physiotheraphyMatrix.physiotheraphy,
          radiology: radiologyMatrix.radiology,
          general_practice: generalPracticeMatrix.general_practice,
          private_diabetic: privateDiabeticMatrix.private_diabetic,
          private_dietetic: privateDiabeticMatrix.private_diabetic,
          oral: oralMatrix.oral,
          oncology: privateOncologyMatrix.private_oncology,
          private_oncology: privateOncologyMatrix.private_oncology,
          paediatric: paediatricMatrix.paediatric,
          private_lab: privateMedicalLabMatrix.private_medical_lab,
          private_medical_lab: privateMedicalLabMatrix.private_medical_lab,
          mental_health: mentalHealthMatrix.mental_health,
          eye: eyeMatrix.eye,
          hospice_palliative: hospiceMatrix.hospice,
          hospice: hospiceMatrix.hospice,
          occupational_health: occupationalHealthMatrix.occupational_health,
          urology_nephrology: urologyMatrix.urology,
          urology: urologyMatrix.urology,
          imci: childhoodIllnessMatrix.childhood_illness,
          childhood_illness: childhoodIllnessMatrix.childhood_illness,
          emonc: emergencyManagementMatrix.emergency_management,
          emergency_management: emergencyManagementMatrix.emergency_management,
        };

    // Decorate Hospital links with visual -G / -B tags based on matrix.json so
    // that the scoring layer and UI can recognise which links are green/blue
    // in the dependency matrix. The tags are purely visual; the scoring core
    // strips them before looking up criteria and may choose to exclude them
    // from root computations.
    const effectiveLinks = {
      ...baseLinks,
      hospital: decorateHospitalLinksWithMatrixTags(baseLinks.hospital || hospitalLinks),
    };

    return {
      ems: buildScoringMeta(sourceConfig, 'ems_full_configuration', effectiveLinks.ems || emsLinks),
      mortuary: buildScoringMeta(sourceConfig, 'mortuary_full_configuration', effectiveLinks.mortuary || mortuaryLinks),
      clinics: buildScoringMeta(sourceConfig, 'clinics_full_configuration', effectiveLinks.clinics || clinicsLinks),
      hospital: buildScoringMeta(sourceConfig, 'hospital_full_configuration', effectiveLinks.hospital || hospitalLinks),
      obgyn: buildScoringMeta(sourceConfig, 'obgyn_full_configuration', effectiveLinks.obgyn || []),
      obsterics_gyno: buildScoringMeta(sourceConfig, 'obsterics_gyno_full_configuration', effectiveLinks.obsterics_gyno || []),
      physiotherapy: buildScoringMeta(sourceConfig, 'physiotherapy_full_configuration', effectiveLinks.physiotherapy || []),
      physiotheraphy: buildScoringMeta(sourceConfig, 'physiotheraphy_full_configuration', effectiveLinks.physiotheraphy || []),
      radiology: buildScoringMeta(sourceConfig, 'radiology_full_configuration', effectiveLinks.radiology || []),
      general_practice: buildScoringMeta(sourceConfig, 'general_practice_full_configuration', effectiveLinks.general_practice || []),
      private_diabetic: buildScoringMeta(sourceConfig, 'private_diabetic_full_configuration', effectiveLinks.private_diabetic || []),
      private_dietetic: buildScoringMeta(sourceConfig, 'private_dietetic_full_configuration', effectiveLinks.private_dietetic || []),
      oral: buildScoringMeta(sourceConfig, 'oral_full_configuration', effectiveLinks.oral || []),
      oncology: buildScoringMeta(sourceConfig, 'oncology_full_configuration', effectiveLinks.oncology || []),
      private_oncology: buildScoringMeta(sourceConfig, 'private_oncology_full_configuration', effectiveLinks.private_oncology || []),
      paediatric: buildScoringMeta(sourceConfig, 'paediatric_full_configuration', effectiveLinks.paediatric || []),
      private_lab: buildScoringMeta(sourceConfig, 'private_lab_full_configuration', effectiveLinks.private_lab || []),
      private_medical_lab: buildScoringMeta(sourceConfig, 'private_medical_lab_full_configuration', effectiveLinks.private_medical_lab || []),
      mental_health: buildScoringMeta(sourceConfig, 'mental_health_full_configuration', effectiveLinks.mental_health || []),
      eye: buildScoringMeta(sourceConfig, 'eye_full_configuration', effectiveLinks.eye || []),
      hospice_palliative: buildScoringMeta(sourceConfig, 'hospice_palliative_full_configuration', effectiveLinks.hospice_palliative || []),
      hospice: buildScoringMeta(sourceConfig, 'hospice_full_configuration', effectiveLinks.hospice || []),
      occupational_health: buildScoringMeta(sourceConfig, 'occupational_health_full_configuration', effectiveLinks.occupational_health || []),
      urology_nephrology: buildScoringMeta(sourceConfig, 'urology_nephrology_full_configuration', effectiveLinks.urology_nephrology || []),
      urology: buildScoringMeta(sourceConfig, 'urology_full_configuration', effectiveLinks.urology || []),
      imci: buildScoringMeta(sourceConfig, 'imci_full_configuration', effectiveLinks.imci || []),
      childhood_illness: buildScoringMeta(sourceConfig, 'childhood_illness_full_configuration', effectiveLinks.childhood_illness || []),
      emonc: buildScoringMeta(sourceConfig, 'emonc_full_configuration', effectiveLinks.emonc || []),
      emergency_management: buildScoringMeta(sourceConfig, 'emergency_management_full_configuration', effectiveLinks.emergency_management || []),
    };
		  }, [configBundles, activeConfigVersionId]);

		  // Keep the scoring core's hospital sub-criteria map in sync with the
		  // active configuration version so that root scores use the correct
		  // configured sub-criteria set per version.
		  useEffect(() => {
		    const bundle =
		      configBundles && activeConfigVersionId
		        ? configBundles[activeConfigVersionId]
		        : null;
		    if (bundle && bundle.compute) {
		      setHospitalSubcriteriaConfig(bundle.compute);
		    } else {
		      // Fall back to the default asset config inside scoring.js
		      setHospitalSubcriteriaConfig(null);
		    }
		  }, [configBundles, activeConfigVersionId]);

  // Load initial data once when the user is available. This is resilient to
  // hot-reloads or remounts where `configuration` or `groups` might be reset.
  useEffect(() => {
    if (!user) return;
    if (initialDataLoaded) return;
    loadInitialData();
  }, [user, initialDataLoaded]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // Fetch only assignments linked to the logged in user
      const [legacyByUid, legacyByUsername] = await Promise.all([
        api.getAssignments('G2gULe4jsfs', user.id),
        user.username && user.username !== user.id ? api.getAssignments('G2gULe4jsfs', user.username) : Promise.resolve([])
      ]);
      const rawAssignments = [...legacyByUid, ...legacyByUsername];
      const seenEnrollments = new Set();
      const msgAssignments = [];
      for (const enr of rawAssignments) {
        if (!seenEnrollments.has(enr.enrollment)) {
          seenEnrollments.add(enr.enrollment);
          msgAssignments.push(enr);
        }
      }
      setAssignments(msgAssignments || []);
      setGroups([]); // no default stage groups; loaded per-stage when needed

      setConfiguration({
        programStage: null,
        program: { id: 'G2gULe4jsfs', displayName: 'MOH Survey Dashboard' },
        organisationUnits: msgAssignments.map(a => a.orgUnit)
      });

      // No default stage metadata loaded on boot; groups are set when a
      // specific stage is selected via loadProgramStageMetadata.

      setAssignments(msgAssignments);
      setUserAssignments(msgAssignments); // Update context

      if (msgAssignments.length > 0) {
        setSelectedFacility(msgAssignments[0]);
      }

    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setIsLoading(false);
      setInitialDataLoaded(true);
    }
  };

			  const groupHasNonAssessmentSections = React.useCallback((group) => (
			    Array.isArray(group?.sections) && group.sections.some(section => !isAssessmentDetailsName(section?.name || section?.code || section?.id))
			  ), []);

			  const selectBestGroup = React.useCallback((transformedGroups, preferredGroupText = '') => {
			    const preferredGroupId = resolveGroupIdFromText(preferredGroupText);
			    const preferred = transformedGroups.find(g => g.id === preferredGroupId) || null;
			    if (preferred && groupHasNonAssessmentSections(preferred)) return preferred;
			    return transformedGroups.find(groupHasNonAssessmentSections) || preferred || transformedGroups[0] || null;
			  }, [groupHasNonAssessmentSections, resolveGroupIdFromText]);

			  const applyMetadataToNavigation = React.useCallback((metadata, preferredGroupText = '') => {
		    const transformedGroups = transformMetadata(metadata);

		    setGroups(transformedGroups);

			    const nextGroup = selectBestGroup(transformedGroups, preferredGroupText);

		    setActiveGroup(nextGroup);
		    setActiveSection(nextGroup?.sections?.[0] || null);
		    return transformedGroups;
			  }, [selectBestGroup]);

			  const formMetadataLoadRef = React.useRef('');
  const lastInferredAssessmentRef = useRef('');

			  const loadProgramStageMetadata = React.useCallback(async (programStageId, preferredGroupText = '', forceRefresh = false) => {
	    const targetStageId = programStageId || '';
			    if (!forceRefresh && configuration?.programStage?.id === targetStageId && Array.isArray(configuration?.programStage?.programStageSections)) {
		      applyMetadataToNavigation(configuration.programStage, preferredGroupText);
		      return;
		    }

	    enterFormLoading();
	    setFormLoadingMessage('Loading assessment metadata…');
	    try {
	      const metadata = await api.getFormMetadata(targetStageId);
	      setFormLoadingMessage('Preparing assessment sections…');
		      applyMetadataToNavigation(metadata, preferredGroupText);
	      setConfiguration({
	        programStage: metadata,
	        program: metadata.program || configuration?.program || { id: 'G2gULe4jsfs', displayName: 'MOH Survey Dashboard' },
	        organisationUnits: assignments.map(a => a.orgUnit)
	      });
	    } catch (err) {
	      console.error('Failed to load form metadata for program stage', targetStageId, err);
	      showToast?.('Failed to load survey questions for this facility type.', 'error');
	    } finally {
	      leaveFormLoading();
	    }
		  }, [applyMetadataToNavigation, assignments, configuration, setConfiguration, showToast, enterFormLoading, leaveFormLoading]);

	  useEffect(() => {
	    if (location.pathname !== '/form') return;

	    const stateAssignment = location.state && location.state.selectedAssignment;
	    const groupText =
	      stateAssignment?.preloadDataValues?.[FACILITY_GROUP_DE_ID] ||
	      stateAssignment?.parentGroupId ||
	      stateAssignment?.facilityGroup ||
	      stateAssignment?.schedule?.facilityGroup ||
	      searchParams.get('parentGroupId') ||
	      searchParams.get('facilityGroup') ||
	      formData?.[FACILITY_GROUP_DE_ID] ||
	      '';
		    const groupStageId = getSurveyProgramStageIdForGroupText(groupText);
		    const explicitStageId = searchParams.get('programStageId') || stateAssignment?.programStageId || '';
		    const targetStageId = explicitStageId || groupStageId || '';


			    // When the URL lacks stage/group info (e.g. after refresh), try to infer
			    // the correct stage by fetching the assessment event.
			    if (!targetStageId) {
			      const assessmentId = searchParams.get('assessmentId');
			      if (assessmentId && lastInferredAssessmentRef.current !== assessmentId) {
			        lastInferredAssessmentRef.current = assessmentId;
			        api.getEventById(assessmentId, 'event,programStage')
			          .then(ev => {
			            const inferredStage = ev?.programStage || '';
			            if (inferredStage) {
			              loadProgramStageMetadata(inferredStage, groupText, true);
			            }
			          })
			          .catch(() => {});
			      }
			      return;
			    }
			    const metadataLoadKey = `${location.key || location.pathname}|${targetStageId}|${groupText || ''}`;
			    const shouldRefreshDedicatedStageMetadata = Object.values(SURVEY_PROGRAM_STAGE_BY_GROUP).includes(targetStageId) && formMetadataLoadRef.current !== metadataLoadKey;
			    if (configuration?.programStage?.id === targetStageId) {
			      if (shouldRefreshDedicatedStageMetadata) {
			        formMetadataLoadRef.current = metadataLoadKey;
			        loadProgramStageMetadata(targetStageId, groupText, true);
			        return;
			      }
		      if (Array.isArray(configuration?.programStage?.programStageSections)) {
		        applyMetadataToNavigation(configuration.programStage, groupText);
		      }
		      return;
		    }
			    formMetadataLoadRef.current = metadataLoadKey;
		    loadProgramStageMetadata(targetStageId, groupText);
			  }, [location.key, location.pathname, location.state, searchParams, configuration?.programStage, formData?.[FACILITY_GROUP_DE_ID], applyMetadataToNavigation, loadProgramStageMetadata]);

	  // Auto-select facility based on navigation state or URL parameter
	  useEffect(() => {
	    const stateAssignment = location.state && location.state.selectedAssignment;
	    if (stateAssignment) {
	      console.log('🎯 App: Auto-selecting facility from navigation state:', stateAssignment.orgUnitName);
		      const preloadedGroupText =
		        stateAssignment?.preloadDataValues?.[FACILITY_GROUP_DE_ID] ||
		        stateAssignment?.parentGroupId ||
		        stateAssignment?.facilityGroup ||
		        stateAssignment?.schedule?.facilityGroup ||
		        searchParams.get('parentGroupId') ||
		        searchParams.get('facilityGroup') ||
		        '';
		      const targetGroupId = resolveGroupIdFromText(preloadedGroupText);
			      if (targetGroupId && Array.isArray(groups) && groups.length > 0) {
			        const found = selectBestGroup(groups, preloadedGroupText);
			        if (found && activeGroup?.id !== found.id) {
		          console.log('🎯 App: Preselecting group from navigation state →', found.name || found.id);
		          setActiveGroup(found);
		          if (found.sections && found.sections.length > 0) setActiveSection(found.sections[0]);
		        }
		      }
	      setSelectedFacility(stateAssignment);
	      return;
	    }

	    const assessmentId = searchParams.get('assessmentId');
        const baselineIdParam = searchParams.get('baselineId');
	    const assessmentTeiIdParam = searchParams.get('assessmentTeiId');
		    const programStageIdParam = searchParams.get('programStageId');

	    if (assessmentId && assignments.length > 0) {
	      // Fallback: match against locally loaded assignments (older workflow)
	      const matched = assignments.find(a => (a.eventId || a.enrollment) === assessmentId);
	      if (matched) {
	        const matchedId = matched.eventId || matched.enrollment;
	        const currentId = selectedFacility?.eventId || selectedFacility?.enrollment;
	        if (matchedId === currentId && selectedFacility?.hydrateAll) {
	          // Already auto-selected and hydrated; avoid creating a new object
	          // reference that triggers cascading re-renders / effects.
	          return;
	        }
	        const restored = { ...matched };
            // Restore baselineId if provided in URL (handles F5 reloads)
	        if (baselineIdParam && !restored.baselineEventId) {
	            restored.baselineEventId = baselineIdParam;
	        }
		        // A URL-opened assessment has no navigation-state preload after refresh.
		        // Tell FormArea to hydrate the local draft from the resolved DHIS2
		        // event bundle instead of rendering an empty form against a mapped event.
		        restored.hydrateAll = true;
		        restored.preloadMode = 'REPLACE';
	        // Preserve a newly created assessment TEI across refreshes. This is
	        // required for Self Assessment, where the new assessment lives on a
	        // different TEI than the scheduling/selected assignment.
	        if (assessmentTeiIdParam) {
	            restored.trackedEntityInstance = assessmentTeiIdParam;
	            restored.scheduleTeiId = assessmentTeiIdParam;
            }
	        if (programStageIdParam) {
	          restored.programStageId = programStageIdParam;
	        }
	        console.log(`🎯 App: Auto-selecting facility for assessment ${assessmentId}:`, matched.orgUnitName);
	        setSelectedFacility(restored);
	      }
	    }
		  }, [location.state, searchParams, assignments, groups, activeGroup?.id, resolveGroupIdFromText, selectBestGroup, selectedFacility]);

  // Track whether we've applied navigation preloads for the current selection
  const preloadAppliedRef = React.useRef(null);
  // Track whether we've aligned Facility Assessment Group to baseline for the
  // current facility/selection to avoid repeated network fetches on re-renders.
  const baselineAlignRef = React.useRef(null);

  // Auto-populate Assessment Details from selected assessment
  useEffect(() => {
	    const isADSection = isAssessmentDetailsName(activeSection?.name || activeSection?.code || activeSection?.id);

    // If navigation carried a baseline event id, persist it to the draft so
    // the Save flow can reuse it without refetching.
    const navBaselineEventId = selectedFacility?.baselineEventId;
    if (navBaselineEventId && !formData?.eventId_internal) {
      console.log('📝 App: Storing baseline eventId_internal from navigation state:', navBaselineEventId);
      saveField('eventId_internal', navBaselineEventId);
    }

    // If navigation carried preloaded DE values (e.g., Assessment Group from a
    // clicked event row), persist them early so dependent forms render correctly.
    const preload = selectedFacility?.preloadDataValues || null;
    const preloadKey = JSON.stringify({
      draft: activeEventId || null,
      a: assessmentIdParam || null,
      tei: selectedFacility?.trackedEntityInstance || selectedFacility?.scheduleTeiId || null,
      ev: selectedFacility?.baselineEventId || selectedFacility?.eventId || null,
      pre: preload || {}
    });

    if (hasLoadedDraft && preload && typeof preload === 'object' && preloadAppliedRef.current !== preloadKey) {
      const preloadMode = selectedFacility?.preloadMode || 'MERGE'; // REPLACE | MERGE
      Object.entries(preload).forEach(([deId, value]) => {
        const existing = formData?.[deId];
        const existingNorm = existing === undefined || existing === null ? '' : String(existing);
        const valueNorm = value === undefined || value === null ? '' : String(value);
        const isDifferent = existingNorm !== valueNorm;
        const isExistingEmpty = existingNorm === '';
        const isValuePresent = valueNorm !== '';
        const shouldApply =
          preloadMode === 'REPLACE' ? isDifferent : (isExistingEmpty && isValuePresent);
        if (shouldApply) {
          console.log('📝 App: Applying preload value:', deId, value);
          saveField(deId, value);
        }
      });
      preloadAppliedRef.current = preloadKey;

      // If a preloaded Facility Assessment Group is present, switch the active
      // group immediately so the correct forms render even before formData updates.
      const preloadedGroupText = preload?.[FACILITY_GROUP_DE_ID] || selectedFacility?.parentGroupId || selectedFacility?.facilityGroup || searchParams.get('parentGroupId') || searchParams.get('facilityGroup');
      if (preloadedGroupText && groups && groups.length > 0) {
        const targetId = resolveGroupIdFromText(preloadedGroupText);
        if (targetId && activeGroup?.id !== targetId) {
          const found = groups.find(g => g.id === targetId);
          if (found) {
            console.log('🎯 App: Preselecting group from preloaded value →', found.name || found.id);
            setActiveGroup(found);
            if (found.sections && found.sections.length > 0) setActiveSection(found.sections[0]);
          }
        }
      }
    }

    // Corrected keys for raw data from api.getAssignments
    const enrollmentId =
      selectedFacility?.enrollment || selectedFacility?.eventId;
    // TEI priority (for UI):
    // 1) TEI from the scheduling workflow (what the Assigned Assessments
    //    list shows: trackedEntityInstance / scheduleTeiId)
    // 2) survey-specific internal TEI if we already created one
    const teiId =
	      selectedFacility?.trackedEntityInstance ||
	      selectedFacility?.scheduleTeiId ||
	      formData.teiId_internal;

    if (selectedFacility && isADSection && enrollmentId) {
      const adFields = activeSection.fields || [];

      // Find fields for TEI ID, Enrollment, Facility Assessment Group,
      // and Assessor User ID
      const teiField = adFields.find(f =>
        (f.label || '').toUpperCase().includes('TEI ID')
      );
      const enrField = adFields.find(f =>
        (f.label || '').toLowerCase().includes('enrollment')
      );
	      const programStageField = adFields.find(f => {
	        const label = (f.label || '').toLowerCase();
	        const code = (f.code || '').toUpperCase();
	        return label.includes('program stage id') || code.includes('PROGRAM_STAGE');
	      });
      const groupField = adFields.find(
        f =>
          f.id === FACILITY_GROUP_DE_ID ||
          (f.label || '')
            .toLowerCase()
	            .match(/facility assessment (group|type)/)
      );
	      const typeField = adFields.find(f => {
	        const label = (f.label || '').toLowerCase();
	        return f.id === typeOfAssessmentDeId
	          || label.includes('type of assessment')
	          || (label.includes('assessment type') && !label.includes('facility assessment'));
	      });
      const assessorField = adFields.find(f => {
        const label = (f.label || '').toUpperCase();
        return (
          label.includes('FAC_ASS_ASSESSOR_USER_ID') ||
          label.includes('ASSESSOR USER ID')
        );
      });
	      const sysTagField = adFields.find(f => {
	        const label = (f.label || '').toLowerCase().trim();
	        const code = (f.code || '').toUpperCase();
	        return (
	          f.id === SYS_TAG_DE_ID ||
	          label === 'tag' ||
	          label.includes('sys tag') ||
	          code === 'TAG' ||
	          code.includes('SYS_TAG')
	        );
	      });

      if (teiField && teiId && !formData[teiField.id]) {
        console.log(`📝 App: Auto-populating TEI ID: ${teiId}`);
        saveField(teiField.id, teiId);
      }
      if (enrField && enrollmentId && !formData[enrField.id]) {
        console.log(
          `📝 App: Auto-populating Enrollment ID: ${enrollmentId}`
        );
        saveField(enrField.id, enrollmentId);
      }
	      if (typeField && !formData[typeField.id]) {
	        const typeValue = selectedFacility?.typeOfAssessment
	          || selectedFacility?.assessmentType
	          || selectedFacility?.preloadDataValues?.[typeField.id]
	          || selectedFacility?.preloadDataValues?.[TYPE_OF_ASSESSMENT_DE_ID]
	          || '';
	        if (String(typeValue).trim() !== '') {
	          console.log('📝 App: Auto-populating Type of Assessment:', typeValue);
	          saveField(typeField.id, typeValue);
	        }
	      }
	      if (programStageField && selectedFacility?.programStageId && !formData[programStageField.id]) {
	        console.log(`📝 App: Auto-populating Program Stage ID: ${selectedFacility.programStageId}`);
	        saveField(programStageField.id, selectedFacility.programStageId);
	      }
      // Avoid overwriting a preloaded group value from a clicked event.
      const preloadedGroupText = (preload && preload[FACILITY_GROUP_DE_ID]) || searchParams.get('parentGroupId') || searchParams.get('facilityGroup');
      // If we didn't preload from a clicked event, resolve the facility's
      // Baseline Assessment Group from DHIS2. This both fills an empty field and
      // corrects a mismatched saved draft (e.g. defaulted Mortuary).
	      if (groupField && !formData[groupField.id]) {
		        const selectedGroupText = selectedFacility?.parentGroupId
		          || selectedFacility?.facilityGroup
		          || preloadedGroupText
		          || '';
		        const selectedGroupId = resolveGroupIdFromText(selectedGroupText);
		        const selectedGroupLabel = {
		          HOSPITAL: 'Hospital',
		          CLINICS: 'Clinics',
		          SE: 'EMS',
		          EMS: 'EMS',
		          GENERAL: 'Mortuary',
		          MORTUARY: 'Mortuary',
		          OBGYN: 'OBGYN',
		        }[selectedGroupId] || selectedGroupText;
		        const groupValue = selectedFacility?.preloadDataValues?.[groupField.id]
		          || selectedGroupLabel
		          || getGroupLabelForStorage(activeGroup)
		          || '';
	        if (String(groupValue).trim() !== '') {
	          console.log('📝 App: Auto-populating Facility Assessment Type:', groupValue);
	          saveField(groupField.id, groupValue);
	        }
	      }
	      if (groupField && !preloadedGroupText) {
        const programId = configuration?.program?.id || 'G2gULe4jsfs';
        const stageId = configuration?.programStage?.id || '';
        const orgUnitId =
          selectedFacility?.orgUnitId ||
          (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id) ||
          selectedFacility?.facilityId ||
          selectedFacility?.programOrgUnitId ||
          null;
        const teiForBaseline =
          selectedFacility?.trackedEntityInstance ||
          selectedFacility?.scheduleTeiId ||
          formData.teiId_internal ||
          null;

        const baselineKey = teiForBaseline && orgUnitId ? `${teiForBaseline}|${orgUnitId}|${programId}|${stageId}` : null;
        if (teiForBaseline && orgUnitId && baselineAlignRef.current !== baselineKey) {
          (async () => {
            try {
              const baselineGroup = await api.getBaselineAssessmentGroup({ teiId: teiForBaseline, orgUnitId, programId, stageId });
              if (baselineGroup && String(baselineGroup).trim() !== '') {
                const currentText = formData[groupField.id];
                const currentId = resolveGroupIdFromText(currentText);
                const targetId = resolveGroupIdFromText(baselineGroup);
                // Align the field to the baseline group if it's empty or mismatched
                if (!currentText || currentId !== targetId) {
                  console.log('📝 App: Setting Facility Assessment Group from Baseline:', baselineGroup);
                  saveField(groupField.id, baselineGroup);
                }
                // Also switch activeGroup immediately so correct forms render
                if (targetId && groups && groups.length > 0 && activeGroup?.id !== targetId) {
                  const found = groups.find(g => g.id === targetId);
                  if (found) {
                    setActiveGroup(found);
                    if (found.sections && found.sections.length > 0) setActiveSection(found.sections[0]);
                  }
                }
                baselineAlignRef.current = baselineKey;
              }
            } catch (e) {
              console.warn('App: Failed to resolve Baseline Assessment Group (non-fatal)', e);
              baselineAlignRef.current = baselineKey; // avoid retry loop on hard errors
            }
          })();
        }
      }
      if (assessorField && user?.id && !formData[assessorField.id]) {
        console.log(
          `📝 App: Auto-populating Assessor User ID with DHIS2 user id: ${user.id}`
        );
        saveField(assessorField.id, user.id);
      }
	      if (sysTagField && String(formData[sysTagField.id] || '').trim() !== 'FINAL') {
	        console.log('📝 App: Auto-populating Assessment Details TAG: FINAL');
	        saveField(sysTagField.id, 'FINAL');
	      }
    }
	  }, [selectedFacility, activeSection, activeGroup, saveField, formData, user?.id, assessmentIdParam, groups, hasLoadedDraft, activeEventId, typeOfAssessmentDeId, resolveGroupIdFromText]);

  // Keep activeGroup in sync with the Facility Assessment Group field value so
  // that when opening an existing event (e.g., Hospital), the Hospital forms
  // load automatically even if the default group was Mortuary.
  useEffect(() => {
    const txt = formData?.[FACILITY_GROUP_DE_ID];
    if (!txt || !groups || groups.length === 0) return;
    const targetId = resolveGroupIdFromText(txt);
    if (!targetId || activeGroup?.id === targetId) return;
    const found = groups.find(g => g.id === targetId);
    if (found) {
      console.log('🎯 App: Switching active group based on Assessment Group field →', found.name || found.id);
      setActiveGroup(found);
      if (found.sections && found.sections.length > 0) setActiveSection(found.sections[0]);
    }
  }, [formData?.[FACILITY_GROUP_DE_ID], groups]);

	  const draftScoringEventIdMap = React.useMemo(
	    () => parseEventIdMap(formData?.eventIdMap_internal),
	    [formData?.eventIdMap_internal, parseEventIdMap]
	  );

	  const preloadScoringEventIdMap = React.useMemo(() => {
	    const preload = selectedFacility?.preloadDataValues || {};
	    return {
	      ...parseEventIdMap(selectedFacility?.eventIdMap),
	      ...parseEventIdMap(preload?.eventIdMap),
	      ...parseEventIdMap(preload?.eventIdMap_internal),
	    };
	  }, [selectedFacility, parseEventIdMap]);

	  const scoringTeiId = React.useMemo(() => (
	    formData?.teiId_internal ||
	    selectedFacility?.trackedEntityInstance ||
	    selectedFacility?.scheduleTeiId ||
	    null
	  ), [formData?.teiId_internal, selectedFacility]);

	  const prevCandidatesRef = React.useRef([]);
	  const scoringNamespaceCandidates = React.useMemo(() => {
	    const preferred = resolveAssessmentNamespaceFromText(
	      formData?.[FACILITY_GROUP_DE_ID] || activeGroup?.name || activeGroup?.id || ''
	    );
	    const next = Array.from(new Set([preferred, ...ALL_CANDIDATE_NAMESPACES].filter(Boolean)));
	    if (
	      prevCandidatesRef.current.length === next.length &&
	      prevCandidatesRef.current.every((val, i) => val === next[i])
	    ) {
	      return prevCandidatesRef.current;
	    }
	    prevCandidatesRef.current = next;
	    return next;
	  }, [formData?.[FACILITY_GROUP_DE_ID], activeGroup, resolveAssessmentNamespaceFromText]);

		  useEffect(() => {
		    if (!user || !scoringTeiId || scoringNamespaceCandidates.length === 0) {
	      setDataStoreScoringEventIdMap(prev => {
	        if (Object.keys(prev || {}).length === 0) return prev;
	        return {};
	      });
	      return;
	    }
	    let cancelled = false;
	    (async () => {
	      const isEquivalent = (a, b) => {
	        const keysA = Object.keys(a || {});
	        const keysB = Object.keys(b || {});
	        if (keysA.length !== keysB.length) return false;
	        return keysA.every(k => a[k] === b[k]);
	      };

	      for (const nsKey of scoringNamespaceCandidates) {
	        try {
	          const plan = await api.getDataStoreItem(nsKey, scoringTeiId);
	          const map = parseEventIdMap(plan?.eventIdMap);
	          if (Object.keys(map).length > 0) {
	            if (!cancelled) {
	              setDataStoreScoringEventIdMap(prev => {
	                if (isEquivalent(prev, map)) return prev;
	                return map;
	              });
	            }
	            return;
	          }
	        } catch (_) {
	          // Keep probing candidate namespaces.
	        }
	      }
	      if (!cancelled) {
	        setDataStoreScoringEventIdMap(prev => {
	          if (Object.keys(prev || {}).length === 0) return prev;
	          return {};
	        });
	      }
	    })();
	    return () => { cancelled = true; };
		  }, [user, scoringTeiId, scoringNamespaceCandidates, parseEventIdMap]);

		  const scoringEventIdMap = React.useMemo(() => {
		    if (!user) return {};
		    return {
		      ...(dataStoreScoringEventIdMap || {}),
		      ...(preloadScoringEventIdMap || {}),
		      ...(draftScoringEventIdMap || {}),
		    };
		  }, [user, dataStoreScoringEventIdMap, preloadScoringEventIdMap, draftScoringEventIdMap]);

	  const scoringEventIds = React.useMemo(() => {
	    const tagRank = (tag) => {
	      if (tag === 'FINAL') return -1;
	      const n = Number(tag);
	      return Number.isFinite(n) ? n : 9999;
	    };
	    const ids = Object.entries(scoringEventIdMap || {})
	      .filter(([, eventId]) => eventId)
	      .sort(([a], [b]) => tagRank(a) - tagRank(b))
	      .map(([, eventId]) => eventId);
	    return Array.from(new Set(ids));
	  }, [scoringEventIdMap]);

	  const scoringEventIdsKey = React.useMemo(() => JSON.stringify(scoringEventIds), [scoringEventIds]);

		  useEffect(() => {
		    if (!user || !scoringEventIds.length) {
		      setServerAssessmentData({});
		      setIsScoringPending(false);
		      return;
		    }
		    let cancelled = false;
		    (async () => {
		      try {
		        setIsScoringPending(true);
		        let loadedEvents = [];
		        try {
		          loadedEvents = await api.getEventsList({
		            eventIds: scoringEventIds,
		            fields: 'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]'
		          });
		        } catch (bulkErr) {
		          console.warn('App: Bulk scoring fetch failed, falling back to individual fetches', bulkErr);
		          const batchSize = 5;
		          for (let i = 0; i < scoringEventIds.length; i += batchSize) {
		            const batch = scoringEventIds.slice(i, i + batchSize);
		            const loaded = await Promise.all(batch.map(eventId => api.getEventById(
		              eventId,
		              'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]'
		            ).catch(() => null)));
		            loaded.forEach(ev => { if (ev?.event) loadedEvents.push(ev); });
		          }
		        }

		        if (cancelled) return;
		        const nextServerData = {};
		        loadedEvents.forEach(ev => {
		          (ev?.dataValues || []).forEach(dv => {
		            if (!dv?.dataElement || dv.value === undefined || dv.value === null) return;
		            const text = String(dv.value).trim();
		            if (text === '') return;
		            nextServerData[dv.dataElement] = dv.value;
		          });
		        });
		        setServerAssessmentData(nextServerData);
		      } catch (e) {
		        console.warn('App: Could not refresh server scoring data', e);
		        if (!cancelled) setServerAssessmentData({});
		      } finally {
		        if (!cancelled) setIsScoringPending(false);
		      }
		    })();
		    return () => { cancelled = true; };
		  }, [user, scoringEventIds, scoringEventIdsKey, serverScoringRefreshTick]);

	  useEffect(() => {
		    if (!user || !scoringEventIds.length) return undefined;
	    const refresh = () => setServerScoringRefreshTick(t => t + 1);
	    const intervalId = window.setInterval(refresh, 120000);
	    window.addEventListener('focus', refresh);
	    const onVisibilityChange = () => {
	      if (document.visibilityState === 'visible') refresh();
	    };
	    document.addEventListener('visibilitychange', onVisibilityChange);
	    return () => {
	      window.clearInterval(intervalId);
	      window.removeEventListener('focus', refresh);
	      document.removeEventListener('visibilitychange', onVisibilityChange);
	    };
		  }, [user, scoringEventIds.length, scoringEventIdsKey]);

		  const displayFormData = React.useMemo(() => {
		    const result = { ...(serverAssessmentData || {}) };
		    Object.entries(formData || {}).forEach(([key, value]) => {
		      const valueText = value === undefined || value === null ? '' : String(value);
		      const hasLocalValue = valueText.trim() !== '';
		      const wasEditedThisSession = locallyEditedFieldIdsRef.current.has(key);
		      const hasServerValue = Object.prototype.hasOwnProperty.call(result, key);
		      if (hasLocalValue || wasEditedThisSession || !hasServerValue) {
		        result[key] = value;
		      }
		    });
		    return result;
		  }, [serverAssessmentData, formData]);

	  const scoringFormData = React.useMemo(() => ({
		    ...(displayFormData || {}),
	    ...(localScoringOverrides || {}),
		  }), [displayFormData, localScoringOverrides]);

  // Assessment Details Prerequisite Check
  const isADComplete = React.useMemo(() => {
	    if (!groups || groups.length === 0 || !displayFormData) return false;

    // Find AD section (usually first section of first group)
    const adSection = groups.flatMap(g => g.sections).find(s => {
	      return isAssessmentDetailsName(s.name || s.code || s.id);
    });
    if (!adSection) return true; // If AD section doesn't exist, don't block anything

	    const fields = adSection.fields || [];

	    // Only require a minimal, critical subset in Assessment Details before
	    // unlocking other sections:
	    // - TEI ID
	    // - Assessor User ID
	    // - Facility Assessment Group
	    const teiField = fields.find(f =>
	      (f.label || '').toUpperCase().includes('TEI ID')
	    );
	    const groupField = fields.find(f =>
	      f.id === FACILITY_GROUP_DE_ID ||
	      /facility assessment (group|type)/.test((f.label || '').toLowerCase())
	    );
	    const assessorField = fields.find(f => {
	      const label = (f.label || '').toUpperCase();
	      return (
	        label.includes('FAC_ASS_ASSESSOR_USER_ID') ||
	        label.includes('ASSESSOR USER ID')
	      );
	    });

	    const requiredFields = [teiField, groupField, assessorField].filter(Boolean);
	    if (requiredFields.length === 0) return true; // nothing to enforce

	    return requiredFields.every(f => {
		      const val = displayFormData[f.id];
	      return val !== undefined && val !== null && String(val).trim() !== '';
	    });
		  }, [groups, displayFormData]);

		  // Scoring Integration: Map flat formData to hierarchical structure for the scoring hook
  // Build a lightweight fingerprint of only the values that affect scoring
	  const scoringDeps = React.useMemo(() => {
    try {
	      if (!activeGroup || !scoringFormData) return '[]';
      const pairs = [];
      const groupsToScan = [activeGroup];
      groupsToScan.forEach(g => {
        (g.sections || []).forEach(sec => {
          (sec.fields || []).forEach(f => {
            if (f && f.type === 'select') {
              const critKey = f && (f.commentFieldId ? `is_critical_${f.commentFieldId}` : `is_critical_${f.id}`);
              const overrideKey = `override_${f.id}`;
	              pairs.push([f.id, scoringFormData[f.id] ?? null]);
	              if (critKey) pairs.push([critKey, scoringFormData[critKey] ?? null]);
              pairs.push([overrideKey, scoringFormData[overrideKey] ?? null]);
            }
          });
        });
      });
      return JSON.stringify(pairs);
    } catch (e) {
      return '[]';
    }
	  }, [activeGroup, scoringFormData]);

  const assessmentDetailsForScoring = React.useMemo(() => {
    if (location.pathname !== '/form') return { sections: [] };
	    if (!groups || groups.length === 0 || !scoringFormData) return { sections: [] };

    // Determine which configuration to use based on the active group
    const programmeType = getProgrammeTypeFromGroup(activeGroup);

    // Use precomputed lookups for the active programme type from the programmeScoringMeta map.
    const activeScoringMeta = programmeScoringMeta[programmeType] || programmeScoringMeta.hospital;
    const { linksDataLookup, severityLookup, criticalLookup } = activeScoringMeta;

	    // Only include sections for the *active* group in scoring so that
	    // switching groups does not require recomputing scores for every other
	    // group, which improves responsiveness of the group dropdown.
	    const targetGroups = activeGroup ? [activeGroup] : groups;
	    const allSections = targetGroups.flatMap(g => g.sections || []);

	    return {
	      sections: allSections.map(section => {
	        const fieldsByStandard = {};

	        (section.fields || [])
	          .filter(f => f.type === 'select')
	          .forEach(f => {
	            const code = f.code || f.id;
	            let normalizedCode = normalizeCriterionCode(code);
	            if (!normalizedCode || !/\d/.test(normalizedCode)) {
	              const labelMatch = String(f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
	              if (labelMatch) normalizedCode = labelMatch[0];
	            }

	            let standardCode = null;
	            if (normalizedCode) {
	              const parts = normalizedCode.split('.');
	              if (parts.length >= 3) {
	                standardCode = `${parts[0]}.${parts[1]}.${parts[2]}`;
	              }
	            }
	            if (!standardCode) {
	              standardCode = section.code || section.id || 'unassigned';
	            }

	            if (!fieldsByStandard[standardCode]) {
	              fieldsByStandard[standardCode] = [];
	            }
	            fieldsByStandard[standardCode].push(f);
	          });

	        const standardsList = Object.entries(fieldsByStandard).map(([stdCode, fields]) => {
	          return {
	            id: stdCode,
	            criteria: fields.map(f => {
	              const code = f.code || f.id;
	              const normalizedCode = normalizeCriterionCode(code);
                  const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
                  const rawLinks = Array.isArray(linksData.linked_criteria) ? linksData.linked_criteria : [];
                  const effectiveLinks = rawLinks.filter(l => !String(l || '').trim().match(/-(G|B)$/i));
                  const hasEffectiveLinks = effectiveLinks.length > 0;
                  const isRoot = hasEffectiveLinks;
	              const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;

                  return {
	                id: f.id,
	                code: code,
	                response: scoringFormData[f.id] || 'NA',
                    isCritical: (function() {
	                  const uiToggle = (scoringFormData[`is_critical_${f.commentFieldId}`]);
                      if (uiToggle !== undefined && uiToggle !== null) return Boolean(uiToggle);
                      return Boolean(criticalLookup[normalizedCode] || criticalLookup[code]);
                    })(),
                    isRoot,
                    links: effectiveLinks,
	                roots: linksData.roots,
                    severity,
                    ...(function() {
	                  const raw = scoringFormData[`override_${f.id}`];
                      const enabled = (raw === true) || (raw === 1) || (String(raw).toLowerCase() === 'true') || (String(raw) === '1');
	                  return enabled ? { overrideEnabled: true, overrideResponse: scoringFormData[f.id] || 'NA' } : {};
                    })()
	              };
	            })
	          };
	        });

	        const finalStandards = standardsList.length > 0 
	          ? standardsList 
	          : [{ id: section.code || section.id, criteria: [] }];

	        return {
	          id: section.id,
	          standards: finalStandards
	        };
	      })
	    };
		  }, [activeGroup, groups, scoringDeps, location.pathname, programmeScoringMeta]);

		  const scoringResults = useAssessmentScoring(assessmentDetailsForScoring);

		  useEffect(() => {
	    if (!isScoringPending) return;
	    const timer = setTimeout(() => {
	      setIsScoringPending(false);
	    }, 300);
	    return () => clearTimeout(timer);
	  }, [scoringResults, isScoringPending]);

	  // Simple group change handler: switch active group and reset section
	  // to the first section of that group (if any). The event ID is already
	  // group-aware via activeEventId, so each group gets its own draft/event.
	  const handleGroupChange = (group) => {
	    setActiveGroup(group);
	    if (group?.sections && group.sections.length > 0) {
	      setActiveSection(group.sections[0]);
	    } else {
	      setActiveSection(null);
	    }
	  };

  const validateSectionLead = React.useCallback((section) => {
    if (!section) return true;
    const isAD = isAssessmentDetailsName(section.name || section.code || section.id);
    if (isAD) return true;

    // Check if the section has any entered data in displayFormData
    const fields = section.fields || [];
    const hasData = fields.some(field => {
      const val = displayFormData?.[field.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') return true;
      const isCritical = displayFormData?.[`is_critical_${field.id}`];
      if (isCritical !== undefined && isCritical !== null && isCritical !== '') return true;
      const override = displayFormData?.[`override_${field.id}`];
      if (override !== undefined && override !== null && override !== '') return true;
      return false;
    });

    if (!hasData) return true;

    // Has data, verify Lead Interviewee Name
    const rawSummary = displayFormData?.[`se_summary_${section.id}`] || '';
    let leadName = '';
    try {
      const parsed = JSON.parse(rawSummary);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        leadName = parsed.leadInterviewee || '';
      }
    } catch (e) {}

    if (!leadName.trim()) {
      showToast?.('Please enter the Lead Interviewee Name in the "Overview" panel of this section before leaving.', 'warning');
      return false;
    }
    return true;
  }, [displayFormData, showToast]);

  const handleSectionSelect = React.useCallback((nextSection) => {
    if (activeSection && activeSection.id !== nextSection?.id) {
      if (!validateSectionLead(activeSection)) {
        return;
      }
    }
    setActiveSection(nextSection);
  }, [activeSection, validateSectionLead]);

  const handleGroupSelect = React.useCallback((group) => {
    if (activeSection) {
      if (!validateSectionLead(activeSection)) {
        return;
      }
    }
    handleGroupChange(group);
  }, [activeSection, validateSectionLead]);

  const handleFacilitySelect = React.useCallback((facility) => {
    if (activeSection) {
      if (!validateSectionLead(activeSection)) {
        return;
      }
    }
    setSelectedFacility(facility);
  }, [activeSection, validateSectionLead]);

  const handleNavigateToDashboard = React.useCallback((go) => {
    if (activeSection) {
      if (!validateSectionLead(activeSection)) {
        return;
      }
    }
    go();
  }, [activeSection, validateSectionLead]);

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setUser} />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      <Route
        path="/form"
        element={
          <PrivateRoute>
            {isLoading ? (
              <div className="loading-screen">Loading Configuration...</div>
            ) : (
              <>
                {formLoadingDepth > 0 && (
                  <div className="form-loader-overlay">
                    <div className="form-loader-card">
                      <div className="form-loader-spinner" />
                      <div className="form-loader-text">{formLoadingMessage}</div>
                    </div>
                  </div>
                )}
                <Layout
                // Navigation Props
                groups={groups}
                activeGroup={activeGroup}
                onSelectGroup={handleGroupSelect}
                activeSection={activeSection}
                onSelectSection={handleSectionSelect}
			                isADComplete={isADComplete}
                onNavigate={handleNavigateToDashboard}

                // Header Props
                assignments={assignments}
                selectedFacility={selectedFacility}
			                onSelectFacility={handleFacilitySelect}
				                formData={displayFormData}
		                scoringEventIdMap={scoringEventIdMap}
				                scoringResults={scoringResults}
				                isAssignedAssessment={Boolean(assessmentIdParam)}
				                isScoringPending={isScoringPending}
                  >
                <FormArea
                  activeSection={activeSection}
                  selectedFacility={selectedFacility}
                  user={user}
                  groups={groups}
	                  formData={displayFormData}
                  saveField={saveField}
                  isSaving={isSaving}
                  lastSaved={lastSaved}
                  isADComplete={isADComplete}
                  activeEventId={activeEventId}
		                  scoringResults={scoringResults}
		                  isScoringPending={isScoringPending}
		                  onCriterionChange={handleCriterionChange}
                />
              </Layout>
            </>
            )}
          </PrivateRoute>
        }
      />

      <Route
        path="/report"
        element={
          <PrivateRoute>
            <Report />
          </PrivateRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <Admin />
          </PrivateRoute>
        }
      />

      <Route
        path="/dev-config-export"
        element={
          <PrivateRoute>
            <DevConfigExport />
          </PrivateRoute>
        }
      />
    </Routes>
  );
};

const App = () => {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </Router>
  );
};

export default App;
