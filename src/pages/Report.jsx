import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { api } from '../services/api';
import { Button, TextField, MenuItem, FormControl, InputLabel, Select, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { transformMetadata } from '../utils/transformers';
import { normalizeCriterionCode } from '../utils/normalization';
import { useAssessmentScoring } from '../hooks/useAssessmentScoring';
import { decorateHospitalLinksWithMatrixTags } from '../utils/hospitalMatrixTags';
import emsConfig from '../assets/ems/ems_config.json';
import mortuaryConfig from '../assets/mortuary/mortuary_config.json';
import clinicsConfig from '../assets/clinics/clinics_config.json';
import hospitalConfig from '../assets/hospital/hospital_config.json';
import emsLinks from '../assets/ems/ems_links.json';
import mortuaryLinks from '../assets/mortuary/mortuary_links.json';
import clinicsLinks from '../assets/clinics/clinics_links.json';
import hospitalLinks from '../assets/hospital/hospital_links.json';
import qimsLogo from '../assets/logo.png';
import { calculatePointsForLink, setHospitalSubcriteriaConfig } from '../utils/scoring';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
	  LabelList,
	  RadarChart,
	  PolarGrid,
	  PolarAngleAxis,
	  PolarRadiusAxis,
	  Radar,
	  ReferenceLine
} from 'recharts';

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

const toFacilityGroupKey = (value) => {
  const t = String(value || '').trim().toLowerCase();
  if (!t || t === '-') return '';
  if (t.includes('hosp')) return 'HOSPITAL';
  if (t.includes('clinic')) return 'CLINICS';
  if (t.includes('ems') || t === 'se' || t.includes(' se')) return 'EMS';
  if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
  if (t.includes('obg')) return 'OBGYN';
  if (t.includes('oncology') || t.includes('onc')) return 'ONCOLOGY';
  if (t.includes('paediatric') || t.includes('pae') || t.includes('pediatric') || t.includes('ped')) return 'PAEDIATRIC';
  return String(value || '').trim().toUpperCase();
};

const getSurveyProgramStageIdForGroup = (facilityGroupKey) => {
  const normalized = toFacilityGroupKey(facilityGroupKey);
  if (!normalized) return '';
  return SURVEY_PROGRAM_STAGE_BY_GROUP[normalized] || '';
};

const getFacilityGroupKeyFromProgramStageId = (stageId) => {
  const id = String(stageId || '').trim();
  if (!id) return '';
  const entry = Object.entries(SURVEY_PROGRAM_STAGE_BY_GROUP).find(([, value]) => value === id);
  return entry?.[0] || '';
};

