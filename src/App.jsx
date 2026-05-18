import React, { useState, useEffect } from 'react';
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
import emsConfig from './assets/ems_config.json';
import mortuaryConfig from './assets/mortuary_config.json';
import clinicsConfig from './assets/clinics_config.json';
import hospitalConfig from './assets/hospital_config.json';
import emsLinks from './assets/ems_links.json';
import mortuaryLinks from './assets/mortuary_links.json';
import clinicsLinks from './assets/clinics_links.json';
import hospitalLinks from './assets/hospital_links.json';
import { decorateHospitalLinksWithMatrixTags } from './utils/hospitalMatrixTags';
import './App.css';
import Report from './pages/Report';
import Admin from './pages/Admin';

// Helper to build scoring metadata (links + severity + critical) for each programme
// type. The actual programmeScoringMeta object is built inside AppContent so
// that it can react to configuration version changes.
const buildScoringMeta = (config, configKey, links) => {
  const linksDataLookup = {};
  (links || []).forEach(linkObj => {
    if (!linkObj || !linkObj.criteria) return;
    linksDataLookup[linkObj.criteria] = {
      roots: linkObj.root || [],
      linked_criteria: linkObj.linked_criteria || []
    };
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
		  } = useApp();
	  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);

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

  // Map a free-text Assessment Group value to an internal group id
  const resolveGroupIdFromText = React.useCallback((text) => {
    if (!text) return null;
    const t = String(text).toLowerCase();
    if (t.includes('hosp')) return 'HOSPITAL';
    if (t.includes('clinic')) return 'CLINICS';
    if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'SE';
    if (t.includes('mortu') || t.includes('general')) return 'GENERAL';
    return null;
  }, []);

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

	  const saveField = React.useCallback((fieldKey, fieldValue) => {
	    baseSaveField(fieldKey, fieldValue);
	  }, [baseSaveField]);

		  useEffect(() => {
		    setLocalScoringOverrides({});
		    setServerAssessmentData({});
		    setDataStoreScoringEventIdMap({});
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
        setIsFormLoading(true);
        await loadFormData();
      } finally {
        if (!cancelled) {
            setIsFormLoading(false);
            setHasLoadedDraft(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeEventId, loadFormData]);

		  const location = useLocation();
	  const assessmentIdParam = searchParams.get('assessmentId');

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
		      : { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };

    const baseLinks = bundle && bundle.links
      ? bundle.links
      : {
          ems: emsLinks,
          mortuary: mortuaryLinks,
          clinics: clinicsLinks,
          hospital: hospitalLinks,
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
      const [metadata, msgAssignments] = await Promise.all([
        api.getFormMetadata(),
        api.getAssignments()
      ]);

      const transformedGroups = transformMetadata(metadata);
      setGroups(transformedGroups);

      // Prefer the program object returned by metadata so that we have the
      // correct program id and trackedEntityType id for tracker submission.
      const programFromMetadata = metadata.program || { id: 'G2gULe4jsfs', displayName: 'MOH Survey Dashboard' };

      setConfiguration({
        programStage: metadata,
        program: programFromMetadata,
        organisationUnits: msgAssignments.map(a => a.orgUnit)
      });

      // Set Defaults
      if (transformedGroups.length > 0) {
        const firstGroup = transformedGroups[0];
        setActiveGroup(firstGroup);
        if (firstGroup.sections.length > 0) {
          setActiveSection(firstGroup.sections[0]);
        }
      }

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

	  // Auto-select facility based on navigation state or URL parameter
	  useEffect(() => {
	    const stateAssignment = location.state && location.state.selectedAssignment;
	    if (stateAssignment) {
	      console.log('🎯 App: Auto-selecting facility from navigation state:', stateAssignment.orgUnitName);
	      setSelectedFacility(stateAssignment);
	      return;
	    }

	    const assessmentId = searchParams.get('assessmentId');
        const baselineIdParam = searchParams.get('baselineId');
	    const assessmentTeiIdParam = searchParams.get('assessmentTeiId');

	    if (assessmentId && assignments.length > 0) {
	      // Fallback: match against locally loaded assignments (older workflow)
	      const matched = assignments.find(a => (a.eventId || a.enrollment) === assessmentId);
	      if (matched) {
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
	        console.log(`🎯 App: Auto-selecting facility for assessment ${assessmentId}:`, matched.orgUnitName);
	        setSelectedFacility(restored);
	      }
	    }
	  }, [location.state, searchParams, assignments]);

  // Track whether we've applied navigation preloads for the current selection
  const preloadAppliedRef = React.useRef(null);
  // Track whether we've aligned Facility Assessment Group to baseline for the
  // current facility/selection to avoid repeated network fetches on re-renders.
  const baselineAlignRef = React.useRef(null);

  // Auto-populate Assessment Details from selected assessment
  useEffect(() => {
    const nameLower = (activeSection?.name || '').toLowerCase().trim();
    const isADSection =
      nameLower === 'assessment details' || nameLower === 'assessment_details';

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
      const preloadedGroupText = preload[FACILITY_GROUP_DE_ID];
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
      const groupField = adFields.find(
        f =>
          f.id === FACILITY_GROUP_DE_ID ||
          (f.label || '')
            .toLowerCase()
	            .match(/facility assessment (group|type)/)
      );
      const assessorField = adFields.find(f => {
        const label = (f.label || '').toUpperCase();
        return (
          label.includes('FAC_ASS_ASSESSOR_USER_ID') ||
          label.includes('ASSESSOR USER ID')
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
      // Avoid overwriting a preloaded group value from a clicked event.
      const preloadedGroupText = preload && preload[FACILITY_GROUP_DE_ID];
      // If we didn't preload from a clicked event, resolve the facility's
      // Baseline Assessment Group from DHIS2. This both fills an empty field and
      // corrects a mismatched saved draft (e.g. defaulted Mortuary).
      if (groupField && !preloadedGroupText) {
        const programId = configuration?.program?.id || 'G2gULe4jsfs';
        const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
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
    }
  }, [selectedFacility, activeSection, activeGroup, saveField, formData, user?.id, assessmentIdParam, groups, hasLoadedDraft, activeEventId]);

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

	  const scoringNamespaceCandidates = React.useMemo(() => {
	    const preferred = resolveAssessmentNamespaceFromText(
	      formData?.[FACILITY_GROUP_DE_ID] || activeGroup?.name || activeGroup?.id || ''
	    );
	    return Array.from(new Set([preferred, 'HOSPITAL', 'CLINICS', 'EMS', 'MORTUARY'].filter(Boolean)));
	  }, [formData?.[FACILITY_GROUP_DE_ID], activeGroup, resolveAssessmentNamespaceFromText]);

		  useEffect(() => {
		    if (!user || !scoringTeiId || scoringNamespaceCandidates.length === 0) {
	      setDataStoreScoringEventIdMap({});
	      return;
	    }
	    let cancelled = false;
	    (async () => {
	      for (const nsKey of scoringNamespaceCandidates) {
	        try {
	          const plan = await api.getDataStoreItem(nsKey, scoringTeiId);
	          const map = parseEventIdMap(plan?.eventIdMap);
	          if (Object.keys(map).length > 0) {
	            if (!cancelled) setDataStoreScoringEventIdMap(map);
	            return;
	          }
	        } catch (_) {
	          // Keep probing candidate namespaces.
	        }
	      }
	      if (!cancelled) setDataStoreScoringEventIdMap({});
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
	      return;
	    }
	    let cancelled = false;
	    (async () => {
	      try {
	        setIsScoringPending(true);
	        const loadedEvents = [];
	        const batchSize = 5;
	        for (let i = 0; i < scoringEventIds.length; i += batchSize) {
	          const batch = scoringEventIds.slice(i, i + batchSize);
	          const loaded = await Promise.all(batch.map(eventId => api.getEventById(
	            eventId,
	            'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]'
	          ).catch(() => null)));
	          loaded.forEach(ev => { if (ev?.event) loadedEvents.push(ev); });
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

	  const nonEmptyLocalFormData = React.useMemo(() => {
	    const result = {};
	    Object.entries(formData || {}).forEach(([key, value]) => {
	      if (value === undefined || value === null) return;
	      if (typeof value === 'string' && value.trim() === '') return;
	      result[key] = value;
	    });
	    return result;
	  }, [formData]);

	  const scoringFormData = React.useMemo(() => ({
	    ...(serverAssessmentData || {}),
	    ...(nonEmptyLocalFormData || {}),
	    ...(localScoringOverrides || {}),
	  }), [serverAssessmentData, nonEmptyLocalFormData, localScoringOverrides]);

  // Assessment Details Prerequisite Check
  const isADComplete = React.useMemo(() => {
    if (!groups || groups.length === 0 || !formData) return false;

    // Find AD section (usually first section of first group)
    const adSection = groups.flatMap(g => g.sections).find(s => {
      const nameLower = (s.name || '').toLowerCase().trim();
      return nameLower === "assessment details" || nameLower === "assessment_details";
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
	      const val = formData[f.id];
	      return val !== undefined && val !== null && String(val).trim() !== '';
	    });
	  }, [groups, formData]);

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
    const isMortuary =
      activeGroup?.id === 'GENERAL' ||
      activeGroup?.id === 'MORTUARY' ||
      activeGroup?.name === 'Mortuary';
    const isClinics =
      activeGroup?.id === 'CLINICS' || activeGroup?.name === 'Clinics';
    const isHospital =
      activeGroup?.id === 'HOSPITAL' || activeGroup?.name === 'Hospital';

		    const programmeType = isMortuary
      ? 'mortuary'
      : isClinics
      ? 'clinics'
      : isHospital
      ? 'hospital'
      : 'ems';

    // Use precomputed lookups for this programme type from the
    // programmeScoringMeta map instead of rebuilding them on each render.
    const { linksDataLookup, severityLookup, criticalLookup } =
      programmeScoringMeta[programmeType] || programmeScoringMeta.ems;

	    // Only include sections for the *active* group in scoring so that
	    // switching groups does not require recomputing scores for every other
	    // group, which improves responsiveness of the group dropdown.
	    const targetGroups = activeGroup ? [activeGroup] : groups;
	    const allSections = targetGroups.flatMap(g => g.sections || []);

	    return {
	      sections: allSections.map(section => ({
	        id: section.id,
	        standards: [{
	          id: section.code || section.id,
	          // Only score select fields (dropdowns) as they correspond to criteria responses
	          criteria: (section.fields || [])
	            .filter(f => f.type === 'select')
	            .map(f => {
	              const code = f.code || f.id;
	              const normalizedCode = normalizeCriterionCode(code);
                  const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
                  // Treat links suffixed with -G / -B as visual-only. A criterion
                  // is considered a real root ONLY if there is at least one
                  // effective (non -G/-B) linked criterion. Otherwise, allow
                  // manual scoring like a normal leaf.
                  const rawLinks = Array.isArray(linksData.linked_criteria) ? linksData.linked_criteria : [];
                  const effectiveLinks = rawLinks.filter(l => !String(l || '').trim().match(/-(G|B)$/i));
                  const hasEffectiveLinks = effectiveLinks.length > 0;
                  const isRoot = hasEffectiveLinks;
	              const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;
	
                  return {
	                id: f.id,
	                code: code,
	                    response: scoringFormData[f.id] || 'NA',
                    // Critical flag: prefer explicit UI toggle if present; otherwise fallback to config
                    isCritical: (function() {
	                      const uiToggle = (scoringFormData[`is_critical_${f.commentFieldId}`]);
                      if (uiToggle !== undefined && uiToggle !== null) return Boolean(uiToggle);
                      return Boolean(criticalLookup[normalizedCode] || criticalLookup[code]);
                    })(),
                    isRoot,
                    // Provide only effective (non -G/-B) links to the scorer so
                    // that criteria with purely visual links behave as leaves and
                    // can be scored manually.
                    links: effectiveLinks,
	                roots: linksData.roots,
                    severity,
                    // Manual override support for root criteria: enable and value
                    ...(function() {
	                      const raw = scoringFormData[`override_${f.id}`];
                      const enabled = (raw === true) || (raw === 1) || (String(raw).toLowerCase() === 'true') || (String(raw) === '1');
	                      return enabled ? { overrideEnabled: true, overrideResponse: scoringFormData[f.id] || 'NA' } : {};
                    })()
	              };
	            })
	        }]
	      }))
	    };
	  }, [activeGroup, groups, scoringDeps, location.pathname]);

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
                {isFormLoading && (
                  <div className="form-loader-overlay">
                    <div className="form-loader-card">
                      <div className="form-loader-spinner" />
                      <div className="form-loader-text">Loading survey…</div>
                    </div>
                  </div>
                )}
                <Layout
                // Navigation Props
                groups={groups}
                activeGroup={activeGroup}
                onSelectGroup={handleGroupChange}
                activeSection={activeSection}
                onSelectSection={setActiveSection}
			                isADComplete={isADComplete}

                // Header Props
                assignments={assignments}
                selectedFacility={selectedFacility}
			                onSelectFacility={setSelectedFacility}
				                scoringResults={scoringResults}
				                isAssignedAssessment={Boolean(assessmentIdParam)}
				                isScoringPending={isScoringPending}
                  >
                <FormArea
                  activeSection={activeSection}
                  selectedFacility={selectedFacility}
                  user={user}
                  groups={groups}
                  formData={formData}
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