export default function Report() {
  const { user, configuration, setConfiguration, showToast, configBundles, activeConfigVersionId, userAssignments, configSource, loadRemoteConfig } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataFetchAttempted, setMetadataFetchAttempted] = useState(false);
  const [error, setError] = useState(null);
  const [facilityOptions, setFacilityOptions] = useState([]); // [{id, name}]
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [facilityLocked, setFacilityLocked] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [autoGenerateRequested, setAutoGenerateRequested] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportInfo, setReportInfo] = useState(null); // { groupId, groupLabel, count, baselineDate, latestDate }
  const [reportAssessment, setReportAssessment] = useState(null);
  const [baselineAssessment, setBaselineAssessment] = useState(null);
  const [baselineProvisioned, setBaselineProvisioned] = useState(false);
  const [sectionLabels, setSectionLabels] = useState({});
  const [sectionChartLabels, setSectionChartLabels] = useState({});
  const [assessorSummary, setAssessorSummary] = useState([]);
  const [isAssessorSummaryCollapsed, setIsAssessorSummaryCollapsed] = useState(true);
  const selectedFacilityName = useMemo(() => {
    const selected = facilityOptions.find(opt => opt.id === selectedFacilityId);
    return selected?.name || selectedFacilityId || 'Selected Facility';
  }, [facilityOptions, selectedFacilityId]);

  const activeConfig = useMemo(() => {
    if (!activeConfigVersionId || !configBundles[activeConfigVersionId]) {
      return {
        hospital_full_configuration: hospitalConfig.hospital_full_configuration,
        clinics_full_configuration: clinicsConfig.clinics_full_configuration,
        ems_full_configuration: emsConfig.ems_full_configuration,
        mortuary_full_configuration: mortuaryConfig.mortuary_full_configuration,
      };
    }
    return configBundles[activeConfigVersionId].config || {};
  }, [activeConfigVersionId, configBundles]);

  const criterionIndex = useMemo(() => {
    const index = {};
    try {
      const possibleKeys = [
        'ems_full_configuration',
        'mortuary_full_configuration',
        'clinics_full_configuration',
        'hospital_full_configuration',
        'eye_full_configuration',
      ];

      possibleKeys.forEach((key) => {
        const arr = activeConfig[key];
        if (Array.isArray(arr)) {
          arr.forEach(se => {
            (se.sections || []).forEach(section => {
              (section.standards || []).forEach(standard => {
                const stdId = (standard.standard_id || standard.standardId || '').trim();
                if (stdId && !index[stdId]) {
                  index[stdId] = {
                    statement: standard.statement || '',
                    description: standard.statement || '',
                  };
                }
                (standard.criteria || []).forEach(crit => {
                  if (crit && crit.id) {
                    index[crit.id] = {
                      statement: standard.statement || '',
                      description: crit.description || '',
                    };
                  }
                });
              });
            });
          });
        }
      });
    } catch (e) {
      console.error('Report: Failed to build criterion index', e);
    }
    return index;
  }, [activeConfig]);
  // Helper: identify the non-SE metadata section often named "Assessment Details"
  const isAssessmentDetailsSection = (section) => {
    if (!section) return false;
    const id = String(section.id || '').toLowerCase();
    const code = String(section.code || '').toLowerCase();
    const name = String(section.name || section.se_name || section.title || '').toLowerCase();
    if (id === 'ad' || id === 'assessment_details' || id === 'assessment-details') return true;
    if (code === 'ad' || code === 'assessment_details' || code === 'assessment-details') return true;
    return name.includes('assessment details');
  };
	  const reportQueryParams = useMemo(() => {
	    try {
	      const sp = new URLSearchParams(window.location.search);
	      return {
	        facilityId: sp.get('facilityId') || '',
	        teiId: sp.get('teiId') || '',
	        eventId: sp.get('eventId') || '',
	        programId: sp.get('programId') || '',
	        programStageId: sp.get('programStageId') || sp.get('stageId') || '',
	        facilityGroup: sp.get('facilityGroup') || sp.get('group') || '',
	        start: sp.get('start') || '',
	        end: sp.get('end') || '',
	      };
	    } catch {
	      return { facilityId: '', teiId: '', eventId: '', programId: '', programStageId: '', facilityGroup: '', start: '', end: '' };
	    }
	  }, []);

  const queryFacilityGroupKey = useMemo(() => toFacilityGroupKey(reportQueryParams.facilityGroup), [reportQueryParams.facilityGroup]);

  const pType = useMemo(() => {
    const groupId = queryFacilityGroupKey;
    return groupId === 'HOSPITAL'
      ? 'hospital'
      : groupId === 'CLINICS'
      ? 'clinics'
      : groupId === 'MORTUARY'
      ? 'mortuary'
      : groupId ? 'ems' : '';
  }, [queryFacilityGroupKey]);

  useEffect(() => {
    if (configSource === 'datastore' && pType) {
      console.log(`[Report] Auto-loading remote configuration for ${pType}...`);
      loadRemoteConfig(pType).catch((err) => {
        console.warn('[Report] Failed to auto-load remote configuration', err);
      });
    }
  }, [configSource, pType, loadRemoteConfig]);
  const programId = reportQueryParams.programId || configuration?.program?.id || 'G2gULe4jsfs';
  const stageIdFromGroup = queryFacilityGroupKey ? getSurveyProgramStageIdForGroup(queryFacilityGroupKey) : '';
  const stageId = reportQueryParams.programStageId || stageIdFromGroup || configuration?.programStage?.id || '';
  const metadataReadyForStage = !stageId || configuration?.programStage?.id === stageId;
  // True once a metadata fetch attempt has completed (success or failure) — allows
  // auto-generate to proceed even if the fetch failed and the IDs never matched.
  const metadataCanProceed = metadataReadyForStage || metadataFetchAttempted;

  useEffect(() => {
    if (!stageId || configuration?.programStage?.id === stageId) {
      // Already ready — mark as attempted so auto-generate is unblocked.
      setMetadataFetchAttempted(true);
      return undefined;
    }
    let cancelled = false;
    setMetadataLoading(true);
    setMetadataFetchAttempted(false);
    api.getFormMetadata(stageId)
      .then((metadata) => {
        if (cancelled) return;
        setConfiguration?.({
          programStage: metadata,
          program: metadata?.program || configuration?.program || { id: programId, displayName: 'MOH Survey Dashboard' },
          organisationUnits: configuration?.organisationUnits || []
        });
      })
      .catch((err) => {
        console.error('Report: failed to load selected program stage metadata', { stageId, err });
        if (!cancelled) showToast?.('Failed to load the selected programme stage metadata for this report.', 'error');
      })
      .finally(() => {
        if (!cancelled) {
          setMetadataLoading(false);
          // Allow auto-generate to proceed regardless of fetch outcome.
          setMetadataFetchAttempted(true);
        }
      });
    return () => { cancelled = true; };
  }, [stageId, configuration?.programStage?.id, configuration?.program, configuration?.organisationUnits, programId, setConfiguration, showToast]);

  // Compute a sensible default OU to search under (user's first org unit)
  const rootOrgUnitId = useMemo(() => {
    const ous = user?.organisationUnits || [];
    return ous[0]?.id || null;
  }, [user]);

  // Build groups from already loaded metadata (no extra network call)
  const groups = useMemo(() => {
    if (!configuration?.programStage) return [];
    try { return transformMetadata(configuration.programStage) || []; } catch { return []; }
  }, [configuration?.programStage]);

  // Build programme-specific scoring metadata from active configuration version
  const programmeScoringMeta = useMemo(() => {
    const bundle = (configBundles && activeConfigVersionId) ? (configBundles[activeConfigVersionId] || null) : null;
    const sourceConfig = bundle && bundle.config ? bundle.config : { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };
    const baseLinks = bundle && bundle.links ? bundle.links : { ems: emsLinks, mortuary: mortuaryLinks, clinics: clinicsLinks, hospital: hospitalLinks };
    const effectiveLinks = { ...baseLinks, hospital: decorateHospitalLinksWithMatrixTags(baseLinks.hospital || hospitalLinks) };

    const buildMeta = (config, key, links) => {
      const linksDataLookup = {};
      (links || []).forEach(linkObj => {
        if (!linkObj || !linkObj.criteria) return;
        const val = { roots: linkObj.root || [], linked_criteria: linkObj.linked_criteria || [] };
        linksDataLookup[linkObj.criteria] = val;
        const normKey = normalizeCriterionCode(linkObj.criteria);
        if (normKey && normKey !== linkObj.criteria) {
          linksDataLookup[normKey] = val;
        }
      });
      const severityLookup = {};
      const criticalLookup = {};
      try {
        (config?.[key] || []).forEach(se => {
          (se.sections || []).forEach(section => {
            (section.standards || []).forEach(standard => {
              (standard.criteria || []).forEach(crit => {
                if (!crit || !crit.id) return;
                severityLookup[crit.id] = crit.severity || 1;
                // Support multiple flag names and normalized IDs
                const isCrit = (
                  crit.is_critical === true ||
                  crit.isCritical === true ||
                  crit.critical === true
                );
                const rawId = String(crit.id);
                const normId = normalizeCriterionCode(rawId);
                if (isCrit) {
                  criticalLookup[rawId] = true;
                  if (normId && normId !== rawId) criticalLookup[normId] = true;
                }
              });
            });
          });
        });
      } catch {}
      return { linksDataLookup, severityLookup, criticalLookup };
    };

    return {
      ems: buildMeta(sourceConfig, 'ems_full_configuration', effectiveLinks.ems || emsLinks),
      mortuary: buildMeta(sourceConfig, 'mortuary_full_configuration', effectiveLinks.mortuary || mortuaryLinks),
      clinics: buildMeta(sourceConfig, 'clinics_full_configuration', effectiveLinks.clinics || clinicsLinks),
      hospital: buildMeta(sourceConfig, 'hospital_full_configuration', effectiveLinks.hospital || hospitalLinks),
      obgyn: buildMeta(sourceConfig, 'obgyn_full_configuration', effectiveLinks.obgyn || []),
    };
  }, [configBundles, activeConfigVersionId]);

  // Keep hospital sub-criteria config in sync for scoring of roots
  useEffect(() => {
    const bundle = (configBundles && activeConfigVersionId) ? (configBundles[activeConfigVersionId] || null) : null;
    if (bundle && bundle.compute) setHospitalSubcriteriaConfig(bundle.compute);
    else setHospitalSubcriteriaConfig(null);
  }, [configBundles, activeConfigVersionId]);

  const FACILITY_GROUP_DE_ID = 'pzenrgsSny3';
  // Resolve the DataElement ID for "Type of Assessment" from loaded metadata
  const TYPE_OF_ASSESSMENT_DE_ID = useMemo(() => {
    const ps = configuration?.programStage;
    if (!ps) return null;
    const candidates = (ps.programStageDataElements || []).map(psde => psde.dataElement || psde);
    const match = candidates.find(de => {
      const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
      return n.includes('type of assessment');
    });
    return match?.id || null;
  }, [configuration]);

  const isBaselineType = (val) => {
    if (val === undefined || val === null) return false;
    const raw = String(val);
    // Exact code provided by user (including trailing space)
    if (raw === 'Baseline Assessment ') return true;
    const trimmed = raw.trim();
    const v = trimmed.toLowerCase();
    // Common textual labels
    if (v === 'baseline' || v === 'baseline assessment' || v === 'base-line') return true;
    // Known code-like values that sometimes appear
    if (v === 'fac_ass_baseline' || v === 'baseline_assessment' || v === 'baseline_survey') return true;
    // Fallback: contains word baseline
    if (v.includes('baseline')) return true;
    return false;
  };
  const parseDateStart = (value) => {
    if (!value) return null;
    const d = new Date(`${String(value).split('T')[0]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const parseDateEnd = (value) => {
    if (!value) return null;
    const d = new Date(`${String(value).split('T')[0]}T23:59:59.999`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const resolveGroupIdFromText = (text) => {
    if (!text) return null;
    const t = String(text).toLowerCase();
    if (t.includes('hosp')) return 'HOSPITAL';
    if (t.includes('clinic')) return 'CLINICS';
    if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'EMS';
    if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
    if (t.includes('obg')) return 'OBGYN';
    return null;
  };

  const withTimeout = (promise, ms, label = 'Request') => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    Promise.resolve(promise)
      .then(value => resolve(value))
      .catch(err => reject(err))
      .finally(() => clearTimeout(timer));
  });

  useEffect(() => {
    let cancelled = false;
    async function loadFacilitiesAuthorised() {
      setLoading(true);
      setError(null);
      try {
        let options = [];
        const directFacilityId = reportQueryParams.facilityId;
        // Prefer authorised facilities from scheduling assignments
        if (directFacilityId) {
          try {
            const ou = await api.getFacilityDetails(directFacilityId);
            options = [{ id: directFacilityId, name: ou.displayName || ou.name || directFacilityId }];
          } catch (_) {
            options = [{ id: directFacilityId, name: directFacilityId }];
          }
        } else if (Array.isArray(userAssignments) && userAssignments.length > 0) {
          const byOu = new Map();
          userAssignments.forEach(a => {
            const id = a.orgUnitId || (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id);
            if (!id) return;
            if (!byOu.has(id)) byOu.set(id, a.orgUnitName || (a.orgUnit && (a.orgUnit.displayName || a.orgUnit.name)) || id);
          });
          options = [...byOu.entries()].map(([id, name]) => ({ id, name }));
        } else if (rootOrgUnitId) {
          // Fallback: discover facilities that already have assessments under user's OU
          const events = await api.getEventsList({
            programId,
            stageId,
            orgUnitId: rootOrgUnitId,
            ouMode: 'DESCENDANTS',
            order: 'eventDate:asc',
            fields: 'event,eventDate,orgUnit,trackedEntityInstance,status',
          });
          const facilityIds = [...new Set((events || []).map(e => e.orgUnit).filter(Boolean))];
          const detailed = await Promise.all(
            facilityIds.map(async (id) => {
              try {
                const ou = await api.getFacilityDetails(id);
                return { id, name: ou.displayName || ou.name || id };
              } catch (_) {
                return { id, name: id };
              }
            })
          );
          options = detailed;
        }

	        if (cancelled) return;
        options.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setFacilityOptions(options);
	        if (directFacilityId) setSelectedFacilityId(directFacilityId);
	        else if (options.length === 1) setSelectedFacilityId(options[0].id);
      } catch (e) {
        console.error('Report: failed to load facilities list', e);
        if (!cancelled) setError('Failed to load facilities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFacilitiesAuthorised();
    return () => { cancelled = true; };
	  }, [userAssignments, programId, stageId, rootOrgUnitId, reportQueryParams.facilityId]);

  const handleGenerate = () => {
    (async () => {
      if (!selectedFacilityId) { showToast?.('Please select a facility.', 'warning'); return; }
	      if (!metadataCanProceed) { showToast?.('Report setup is still loading. Please try again in a moment.', 'info'); return; }
      const periodStart = parseDateStart(startDate);
      const periodEnd = parseDateEnd(endDate);
      if (periodStart && periodEnd && periodStart > periodEnd) { showToast?.('Start date must be before end date.', 'warning'); return; }
      setReportLoading(true);
      setReportInfo(null);
      setReportAssessment(null);
      try {
	        const eventFields = 'event,enrollment,eventDate,program,programStage,orgUnit,trackedEntityInstance,status,dataValues[dataElement,value],notes[note,value]';
	        let all = [];
	        let effectiveStageId = stageId;
	        const mergeEvents = (...lists) => {
	          const byEvent = new Map();
	          lists.flat().forEach(ev => {
	            if (ev?.event) byEvent.set(ev.event, ev);
	          });
	          return Array.from(byEvent.values());
	        };

	        if (reportQueryParams.eventId) {
	          const enrollmentEvents = await api.getEventsList({
	            enrollmentId: reportQueryParams.eventId,
	            order: 'eventDate:desc',
	            fields: eventFields,
	          }).catch(() => []);
	          const directEvent = await api.getEventById(reportQueryParams.eventId, eventFields).then(ev => ev ? [ev] : []).catch(() => []);
	          all = mergeEvents(enrollmentEvents || [], directEvent || []);
	        }

	        if (reportQueryParams.teiId) {
	          const candidateStages = Array.from(new Set([
	            effectiveStageId,
	            stageIdFromGroup,
	            configuration?.programStage?.id,
	            SURVEY_PROGRAM_STAGE_BY_GROUP.HOSPITAL,
	            SURVEY_PROGRAM_STAGE_BY_GROUP.CLINICS,
	            SURVEY_PROGRAM_STAGE_BY_GROUP.EMS,
	            SURVEY_PROGRAM_STAGE_BY_GROUP.MORTUARY,
	          ].filter(Boolean)));

	          for (const candidateStageId of candidateStages) {
	            const teiEvents = await api.getSurveyEventsForTei({
	              teiId: reportQueryParams.teiId,
	              orgUnitId: selectedFacilityId,
	              programId,
	              stageId: candidateStageId,
	              fields: eventFields,
	            }).catch(() => []);
	            if (Array.isArray(teiEvents) && teiEvents.length > 0) {
	              all = mergeEvents(all, teiEvents);
	            }
	          }
	        }

		        if (all.length > 0) {
		          const firstEventStage = all.find(ev => ev?.programStage)?.programStage;
		          if (firstEventStage) effectiveStageId = firstEventStage;
		        }
	
		        // Always load all facility events so the true baseline can be found,
		        // even when a specific TEI/event was targeted from the dashboard.
		        const facilityEvents = await api.getSurveyEventsForOrgUnit({
		          orgUnitId: selectedFacilityId,
		          programId,
		          stageId: effectiveStageId,
		          fields: eventFields
		        }).catch(() => []);
		        all = mergeEvents(all, facilityEvents);
	

        if (all.length === 0) {
          showToast?.('No assessments found for this facility.', 'info');
          setReportLoading(false);
          return;
        }

        const SYS_TAG_DE_ID = 'r8pqjX6Jtr0';
        const getSysTag = (ev) => {
          const tagDv = (ev?.dataValues || []).find(d => d?.dataElement === SYS_TAG_DE_ID && d?.value !== undefined && String(d.value).trim() !== '');
          if (tagDv) return String(tagDv.value).trim();
          const notes = Array.isArray(ev?.notes) ? ev.notes : [];
          const sysTagNote = notes.find(n => n?.value && String(n.value).includes('SYS_TAG:'));
          return sysTagNote ? String(sysTagNote.value).replace('SYS_TAG:', '').trim() : null;
        };
        const getNumericSysTag = (ev) => {
          const tag = getSysTag(ev);
          return tag && /^\d+$/.test(tag) ? tag : null;
        };
        const getTypeValue = (ev) => {
          if (!TYPE_OF_ASSESSMENT_DE_ID) return '';
          return ((ev?.dataValues || []).find(d => d.dataElement === TYPE_OF_ASSESSMENT_DE_ID)?.value) || '';
        };
        const getGroupValue = (ev) => {
          return ((ev?.dataValues || []).find(d => d.dataElement === FACILITY_GROUP_DE_ID)?.value) || '';
        };
        const pickEarliest = (list) => (list || []).reduce((earliest, ev) => (
          !earliest || new Date(ev.eventDate) < new Date(earliest.eventDate) ? ev : earliest
        ), null);
        const pickLatest = (list) => (list || []).reduce((latestEv, ev) => (
          !latestEv || new Date(ev.eventDate) > new Date(latestEv.eventDate) ? ev : latestEv
        ), null);
        const resolveSectionTag = (section, idx = 0) => {
          if (section?.se_id !== undefined && section?.se_id !== null && String(section.se_id).trim() !== '') {
            const n = parseInt(String(section.se_id), 10);
            if (!Number.isNaN(n)) return String(n);
          }
          const codeStr = String(section?.code || section?.name || section?.id || '');
          const seMatch = codeStr.match(/se\s*[_-]*\s*(\d+)/i) || codeStr.match(/(\d+)/);
          if (seMatch) {
            const n = parseInt(seMatch[1] || seMatch[0], 10);
            if (!Number.isNaN(n)) return String(n);
          }
          return String(idx + 1);
        };

        // New model: one TEI = one assessment; events under that TEI are the SE rows + one meta/final event
        const bundlesByTei = {};
        all.forEach(ev => {
          const teiId = ev?.trackedEntityInstance;
          if (!teiId) return;
          if (!bundlesByTei[teiId]) bundlesByTei[teiId] = { teiId, events: [], byTag: {}, metaEvents: [] };
          bundlesByTei[teiId].events.push(ev);
          const tag = getNumericSysTag(ev);
          if (tag) {
            if (!bundlesByTei[teiId].byTag[tag]) bundlesByTei[teiId].byTag[tag] = [];
            bundlesByTei[teiId].byTag[tag].push(ev);
          } else {
            bundlesByTei[teiId].metaEvents.push(ev);
          }
        });

        const bundles = Object.values(bundlesByTei).map(bundle => {
          const typeEvents = bundle.events.filter(ev => getTypeValue(ev));
          const groupEvents = bundle.events.filter(ev => getGroupValue(ev));
          const latestTypeEvent = pickLatest(typeEvents) || pickLatest(bundle.metaEvents) || pickLatest(bundle.events);
          const latestGroupEvent = pickLatest(groupEvents) || pickLatest(bundle.metaEvents) || pickLatest(bundle.events);
          const assessmentDate = latestTypeEvent?.eventDate || pickLatest(bundle.metaEvents)?.eventDate || pickLatest(bundle.events)?.eventDate || null;
          return {
            ...bundle,
            assessmentDate,
            latestType: getTypeValue(latestTypeEvent),
            groupText: getGroupValue(latestGroupEvent),
            isBaseline: typeEvents.some(ev => isBaselineType(getTypeValue(ev))),
            metaEvent: latestTypeEvent || pickLatest(bundle.metaEvents) || pickLatest(bundle.events)
          };
        }).filter(b => b.assessmentDate);

	        const targetBundle = (() => {
	          if (reportQueryParams.teiId) {
	            const byTei = bundles.find(b => b.teiId === reportQueryParams.teiId);
	            if (byTei) return byTei;
	          }
	          if (reportQueryParams.eventId) {
	            return bundles.find(b => (b.events || []).some(ev =>
	              ev?.event === reportQueryParams.eventId || ev?.enrollment === reportQueryParams.eventId
	            )) || null;
	          }
	          return null;
	        })();

	        const inPeriodBundles = bundles.filter(b => {
          const d = b.assessmentDate ? new Date(b.assessmentDate) : null;
          if (!d) return false;
	          if (periodStart && d < periodStart) return false;
	          if (periodEnd && d > periodEnd) return false;
          return true;
        });
	        const targetInPeriod = targetBundle && (!periodStart || new Date(targetBundle.assessmentDate) >= periodStart) && (!periodEnd || new Date(targetBundle.assessmentDate) <= periodEnd);
	        if (inPeriodBundles.length === 0 && !targetInPeriod) { showToast?.('No assessments found for the selected filters.', 'info'); setReportLoading(false); return; }

        let baselineBundle = bundles.filter(b => b.isBaseline).sort((a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate))[0] || null;
        if (!baselineBundle) baselineBundle = bundles.sort((a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate))[0] || null;
	        const latestBundle = (targetInPeriod ? targetBundle : null) || inPeriodBundles.sort((a, b) => new Date(b.assessmentDate) - new Date(a.assessmentDate))[0] || null;
        if (!baselineBundle || !latestBundle) {
          showToast?.('Could not resolve baseline/latest assessments for this facility.', 'warning');
          setReportLoading(false);
          return;
        }

	        const groupText = baselineBundle.groupText || latestBundle.groupText || '';
	        const groupId = resolveGroupIdFromText(groupText) || getFacilityGroupKeyFromProgramStageId(effectiveStageId) || 'GENERAL';
	        let reportGroups = groups;
	        if (effectiveStageId && configuration?.programStage?.id !== effectiveStageId) {
	          try {
	            const metadata = await api.getFormMetadata(effectiveStageId);
	            reportGroups = transformMetadata(metadata) || [];
	            setConfiguration?.({
	              programStage: metadata,
	              program: metadata?.program || configuration?.program || { id: programId, displayName: 'MOH Survey Dashboard' },
	              organisationUnits: configuration?.organisationUnits || []
	            });
	          } catch (metadataErr) {
	            console.warn('Report: failed to load metadata for resolved event stage; using current metadata', metadataErr);
	          }
	        }

		        // Fallback: when an event was saved under the generic/default stage but
		        // belongs to a dedicated facility group (e.g. HOSPITAL), the generic metadata
		        // won't have the group's sections. Load the group-specific stage metadata.
		        const preliminaryGroupObj = reportGroups.find(g => g.id === groupId) || null;
		        if (!((preliminaryGroupObj?.sections || []).some(s => !isAssessmentDetailsSection(s))) && groupId && groupId !== 'GENERAL') {
		          const groupStageId = getSurveyProgramStageIdForGroup(groupId);
		          if (groupStageId && groupStageId !== effectiveStageId && groupStageId !== configuration?.programStage?.id) {
		            try {
		              const fallbackMetadata = await api.getFormMetadata(groupStageId);
		              const fallbackGroups = transformMetadata(fallbackMetadata) || [];
		              const fallbackGroupObj = fallbackGroups.find(g => g.id === groupId) || null;
		              if ((fallbackGroupObj?.sections || []).some(s => !isAssessmentDetailsSection(s))) {
		                reportGroups = fallbackGroups;
		                setConfiguration?.({
		                  programStage: fallbackMetadata,
		                  program: fallbackMetadata?.program || configuration?.program || { id: programId, displayName: 'MOH Survey Dashboard' },
		                  organisationUnits: configuration?.organisationUnits || []
		                });
		              }
		            } catch (fallbackErr) {
		              console.warn('Report: failed to load group-specific metadata fallback', fallbackErr);
		            }
		          }
		        }
	        const directGroupObj = reportGroups.find(g => g.id === groupId) || null;
	        const hasServiceSections = (sections = []) => sections.some(s => !isAssessmentDetailsSection(s));
	        const uniqueSections = (sections = []) => {
	          const byId = new Map();
	          sections.forEach((section, idx) => {
	            const key = section?.id || section?.code || `${section?.name || 'section'}-${idx}`;
	            if (key && !byId.has(key)) byId.set(key, section);
	          });
	          return Array.from(byId.values());
	        };
	        const directSections = directGroupObj?.sections || [];
	        const stageIsDedicatedToGroup = !!effectiveStageId && effectiveStageId === getSurveyProgramStageIdForGroup(groupId);
	        const fallbackStageSections = stageIsDedicatedToGroup
	          ? uniqueSections(reportGroups.flatMap(g => g.sections || []))
	          : [];
	        const targetSections = hasServiceSections(directSections) ? directSections : fallbackStageSections;
	        const groupObj = directGroupObj || (targetSections.length > 0 ? {
	          id: groupId,
	          name: groupId === 'HOSPITAL' ? 'Hospital' : groupId,
	          sections: targetSections,
	        } : null);

        // Build assessment structure for scoring based on facility group
        const pType = groupId === 'HOSPITAL'
          ? 'hospital'
          : groupId === 'CLINICS'
          ? 'clinics'
          : groupId === 'MORTUARY'
          ? 'mortuary'
          : 'ems';
        const { linksDataLookup, severityLookup, criticalLookup } = programmeScoringMeta[pType] || programmeScoringMeta.hospital;

        // Under the new model, each SE lives in its own event tagged as SYS_TAG:<seNum>
        const sectionTagMap = Object.fromEntries(
          targetSections
            .filter(s => !isAssessmentDetailsSection(s))
            .map((s, idx) => [s.id, resolveSectionTag(s, idx)])
        );
        const latestType = latestBundle.latestType || 'Latest assessment';

        const baselineEventBySection = {};
        const latestEventBySection = {};
        targetSections.filter(s => !isAssessmentDetailsSection(s)).forEach((section, idx) => {
          const tag = sectionTagMap[section.id] || resolveSectionTag(section, idx);
          baselineEventBySection[section.id] = pickLatest(baselineBundle.byTag?.[tag] || []);
          latestEventBySection[section.id] = pickLatest(latestBundle.byTag?.[tag] || []);
        });

        const buildAssessmentFromBundle = (bundle) => ({
          sections: targetSections.map((section, idx) => ({
            id: section.id,
            standards: [{
              id: section.code || section.id,
              criteria: (section.fields || [])
                .filter(f => f.type === 'select')
                .map(f => {
                  const tagEvent = pickLatest(bundle.byTag?.[sectionTagMap[section.id] || resolveSectionTag(section, idx)] || []);
                  const sectionEvent = isAssessmentDetailsSection(section)
                    ? bundle.metaEvent
                    : tagEvent || (() => {
                        // Mixed-model fallback: old-model assessments stored all criteria
                        // in a single meta event without SYS_TAG. Find the latest meta event
                        // that actually contains data values for this section's fields.
                        if (!section.fields?.length || !Array.isArray(bundle.metaEvents)) return bundle.metaEvent || null;
                        const fieldIds = new Set(section.fields.map(field => field.id));
                        const candidates = bundle.metaEvents.filter(ev =>
                          (ev.dataValues || []).some(dv => fieldIds.has(dv.dataElement))
                        );
                        return candidates.sort((a, b) => new Date(b.eventDate || 0) - new Date(a.eventDate || 0))[0] || bundle.metaEvent || null;
                      })();
                  const formDataForSection = Object.fromEntries((((sectionEvent || {}).dataValues) || []).map(dv => [dv.dataElement, dv.value]));
                  const code = f.code || f.id;
                  const normalizedCode = normalizeCriterionCode(code);
	                  const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
	                  const rawLinks = Array.isArray(linksData.linked_criteria) ? linksData.linked_criteria : [];
	                  const effectiveLinks = rawLinks.filter(l => !String(l || '').trim().match(/-(G|B)$/i));
	                  const isRoot = effectiveLinks.length > 0;
                  const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;
                  const isCritical = (function() {
                    const uiToggle = f.commentFieldId ? formDataForSection[`is_critical_${f.commentFieldId}`] : undefined;
                    if (uiToggle !== undefined && uiToggle !== null && String(uiToggle).trim() !== '') {
                      return (uiToggle === true || String(uiToggle).toLowerCase() === 'true' || uiToggle === 1 || String(uiToggle) === '1');
                    }
                    const commentVal = f.commentFieldId ? String(formDataForSection[f.commentFieldId] || '') : '';
                    if (commentVal.includes('[CRITICAL]')) return true;
                    return Boolean(criticalLookup[normalizedCode] || criticalLookup[code]);
                  })();
                  return {
                    id: f.id,
                    code,
	                    label: f.label || f.displayName || f.name || code,
                    response: formDataForSection[f.id] || 'NA',
                    isCritical,
                    isRoot,
	                    links: effectiveLinks,
                    roots: linksData.roots,
                    severity
                  };
                })
            }]
          }))
        });

        const assessment = buildAssessmentFromBundle(latestBundle);
        const baselineAssess = buildAssessmentFromBundle(baselineBundle);

        setReportAssessment(assessment);
        setBaselineAssessment(baselineAssess);
        // Build section label map for display (exclude Assessment Details; prefer SE name)
        const labels = {};
        const chartLabels = {};
        // Build a quick se_id -> se_name map from active config for friendly names
        const seNameMap = (() => {
          try {
            let arr = [];
            if (programmeType === 'hospital') arr = activeConfig.hospital_full_configuration || [];
            else if (programmeType === 'clinics') arr = activeConfig.clinics_full_configuration || [];
            else if (programmeType === 'ems') arr = activeConfig.ems_full_configuration || [];
            else if (programmeType === 'mortuary') arr = activeConfig.mortuary_full_configuration || [];
            else if (programmeType === 'obgyn') arr = [];
            const map = {};
            (arr || []).forEach(se => {
              const n = parseInt(String(se.se_id || ''), 10);
              if (!Number.isNaN(n)) map[n] = se.se_name || se.name || se.title || '';
            });
            return map;
          } catch { return {}; }
        })();

        targetSections
          .filter(s => !isAssessmentDetailsSection(s))
          .forEach((s, idx) => {
	            const baseName = s.se_name || s.name || s.title || s.code || s.id;
            // Determine SE number from se_id, then code/id (e.g., HOSP_SE7), else fallback to order index
            let seNum = null;
            if (s.se_id !== undefined && s.se_id !== null && String(s.se_id).trim() !== '') {
              const n = parseInt(String(s.se_id), 10);
              if (!Number.isNaN(n)) seNum = n;
            }
            if (seNum === null) {
              const codeStr = String(s.code || s.id || '');
              const seMatch = codeStr.match(/se\s*[_-]*\s*(\d+)/i) || codeStr.match(/(\d+)/);
              if (seMatch) {
                const n = parseInt(seMatch[1] || seMatch[0], 10);
                if (!Number.isNaN(n)) seNum = n;
              }
            }
            if (seNum === null) seNum = idx + 1;
            const official = seNameMap[seNum];
            const cleanedName = String(official || baseName || '')
              .replace(/^\s*se\s*\d+\s*[-:\u2013\u2014]?\s*/i, '')
              .replace(/^\s*\d+\s*[-:\u2013\u2014]?\s*/i, '')
              .replace(/_/g, ' ')
              .trim();
	            const seLabel = cleanedName ? `SE ${seNum} ${cleanedName}` : `SE ${seNum}`;
	            labels[s.id] = seLabel;
	            chartLabels[s.id] = seLabel;
          });
        setSectionLabels(labels);
        setSectionChartLabels(chartLabels);
        setReportInfo({
          groupId,
          groupLabel: groupObj?.name || groupId,
		          programStageId: effectiveStageId,
          count: inPeriodBundles.length,
          baselineDate: baselineBundle.assessmentDate || null,
          latestDate: latestBundle.assessmentDate || null,
	          periodStart: startDate || null,
	          periodEnd: endDate || null,
          latestType,
          sectionLatestDates: Object.fromEntries(
            targetSections.filter(s => !isAssessmentDetailsSection(s)).map(s => [s.id, latestEventBySection[s.id]?.eventDate || null])
          ),
        });

        // ── Assessor Activity Summary ───────────────────────────────────
        (async () => {
          try {
            const teiId = latestBundle?.teiId || baselineBundle?.teiId || null;
            if (!teiId || !groupId) return;

            const nsKey = ['HOSPITAL', 'CLINICS', 'EMS', 'MORTUARY'].find(k => groupId.includes(k)) || groupId;
            const plan = await api.getDataStoreItem(nsKey, teiId);
            if (!plan) return;

            const seAssignments = plan.seAssignments || {};
            const teamMembers = plan.team || [];
            const allUserIds = [...new Set(teamMembers.map(t => t.userId).filter(Boolean))];
            let userMap = {};
            if (allUserIds.length > 0) {
              userMap = await api.resolveUserDisplayNames(allUserIds);
            }

            // Group all data values from the selected latest assessment by SE (using SYS_TAG notes)
            const seDataMap = {}; // { [seNum]: { [deId]: value, lastUpdated: date } }
            (latestBundle?.events || []).forEach(ev => {
              const seNum = getSysTag(ev);
              if (seNum) {
                if (!seDataMap[seNum]) seDataMap[seNum] = { values: {}, lastUpdated: ev.eventDate };
                (ev.dataValues || []).forEach(dv => {
                  seDataMap[seNum].values[dv.dataElement] = dv.value;
                });
                if (new Date(ev.eventDate) > new Date(seDataMap[seNum].lastUpdated)) {
                  seDataMap[seNum].lastUpdated = ev.eventDate;
                }
              }
            });

            const summary = [];
            teamMembers.forEach(member => {
              const uId = member.userId;
              const resolved = userMap[uId] || { displayName: uId, username: uId };

              // Find SEs assigned to this member
              const assignedSeNums = Object.entries(seAssignments)
                .filter(([_, ids]) => Array.isArray(ids) && ids.includes(uId))
                .map(([num, _]) => num);

              if (assignedSeNums.length === 0) return;

              let stats = { C: 0, PC: 0, NC: 0, NA: 0, total: 0, criteriaCount: 0 };
              let lastUpdated = null;

              assignedSeNums.forEach(num => {
                const data = seDataMap[num];
                if (!data) return;
                if (!lastUpdated || new Date(data.lastUpdated) > new Date(lastUpdated)) {
                  lastUpdated = data.lastUpdated;
                }

                // Match against fields in the section
                const section = targetSections.find((s, idx) => {
                   const tag = sectionTagMap[s.id] || resolveSectionTag(s, idx);
                   return tag === num;
                });

                if (section) {
                  (section.fields || []).forEach(f => {
                    if (f.type === 'select') {
                      const val = data.values[f.id];
                      if (val !== undefined && val !== null && String(val).trim() !== '') {
                        const s = String(val).trim().toLowerCase();
                        if (s === '2' || s === 'yes' || s === 'y' || s === 'compliant' || s === 'c') stats.C++;
                        else if (s === '1' || s === 'partial' || s === 'partially compliant' || s === 'pc') stats.PC++;
                        else if (s === '0' || s === 'no' || s === 'n' || s === 'non compliant' || s === 'non-compliant' || s === 'nc') stats.NC++;
                        else if (s === 'na' || s === 'not applicable' || s === 'not_applicable') stats.NA++;
                        stats.criteriaCount++;
                      }
                    }
                  });
                }
              });

              stats.total = stats.C + stats.PC + stats.NC;
              const compliance = stats.total > 0 ? ((stats.C / stats.total) * 100).toFixed(1) : '0.0';

              summary.push({
                displayName: resolved.displayName || resolved.username || uId,
                role: (member.role || '').replace(/^FAC_ASS_ROLE_/i, '').replace(/_/g, ' '),
                seNums: assignedSeNums.join(', '),
                stats,
                compliance,
                lastUpdated: lastUpdated ? new Date(lastUpdated).toLocaleDateString() : '—'
              });
            });

            setAssessorSummary(summary);
          } catch (err) {
            console.warn('Report: failed to process assessor summary', err);
          }
        })();
      } catch (e) {
        console.error('Report: generation failed', e);
        showToast?.('Failed to generate report', 'error');
      } finally {
        setReportLoading(false);
      }
    })();
  };

	  // If query params are provided (from Dashboard "View Report"), prefill and auto-generate
  useEffect(() => {
    try {
	      const facilityId = reportQueryParams.facilityId;
	      const start = reportQueryParams.start;
	      const end = reportQueryParams.end;
      if (facilityId) setSelectedFacilityId(facilityId);
      if (facilityId) setFacilityLocked(true);
      if (start) setStartDate(start.split('T')[0] || start);
      if (end) setEndDate(end.split('T')[0] || end);
	      if (facilityId) setAutoGenerateRequested(true);
    } catch {}
	  }, [reportQueryParams]);

	  useEffect(() => {
	    if (!autoGenerateRequested || !selectedFacilityId || metadataLoading || !metadataCanProceed) return undefined;
	    const t = setTimeout(() => {
	      handleGenerate();
	      setAutoGenerateRequested(false);
	    }, 0);
	    return () => clearTimeout(t);
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [autoGenerateRequested, selectedFacilityId, startDate, endDate, metadataLoading, metadataCanProceed]);

  const scoring = useAssessmentScoring(reportAssessment || { sections: [] });
  const baselineScoring = useAssessmentScoring(baselineAssessment || { sections: [] });

  // Collapsible state for Facility Overview
  const [isFacilityOverviewCollapsed, setIsFacilityOverviewCollapsed] = useState(true);
  // Large radar chart dialog state
  const [isRadarChartOpen, setIsRadarChartOpen] = useState(false);
	  // Collapsible state for C / PC / NC stacked distribution
	  const [isResponseDistributionCollapsed, setIsResponseDistributionCollapsed] = useState(true);
	  // Collapsible state for criteria heatmap
	  const [isHeatmapCollapsed, setIsHeatmapCollapsed] = useState(true);
  // Collapsible state for Baseline vs Latest (per SE)
  const [isBaselineVsLatestCollapsed, setIsBaselineVsLatestCollapsed] = useState(true);
  // Drilldown state for Baseline vs Latest chart
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillSectionId, setDrillSectionId] = useState(null);
  const [drillLevel, setDrillLevel] = useState('pi'); // pi | standards | criteria
  const [drillRootCode, setDrillRootCode] = useState(null); // holds PI code (e.g. "1.1")
  const [drillStandardCode, setDrillStandardCode] = useState(null); // holds Standard code (e.g. "1.1.1")
  const drillChartRef = useRef(null);

  const formatOverviewDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB');
  };

  const getMonthsSinceDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    let months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
    if (today.getDate() < d.getDate()) months--;
    return Math.max(0, months);
  };

  const buildOverviewDeltaMeta = (baselineValue, latestValue) => {
    if (!Number.isFinite(baselineValue) || !Number.isFinite(latestValue)) {
      return { value: null, display: '—', category: 'muted' };
    }
    const roundedBaseline = Math.round(baselineValue);
    const roundedLatest = Math.round(latestValue);
    const value = roundedLatest - roundedBaseline;
    return {
      value,
      display: `${value > 0 ? '+' : ''}${value}%`,
      category: value > 0 ? 'success' : value < 0 ? 'risk' : 'neutral',
    };
  };

  const buildOverviewResolutionMeta = (completedCount, baselineTotal) => {
    if (!Number.isFinite(baselineTotal) || baselineTotal <= 0) {
      return { value: null, display: '—', category: 'muted' };
    }
    const value = Math.max(0, Math.min(100, Math.round((Number(completedCount || 0) / baselineTotal) * 100)));
    return {
      value,
      display: `${value}%`,
      category: value >= 80 ? 'success' : value >= 40 ? 'warning' : 'risk',
    };
  };

  const buildOverviewAgeMeta = useCallback((dateValue) => {
    const value = getMonthsSinceDate(dateValue);
    if (!Number.isFinite(value)) return { value: null, display: '—', category: 'muted' };
    return {
      value,
      display: `${value} ${value === 1 ? 'month' : 'months'}`,
      category: value <= 1 ? 'success' : value <= 3 ? 'warning' : 'risk',
    };
  }, []);

  const buildOverviewStatusMeta = ({ criticalRemainingNC = 0, criticalRemainingTotal = 0, remainingNC = 0, scoreDelta = null } = {}) => {
    if (Number(criticalRemainingNC) > 0 || (Number.isFinite(scoreDelta) && scoreDelta <= -15)) {
      return { display: 'Critical', category: 'risk', tooltip: 'Critical non-compliant criteria remain or score declined by 15+ percentage points. Immediate action required.' };
    }
    if (Number(criticalRemainingTotal) > 0 || Number(remainingNC) > 0 || (Number.isFinite(scoreDelta) && scoreDelta <= -5)) {
      return { display: 'Warning', category: 'warning', tooltip: 'Some critical or non-compliant criteria remain, or score declined by 5+ percentage points. Attention needed.' };
    }
    return { display: 'On Track', category: 'success', tooltip: 'All criteria are on track with no significant decline in score.' };
  };

  // Build Facility Overview rows (per SE)
  const facilityOverview = useMemo(() => {
    if (!reportAssessment || !baselineAssessment || !reportInfo) return [];
    const latestSections = reportAssessment.sections || [];
    const baseSections = baselineAssessment.sections || [];
    const latestById = Object.fromEntries(latestSections.map(s => [s.id, s]));
    const baseById = Object.fromEntries(baseSections.map(s => [s.id, s]));

    const norm = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (s === '2' || s === 'yes' || s === 'y' || s === 'compliant' || s === 'c') return 'C';
      if (s === '1' || s === 'partial' || s === 'partially compliant' || s === 'pc') return 'PC';
      if (s === '0' || s === 'no' || s === 'n' || s === 'non compliant' || s === 'non-compliant' || s === 'nc') return 'NC';
      return 'NA';
    };

    const getCounts = (critList) => {
      const out = { C: 0, PC: 0, NC: 0, NA: 0 };
      critList.forEach(c => { out[norm(c.response)]++; });
      return out;
    };

    const blSecs = Array.isArray(baselineScoring?.sections) ? baselineScoring.sections : [];
    const ltSecs = Array.isArray(scoring?.sections) ? scoring.sections : [];
    const blPct = Object.fromEntries(blSecs.map(s => [s.id, s.percent]));
    const ltPct = Object.fromEntries(ltSecs.map(s => [s.id, s.percent]));

    const ids = Object.keys(sectionLabels || {});
    return ids.map((id, idx) => {
      const name = sectionLabels[id] || id;
      const baseCrit = (((baseById[id]||{}).standards||[{}])[0].criteria)||[];
      const lateCrit = (((latestById[id]||{}).standards||[{}])[0].criteria)||[];
      const baseCounts = getCounts(baseCrit);
      const lateCounts = getCounts(lateCrit);
      const baselinePercentValue = Number.isFinite(blPct[id]) ? Number(blPct[id]) : null;
      const latestPercentValue = Number.isFinite(ltPct[id]) ? Number(ltPct[id]) : null;
      const baselineDefTotal = baseCounts.NC + baseCounts.PC;
      const completed = baseCrit.reduce((acc, bc) => {
        const code = bc.code;
        const wasDef = ['NC','PC'].includes(norm(bc.response));
        if (!wasDef) return acc;
        const lc = lateCrit.find(x => x.code === code);
        if (lc && norm(lc.response) === 'C') return acc + 1;
        return acc;
      }, 0);

      // Critical criteria counts
      const reportPType = reportInfo?.groupId === 'HOSPITAL'
        ? 'hospital'
        : reportInfo?.groupId === 'CLINICS'
        ? 'clinics'
        : reportInfo?.groupId === 'MORTUARY'
        ? 'mortuary'
        : 'ems';
      const criticalLookup = (programmeScoringMeta[reportPType] || programmeScoringMeta.hospital).criticalLookup || {};
      const getCritical = (list) => list.filter(c => {
        const code = String(c.code || '').trim();
        const n = normalizeCriterionCode(code);
        return criticalLookup[code] === true || criticalLookup[n] === true;
      });
      const baseCritCritical = getCritical(baseCrit);
      const lateCritCritical = getCritical(lateCrit);
      const baseCriticalCounts = getCounts(baseCritCritical);
      const lateCriticalCounts = getCounts(lateCritCritical);
      const latestDateValue = reportInfo.sectionLatestDates?.[id] || reportInfo.latestDate || null;
      const scoreDelta = buildOverviewDeltaMeta(baselinePercentValue, latestPercentValue);
      const resolutionRate = buildOverviewResolutionMeta(completed, baselineDefTotal);
      const daysSince = buildOverviewAgeMeta(latestDateValue);
      const status = buildOverviewStatusMeta({
        criticalRemainingNC: lateCriticalCounts.NC,
        criticalRemainingTotal: lateCritCritical.length,
        remainingNC: lateCounts.NC,
        scoreDelta: scoreDelta.value,
      });

      return {
        seIndex: idx + 1,
        seName: name,
        baselinePercent: baselinePercentValue !== null ? baselinePercentValue.toFixed(0) : '—',
        latestPercent: latestPercentValue !== null ? latestPercentValue.toFixed(0) : '—',
        scoreDelta,
        resolutionRate,
        daysSince,
        status,
        blDefs: { total: baselineDefTotal, NC: baseCounts.NC, PC: baseCounts.PC },
        completed,
        remaining: { total: lateCounts.NC + lateCounts.PC, NC: lateCounts.NC, PC: lateCounts.PC },
        critical: { total: baseCritCritical.length, NC: baseCriticalCounts.NC, PC: baseCriticalCounts.PC },
        criticalRemaining: { total: lateCritCritical.length, NC: lateCriticalCounts.NC, PC: lateCriticalCounts.PC },
        latestDate: formatOverviewDate(latestDateValue),
        policies: { NC: 0, PC: 0, C: 0, total: 0 },
        qiCompliance: 'N/A',
      };
    });
  }, [reportAssessment, baselineAssessment, baselineScoring, scoring, sectionLabels, reportInfo, programmeScoringMeta, buildOverviewAgeMeta]);

  const canDownloadPdf = useMemo(() => {
    if (!reportInfo || !reportAssessment || !baselineAssessment) return false;
    const printableSectionCount = Object.keys(sectionLabels || {}).length;
    const reportSectionCount = (reportAssessment?.sections || []).filter(s => !isAssessmentDetailsSection(s)).length;
    const baselineSectionCount = (baselineAssessment?.sections || []).filter(s => !isAssessmentDetailsSection(s)).length;
    return printableSectionCount > 0 || facilityOverview.length > 0 || reportSectionCount > 0 || baselineSectionCount > 0;
  }, [reportInfo, reportAssessment, baselineAssessment, sectionLabels, facilityOverview]);

	  const radarChartData = useMemo(() => {
	    const bl = Array.isArray(baselineScoring?.sections) ? baselineScoring.sections : [];
	    const lt = Array.isArray(scoring?.sections) ? scoring.sections : [];
	    const blMap = Object.fromEntries(bl.map(s => [s.id, s.percent]));
	    const ltMap = Object.fromEntries(lt.map(s => [s.id, s.percent]));
	    return Object.keys(sectionChartLabels || {})
	      .filter((sectionId) => {
	        const label = String(sectionChartLabels[sectionId] || sectionLabels[sectionId] || '').toLowerCase();
	        const idLower = String(sectionId || '').toLowerCase();
	        return label && !label.includes('assessment details') && !['ad', 'assessment-details', 'assessment_details'].includes(idLower);
	      })
	      .map(sectionId => {
	        const label = sectionChartLabels[sectionId] || sectionLabels[sectionId] || sectionId;
	        const shortName = String(label).replace(/^\s*SE\s*[0-9]+\s*/i, '').trim();
	        return {
	          id: sectionId,
	          name: shortName.length > 22 ? `${shortName.slice(0, 21)}…` : shortName || label,
	          fullName: label,
	          Baseline: Number.isFinite(blMap[sectionId]) ? Number(blMap[sectionId]) : 0,
	          Latest: Number.isFinite(ltMap[sectionId]) ? Number(ltMap[sectionId]) : 0,
	        };
	      });
	  }, [baselineScoring, scoring, sectionChartLabels, sectionLabels]);

	  const responseDistributionData = useMemo(() => {
	    if (!reportAssessment) return [];
	    const norm = (value) => {
	      const s = String(value || '').trim().toLowerCase();
	      if (['2', 'yes', 'y', 'compliant', 'c'].includes(s)) return 'C';
	      if (['1', 'partial', 'partially compliant', 'pc'].includes(s)) return 'PC';
	      if (['0', 'no', 'n', 'non compliant', 'non-compliant', 'nc'].includes(s)) return 'NC';
	      return 'NA';
	    };
	    const sectionsById = Object.fromEntries((reportAssessment.sections || []).map(section => [section.id, section]));
	    return Object.keys(sectionChartLabels || {})
	      .filter((sectionId) => {
	        const label = String(sectionChartLabels[sectionId] || sectionLabels[sectionId] || '').toLowerCase();
	        const idLower = String(sectionId || '').toLowerCase();
	        return label && !label.includes('assessment details') && !['ad', 'assessment-details', 'assessment_details'].includes(idLower);
	      })
	      .map((sectionId) => {
	        const section = sectionsById[sectionId] || {};
	        const criteria = (((section.standards || [{}])[0] || {}).criteria) || [];
	        const counts = criteria.reduce((acc, criterion) => {
	          acc[norm(criterion.response)] += 1;
	          return acc;
	        }, { C: 0, PC: 0, NC: 0, NA: 0 });
	        const total = Math.max(1, counts.C + counts.PC + counts.NC);
	        return {
	          id: sectionId,
	          name: sectionChartLabels[sectionId] || sectionLabels[sectionId] || sectionId,
	          C: Math.round((counts.C / total) * 100),
	          PC: Math.round((counts.PC / total) * 100),
	          NC: Math.round((counts.NC / total) * 100),
	          cCount: counts.C,
	          pcCount: counts.PC,
	          ncCount: counts.NC,
	          naCount: counts.NA,
	          total,
	        };
	      });
	  }, [reportAssessment, sectionChartLabels, sectionLabels]);

  const analyzeOverviewMetric = (value, { tone = 'neutral', zeroAsDash = false, naLabel = 'N/A', suffix = '' } = {}) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return { numeric: null, display: naLabel, category: 'muted' };
    const category = numeric === 0
      ? 'muted'
      : tone === 'success'
        ? 'success'
        : tone === 'risk'
          ? 'risk'
          : tone === 'warning'
            ? 'warning'
            : 'neutral';
    return {
      numeric,
      display: numeric === 0 && zeroAsDash ? '—' : `${numeric}${suffix}`,
      category,
    };
  };

  const analyzeOverviewScore = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return { numeric: null, display: '—', category: 'muted' };
    return {
      numeric,
      display: `${numeric}%`,
      category: numeric >= 85 ? 'success' : numeric >= 65 ? 'warning' : 'risk',
    };
  };

  const overviewPalette = {
    muted: { color: '#64748b', background: '#f8fafc', border: '#e2e8f0' },
    neutral: { color: '#1e293b', background: '#eef2ff', border: '#c7d2fe' },
    success: { color: '#166534', background: '#dcfce7', border: '#86efac' },
    warning: { color: '#92400e', background: '#fef3c7', border: '#fcd34d' },
    risk: { color: '#991b1b', background: '#fee2e2', border: '#fca5a5' },
  };

  const renderOverviewBadge = (value, options = {}) => {
    const meta = analyzeOverviewMetric(value, options);
    const palette = overviewPalette[meta.category] || overviewPalette.neutral;
    return (
      <span style={{
        display: 'inline-flex',
        minWidth: 34,
        justifyContent: 'center',
        padding: '2px 7px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: '0.76rem',
        color: palette.color,
        background: palette.background,
        border: `1px solid ${palette.border}`,
      }}>
        {meta.display}
      </span>
    );
  };

  const renderOverviewMetaBadge = (meta) => {
    const palette = overviewPalette[meta?.category] || overviewPalette.muted;
    return (
      <span
        title={meta?.tooltip || ''}
        style={{
          display: 'inline-flex',
          minWidth: 48,
          justifyContent: 'center',
          padding: '2px 7px',
          borderRadius: 999,
          fontWeight: 700,
          fontSize: '0.76rem',
          color: palette.color,
          background: palette.background,
          border: `1px solid ${palette.border}`,
          whiteSpace: 'nowrap',
        }}
      >
        {meta?.display || '—'}
      </span>
    );
  };

  const renderOverviewScore = (value) => {
    const meta = analyzeOverviewScore(value);
    const palette = overviewPalette[meta.category] || overviewPalette.muted;
    return (
      <div style={{ minWidth: 74 }}>
        <div style={{ fontWeight: 700, color: palette.color, textAlign: 'right', fontSize: '0.82rem' }}>{meta.display}</div>
        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
          <div style={{ width: `${Math.max(0, Math.min(100, meta.numeric || 0))}%`, height: '100%', background: palette.border }} />
        </div>
      </div>
    );
  };

  const renderOverviewService = (row) => {
    const rawName = String(row.seName || '').trim();
    const cleanName = rawName.replace(/^SE\s*[0-9]+\s*/i, '').trim() || rawName;
    return (
      <div style={{ fontWeight: 600, color: '#0f172a', lineHeight: 1.25 }}>{cleanName || rawName || `SE ${row.seIndex}`}</div>
    );
  };

  const facilityOverviewTotals = useMemo(() => facilityOverview.reduce((totals, row) => {
    totals.blTotal += Number(row.blDefs?.total || 0);
    totals.blNC += Number(row.blDefs?.NC || 0);
    totals.blPC += Number(row.blDefs?.PC || 0);
    totals.completed += Number(row.completed || 0);
    totals.remTotal += Number(row.remaining?.total || 0);
    totals.remNC += Number(row.remaining?.NC || 0);
    totals.remPC += Number(row.remaining?.PC || 0);
    totals.critTotal += Number(row.critical?.total || 0);
    totals.critNC += Number(row.critical?.NC || 0);
    totals.critPC += Number(row.critical?.PC || 0);
    totals.critRemTotal += Number(row.criticalRemaining?.total || 0);
    totals.critRemNC += Number(row.criticalRemaining?.NC || 0);
    totals.critRemPC += Number(row.criticalRemaining?.PC || 0);
    totals.policyNC += Number(row.policies?.NC || 0);
    totals.policyPC += Number(row.policies?.PC || 0);
    totals.policyC += Number(row.policies?.C || 0);
    totals.policyTotal += Number(row.policies?.total || 0);
    return totals;
  }, {
    blTotal: 0, blNC: 0, blPC: 0, completed: 0,
    remTotal: 0, remNC: 0, remPC: 0,
    critTotal: 0, critNC: 0, critPC: 0,
    critRemTotal: 0, critRemNC: 0, critRemPC: 0,
    policyNC: 0, policyPC: 0, policyC: 0, policyTotal: 0,
  }), [facilityOverview]);

  const baselineOverall = Number.isFinite(baselineScoring?.overall?.percent) ? baselineScoring.overall.percent.toFixed(0) : '—';
  const latestOverall = Number.isFinite(scoring?.overall?.percent) ? scoring.overall.percent.toFixed(0) : '—';
  const overallDeltaMeta = buildOverviewDeltaMeta(baselineScoring?.overall?.percent, scoring?.overall?.percent);
  const overallResolutionMeta = buildOverviewResolutionMeta(facilityOverviewTotals.completed, facilityOverviewTotals.blTotal);
  const overallDaysSinceMeta = buildOverviewAgeMeta(reportInfo?.latestDate);
  const overallStatusMeta = buildOverviewStatusMeta({
    criticalRemainingNC: facilityOverviewTotals.critRemNC,
    criticalRemainingTotal: facilityOverviewTotals.critRemTotal,
    remainingNC: facilityOverviewTotals.remNC,
    scoreDelta: overallDeltaMeta.value,
  });

  const overviewHeaderCellStyle = (background = '#f8fafc', color = '#0f172a', extra = {}) => ({
    border: '1px solid #d8e1eb',
    padding: '8px 6px',
    background,
    color,
    fontWeight: 700,
    ...extra,
  });

  const overviewBodyCellStyle = (rowIndex, extra = {}) => ({
    border: '1px solid #e2e8f0',
    padding: '8px 6px',
    background: rowIndex % 2 === 1 ? '#f8fafc' : '#ffffff',
    verticalAlign: 'middle',
    ...extra,
  });

  const overviewTotalsCellStyle = (extra = {}) => ({
    border: '1px solid #cbd5e1',
    padding: '8px 6px',
    background: '#e2e8f0',
    fontWeight: 700,
    verticalAlign: 'middle',
    ...extra,
  });

  const openDrillForSection = (sectionId) => {
    setDrillSectionId(sectionId);
    setDrillRootCode(null);
    setDrillStandardCode(null);
    setDrillLevel('pi');
    setDrillOpen(true);
  };

  const closeDrill = () => {
    setDrillOpen(false);
    setDrillSectionId(null);
    setDrillRootCode(null);
    setDrillStandardCode(null);
    setDrillLevel('pi');
  };

  const backDrill = () => {
    if (drillLevel === 'criteria') {
      setDrillStandardCode(null);
      setDrillLevel('standards');
      return;
    }
    if (drillLevel === 'standards') {
      setDrillRootCode(null);
      setDrillLevel('pi');
      return;
    }
    closeDrill();
  };

  const getSectionCriteria = (assessment, sectionId) => {
    const sec = (assessment?.sections || []).find(s => s.id === sectionId);
    return (sec?.standards || []).flatMap(std => std?.criteria || []);
  };

  const normalizeResponseLabel = (value) => {
    const s = String(value || '').trim().toUpperCase();
    if (!s || s === 'NA') return 'NA';
    if (s === 'PENDING') return 'Pending';
    if (/^(C|FC|FULL|COMPLIANT)$/.test(s) && !s.includes('NON')) return 'C';
    if (/^(PC|PARTIAL|SUBSTANTIAL)$/.test(s) || s.includes('PARTIAL')) return 'PC';
    if (/^(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(s) || s.includes('NON') || s.includes('FAIL')) return 'NC';
    return s;
  };

  const toChartScoreValue = (scoreBag, code, fallbackCriterion = null) => {
    const normalized = normalizeCriterionCode(code || fallbackCriterion?.code || fallbackCriterion?.id || '');
    const scoreInfo = scoreBag?.globalScores?.[normalized] || scoreBag?.globalScores?.[code] || null;
    const candidates = [scoreInfo?.displayPoints, scoreInfo?.points, scoreInfo?.rootDraftPoints, scoreInfo?.draftAvg];
    const numeric = candidates.find(value => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)));
    if (numeric !== undefined) return Math.max(0, Math.min(100, Number(numeric)));

    const directPoints = fallbackCriterion
      ? calculatePointsForLink(fallbackCriterion.response, fallbackCriterion.severity || 1)
      : null;
    return Number.isFinite(Number(directPoints)) ? Math.max(0, Math.min(100, Number(directPoints))) : 0;
  };

  const criteriaByCode = (criteriaList) => Object.fromEntries(
    (criteriaList || []).map(c => [normalizeCriterionCode(c?.code || c?.id || ''), c]).filter(([code]) => Boolean(code))
  );

	  const cleanCriterionLabel = (code, rawLabel) => {
	    const normalizedCode = normalizeCriterionCode(code || '');
	    let label = String(rawLabel || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
	    if (!label) return normalizedCode || String(code || '');
	    if (normalizedCode && !label.startsWith(normalizedCode)) {
	      label = `${normalizedCode} ${label}`;
	    }
	    return label;
	  };

	  const criterionLabelForCode = (code, ...criteria) => {
	    const normalizedCode = normalizeCriterionCode(code || '');
	    const configEntry = normalizedCode ? (criterionIndex[normalizedCode] || null) : null;
	    
	    let raw = '';
	    if (configEntry) {
	      const isStandardCode = /^\d+(\.\d+){2}$/.test(normalizedCode);
	      raw = isStandardCode ? configEntry.statement : configEntry.description;
	    }
	    
	    if (!raw) {
	      const criterion = criteria.find(Boolean) || null;
	      raw = criterion?.label || criterion?.displayName || criterion?.name || criterion?.code || code;
	    }
	    
	    return cleanCriterionLabel(code, raw);
	  };

	  const shortCriterionLabel = (label, max = 64) => {
	    const value = String(label || '').trim();
	    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
	  };

  const getSectionStatusLabel = (assessment, sectionId) => {
    const criteria = getSectionCriteria(assessment, sectionId);
    const labels = criteria.map(c => normalizeResponseLabel(c?.response)).filter(Boolean);
    if (labels.length === 0) return 'NA';
    if (labels.includes('NC')) return 'NC';
    if (labels.includes('PC')) return 'PC';
    if (labels.includes('C')) return 'C';
    if (labels.includes('Pending')) return 'Pending';
    return 'NA';
  };

  const getPiLabel = (piCode) => {
    if (!piCode) return '';
    const programmeType = (reportInfo?.groupId === 'HOSPITAL') ? 'hospital' : (reportInfo?.groupId === 'CLINICS') ? 'clinics' : (reportInfo?.groupId === 'EMS') ? 'ems' : (reportInfo?.groupId === 'MORTUARY') ? 'mortuary' : (reportInfo?.groupId === 'OBGYN') ? 'obgyn' : 'mortuary';
    const configMap = {
      hospital: activeConfig?.hospital_full_configuration,
      mortuary: activeConfig?.mortuary_full_configuration,
      clinics: activeConfig?.clinics_full_configuration,
      ems: activeConfig?.ems_full_configuration,
      obgyn: activeConfig?.obgyn_full_configuration || []
    };
    const config = configMap[programmeType] || [];
    for (const se of config) {
      for (const sec of se.sections || []) {
        if ((sec.section_pi_id || '').trim() === piCode) {
          return sec.title || '';
        }
      }
    }
    return '';
  };

  const getStandardLabel = (standardCode) => {
    if (!standardCode) return '';
    const programmeType = (reportInfo?.groupId === 'HOSPITAL') ? 'hospital' : (reportInfo?.groupId === 'CLINICS') ? 'clinics' : (reportInfo?.groupId === 'EMS') ? 'ems' : (reportInfo?.groupId === 'MORTUARY') ? 'mortuary' : (reportInfo?.groupId === 'OBGYN') ? 'obgyn' : 'mortuary';
    const configMap = {
      hospital: activeConfig?.hospital_full_configuration,
      mortuary: activeConfig?.mortuary_full_configuration,
      clinics: activeConfig?.clinics_full_configuration,
      ems: activeConfig?.ems_full_configuration,
      obgyn: activeConfig?.obgyn_full_configuration || []
    };
    const config = configMap[programmeType] || [];
    for (const se of config) {
      for (const sec of se.sections || []) {
        for (const std of sec.standards || []) {
          if ((std.standard_id || '').trim() === standardCode) {
            return std.statement || std.title || '';
          }
        }
      }
    }
    return '';
  };

  const toPiScoreValue = (scoreBag, piCode, sectionCriteria) => {
    const latestByCode = criteriaByCode(sectionCriteria);
    const standardCodes = Array.from(new Set(
      sectionCriteria
        .filter(c => c?.isRoot || /^\d+\.\d+\.\d+$/.test(normalizeCriterionCode(c.code || c.id) || ''))
        .map(c => normalizeCriterionCode(c.code || c.id))
        .filter(code => code && code.startsWith(`${piCode}.`))
    ));
    if (standardCodes.length === 0) return 0;
    let sum = 0;
    let count = 0;
    standardCodes.forEach(code => {
      const val = toChartScoreValue(scoreBag, code, latestByCode[code]);
      if (Number.isFinite(val)) {
        sum += val;
        count++;
      }
    });
    return count > 0 ? Math.round(sum / count) : 0;
  };

  const buildPiChartData = (sectionId) => {
    const latestCriteria = getSectionCriteria(reportAssessment, sectionId);
    const baselineCriteria = getSectionCriteria(baselineAssessment, sectionId);
    const piCodesSet = new Set();
    [...latestCriteria, ...baselineCriteria].forEach(c => {
      const code = normalizeCriterionCode(c.code || c.id);
      if (code) {
        const parts = code.split('.');
        if (parts.length >= 2) {
          piCodesSet.add(`${parts[0]}.${parts[1]}`);
        }
      }
    });
    const piCodes = Array.from(piCodesSet).sort((a, b) => {
      const aParts = String(a).split('.').map(Number);
      const bParts = String(b).split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aNum = Number.isFinite(aParts[i]) ? aParts[i] : 0;
        const bNum = Number.isFinite(bParts[i]) ? bParts[i] : 0;
        if (aNum !== bNum) return aNum - bNum;
      }
      return 0;
    });
    return piCodes.map(code => {
      const title = getPiLabel(code) || `PI ${code}`;
      return {
        code,
        name: shortCriterionLabel(`${code} ${title}`),
        fullLabel: `${code} ${title}`,
        Baseline: toPiScoreValue(baselineScoring, code, baselineCriteria),
        Latest: toPiScoreValue(scoring, code, latestCriteria),
      };
    });
  };

  const buildRootChartData = (sectionId, piCode) => {
    const latestCriteria = getSectionCriteria(reportAssessment, sectionId);
    const baselineCriteria = getSectionCriteria(baselineAssessment, sectionId);
    const latestByCode = criteriaByCode(latestCriteria);
    const baselineByCode = criteriaByCode(baselineCriteria);
    const isStandard = c => c?.isRoot || /^\d+\.\d+\.\d+$/.test(normalizeCriterionCode(c?.code || c?.id || '') || '');
    const latestRoots = latestCriteria.filter(c => isStandard(c) && normalizeCriterionCode(c.code || c.id)?.startsWith(`${piCode}.`));
    const baselineRoots = baselineCriteria.filter(c => isStandard(c) && normalizeCriterionCode(c.code || c.id)?.startsWith(`${piCode}.`));
    const codes = Array.from(new Set([
      ...latestRoots.map(c => normalizeCriterionCode(c.code || c.id)),
      ...baselineRoots.map(c => normalizeCriterionCode(c.code || c.id))
    ].filter(Boolean))).sort((a, b) => {
      const aParts = String(a).split('.').map(Number);
      const bParts = String(b).split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aNum = Number.isFinite(aParts[i]) ? aParts[i] : 0;
        const bNum = Number.isFinite(bParts[i]) ? bParts[i] : 0;
        if (aNum !== bNum) return aNum - bNum;
      }
      return 0;
    });
    return codes.map(code => ({
      code,
      name: shortCriterionLabel(criterionLabelForCode(code, latestByCode[code], baselineByCode[code])),
      fullLabel: criterionLabelForCode(code, latestByCode[code], baselineByCode[code]),
      Baseline: toChartScoreValue(baselineScoring, code, baselineByCode[code]),
      Latest: toChartScoreValue(scoring, code, latestByCode[code]),
    }));
  };

  const buildCriteriaChartData = (sectionId, standardCode) => {
    const stripTag = (raw) => {
      const m = String(raw || '').match(/^(.*?)-([GB])$/i);
      return m ? m[1] : String(raw || '');
    };
    const latestCriteria = getSectionCriteria(reportAssessment, sectionId);
    const baselineCriteria = getSectionCriteria(baselineAssessment, sectionId);
    const latestByCode = criteriaByCode(latestCriteria);
    const baselineByCode = criteriaByCode(baselineCriteria);
    const allCriteria = [...latestCriteria, ...baselineCriteria];
    const isStandard = c => c?.isRoot || /^\d+\.\d+\.\d+$/.test(normalizeCriterionCode(c?.code || c?.id || '') || '');
    const findRoot = (list) => list.find(c => isStandard(c) && normalizeCriterionCode(c.code || c.id) === standardCode);
    const latestRoot = findRoot(latestCriteria);
    const baselineRoot = findRoot(baselineCriteria);
    const linkedCodes = [
      ...((latestRoot?.links || []).map(v => normalizeCriterionCode(stripTag(v))) || []),
      ...((baselineRoot?.links || []).map(v => normalizeCriterionCode(stripTag(v))) || [])
    ];
    const inferredCodes = allCriteria
      .filter(c => !isStandard(c))
      .map(c => normalizeCriterionCode(c.code || c.id))
      .filter(code => code && (code.startsWith(`${standardCode}.`) || code.startsWith(`${standardCode}-`)));
    const codes = Array.from(new Set([...linkedCodes, ...inferredCodes].filter(Boolean))).sort((a, b) => {
      const aParts = String(a).split('.').map(Number);
      const bParts = String(b).split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aNum = Number.isFinite(aParts[i]) ? aParts[i] : 0;
        const bNum = Number.isFinite(bParts[i]) ? bParts[i] : 0;
        if (aNum !== bNum) return aNum - bNum;
      }
      return 0;
    });
    return codes.map(code => ({
      code,
      name: shortCriterionLabel(criterionLabelForCode(code, latestByCode[code], baselineByCode[code])),
      fullLabel: criterionLabelForCode(code, latestByCode[code], baselineByCode[code]),
      Baseline: toChartScoreValue(baselineScoring, code, baselineByCode[code]),
      Latest: toChartScoreValue(scoring, code, latestByCode[code]),
    }));
  };

	  const criterionLabelInSection = (sectionId, code) => {
	    const normalized = normalizeCriterionCode(code || '');
	    const latestByCode = criteriaByCode(getSectionCriteria(reportAssessment, sectionId));
	    const baselineByCode = criteriaByCode(getSectionCriteria(baselineAssessment, sectionId));
	    return criterionLabelForCode(normalized, latestByCode[normalized], baselineByCode[normalized]);
	  };

	  const heatmapData = useMemo(() => {
	    if (!reportAssessment) return [];
	    return Object.keys(sectionChartLabels || {})
	      .filter((sectionId) => {
	        const label = String(sectionChartLabels[sectionId] || sectionLabels[sectionId] || '').toLowerCase();
	        const idLower = String(sectionId || '').toLowerCase();
	        return label && !label.includes('assessment details') && !['ad', 'assessment-details', 'assessment_details'].includes(idLower);
	      })
	      .map((sectionId) => {
	        const criteria = getSectionCriteria(reportAssessment, sectionId);
	        const cells = criteria.map((criterion) => {
	          const code = normalizeCriterionCode(criterion?.code || criterion?.id || '');
	          const response = normalizeResponseLabel(criterion?.response || 'NA');
	          return {
	            code,
	            label: criterionLabelForCode(code, criterion),
	            response,
	          };
	        });
	        return {
	          id: sectionId,
	          name: sectionChartLabels[sectionId] || sectionLabels[sectionId] || sectionId,
	          cells,
	          counts: cells.reduce((acc, cell) => {
	            acc[cell.response] = (acc[cell.response] || 0) + 1;
	            return acc;
	          }, { C: 0, PC: 0, NC: 0, NA: 0, Pending: 0 }),
	        };
	      });
	  }, [reportAssessment, sectionChartLabels, sectionLabels]);

  const ValueLabel = ({ x, y, width, value }) => {
    if (value === undefined || value === null) return null;
    const cx = (x || 0) + (width || 0) / 2;
    const cy = (y || 0) - 6;
    return (
      <text x={cx} y={cy} textAnchor="middle" fill="#0f172a" fontSize={11} fontWeight={600}>
        {`${Number(value).toFixed(0)}%`}
      </text>
    );
  };

	  const wrapAxisLabel = (value, maxChars = 24, maxLines = 4) => {
	    const text = String(value || '').trim();
	    if (!text) return ['—'];
	    const words = text.split(/\s+/).filter(Boolean);
	    const lines = [];
	    let current = '';
	    words.forEach(word => {
	      const next = current ? `${current} ${word}` : word;
	      if (next.length > maxChars && current) {
	        lines.push(current);
	        current = word;
	      } else {
	        current = next;
	      }
	    });
	    if (current) lines.push(current);
	    if (lines.length <= maxLines) return lines;
	    const trimmed = lines.slice(0, maxLines);
	    trimmed[maxLines - 1] = `${trimmed[maxLines - 1].replace(/…$/, '')}…`;
	    return trimmed;
	  };

	  const DrillAxisTick = ({ x, y, payload }) => {
	    const lines = wrapAxisLabel(payload?.value, 22, 4);
	    return (
	      <g transform={`translate(${x},${y})`}>
	        <text textAnchor="middle" fill="#334155" fontSize={10}>
	          {lines.map((line, idx) => (
	            <tspan key={`${line}-${idx}`} x={0} dy={idx === 0 ? 12 : 12}>{line}</tspan>
	          ))}
	        </text>
	      </g>
	    );
	  };

  const getStatusBadgeStyle = (label) => {
    const v = normalizeResponseLabel(label);
    if (v === 'C') return { color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7' };
    if (v === 'PC') return { color: '#92400e', background: '#fef3c7', border: '1px solid #fbbf24' };
    if (v === 'NC') return { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' };
    if (v === 'Pending') return { color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd' };
    return { color: '#475569', background: '#e2e8f0', border: '1px solid #cbd5e1' };
  };

	  const getHeatmapCellStyle = (label) => ({
	    ...getStatusBadgeStyle(label),
	    width: 30,
	    height: 30,
	    borderRadius: 6,
	    display: 'inline-flex',
	    alignItems: 'center',
	    justifyContent: 'center',
	    fontSize: 10,
	    fontWeight: 800,
	    cursor: 'help',
	    flex: '0 0 auto',
	  });

  const StatusBadge = ({ label }) => (
    <span
      style={{
        ...getStatusBadgeStyle(label),
        opacity: 1,
        display: 'inline-block',
        marginLeft: 6,
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        verticalAlign: 'middle'
      }}
    >
      {label || '—'}
    </span>
  );

  const DrillTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const item = payload[0]?.payload || {};
    const code = item.code;
    const baselineRes = baselineScoring?.globalScores?.[code];
    const latestRes = scoring?.globalScores?.[code];
    return (
      <div style={{ background: '#111827', color: '#e5e7eb', padding: '8px 10px', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
	        <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.fullLabel || item.name || code}</div>
	        {item.fullLabel && item.fullLabel !== code && (
	          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Code: {code}</div>
	        )}
        <div>
          Baseline: {Number(item.Baseline || 0).toFixed(1)}%
          <StatusBadge label={baselineRes?.response || '—'} />
        </div>
        <div>
          Latest: {Number(item.Latest || 0).toFixed(1)}%
          <StatusBadge label={latestRes?.response || '—'} />
        </div>
      </div>
    );
  };

  const MainChartTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const item = payload[0]?.payload || {};
    const sectionId = item.id;
    const baselineLabel = getSectionStatusLabel(baselineAssessment, sectionId);
    const latestLabel = getSectionStatusLabel(reportAssessment, sectionId);
    return (
      <div style={{ background: '#111827', color: '#e5e7eb', padding: '8px 10px', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.name || sectionId}</div>
        <div>
          Baseline: {Number(item.Baseline || 0).toFixed(1)}%
          <StatusBadge label={baselineLabel} />
        </div>
        <div>
          Latest: {Number(item.Latest || 0).toFixed(1)}%
          <StatusBadge label={latestLabel} />
        </div>
      </div>
    );
  };

	  const RadarTooltip = ({ active, payload }) => {
	    if (!active || !payload || payload.length === 0) return null;
	    const item = payload[0]?.payload || {};
	    return (
	      <div style={{ background: '#111827', color: '#e5e7eb', padding: '8px 10px', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
	        <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.fullName || item.name || 'Service element'}</div>
	        <div style={{ color: '#bfdbfe' }}>Baseline: {Number(item.Baseline || 0).toFixed(1)}%</div>
	        <div style={{ color: '#f87171' }}>Latest: {Number(item.Latest || 0).toFixed(1)}%</div>
	      </div>
	    );
	  };

	  const ResponseDistributionTooltip = ({ active, payload }) => {
	    if (!active || !payload || payload.length === 0) return null;
	    const item = payload[0]?.payload || {};
	    return (
	      <div style={{ background: '#111827', color: '#e5e7eb', padding: '8px 10px', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
	        <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.name || item.id || 'Service element'}</div>
	        <div style={{ color: '#bbf7d0' }}>C: {item.cCount || 0} criteria ({Number(item.C || 0).toFixed(1)}%)</div>
	        <div style={{ color: '#fde68a' }}>PC: {item.pcCount || 0} criteria ({Number(item.PC || 0).toFixed(1)}%)</div>
	        <div style={{ color: '#f87171' }}>NC: {item.ncCount || 0} criteria ({Number(item.NC || 0).toFixed(1)}%)</div>
	        {Number(item.naCount || 0) > 0 && (
	          <div style={{ color: '#cbd5e1', marginTop: 4 }}>N/A excluded: {item.naCount}</div>
	        )}
	      </div>
	    );
	  };

  const exportDrillAsPng = async () => {
    try {
      const container = drillChartRef.current;
      if (!container) throw new Error('Chart not ready');
      const svg = container.querySelector('svg');
      if (!svg) throw new Error('Chart SVG not found');

      const width = Number(svg.getAttribute('width')) || container.clientWidth || 900;
      const height = Number(svg.getAttribute('height')) || 360;
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = blobUrl;
      });

      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);

      const a = document.createElement('a');
      const seLabel = sectionChartLabels[drillSectionId] || sectionLabels[drillSectionId] || drillSectionId || 'SE';
      a.download = `drilldown-${String(seLabel).replace(/\s+/g, '_')}${drillRootCode ? `-${drillRootCode}` : ''}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (e) {
      showToast?.(`Export failed: ${e.message}`, 'error');
    }
  };

  const formatCoverDate = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB');
  };

  const handleDownloadCoverPdf = () => {
    if (!reportInfo) {
      showToast?.('Generate the report first.', 'warning');
      return;
    }
    if (!canDownloadPdf) {
      showToast?.('Please wait for the report data to finish loading before downloading the PDF.', 'warning');
      return;
    }

    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const surveyors = assessorSummary.length > 0
      ? assessorSummary.map(a => a.displayName).filter(Boolean).join(', ')
      : (user?.displayName || user?.username || 'N/A');
    const score = Number.isFinite(scoring?.overall?.percent)
      ? Math.round(scoring.overall.percent)
      : 'N/A';
	    const reportPeriodStart = reportInfo.periodStart || startDate || reportInfo.baselineDate;
	    const reportPeriodEnd = reportInfo.periodEnd || endDate || reportInfo.latestDate;
	    const dateRange = `${formatCoverDate(reportPeriodStart)} to ${formatCoverDate(reportPeriodEnd)}`;
    const servicesSeen = facilityOverview.length || (reportAssessment?.sections || []).filter(s => !isAssessmentDetailsSection(s)).length || '';
    const overviewRows = [
      ['Facility:', selectedFacilityName],
	      ['Visit From Date:', formatCoverDate(reportPeriodStart)],
	      ['Visit To Date:', formatCoverDate(reportPeriodEnd)],
      ['Visit Type:', reportInfo.latestType || reportInfo.groupLabel || ''],
      ['Cohsasa Facilitators:', surveyors],
      ['Facility Point of Contact:', ''],
      ['Meeting Scheduled:', ''],
      ['Meeting Started:', ''],
      ['Reason for Delay (if applicable):', ''],
      ['Total Number of Steering Committee Members:', ''],
      ['Number of Steering Committee Present:', ''],
      ['Non-Steering Committee Present:', ''],
      ['Number of Services Seen:', servicesSeen],
    ];
    const overviewTableRows = overviewRows.map(([label, value]) => `
      <tr>
        <td class="overview-label">${escapeHtml(label)}</td>
        <td class="overview-value">${escapeHtml(value)}</td>
      </tr>
    `).join('');
    const getFacilitatorsForServiceElement = (seCode) => {
      const code = String(seCode || '').trim();
      if (!code) return '';
      return assessorSummary
        .filter(a => String(a.seNums || '').split(',').map(s => s.trim()).includes(code))
        .map(a => a.displayName)
        .filter(Boolean)
        .join(', ');
    };
    const serviceElementRowsSource = Object.keys(sectionLabels || {}).length > 0
      ? Object.entries(sectionLabels).map(([sectionId, label], idx) => {
        const chartLabel = sectionChartLabels[sectionId] || '';
        const match = chartLabel.match(/SE\s*([0-9]+)/i);
        const seCode = match ? match[1] : String(idx + 1);
        const serviceElement = chartLabel
          ? chartLabel.replace(/^\s*SE\s*[0-9]+\s*/i, '').trim()
          : String(label || '').replace(/^\s*SE\s*[0-9]+\s*/i, '').trim();
        
        // Find score from facilityOverview
        const ovRow = facilityOverview[idx];
        const latestPercent = ovRow ? Number(ovRow.latestPercent) : 0;
        const seenVal = (Number.isFinite(latestPercent) && latestPercent > 0) ? 'Yes' : 'No';

        return { 
          seCode, 
          serviceElement, 
          facilitator: getFacilitatorsForServiceElement(seCode),
          scheduled: 'Yes',
          seen: seenVal
        };
      })
      : facilityOverview.map(row => {
        const latestPercent = Number(row.latestPercent) || 0;
        const seenVal = (Number.isFinite(latestPercent) && latestPercent > 0) ? 'Yes' : 'No';
        return {
          seCode: row.seIndex,
          serviceElement: row.seName,
          facilitator: getFacilitatorsForServiceElement(row.seIndex),
          scheduled: 'Yes',
          seen: seenVal
        };
      });
    const serviceElementTableRows = serviceElementRowsSource.map(row => `
      <tr>
        <td class="se-code">${escapeHtml(row.seCode)}</td>
        <td class="se-name">${escapeHtml(row.serviceElement)}</td>
        <td class="se-small">${escapeHtml(row.scheduled)}</td>
        <td class="se-small">${escapeHtml(row.seen)}</td>
        <td class="se-reason"></td>
        <td class="se-facilitator">${escapeHtml(row.facilitator)}</td>
      </tr>
    `).join('');

    const toReportNumber = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    const formatReportCell = (value) => (value === undefined || value === null || value === '' ? '' : value);
    const buildPdfMetricPill = (value, options = {}) => {
      const meta = analyzeOverviewMetric(value, options);
      return `<span class="fo-pill fo-pill-${meta.category}">${escapeHtml(meta.display)}</span>`;
    };
    const buildPdfMetaPill = (meta) => {
      const category = meta?.category || 'muted';
      const display = meta?.display || '—';
      return `<span class="fo-pill fo-pill-${category}">${escapeHtml(display)}</span>`;
    };
    const buildPdfScoreCell = (value) => {
      const meta = analyzeOverviewScore(value);
      return `
        <div class="fo-score-card">
          <div class="fo-score-value fo-score-${meta.category}">${escapeHtml(meta.display)}</div>
          <div class="fo-score-track"><div class="fo-score-fill fo-score-${meta.category}" style="width:${Math.max(0, Math.min(100, meta.numeric || 0))}%"></div></div>
        </div>
      `;
    };
    const facilityOverviewTotals = facilityOverview.reduce((totals, row) => {
      totals.blTotal += toReportNumber(row.blDefs?.total);
      totals.blNC += toReportNumber(row.blDefs?.NC);
      totals.blPC += toReportNumber(row.blDefs?.PC);
      totals.completed += toReportNumber(row.completed);
      totals.remTotal += toReportNumber(row.remaining?.total);
      totals.remNC += toReportNumber(row.remaining?.NC);
      totals.remPC += toReportNumber(row.remaining?.PC);
      totals.critTotal += toReportNumber(row.critical?.total);
      totals.critNC += toReportNumber(row.critical?.NC);
      totals.critPC += toReportNumber(row.critical?.PC);
      totals.critRemTotal += toReportNumber(row.criticalRemaining?.total);
      totals.critRemNC += toReportNumber(row.criticalRemaining?.NC);
      totals.critRemPC += toReportNumber(row.criticalRemaining?.PC);
      totals.policyNC += toReportNumber(row.policies?.NC);
      totals.policyPC += toReportNumber(row.policies?.PC);
      totals.policyC += toReportNumber(row.policies?.C);
      totals.policyTotal += toReportNumber(row.policies?.total);
      return totals;
    }, {
      blTotal: 0, blNC: 0, blPC: 0, completed: 0,
      remTotal: 0, remNC: 0, remPC: 0,
      critTotal: 0, critNC: 0, critPC: 0,
      critRemTotal: 0, critRemNC: 0, critRemPC: 0,
      policyNC: 0, policyPC: 0, policyC: 0, policyTotal: 0,
    });
    const facilityOverviewTableRows = facilityOverview.map((row, idx) => {
      const scheduleRow = serviceElementRowsSource[idx] || {};
      const seCode = formatReportCell(scheduleRow.seCode || row.seIndex);
      const serviceName = formatReportCell(scheduleRow.serviceElement || row.seName).replace(/^SE\s*[0-9]+\s*/i, '').trim();
      return `
        <tr>
          <td class="fo-se-cell"><span class="fo-se-badge">SE ${escapeHtml(seCode)}</span></td>
          <td class="fo-service fo-service-strong">${escapeHtml(serviceName || `SE ${seCode}`)}</td>
          <td>${buildPdfScoreCell(row.baselinePercent)}</td>
          <td>${buildPdfScoreCell(row.latestPercent)}</td>
          <td>${buildPdfMetaPill(row.scoreDelta)}</td>
          <td>${buildPdfMetaPill(row.resolutionRate)}</td>
          <td>${buildPdfMetaPill(row.daysSince)}</td>
          <td>${buildPdfMetaPill(row.status)}</td>
          <td>${buildPdfMetricPill(row.blDefs?.total, { zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.blDefs?.NC, { tone: 'risk', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.blDefs?.PC, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.completed, { tone: 'success', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.remaining?.total, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.remaining?.NC, { tone: 'risk', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.remaining?.PC, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.critical?.total, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.critical?.NC, { tone: 'risk', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.critical?.PC, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.criticalRemaining?.total, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.criticalRemaining?.NC, { tone: 'risk', zeroAsDash: true })}</td>
          <td>${buildPdfMetricPill(row.criticalRemaining?.PC, { tone: 'warning', zeroAsDash: true })}</td>
          <td>${escapeHtml(formatReportCell(row.latestDate))}</td>
        </tr>
      `;
    }).join('');
    const baselineOverall = Number.isFinite(baselineScoring?.overall?.percent) ? baselineScoring.overall.percent.toFixed(0) : '';
    const latestOverall = Number.isFinite(scoring?.overall?.percent) ? scoring.overall.percent.toFixed(0) : '';

    const buildCriterionRows = (criteriaList, baselineLookup = {}) => criteriaList.map((criterion) => {
      const code = normalizeCriterionCode(criterion?.code || criterion?.id || '');
	      const label = criterionLabelForCode(code, criterion);
      const response = normalizeResponseLabel(criterion?.response || 'NA');
      const scoreInfo = scoring?.globalScores?.[code] || {};
	      const scoreValue = [scoreInfo.displayPoints, scoreInfo.points, scoreInfo.rootDraftPoints, scoreInfo.draftAvg]
	        .find(value => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)));
	      const scoreText = scoreValue !== undefined ? Number(scoreValue).toFixed(0) : response;
      // Baseline data for this criterion
      const baselineCriterion = baselineLookup[code] || null;
      const baselineResponse = baselineCriterion ? normalizeResponseLabel(baselineCriterion?.response || 'NA') : '';
      const baselineDeficiencyText = baselineCriterion
        ? (baselineResponse === 'C'
            ? 'Compliant at baseline.'
            : baselineResponse && baselineResponse !== 'NA'
              ? `Baseline: ${baselineResponse}. Criterion required follow-up at baseline.`
              : 'No baseline data.')
        : 'No baseline data.';
      const baselineResponseStyle = baselineResponse === 'NC'
        ? 'background:#fee2e2;color:#991b1b;font-weight:bold;text-align:center;'
        : baselineResponse === 'PC'
          ? 'background:#fef3c7;color:#92400e;font-weight:bold;text-align:center;'
          : baselineResponse === 'C'
            ? 'background:#d1fae5;color:#065f46;font-weight:bold;text-align:center;'
            : 'color:#6b7280;text-align:center;font-style:italic;';
      // Baseline date — shared across the whole assessment
      const baselineDateText = reportInfo?.baselineDate ? formatCoverDate(reportInfo.baselineDate) : '—';
      return `
        <tr>
	          <td><div>${escapeHtml(code)}</div><div class="criterion-human-label">${escapeHtml(label)}</div><div>Score: ${escapeHtml(scoreText)}</div></td>
          <td style="${baselineResponseStyle}">${escapeHtml(baselineResponse || '—')}</td>
          <td>${escapeHtml(baselineDeficiencyText)}</td>
          <td style="text-align:center;color:#374151;">${escapeHtml(baselineDateText)}</td>
          <td>${escapeHtml(response === 'C' ? 'Criterion reviewed as compliant.' : `Criterion requires follow-up. Current response: ${response}.`)}</td>
          <td>${escapeHtml(response === 'C' ? 'Maintain compliance and supporting evidence.' : 'Develop and implement corrective action; update evidence for reassessment.')}</td>
          <td></td>
          <td></td>
          <td>${escapeHtml(formatCoverDate(reportInfo.latestDate))}</td>
          <td></td>
          <td>${escapeHtml(response)}<br />New Deficiency</td>
          <td></td>
        </tr>
      `;
    }).join('');

    const buildPdfBarChartSvg = (data, xTitle, latestLabel) => {
      if (!Array.isArray(data) || data.length === 0) return '<div>No chart data available</div>';
      const width = 980;
      const height = 520;
      const plot = { left: 78, top: 34, width: 850, height: 330 };
      const bottom = plot.top + plot.height;
      const gridValues = [0, 25, 50, 75, 100];
      const groupWidth = plot.width / Math.max(1, data.length);
      const barWidth = Math.max(12, Math.min(22, groupWidth * 0.18));
      const safeValue = (value) => Math.max(0, Math.min(100, Number(value) || 0));
      const yFor = (value) => bottom - ((safeValue(value) / 100) * plot.height);

      const grid = gridValues.map(value => {
        const y = yFor(value);
        return `
          <line x1="${plot.left}" y1="${y}" x2="${plot.left + plot.width}" y2="${y}" stroke="#cfd4dc" stroke-width="1" />
          <text x="${plot.left - 12}" y="${y + 4}" text-anchor="end" font-size="11" fill="#111827">${value}</text>
        `;
      }).join('');

      const bars = data.map((item, index) => {
        const center = plot.left + (groupWidth * index) + (groupWidth / 2);
        const baseline = safeValue(item.Baseline);
        const latest = safeValue(item.Latest);
        const baselineY = yFor(baseline);
        const latestY = yFor(latest);
        const labelX = center;
        const labelY = bottom + 42;
        const label = escapeHtml(item.name || item.code || '');
        const baselineTextY = baseline > 12 ? baselineY + 16 : baselineY - 5;
        const latestTextY = latest > 12 ? latestY + 16 : latestY - 5;
        const baselineTextFill = baseline > 12 ? '#ffffff' : '#0505ff';
        const latestTextFill = latest > 12 ? '#ffffff' : '#d7282f';
        return `
          <rect x="${center - barWidth - 3}" y="${baselineY}" width="${barWidth}" height="${Math.max(1, bottom - baselineY)}" fill="#0505ff" stroke="#000" />
          <rect x="${center + 3}" y="${latestY}" width="${barWidth}" height="${Math.max(1, bottom - latestY)}" fill="#ef5359" stroke="#000" />
          <text x="${center - barWidth / 2 - 3}" y="${baselineTextY}" text-anchor="middle" font-size="12" font-weight="700" fill="${baselineTextFill}">${baseline.toFixed(0)}</text>
          <text x="${center + barWidth / 2 + 3}" y="${latestTextY}" text-anchor="middle" font-size="12" font-weight="700" fill="${latestTextFill}">${latest.toFixed(0)}</text>
	          <title>${escapeHtml(item.fullLabel || item.name || item.code || '')}</title>
          <text x="${labelX}" y="${labelY}" transform="rotate(-45 ${labelX} ${labelY})" text-anchor="end" font-size="9" fill="#111827">${label}</text>
        `;
      }).join('');

      return `
        <svg class="se-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <text x="${width / 2}" y="18" text-anchor="middle" font-size="12" font-weight="700">${escapeHtml(selectedFacilityName)} Progress Report</text>
          ${grid}
          <line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${bottom}" stroke="#111827" stroke-width="1.5" />
          <line x1="${plot.left}" y1="${bottom}" x2="${plot.left + plot.width}" y2="${bottom}" stroke="#111827" stroke-width="1.5" />
          <text x="18" y="${plot.top + plot.height / 2}" transform="rotate(-90 18 ${plot.top + plot.height / 2})" text-anchor="middle" font-size="13" font-weight="700">Scores</text>
          ${bars}
          <text x="${width / 2}" y="${height - 58}" text-anchor="middle" font-size="13" font-weight="700">${escapeHtml(xTitle)}</text>
          <rect x="${width / 2 - 62}" y="${height - 42}" width="122" height="18" fill="none" stroke="#555" />
          <rect x="${width / 2 - 52}" y="${height - 36}" width="10" height="10" fill="#0505ff" stroke="#000" />
          <text x="${width / 2 - 38}" y="${height - 27}" font-size="10">Baseline</text>
          <rect x="${width / 2 + 10}" y="${height - 36}" width="10" height="10" fill="#ef5359" stroke="#000" />
          <text x="${width / 2 + 24}" y="${height - 27}" font-size="10">${escapeHtml(latestLabel)}</text>
        </svg>
      `;
    };

    const printableSeSectionIds = Object.keys(sectionLabels || {});
    const printableSePages = printableSeSectionIds.map((sectionId, idx) => {
      const seSchedule = serviceElementRowsSource[idx] || {};
      const seOverview = facilityOverview[idx] || {};
      const seCode = seSchedule.seCode || seOverview.seIndex || String(idx + 1);
      const seName = seSchedule.serviceElement || seOverview.seName || sectionLabels[sectionId] || 'Service Element';
      const seTitle = `SE ${seCode}: ${seName}`;
      const seFacilitators = getFacilitatorsForServiceElement(seCode) || surveyors;
      const seCriteria = getSectionCriteria(reportAssessment, sectionId);
      const seBaselineCriteria = getSectionCriteria(baselineAssessment, sectionId);
      const seCriteriaByCode = criteriaByCode(seCriteria);
      const seBaselineCriteriaByCode = criteriaByCode(seBaselineCriteria);
      const seImmediateCriteria = seCriteria.filter(c => ['NC', 'PC'].includes(normalizeResponseLabel(c?.response)));
      const seReviewCriteria = seCriteria.filter(c => !['NC', 'PC'].includes(normalizeResponseLabel(c?.response))).slice(0, 12);
      const seImmediateRows = buildCriterionRows(seImmediateCriteria.slice(0, 10), seBaselineCriteriaByCode) || `
        <tr><td colspan="12">No immediate-response criteria identified for this service element.</td></tr>
      `;
      const seReviewRows = buildCriterionRows(seReviewCriteria, seBaselineCriteriaByCode) || `
        <tr><td colspan="12">No review criteria available for this service element.</td></tr>
      `;
      const seSummaryRow = `
        <tr>
          <td>${escapeHtml(formatReportCell(seOverview.baselinePercent))}</td>
          <td>${escapeHtml(formatReportCell(seOverview.latestPercent))}</td>
          <td>${escapeHtml(seOverview.blDefs?.total ?? 0)}</td>
          <td>${escapeHtml(seOverview.blDefs?.NC ?? 0)}</td>
          <td>${escapeHtml(seOverview.blDefs?.PC ?? 0)}</td>
          <td>${escapeHtml(seOverview.completed ?? 0)}</td>
          <td>${escapeHtml(seOverview.remaining?.total ?? 0)}</td>
          <td>${escapeHtml(seOverview.remaining?.NC ?? 0)}</td>
          <td>${escapeHtml(seOverview.remaining?.PC ?? 0)}</td>
          <td>${escapeHtml(seOverview.critical?.total ?? 0)}</td>
          <td>${escapeHtml(seOverview.critical?.NC ?? 0)}</td>
          <td>${escapeHtml(seOverview.critical?.PC ?? 0)}</td>
          <td>${escapeHtml(seOverview.criticalRemaining?.total ?? 0)}</td>
          <td>${escapeHtml(seOverview.criticalRemaining?.NC ?? 0)}</td>
          <td>${escapeHtml(seOverview.criticalRemaining?.PC ?? 0)}</td>
          <td>${escapeHtml(formatReportCell(seOverview.latestDate || formatCoverDate(reportInfo.latestDate)))}</td>
          <td>${escapeHtml(seOverview.policies?.NC ?? 0)}</td>
          <td>${escapeHtml(seOverview.policies?.PC ?? 0)}</td>
          <td>${escapeHtml(seOverview.policies?.C ?? 0)}</td>
          <td>${escapeHtml(seOverview.policies?.total ?? 0)}</td>
          <td>${escapeHtml(seOverview.qiCompliance || 'N/A')}</td>
        </tr>
      `;
      const seChartData = (() => {
        const rootRows = sectionId ? buildRootChartData(sectionId) : [];
        const source = rootRows.length > 0 ? rootRows : seCriteria.slice(0, 6).map(c => {
          const code = normalizeCriterionCode(c?.code || c?.id || '');
          return {
            code,
	            name: shortCriterionLabel(criterionLabelForCode(code, c), 58),
	            fullLabel: criterionLabelForCode(code, c),
            Baseline: toChartScoreValue(baselineScoring, code, seBaselineCriteriaByCode[code]),
            Latest: toChartScoreValue(scoring, code, seCriteriaByCode[code]),
          };
        });
        return source.slice(0, 8);
      })();
      const seChartSvg = buildPdfBarChartSvg(
        seChartData,
        `Performance Indicators ${seCode}`,
        reportInfo.latestType || 'Latest'
      );
      return `
          <section class="report-page se-narrative-page">
            <h1 class="se-narrative-title">Overview for ${escapeHtml(seTitle.replace(':', ''))}</h1>
            <div class="se-narrative-line">${escapeHtml(reportInfo.latestType || 'Latest assessment')} undertaken by: ${escapeHtml(seFacilitators)}</div>
            <div class="se-narrative-line">No overview is recorded for ${escapeHtml(seTitle.replace(/^SE\s*[0-9]+:\s*/i, ''))}</div>
            <div class="se-narrative-line">Baseline undertaken by: ${escapeHtml(surveyors)}</div>
            <p>${escapeHtml(selectedFacilityName)} assessment findings for ${escapeHtml(seName)} are summarised in the preceding tables and chart.</p>
          </section>
          <section class="report-page se-chart-page">
            <h1 class="se-chart-title">${escapeHtml(seTitle)}</h1>
            <div class="se-chart-wrapper">
              ${seChartSvg}
            </div>
          </section>
          <section class="report-page se-output-page">
            <table class="se-summary-table">
              <thead>
                <tr>
                  <th rowspan="2">Overall<br />baseline<br />score</th>
                  <th rowspan="2">Overall<br />progress<br />score</th>
                  <th colspan="3">Deficiencies identified at<br />baseline</th>
                  <th rowspan="2">Deficiencies<br />completed to<br />date</th>
                  <th colspan="3">Remaining deficiencies<br />to be addressed</th>
                  <th colspan="3">Critical Criteria</th>
                  <th colspan="3">Critical Criteria<br />Remaining</th>
                  <th rowspan="2">Most recent<br />assessment<br />date</th>
                  <th colspan="4">Policies &amp; Procedures</th>
                  <th rowspan="2">Quality<br />improvement<br />standard<br />compliance</th>
                </tr>
                <tr>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>NC</th><th>PC</th><th>C</th><th>Tot</th>
                </tr>
              </thead>
              <tbody>${seSummaryRow}</tbody>
            </table>
            <div class="se-output-heading">Critical criteria requiring immediate response</div>
            <div class="se-output-subheading">${escapeHtml(seTitle)}</div>
            <table class="se-criteria-table">
              <thead>
                <tr>
                  <th class="criterion-col">Criterion</th>
                  <th class="baseline-response-col">Baseline<br />Response</th>
                  <th class="baseline-action-col">Baseline<br />Finding</th>
                  <th class="baseline-date-col">Baseline<br />Date</th>
                  <th class="deficiency-col">Current Deficiency<br />Identified</th>
                  <th class="action-col">Current Action /<br />Recommendation</th>
                  <th class="small-col">Responsible</th>
                  <th class="small-col">Date Due</th>
                  <th class="small-col">Date<br />Reassessed</th>
                  <th class="small-col">Date Completed</th>
                  <th class="progress-col">Progress</th>
                  <th class="small-col">Comment</th>
                </tr>
              </thead>
              <tbody>${seImmediateRows}</tbody>
            </table>
            <div class="se-output-heading">Overall criteria for review</div>
            <table class="se-criteria-table">
              <thead>
                <tr>
                  <th class="criterion-col">Criterion</th>
                  <th class="baseline-response-col">Baseline<br />Response</th>
                  <th class="baseline-action-col">Baseline<br />Finding</th>
                  <th class="baseline-date-col">Baseline<br />Date</th>
                  <th class="deficiency-col">Current Deficiency<br />Identified</th>
                  <th class="action-col">Current Action /<br />Recommendation</th>
                  <th class="small-col">Responsible</th>
                  <th class="small-col">Date Due</th>
                  <th class="small-col">Date<br />Reassessed</th>
                  <th class="small-col">Date Completed</th>
                  <th class="progress-col">Progress</th>
                  <th class="small-col">Comment</th>
                </tr>
              </thead>
              <tbody>${seReviewRows}</tbody>
            </table>
          </section>`;
    }).join('');

    const html = `<!doctype html>
      <html>
        <head>
          <title>${escapeHtml(selectedFacilityName)} Progress Report</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            html, body { margin: 0; padding: 0; font-family: "Times New Roman", Times, serif; color: #000; }
            .preview-toolbar {
              position: sticky;
              top: 0;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              padding: 10px 14px;
              background: #0f172a;
              color: #e5e7eb;
              font-family: Arial, Helvetica, sans-serif;
              box-shadow: 0 2px 10px rgba(15, 23, 42, 0.25);
            }
            .preview-toolbar-title { font-size: 13px; font-weight: 700; }
            .preview-toolbar-actions { display: flex; gap: 8px; }
            .preview-button {
              border: 1px solid #93c5fd;
              border-radius: 6px;
              padding: 7px 12px;
              background: #2563eb;
              color: #fff;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
            }
            .preview-button.secondary { background: transparent; color: #e5e7eb; border-color: #475569; }
            .report-page {
              width: 273mm;
              min-height: 186mm;
              position: relative;
              padding: 0 4mm 8mm;
              box-sizing: border-box;
              break-after: page;
              page-break-after: always;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .report-page:last-child { break-after: auto; page-break-after: auto; }
            .page-footer {
              position: absolute;
              right: 4mm;
              bottom: 1.5mm;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 9px;
              color: #111827;
            }
            .page-header {
              position: absolute;
              left: 4mm;
              right: 4mm;
              top: -7mm;
              display: flex;
              justify-content: space-between;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 9px;
              color: #111827;
            }
            .cover { text-align: center; }
            .crest { width: 74px; height: 74px; object-fit: contain; margin-top: 0; }
            .top-rule { border: 0; border-top: 1px solid #000; margin: 4px 0 14px; }
            .facility { font-size: 20px; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 16px; font-weight: normal; }
            .title { font-size: 16px; line-height: 1.1; margin: 0 0 16px; }
            .line { font-size: 13px; margin: 12px 0; }
            .surveyors { font-size: 12px; line-height: 1.35; max-width: 260mm; margin: 12px auto 20px; }
            .confidential { font-size: 20px; letter-spacing: 0.4px; margin: 22px 0 14px; }
            .contact { font-size: 12px; line-height: 1.45; }
            .bottom-logos { position: absolute; left: 52mm; right: 52mm; bottom: 0; display: flex; justify-content: space-between; align-items: flex-end; }
            .bottom-logo { width: 78px; height: 78px; object-fit: contain; }
            .botswana-mark { font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; color: #1d9bd7; letter-spacing: 0.5px; }
            .botswana-tagline { display: block; font-size: 5px; color: #f59e0b; letter-spacing: 0; margin-top: -2px; }
            .overview-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
            .vision-values { text-align: center; font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.35; margin: 2px 0 6px; }
            .overview-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .overview-table td { border: 1px dotted #9ca3af; padding: 3px 4px; vertical-align: top; min-height: 16px; }
            .overview-label { width: 31%; }
            .overview-value { width: 69%; }
            .non-attendance { margin-top: 26px; }
            .overview-heading { font-size: 18px; font-weight: normal; margin: 4px 0 0; }
            .attendance-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 14px; }
            .attendance-title { margin-top: 0; }
            .attendance-link-word { color: #0645ad; text-decoration: underline; }
            .attendance-note { font-size: 9px; margin-left: 2px; }
            .service-elements-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
            .service-elements-title { font-size: 20px; font-weight: normal; margin: 0 0 16px; }
            .service-elements-table { width: 92%; margin: 0 auto; border-collapse: collapse; table-layout: fixed; }
            .service-elements-table th { background: #f3f4f6; border: 1px solid #222; padding: 5px 3px; font-weight: normal; text-align: center; }
            .service-elements-table td { border: 1px solid #222; padding: 2px 3px; line-height: 1.05; height: 14px; vertical-align: top; }
            .se-code { width: 7%; text-align: left; }
            .se-name { width: 33%; }
            .se-small { width: 7%; text-align: center; }
            .se-reason { width: 30%; }
            .se-facilitator { width: 16%; }
            .service-elements-footer-title { font-size: 20px; font-weight: normal; margin: 0; position: absolute; left: 4mm; bottom: 0; }
            .facility-overview-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; padding: 0; }
            .facility-overview-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 6.6px; line-height: 1.05; }
            .facility-overview-table th, .facility-overview-table td { border: 1px solid #000; padding: 3px 2px; text-align: center; vertical-align: middle; }
            .facility-overview-table th { font-weight: 700; background: #f8fafc; }
            .facility-overview-table .fo-se { width: 3%; }
            .facility-overview-table .fo-service { width: 12%; text-align: left; }
            .facility-overview-table .fo-date { width: 6%; }
            .facility-overview-table .fo-qi { width: 6%; }
            .facility-overview-table .fo-insight { width: 4.5%; }
            .facility-overview-table .fo-status { width: 5.5%; }
            .facility-overview-table tbody tr:nth-child(even) td { background: #f8fafc; }
            .facility-overview-table tfoot td { font-weight: 700; background: #e2e8f0; }
            .facility-overview-table .group-scores { background: #dbeafe; color: #1e3a8a; }
            .facility-overview-table .group-insights { background: #e0f2fe; color: #075985; }
            .facility-overview-table .group-baseline { background: #fef3c7; color: #92400e; }
            .facility-overview-table .group-completed { background: #dcfce7; color: #166534; }
            .facility-overview-table .group-remaining { background: #fee2e2; color: #991b1b; }
            .facility-overview-table .group-critical { background: #fecaca; color: #7f1d1d; }
            .facility-overview-table .group-policy { background: #ede9fe; color: #5b21b6; }
            .facility-overview-table .group-qi { background: #e2e8f0; color: #334155; }
            .fo-se-cell { background: #f8fafc; }
            .fo-se-badge { display: inline-block; padding: 1px 6px; border-radius: 999px; background: #0f172a; color: #fff; font-weight: 700; }
            .fo-service-strong { font-weight: 700; color: #0f172a; }
            .fo-pill { display: inline-block; min-width: 18px; padding: 1px 6px; border-radius: 999px; border: 1px solid #cbd5e1; font-weight: 700; }
            .fo-pill-muted { color: #64748b; background: #f8fafc; border-color: #e2e8f0; }
            .fo-pill-neutral { color: #1e293b; background: #eef2ff; border-color: #c7d2fe; }
            .fo-pill-success { color: #166534; background: #dcfce7; border-color: #86efac; }
            .fo-pill-warning { color: #92400e; background: #fef3c7; border-color: #fcd34d; }
            .fo-pill-risk { color: #991b1b; background: #fee2e2; border-color: #fca5a5; }
            .fo-score-card { min-width: 42px; }
            .fo-score-value { font-weight: 700; margin-bottom: 2px; }
            .fo-score-track { height: 5px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
            .fo-score-fill { height: 100%; border-radius: 999px; }
            .fo-score-success { color: #166534; background: #86efac; }
            .fo-score-warning { color: #92400e; background: #fbbf24; }
            .fo-score-risk { color: #991b1b; background: #f87171; }
            .fo-score-muted { color: #64748b; background: #cbd5e1; }
            .se-output-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; padding: 0; font-size: 7px; }
            .se-summary-table, .se-criteria-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .se-summary-table th, .se-summary-table td, .se-criteria-table th, .se-criteria-table td { border: 1px solid #000; padding: 2px; vertical-align: top; }
            .se-summary-table th, .se-criteria-table th { background: #f3f4f6; font-weight: normal; text-align: center; }
            .se-output-heading { font-size: 10px; margin: 4px 0 2px; font-weight: bold; }
            .se-output-subheading { font-size: 9px; margin: 2px 0; }
	            .criterion-human-label { font-size: 6px; line-height: 1.1; color: #374151; margin: 1px 0; }
            .se-criteria-table .criterion-col { width: 11%; }
            .se-criteria-table .deficiency-col { width: 16%; }
            .se-criteria-table .action-col { width: 16%; }
            .se-criteria-table .baseline-response-col { width: 4%; text-align: center; }
            .se-criteria-table .baseline-action-col { width: 13%; }
            .se-criteria-table .baseline-date-col { width: 6%; text-align: center; }
            .se-criteria-table .small-col { width: 6%; }
            .se-criteria-table .progress-col { width: 6%; }
            .se-chart-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; text-align: center; }
            .se-chart-title { font-size: 24px; font-weight: bold; margin: 0 0 4px; }
            .se-chart-wrapper { width: 260mm; height: 138mm; margin: 0 auto; }
            .se-chart-svg { display: block; width: 100%; height: 100%; overflow: visible; }
            .se-narrative-page { break-before: page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
            .se-narrative-title { font-size: 16px; margin: 0 0 12px; font-weight: normal; }
            .se-narrative-line { margin: 8px 0; }
            @media print {
              .preview-toolbar { display: none !important; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .report-page { break-after: page; page-break-after: always; }
              .report-page:last-child { break-after: auto; page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <div class="preview-toolbar">
            <div class="preview-toolbar-title">PDF Preview — ${escapeHtml(selectedFacilityName)} Progress Report</div>
            <div class="preview-toolbar-actions">
              <button class="preview-button" type="button" onclick="window.print()">Print / Save PDF</button>
              <button class="preview-button secondary" type="button" onclick="window.close()">Close Preview</button>
            </div>
          </div>
          <main class="report-page cover">
            <img class="crest" src="${qimsLogo}" alt="Republic of Botswana" />
            <hr class="top-rule" />
            <h1 class="facility">${escapeHtml(selectedFacilityName)}</h1>
            <div class="title">National Health Quality Standards Progress<br />Report</div>
            <div class="line">OVERALL FACILITY SCORE: ${escapeHtml(score)}</div>
            <div class="line">DATE OF SURVEY: ${escapeHtml(dateRange)}</div>
            <div class="surveyors">SURVEYORS: ${escapeHtml(surveyors)}</div>
            <div class="confidential">CONFIDENTIAL</div>
            <div class="contact">
              Ministry of Health<br />
              Private Bag 0038, Gaborone<br />
              Plot 54609, Government Enclave, Gaborone<br />
              Tel: 363 2500<br />
              Toll free 0800600740
            </div>
            <div class="bottom-logos">
              <img class="bottom-logo" src="${qimsLogo}" alt="Ministry of Health" />
              <div class="botswana-mark">BOTSWANA<span class="botswana-tagline">our pride, your destination</span></div>
            </div>
          </main>
          <section class="report-page overview-page">
            <div class="vision-values">
              <div><strong>Vision:</strong>A Model of Excellence in Quality Health Services.</div>
              <div><strong>Values:</strong>Botho, Equity, Timeliness, Customer Focus, Teamwork.</div>
            </div>
            <table class="overview-table">
              <tbody>${overviewTableRows}</tbody>
            </table>
            <div class="non-attendance">Reasons for Non-attendance of Steering Committee member:</div>
            <h2 class="overview-heading">Overview</h2>
          </section>
          <section class="report-page attendance-page">
            <div class="attendance-title">
              Steering Committee <span class="attendance-link-word">Attendance</span><span class="attendance-note">(only project management meetings calculated)</span>
            </div>
          </section>
          <section class="report-page service-elements-page">
            <h2 class="service-elements-title">Service Elements Scheduled</h2>
            <table class="service-elements-table">
              <thead>
                <tr>
                  <th class="se-code">SE Code</th>
                  <th class="se-name">Service Element</th>
                  <th class="se-small">Scheduled</th>
                  <th class="se-small">Seen</th>
                  <th class="se-reason">Reason Not Seen</th>
                  <th class="se-facilitator">Facilitator</th>
                </tr>
              </thead>
              <tbody>${serviceElementTableRows}</tbody>
            </table>
            <h2 class="service-elements-footer-title">Facility Overview</h2>
          </section>
          <section class="report-page facility-overview-page">
            <table class="facility-overview-table">
              <thead>
                <tr>
                  <th class="fo-se" rowspan="2" title="Service Element index code">SE</th>
                  <th class="fo-service" rowspan="2" title="Service Element name">Service</th>
                  <th class="group-scores" rowspan="2" title="First recorded compliance score inside the selected date range.">Overall<br />baseline<br />score</th>
                  <th class="group-scores" rowspan="2" title="Most recent recorded compliance score inside the selected date range.">Overall<br />progress<br />score</th>
                  <th class="group-insights" colspan="4" title="Action-oriented metrics tracking change, closure rate, timeline, and status.">Action<br />insights</th>
                  <th class="group-baseline" colspan="3" title="Deficiencies (Non-Compliant or Partially Compliant criteria) identified in the baseline assessment.">Deficiencies<br />identified at<br />baseline</th>
                  <th class="group-completed" rowspan="2" title="Baseline deficiencies successfully resolved to Compliant in the latest assessment.">Deficiencies<br />completed<br />to date</th>
                  <th class="group-remaining" colspan="3" title="Baseline deficiencies that remain Non-Compliant or Partially Compliant in the latest assessment.">Remaining<br />deficiencies to be<br />addressed</th>
                  <th class="group-critical" colspan="3" title="Total number of critical criteria evaluated at baseline.">Critical Criteria</th>
                  <th class="group-critical" colspan="3" title="Number of baseline critical criteria that remain deficient (NC/PC) in the latest assessment.">Critical Criteria<br />Remaining</th>
                  <th class="fo-date" rowspan="2" title="Date of the most recent assessment within the selected range.">Most recent<br />assessment<br />date</th>
                </tr>
                <tr>
                  <th class="fo-insight" title="Percentage point change between progress and baseline scores: (rounded progress % - rounded baseline %).">Δ<br />Change</th>
                  <th class="fo-insight" title="Percentage of baseline deficiencies successfully resolved: (Completed / Baseline Total) * 100.">Closure<br />Rate</th>
                  <th class="fo-insight" title="Number of months elapsed since the latest assessment was completed.">Months<br />Since</th>
                  <th class="fo-status" title="Current status of the service: Critical (remaining critical deficiencies or score drop <= -15%), Warning (some deficiencies or score drop <= -5%), or On Track.">Status</th>
                  <th title="Total baseline deficiencies: (NC + PC).">Total</th><th title="Baseline criteria scored as Non-Compliant.">NC</th><th title="Baseline criteria scored as Partially Compliant.">PC</th>
                  <th title="Total remaining deficiencies: (NC + PC).">Total</th><th title="Remaining criteria scored as Non-Compliant in the latest assessment.">NC</th><th title="Remaining criteria scored as Partially Compliant in the latest assessment.">PC</th>
                  <th title="Total critical criteria evaluated at baseline.">Total</th><th title="Critical criteria scored as Non-Compliant at baseline.">NC</th><th title="Critical criteria scored as Partially Compliant at baseline.">PC</th>
                  <th title="Total critical criteria remaining deficient in the latest assessment.">Total</th><th title="Critical criteria remaining Non-Compliant in the latest assessment.">NC</th><th title="Critical criteria remaining Partially Compliant in the latest assessment.">PC</th>
                </tr>
              </thead>
              <tbody>${facilityOverviewTableRows}</tbody>
              <tfoot>
                <tr>
                  <td>Totals:</td>
                  <td class="fo-service">SE Count: ${escapeHtml(facilityOverview.length)}</td>
                  <td>${buildPdfScoreCell(baselineOverall)}</td>
                  <td>${buildPdfScoreCell(latestOverall)}</td>
                  <td>${buildPdfMetaPill(overallDeltaMeta)}</td>
                  <td>${buildPdfMetaPill(overallResolutionMeta)}</td>
                  <td>${buildPdfMetaPill(overallDaysSinceMeta)}</td>
                  <td>${buildPdfMetaPill(overallStatusMeta)}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.blTotal, { zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.blNC, { tone: 'risk', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.blPC, { tone: 'warning', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.completed, { tone: 'success', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.remTotal, { tone: 'warning', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.remNC, { tone: 'risk', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.remPC, { tone: 'warning', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.critTotal, { tone: 'warning', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.critNC, { tone: 'risk', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.critPC, { tone: 'warning', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.critRemTotal, { tone: 'warning', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.critRemNC, { tone: 'risk', zeroAsDash: true })}</td>
                  <td>${buildPdfMetricPill(facilityOverviewTotals.critRemPC, { tone: 'warning', zeroAsDash: true })}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </section>
          ${printableSePages}
        </body>
      </html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast?.('Popup blocked. Please allow popups to preview the PDF.', 'warning');
      return;
    }

    let didStartPrintPreview = false;
    const waitForPrintReady = () => {
      if (didStartPrintPreview) return;
      didStartPrintPreview = true;
      const stampPagination = () => {
        const doc = printWindow.document;
        const pages = Array.from(doc.querySelectorAll('.report-page'));
        const total = pages.length;
        const generatedAt = new Date().toLocaleString();
        pages.forEach((page, index) => {
          page.querySelectorAll('.page-footer, .page-header').forEach(node => node.remove());
          const header = doc.createElement('div');
          header.className = 'page-header';
          header.innerHTML = `<span>${generatedAt}</span><span>${escapeHtml(selectedFacilityName)} Progress Report</span>`;
          const footer = doc.createElement('div');
          footer.className = 'page-footer';
          footer.textContent = `Page ${index + 1} of ${total}`;
          page.appendChild(header);
          page.appendChild(footer);
        });
      };
      const nextFrame = () => new Promise(resolve => {
        const raf = printWindow.requestAnimationFrame || window.requestAnimationFrame;
        raf(() => raf(resolve));
      });
      const waitForImages = Promise.all(
        Array.from(printWindow.document.images || []).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        })
      );
      const waitForFonts = printWindow.document.fonts?.ready
        ? printWindow.document.fonts.ready.catch(() => undefined)
        : Promise.resolve();

      Promise.all([waitForImages, waitForFonts])
        .then(() => { stampPagination(); })
        .then(nextFrame)
        .then(() => {
          if (printWindow.closed) return;
          printWindow.focus();
          printWindow.document.title = `${selectedFacilityName} Progress Report Preview`;
          printWindow.print();
        })
        .catch(() => {
          if (printWindow.closed) return;
          printWindow.focus();
          printWindow.document.title = `${selectedFacilityName} Progress Report Preview`;
          printWindow.print();
        });
    };

    printWindow.addEventListener('load', waitForPrintReady, { once: true });
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      try {
        if (!printWindow.closed && printWindow.document.readyState === 'complete') waitForPrintReady();
      } catch (_) { /* noop */ }
    }, 750);
  };

  return (
    <div className="dashboard-container" style={{ padding: '16px' }}>
      <div className="program-header" style={{ marginBottom: '12px' }}>
        <div className="program-info"><h1 className="program-title">Report</h1></div>
        <div className="quick-actions">
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(-1)}
            startIcon={<ArrowBackIcon />}
          >
            Back
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 720 }}>
        <TextField
          label="Start date"
          type="date"
          size="small"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End date"
          type="date"
          size="small"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <FormControl size="small" fullWidth style={{ gridColumn: '1 / span 2' }}>
          <InputLabel id="facility-select-label">Facility (authorised)</InputLabel>
          <Select
            labelId="facility-select-label"
            label="Facility (authorised)"
            value={selectedFacilityId}
            onChange={e => setSelectedFacilityId(e.target.value)}
            disabled={facilityLocked}
          >
            {facilityOptions.map(opt => (
              <MenuItem key={opt.id} value={opt.id}>{opt.name} ({opt.id})</MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          variant="contained"
          color="primary"
		          disabled={loading || metadataLoading || !metadataCanProceed || reportLoading || !selectedFacilityId}
          onClick={handleGenerate}
        >
	          {metadataLoading && !metadataCanProceed ? 'Loading setup…' : (reportLoading ? 'Generating…' : 'Generate')}
        </Button>
        {reportInfo && (
          <Button
            variant="outlined"
            color="primary"
            disabled={!canDownloadPdf}
            onClick={handleDownloadCoverPdf}
          >
            Preview PDF
          </Button>
        )}
        {loading && <span style={{ color: '#64748b' }}>Loading facilities…</span>}
	        {!loading && metadataLoading && <span style={{ color: '#64748b' }}>Loading selected programme stage…</span>}
        {!loading && error && <span style={{ color: '#dc2626' }}>{error}</span>}
        {!loading && !error && (
          <span style={{ color: '#64748b' }}>
            {facilityOptions.length} authorised facilities
          </span>
        )}
      </div>

      {/* Report Output */}
      <div style={{ marginTop: 24 }}>
        {!reportInfo && (
          <div style={{ color: '#475569', fontSize: '0.95em' }}>
            Select a period and facility, then click Generate to view the report.
          </div>
        )}
        {reportInfo && (
          <div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
	              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 180 }}>
	                <div style={{ fontSize: 12, opacity: 0.8 }}>Facility type</div>
	                <div style={{ fontWeight: 700 }}>{reportInfo.groupLabel}</div>
	              </div>
	              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 180 }}>
	                <div style={{ fontSize: 12, opacity: 0.8 }}>Program Stage ID</div>
	                <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{reportInfo.programStageId || '—'}</div>
	              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Assessments in period</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.count}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Baseline (earliest)</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.baselineDate ? new Date(reportInfo.baselineDate).toLocaleDateString() : 'N/A'}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Latest in period</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.latestDate ? new Date(reportInfo.latestDate).toLocaleDateString() : 'N/A'}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Overall</div>
                <div style={{ fontWeight: 700 }}>{Number.isFinite(scoring?.overall?.percent) ? `${scoring.overall.percent.toFixed(1)}%` : '—'}</div>
              </div>
            </div>

            {/* Facility Overview (collapsible) */}
            <div style={{ marginTop: 18 }}>
              <div
                className="section-header"
                onClick={() => setIsFacilityOverviewCollapsed(!isFacilityOverviewCollapsed)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span
                  style={{
                    transform: isFacilityOverviewCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                  }}
                >
                  ▼
                </span>
                <h3 style={{ margin: 0 }}>Facility Overview</h3>
              </div>
              {!isFacilityOverviewCollapsed && (
              <div style={{ overflowX: 'auto', marginTop: 8, maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84em', minWidth: 1500 }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={overviewHeaderCellStyle('#f8fafc', '#0f172a')} title="Service Element index code">SE</th>
                      <th rowSpan={2} style={overviewHeaderCellStyle('#f8fafc', '#0f172a', { minWidth: 220 })} title="Service Element name">Service</th>
                      <th rowSpan={2} style={overviewHeaderCellStyle('#dbeafe', '#1e3a8a')} title="First recorded compliance score inside the selected date range.">Overall baseline score</th>
                      <th rowSpan={2} style={overviewHeaderCellStyle('#dbeafe', '#1e3a8a')} title="Most recent recorded compliance score inside the selected date range.">Overall progress score</th>
                      <th colSpan={4} style={overviewHeaderCellStyle('#e0f2fe', '#075985')} title="Action-oriented metrics tracking change, closure rate, timeline, and status.">Action insights</th>
                      <th colSpan={3} style={overviewHeaderCellStyle('#fef3c7', '#92400e')} title="Deficiencies (Non-Compliant or Partially Compliant criteria) identified in the baseline assessment.">Deficiencies identified at baseline</th>
                      <th rowSpan={2} style={overviewHeaderCellStyle('#dcfce7', '#166534')} title="Baseline deficiencies successfully resolved to Compliant in the latest assessment.">Deficiencies completed to date</th>
                      <th colSpan={3} style={overviewHeaderCellStyle('#fee2e2', '#991b1b')} title="Baseline deficiencies that remain Non-Compliant or Partially Compliant in the latest assessment.">Remaining deficiencies to be addressed</th>
                      <th colSpan={3} style={overviewHeaderCellStyle('#fecaca', '#7f1d1d')} title="Total number of critical criteria evaluated at baseline.">Critical Criteria</th>
                      <th colSpan={3} style={overviewHeaderCellStyle('#fecaca', '#7f1d1d')} title="Number of baseline critical criteria that remain deficient (NC/PC) in the latest assessment.">Critical Criteria Remaining</th>
                      <th rowSpan={2} style={overviewHeaderCellStyle('#f8fafc', '#0f172a')} title="Date of the most recent assessment within the selected range.">Most recent assessment date</th>
                    </tr>
                    <tr>
                      <th style={overviewHeaderCellStyle('#f0f9ff', '#075985', { whiteSpace: 'nowrap' })} title="Percentage point change between progress and baseline scores: (rounded progress % - rounded baseline %).">Δ Change</th>
                      <th style={overviewHeaderCellStyle('#f0f9ff', '#075985')} title="Percentage of baseline deficiencies successfully resolved: (Completed / Baseline Total) * 100.">Closure Rate</th>
                      <th style={overviewHeaderCellStyle('#f0f9ff', '#075985', { whiteSpace: 'nowrap' })} title="Number of months elapsed since the latest assessment was completed.">Months Since</th>
                      <th style={overviewHeaderCellStyle('#f0f9ff', '#075985')} title="Current status of the service: Critical (remaining critical deficiencies or score drop <= -15%), Warning (some deficiencies or score drop <= -5%), or On Track.">Status</th>
                      <th style={overviewHeaderCellStyle('#fff7ed', '#92400e')} title="Total baseline deficiencies: (NC + PC).">Total</th>
                      <th style={overviewHeaderCellStyle('#fff7ed', '#92400e')} title="Baseline criteria scored as Non-Compliant.">NC</th>
                      <th style={overviewHeaderCellStyle('#fff7ed', '#92400e')} title="Baseline criteria scored as Partially Compliant.">PC</th>
                      <th style={overviewHeaderCellStyle('#fef2f2', '#991b1b')} title="Total remaining deficiencies: (NC + PC).">Total</th>
                      <th style={overviewHeaderCellStyle('#fef2f2', '#991b1b')} title="Remaining criteria scored as Non-Compliant in the latest assessment.">NC</th>
                      <th style={overviewHeaderCellStyle('#fef2f2', '#991b1b')} title="Remaining criteria scored as Partially Compliant in the latest assessment.">PC</th>
                      <th style={overviewHeaderCellStyle('#fee2e2', '#7f1d1d')} title="Total critical criteria evaluated at baseline.">Total</th>
                      <th style={overviewHeaderCellStyle('#fee2e2', '#7f1d1d')} title="Critical criteria scored as Non-Compliant at baseline.">NC</th>
                      <th style={overviewHeaderCellStyle('#fee2e2', '#7f1d1d')} title="Critical criteria scored as Partially Compliant at baseline.">PC</th>
                      <th style={overviewHeaderCellStyle('#fee2e2', '#7f1d1d')} title="Total critical criteria remaining deficient in the latest assessment.">Total</th>
                      <th style={overviewHeaderCellStyle('#fee2e2', '#7f1d1d')} title="Critical criteria remaining Non-Compliant in the latest assessment.">NC</th>
                      <th style={overviewHeaderCellStyle('#fee2e2', '#7f1d1d')} title="Critical criteria remaining Partially Compliant in the latest assessment.">PC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilityOverview.map((row, rowIndex) => (
                      <tr key={`ov-${row.seIndex}`}>
                        <td style={overviewBodyCellStyle(rowIndex)}>{`SE ${row.seIndex}`}</td>
                        <td style={overviewBodyCellStyle(rowIndex, { minWidth: 220 })}>{renderOverviewService(row)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewScore(row.baselinePercent)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewScore(row.latestPercent)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewMetaBadge(row.scoreDelta)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewMetaBadge(row.resolutionRate)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewMetaBadge(row.daysSince)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewMetaBadge(row.status)}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.blDefs.total, { zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.blDefs.NC, { tone: 'risk', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.blDefs.PC, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.completed, { tone: 'success', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.remaining.total, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.remaining.NC, { tone: 'risk', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.remaining.PC, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.critical.total, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.critical.NC, { tone: 'risk', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.critical.PC, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.criticalRemaining.total, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.criticalRemaining.NC, { tone: 'risk', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex)}>{renderOverviewBadge(row.criticalRemaining.PC, { tone: 'warning', zeroAsDash: true })}</td>
                        <td style={overviewBodyCellStyle(rowIndex, { whiteSpace: 'nowrap' })}>{row.latestDate}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={overviewTotalsCellStyle()}>Totals</td>
                      <td style={overviewTotalsCellStyle({ textAlign: 'left' })}>{`SE Count: ${facilityOverview.length}`}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewScore(baselineOverall)}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewScore(latestOverall)}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewMetaBadge(overallDeltaMeta)}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewMetaBadge(overallResolutionMeta)}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewMetaBadge(overallDaysSinceMeta)}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewMetaBadge(overallStatusMeta)}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.blTotal, { zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.blNC, { tone: 'risk', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.blPC, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.completed, { tone: 'success', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.remTotal, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.remNC, { tone: 'risk', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.remPC, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.critTotal, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.critNC, { tone: 'risk', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.critPC, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.critRemTotal, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.critRemNC, { tone: 'risk', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}>{renderOverviewBadge(facilityOverviewTotals.critRemPC, { tone: 'warning', zeroAsDash: true })}</td>
                      <td style={overviewTotalsCellStyle()}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              )}
            </div>

	            {/* Radar Chart */}
	            <div style={{ marginTop: 18 }}>
	              <div
	                className="section-header"
	                onClick={() => setIsRadarChartOpen(true)}
	                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
	              >
	                <span
	                  style={{
	                    transform: isRadarChartOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
	                    transition: 'transform 0.2s ease',
	                    display: 'inline-block',
	                  }}
	                >
	                  ▼
	                </span>
	                <h3 style={{ margin: 0 }}>Radar Chart: Service Element Score Profile</h3>
	              </div>
	            </div>

	            {/* Response Distribution (C / PC / NC) */}
	            <div style={{ marginTop: 18 }}>
	              <div
	                className="section-header"
	                onClick={() => setIsResponseDistributionCollapsed(!isResponseDistributionCollapsed)}
	                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
	              >
	                <span
	                  style={{
	                    transform: isResponseDistributionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
	                    transition: 'transform 0.2s ease',
	                    display: 'inline-block',
	                  }}
	                >
	                  ▼
	                </span>
	                <h3 style={{ margin: 0 }}>Response Distribution (C / PC / NC)</h3>
	              </div>
	              {!isResponseDistributionCollapsed && (
	                <div style={{ marginTop: 8 }}>
	                  <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>
	                    Latest assessment criteria distribution by service element. N/A responses are excluded from the percentage bars.
	                  </div>
	                  {responseDistributionData.length === 0 ? (
	                    <div style={{ color: '#64748b' }}>No response distribution data available.</div>
	                  ) : (() => {
	                    const chartWidth = Math.max(760, responseDistributionData.length * 150);
	                    return (
	                      <div style={{ width: '100%' }}>
	                        <div style={{ width: '100%', overflowX: 'auto' }}>
	                          <div style={{ width: chartWidth, height: 360 }}>
	                            <BarChart width={chartWidth} height={360} data={responseDistributionData} margin={{ top: 16, right: 16, bottom: 76, left: 60 }}>
	                              <CartesianGrid strokeDasharray="3 3" />
	                              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={86} />
	                              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} />
	                              <Tooltip content={<ResponseDistributionTooltip />} />
	                              <Bar dataKey="C" name="Compliant" stackId="latest" fill="#22c55e" />
	                              <Bar dataKey="PC" name="Partially compliant" stackId="latest" fill="#f59e0b" />
	                              <Bar dataKey="NC" name="Non-compliant" stackId="latest" fill="#ef4444" />
	                            </BarChart>
	                          </div>
	                        </div>
	                        {/* Centered viewport-fixed Legend */}
	                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 12, fontWeight: 500, color: '#475569' }}>
	                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
	                            <span style={{ width: 12, height: 12, backgroundColor: '#22c55e', borderRadius: 2 }} />
	                            <span>Compliant</span>
	                          </div>
	                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
	                            <span style={{ width: 12, height: 12, backgroundColor: '#f59e0b', borderRadius: 2 }} />
	                            <span>Partially compliant</span>
	                          </div>
	                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
	                            <span style={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 2 }} />
	                            <span>Non-compliant</span>
	                          </div>
	                        </div>
	                      </div>
	                    );
	                  })()}
	                </div>
	              )}
	            </div>

	            {/* Criteria Heatmap */}
	            <div style={{ marginTop: 18 }}>
	              <div
	                className="section-header"
	                onClick={() => setIsHeatmapCollapsed(!isHeatmapCollapsed)}
	                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
	              >
	                <span
	                  style={{
	                    transform: isHeatmapCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
	                    transition: 'transform 0.2s ease',
	                    display: 'inline-block',
	                  }}
	                >
	                  ▼
	                </span>
	                <h3 style={{ margin: 0 }}>Criteria Heatmap</h3>
	              </div>
	              {!isHeatmapCollapsed && (
	                <div style={{ marginTop: 8 }}>
	                  <div style={{ color: '#64748b', fontSize: 13, marginBottom: 10 }}>
	                    Latest assessment criteria map by service element. Hover over a cell to see the criterion code and description.
	                  </div>
	                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, fontSize: 12 }}>
	                    <span><StatusBadge label="C" /> Compliant</span>
	                    <span><StatusBadge label="PC" /> Partially compliant</span>
	                    <span><StatusBadge label="NC" /> Non-compliant</span>
	                    <span><StatusBadge label="NA" /> N/A</span>
	                  </div>
	                  {heatmapData.length === 0 ? (
	                    <div style={{ color: '#64748b' }}>No heatmap data available.</div>
	                  ) : (
	                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
	                      {heatmapData.map((row) => (
	                        <div key={`heat-${row.id}`} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, alignItems: 'start', minWidth: 760 }}>
	                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
	                            <div style={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>{row.name}</div>
	                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 11 }}>
	                              <span style={{ color: '#166534' }}>C: {row.counts.C || 0}</span>
	                              <span style={{ color: '#92400e' }}>PC: {row.counts.PC || 0}</span>
	                              <span style={{ color: '#991b1b' }}>NC: {row.counts.NC || 0}</span>
	                              <span style={{ color: '#64748b' }}>NA: {row.counts.NA || 0}</span>
	                            </div>
	                          </div>
	                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
	                            {row.cells.length === 0 ? (
	                              <span style={{ color: '#64748b' }}>No criteria available</span>
	                            ) : row.cells.map((cell, idx) => (
	                              <span
	                                key={`${row.id}-${cell.code || idx}`}
	                                style={getHeatmapCellStyle(cell.response)}
	                                title={`${cell.code || 'Criterion'}: ${cell.label || ''} — ${cell.response}`}
	                              >
	                                {cell.response === 'Pending' ? 'P' : cell.response}
	                              </span>
	                            ))}
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                  )}
	                </div>
	              )}
	            </div>

            {/* Assessor Activity Summary (collapsible) */}
            {assessorSummary.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div
                  className="section-header"
                  onClick={() => setIsAssessorSummaryCollapsed(!isAssessorSummaryCollapsed)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span
                    style={{
                      transform: isAssessorSummaryCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      display: 'inline-block',
                    }}
                  >
                    ▼
                  </span>
                  <h3 style={{ margin: 0 }}>Assessor Activity & Contribution</h3>
                </div>
                {!isAssessorSummaryCollapsed && (
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>Assessor</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>Role</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>Assigned SEs</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>C</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>PC</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>NC</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>NA</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>Compliance %</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>Last Entry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessorSummary.map((row, idx) => (
                          <tr key={`ass-${idx}`}>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', fontWeight: 600 }}>{row.displayName}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textTransform: 'capitalize' }}>{row.role}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px' }}>{row.seNums}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center', background: '#ecfdf5', color: '#065f46' }}>{row.stats.C}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center', background: '#fffbeb', color: '#92400e' }}>{row.stats.PC}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center', background: '#fef2f2', color: '#991b1b' }}>{row.stats.NC}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{row.stats.NA}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{row.compliance}%</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', color: '#64748b' }}>{row.lastUpdated}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Baseline vs Latest (per SE) */}
            <div style={{ marginTop: 18 }}>
              <div
                className="section-header"
                onClick={() => setIsBaselineVsLatestCollapsed(!isBaselineVsLatestCollapsed)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span
                  style={{
                    transform: isBaselineVsLatestCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                  }}
                >
                  {'\u25BC'}
                </span>
                <h3 style={{ margin: 0 }}>Baseline vs Latest (per SE)</h3>
              </div>
              {!isBaselineVsLatestCollapsed && (
                <>
                  {/* Simple legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, color: '#64748b', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, background: '#60a5fa', display: 'inline-block', borderRadius: 2 }} />
                      <span>Baseline</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, background: '#ef4444', display: 'inline-block', borderRadius: 2 }} />
                      <span>{reportInfo?.latestType || 'Latest assessment'}</span>
                    </div>
                  </div>
                  {(() => {
                    const bl = Array.isArray(baselineScoring?.sections) ? baselineScoring.sections : [];
                    const lt = Array.isArray(scoring?.sections) ? scoring.sections : [];
                    const blMap = Object.fromEntries(bl.map(s => [s.id, s.percent]));
                    const ltMap = Object.fromEntries(lt.map(s => [s.id, s.percent]));
                    // Exclude "Assessment Details" from the chart explicitly
                    const ids = Object.keys(sectionChartLabels || {}).filter((sid) => {
                      const lbl = String((sectionChartLabels[sid] || sectionLabels[sid] || '')).toLowerCase();
                      const idLower = String(sid || '').toLowerCase();
                      if (!lbl) return false;
                      if (lbl.includes('assessment details')) return false;
                      if (idLower === 'ad' || idLower === 'assessment-details' || idLower === 'assessment_details') return false;
                      return true;
                    });
                    if (ids.length === 0) return (<div style={{ color: '#64748b' }}>No section breakdown available.</div>);
                    const chartData = ids.map(id => ({
                      id,
                      name: sectionChartLabels[id] || sectionLabels[id] || id,
                      Baseline: Number.isFinite(blMap[id]) ? Number(blMap[id]) : 0,
                      Latest: Number.isFinite(ltMap[id]) ? Number(ltMap[id]) : 0,
                    }));
                    const chartWidth = Math.max(700, ids.length * 140);
                    return (
                      <div style={{ width: '100%', marginBottom: 12 }}>
                        <div style={{ width: '100%', overflowX: 'auto' }}>
                          <div style={{ width: chartWidth, height: 340 }}>
                            <BarChart width={chartWidth} height={340} data={chartData} margin={{ top: 16, right: 16, bottom: 52, left: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                              <Tooltip content={<MainChartTooltip />} />
                              <ReferenceLine y={40} stroke="#d97706" strokeDasharray="3 3" label={{ value: '40%', position: 'insideBottomLeft', fill: '#b45309', fontSize: 10 }} />
                              <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="3 3" label={{ value: '80%', position: 'insideBottomLeft', fill: '#15803d', fontSize: 10 }} />
                              <Bar dataKey="Baseline" fill="#60a5fa" cursor="pointer" onClick={(d) => openDrillForSection(d?.id || d?.payload?.id)}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                              <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444" cursor="pointer" onClick={(d) => openDrillForSection(d?.id || d?.payload?.id)}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                            </BarChart>
                          </div>
                        </div>
                        {/* Centered viewport-fixed Legend */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 12, fontWeight: 500, color: '#475569' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#60a5fa', borderRadius: 2 }} />
                            <span>Baseline</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 2 }} />
                            <span>Latest ({reportInfo?.latestType || 'Latest'})</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            {drillOpen && (
              <div
                onClick={closeDrill}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15, 23, 42, 0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1600,
                  padding: 16,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 'min(96vw, 1100px)',
                    maxHeight: '88vh',
                    overflow: 'auto',
                    background: '#fff',
                    borderRadius: 12,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>
                        SE Drilldown: {drillLevel === 'pi' ? "PI's" : drillLevel === 'standards' ? "Standards" : "Criterions"}
                      </h3>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                        {sectionChartLabels[drillSectionId] || sectionLabels[drillSectionId] || drillSectionId}
                        {drillLevel === 'standards' && drillRootCode ? ` / PI ${drillRootCode}: ${getPiLabel(drillRootCode)}` : ''}
                        {drillLevel === 'criteria' && drillStandardCode ? ` / PI ${drillRootCode} / Standard ${drillStandardCode}: ${shortCriterionLabel(getStandardLabel(drillStandardCode), 60)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button size="small" variant="outlined" onClick={backDrill}>
                        {drillLevel === 'criteria' ? 'Back to standards' : drillLevel === 'standards' ? 'Back to PIs' : 'Close'}
                      </Button>
                      <Button size="small" variant="outlined" onClick={exportDrillAsPng}>Export as PNG</Button>
                    </div>
                  </div>

                  {drillLevel === 'pi' && (() => {
                    const data = buildPiChartData(drillSectionId);
                    const chartWidth = Math.max(800, data.length * 170);
                    if (data.length === 0) return <div style={{ color: '#64748b' }}>No PIs available for this SE.</div>;
                    return (
                      <div style={{ width: '100%' }}>
                        <div style={{ width: '100%', overflowX: 'auto' }}>
                          <div ref={drillChartRef} style={{ width: chartWidth, height: 430 }}>
                            <BarChart width={chartWidth} height={430} data={data} margin={{ top: 16, right: 16, bottom: 108, left: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={<DrillAxisTick />} interval={0} height={118} />
                              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                              <Tooltip content={<DrillTooltip />} />
                              <Bar dataKey="Baseline" fill="#60a5fa" cursor="pointer" onClick={(d) => { setDrillRootCode(d?.code || d?.payload?.code || null); setDrillLevel('standards'); }}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                              <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444" cursor="pointer" onClick={(d) => { setDrillRootCode(d?.code || d?.payload?.code || null); setDrillLevel('standards'); }}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                            </BarChart>
                          </div>
                        </div>
                        {/* Centered viewport-fixed Legend */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 12, fontWeight: 500, color: '#475569' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#60a5fa', borderRadius: 2 }} />
                            <span>Baseline</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 2 }} />
                            <span>Latest ({reportInfo?.latestType || 'Latest'})</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {drillLevel === 'standards' && (() => {
                    const data = buildRootChartData(drillSectionId, drillRootCode);
                    const chartWidth = Math.max(800, data.length * 170);
                    if (data.length === 0) return <div style={{ color: '#64748b' }}>No standards available for this PI.</div>;
                    return (
                      <div style={{ width: '100%' }}>
                        <div style={{ width: '100%', overflowX: 'auto' }}>
                          <div ref={drillChartRef} style={{ width: chartWidth, height: 430 }}>
                            <BarChart width={chartWidth} height={430} data={data} margin={{ top: 16, right: 16, bottom: 108, left: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={<DrillAxisTick />} interval={0} height={118} />
                              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                              <Tooltip content={<DrillTooltip />} />
                              <Bar dataKey="Baseline" fill="#60a5fa" cursor="pointer" onClick={(d) => { setDrillStandardCode(d?.code || d?.payload?.code || null); setDrillLevel('criteria'); }}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                              <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444" cursor="pointer" onClick={(d) => { setDrillStandardCode(d?.code || d?.payload?.code || null); setDrillLevel('criteria'); }}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                            </BarChart>
                          </div>
                        </div>
                        {/* Centered viewport-fixed Legend */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 12, fontWeight: 500, color: '#475569' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#60a5fa', borderRadius: 2 }} />
                            <span>Baseline</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 2 }} />
                            <span>Latest ({reportInfo?.latestType || 'Latest'})</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {drillLevel === 'criteria' && (() => {
                    const data = buildCriteriaChartData(drillSectionId, drillStandardCode);
                    const chartWidth = Math.max(800, data.length * 170);
                    if (data.length === 0) return <div style={{ color: '#64748b' }}>No linked criteria found for {drillStandardCode}.</div>;
                    return (
                      <div style={{ width: '100%' }}>
                        <div style={{ width: '100%', overflowX: 'auto' }}>
                          <div ref={drillChartRef} style={{ width: chartWidth, height: 430 }}>
                            <BarChart width={chartWidth} height={430} data={data} margin={{ top: 16, right: 16, bottom: 108, left: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={<DrillAxisTick />} interval={0} height={118} />
                              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                              <Tooltip content={<DrillTooltip />} />
                              <Bar dataKey="Baseline" fill="#60a5fa">
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                              <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444">
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                            </BarChart>
                          </div>
                        </div>
                        {/* Centered viewport-fixed Legend */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 12, fontWeight: 500, color: '#475569' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#60a5fa', borderRadius: 2 }} />
                            <span>Baseline</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 2 }} />
                            <span>Latest ({reportInfo?.latestType || 'Latest'})</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

	    <Dialog
	      open={isRadarChartOpen}
	      onClose={() => setIsRadarChartOpen(false)}
	      fullWidth
	      maxWidth="xl"
	      PaperProps={{ style: { maxWidth: '96vw', width: '96vw' } }}
	    >
	      <DialogTitle>Radar Chart: Service Element Score Profile</DialogTitle>
	      <DialogContent dividers>
	        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
	          Compares baseline and latest score patterns across service elements in a larger view for easier reading.
	        </div>
	        {radarChartData.length === 0 ? (
	          <div style={{ color: '#64748b' }}>No radar chart data available.</div>
	        ) : (
	          <div style={{ width: '100%', height: '72vh', minHeight: 540 }}>
	            <ResponsiveContainer width="100%" height="100%">
	              <RadarChart data={radarChartData} outerRadius="68%">
	                <PolarGrid />
	                <PolarAngleAxis dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} />
	                <PolarRadiusAxis angle={90} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
	                <Tooltip content={<RadarTooltip />} />
	                <Legend />
	                <Radar name="Baseline" dataKey="Baseline" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.18} />
	                <Radar name={`Latest (${reportInfo?.latestType || 'Latest'})`} dataKey="Latest" stroke="#ef4444" fill="#ef4444" fillOpacity={0.18} />
	              </RadarChart>
	            </ResponsiveContainer>
	          </div>
	        )}
	      </DialogContent>
	      <DialogActions>
	        <Button onClick={() => setIsRadarChartOpen(false)}>Close</Button>
	      </DialogActions>
	    </Dialog>
      </div>
    </div>
  );
}
