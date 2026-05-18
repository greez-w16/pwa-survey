import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { api } from '../services/api';
import { Button, TextField, MenuItem, FormControl, InputLabel, Select } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { transformMetadata } from '../utils/transformers';
import { normalizeCriterionCode } from '../utils/normalization';
import { useAssessmentScoring } from '../hooks/useAssessmentScoring';
import { decorateHospitalLinksWithMatrixTags } from '../utils/hospitalMatrixTags';
import emsConfig from '../assets/ems_config.json';
import mortuaryConfig from '../assets/mortuary_config.json';
import clinicsConfig from '../assets/clinics_config.json';
import hospitalConfig from '../assets/hospital_config.json';
import emsLinks from '../assets/ems_links.json';
import mortuaryLinks from '../assets/mortuary_links.json';
import clinicsLinks from '../assets/clinics_links.json';
import hospitalLinks from '../assets/hospital_links.json';
import qimsLogo from '../assets/logo.png';
import { setHospitalSubcriteriaConfig } from '../utils/scoring';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList
} from 'recharts';

export default function Report() {
  const { user, configuration, showToast, configBundles, activeConfigVersionId, userAssignments } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
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

  const programId = configuration?.program?.id || 'G2gULe4jsfs';
  const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';

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
        linksDataLookup[linkObj.criteria] = { roots: linkObj.root || [], linked_criteria: linkObj.linked_criteria || [] };
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
    if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'SE';
    if (t.includes('mortu') || t.includes('general')) return 'GENERAL';
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    async function loadFacilitiesAuthorised() {
      setLoading(true);
      setError(null);
      try {
        let options = [];
        // Prefer authorised facilities from scheduling assignments
        if (Array.isArray(userAssignments) && userAssignments.length > 0) {
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
        if (options.length === 1) setSelectedFacilityId(options[0].id);
      } catch (e) {
        console.error('Report: failed to load facilities list', e);
        if (!cancelled) setError('Failed to load facilities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFacilitiesAuthorised();
    return () => { cancelled = true; };
  }, [userAssignments, programId, stageId, rootOrgUnitId]);

  const handleGenerate = () => {
    (async () => {
      if (!selectedFacilityId) { showToast?.('Please select a facility.', 'warning'); return; }
      const periodStart = parseDateStart(startDate);
      const periodEnd = parseDateEnd(endDate);
      if (periodStart && periodEnd && periodStart > periodEnd) { showToast?.('Start date must be before end date.', 'warning'); return; }
      setReportLoading(true);
      setReportInfo(null);
      setReportAssessment(null);
      try {
        // Fetch all events for this facility OU, including descendants, to ensure we catch 
        // both scheduled and self-initiated assessments.
        const events = await api.getSurveyEventsForOrgUnit({ 
            orgUnitId: selectedFacilityId, 
            fields: 'event,eventDate,orgUnit,trackedEntityInstance,status,dataValues[dataElement,value],notes[note,value]'
        });
        const all = Array.isArray(events) ? events : [];

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

        const inPeriodBundles = bundles.filter(b => {
          const d = b.assessmentDate ? new Date(b.assessmentDate) : null;
          if (!d) return false;
	          if (periodStart && d < periodStart) return false;
	          if (periodEnd && d > periodEnd) return false;
          return true;
        });
        if (inPeriodBundles.length === 0) { showToast?.('No assessments found for the selected filters.', 'info'); setReportLoading(false); return; }

        let baselineBundle = bundles.filter(b => b.isBaseline).sort((a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate))[0] || null;
        if (!baselineBundle) baselineBundle = bundles.sort((a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate))[0] || null;
        const latestBundle = inPeriodBundles.sort((a, b) => new Date(b.assessmentDate) - new Date(a.assessmentDate))[0] || null;
        if (!baselineBundle || !latestBundle) {
          showToast?.('Could not resolve baseline/latest assessments for this facility.', 'warning');
          setReportLoading(false);
          return;
        }

        const groupText = baselineBundle.groupText || latestBundle.groupText || '';
        const groupId = resolveGroupIdFromText(groupText) || 'GENERAL';
        const groupObj = groups.find(g => g.id === groupId) || null;

        // Build assessment structure for scoring based on facility group
        const programmeType = (groupId === 'HOSPITAL') ? 'hospital' : (groupId === 'CLINICS') ? 'clinics' : (groupId === 'SE') ? 'ems' : 'mortuary';
        const { linksDataLookup, severityLookup } = programmeScoringMeta[programmeType] || programmeScoringMeta.ems;
        const targetSections = groupObj ? groupObj.sections || [] : [];

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
                  const sectionEvent = isAssessmentDetailsSection(section)
                    ? bundle.metaEvent
                    : pickLatest(bundle.byTag?.[sectionTagMap[section.id] || resolveSectionTag(section, idx)] || []);
                  const formDataForSection = Object.fromEntries((((sectionEvent || {}).dataValues) || []).map(dv => [dv.dataElement, dv.value]));
                  const code = f.code || f.id;
                  const normalizedCode = normalizeCriterionCode(code);
                  const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
                  const isRoot = linksData.linked_criteria.length > 0;
                  const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;
                  return {
                    id: f.id,
                    code,
                    response: formDataForSection[f.id] || 'NA',
                    isCritical: false,
                    isRoot,
                    links: linksData.linked_criteria,
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
        // Build a quick se_id -> se_name map from on-disk configs for friendly names
        const seNameMap = (() => {
          try {
            let arr = [];
            if (programmeType === 'hospital') arr = hospitalConfig.hospital_full_configuration || [];
            else if (programmeType === 'clinics') arr = clinicsConfig.clinics_full_configuration || [];
            else if (programmeType === 'ems') arr = emsConfig.ems_full_configuration || [];
            else if (programmeType === 'mortuary') arr = mortuaryConfig.mortuary_full_configuration || [];
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
            labels[s.id] = baseName;
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
            chartLabels[s.id] = `SE ${seNum} ${cleanedName}`;
          });
        setSectionLabels(labels);
        setSectionChartLabels(chartLabels);
        setReportInfo({
          groupId,
          groupLabel: groupObj?.name || groupId,
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
                const section = targetSections.find(s => {
                   const m = (s.name || s.code || '').match(/se\s*(\d+)/i);
                   return m && m[1] === num;
                });

                if (section) {
                  (section.fields || []).forEach(f => {
                    if (f.type === 'select') {
                      const val = data.values[f.id];
                      if (val) {
                        const s = String(val).trim().toLowerCase();
                        if (s === 'c' || s === 'compliant') stats.C++;
                        else if (s === 'pc' || s === 'partial' || s === 'partially compliant') stats.PC++;
                        else if (s === 'nc' || s === 'non compliant' || s === 'non-compliant') stats.NC++;
                        else if (s === 'na') stats.NA++;
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
      const sp = new URLSearchParams(window.location.search);
      const facilityId = sp.get('facilityId');
      const start = sp.get('start');
      const end = sp.get('end');
      if (facilityId) setSelectedFacilityId(facilityId);
      if (facilityId) setFacilityLocked(true);
      if (start) setStartDate(start.split('T')[0] || start);
      if (end) setEndDate(end.split('T')[0] || end);
	      if (facilityId) setAutoGenerateRequested(true);
    } catch {}
  }, []);

	  useEffect(() => {
	    if (!autoGenerateRequested || !selectedFacilityId) return undefined;
	    const t = setTimeout(() => {
	      handleGenerate();
	      setAutoGenerateRequested(false);
	    }, 0);
	    return () => clearTimeout(t);
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [autoGenerateRequested, selectedFacilityId, startDate, endDate]);

  const scoring = useAssessmentScoring(reportAssessment || { sections: [] });
  const baselineScoring = useAssessmentScoring(baselineAssessment || { sections: [] });

  // Collapsible state for Facility Overview
  const [isFacilityOverviewCollapsed, setIsFacilityOverviewCollapsed] = useState(true);
  // Collapsible state for Baseline vs Latest (per SE)
  const [isBaselineVsLatestCollapsed, setIsBaselineVsLatestCollapsed] = useState(true);
  // Drilldown state for Baseline vs Latest chart
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillSectionId, setDrillSectionId] = useState(null);
  const [drillLevel, setDrillLevel] = useState('roots'); // roots | criteria
  const [drillRootCode, setDrillRootCode] = useState(null);
  const drillChartRef = useRef(null);

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
      const completed = baseCrit.reduce((acc, bc) => {
        const code = bc.code;
        const wasDef = ['NC','PC'].includes(norm(bc.response));
        if (!wasDef) return acc;
        const lc = lateCrit.find(x => x.code === code);
        if (lc && norm(lc.response) === 'C') return acc + 1;
        return acc;
      }, 0);

      // Critical criteria counts
      // Try to detect programme type from reportInfo.groupId
      const programmeType = (reportInfo.groupId === 'HOSPITAL') ? 'hospital' : (reportInfo.groupId === 'CLINICS') ? 'clinics' : (reportInfo.groupId === 'SE') ? 'ems' : 'mortuary';
      const criticalLookup = (programmeScoringMeta[programmeType] && programmeScoringMeta[programmeType].criticalLookup) || {};
      const getCritical = (list) => list.filter(c => {
        const code = String(c.code || '').trim();
        const n = normalizeCriterionCode(code);
        return criticalLookup[code] === true || criticalLookup[n] === true;
      });
      const baseCritCritical = getCritical(baseCrit);
      const lateCritCritical = getCritical(lateCrit);
      const baseCriticalCounts = getCounts(baseCritCritical);
      const lateCriticalCounts = getCounts(lateCritCritical);

      return {
        seIndex: idx + 1,
        seName: name,
        baselinePercent: Number.isFinite(blPct[id]) ? Number(blPct[id]).toFixed(0) : '—',
        latestPercent: Number.isFinite(ltPct[id]) ? Number(ltPct[id]).toFixed(0) : '—',
        blDefs: { total: baseCounts.NC + baseCounts.PC, NC: baseCounts.NC, PC: baseCounts.PC },
        completed,
        remaining: { total: lateCounts.NC + lateCounts.PC, NC: lateCounts.NC, PC: lateCounts.PC },
        critical: { total: baseCritCritical.length, NC: baseCriticalCounts.NC, PC: baseCriticalCounts.PC },
        criticalRemaining: { total: lateCritCritical.length, NC: lateCriticalCounts.NC, PC: lateCriticalCounts.PC },
        latestDate: (reportInfo.sectionLatestDates?.[id] || reportInfo.latestDate)
          ? new Date(reportInfo.sectionLatestDates?.[id] || reportInfo.latestDate).toLocaleDateString()
          : '—',
        policies: { NC: 0, PC: 0, C: 0, total: 0 },
        qiCompliance: 'N/A',
      };
    });
  }, [reportAssessment, baselineAssessment, baselineScoring, scoring, sectionLabels, reportInfo, programmeScoringMeta]);

  const openDrillForSection = (sectionId) => {
    setDrillSectionId(sectionId);
    setDrillRootCode(null);
    setDrillLevel('roots');
    setDrillOpen(true);
  };

  const closeDrill = () => {
    setDrillOpen(false);
    setDrillSectionId(null);
    setDrillRootCode(null);
    setDrillLevel('roots');
  };

  const backDrill = () => {
    if (drillLevel === 'criteria') {
      setDrillRootCode(null);
      setDrillLevel('roots');
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

  const buildRootChartData = (sectionId) => {
    const latestCriteria = getSectionCriteria(reportAssessment, sectionId);
    const baselineCriteria = getSectionCriteria(baselineAssessment, sectionId);
    const latestRoots = latestCriteria.filter(c => c?.isRoot);
    const baselineRoots = baselineCriteria.filter(c => c?.isRoot);
    const codes = Array.from(new Set([
      ...latestRoots.map(c => normalizeCriterionCode(c.code || c.id)),
      ...baselineRoots.map(c => normalizeCriterionCode(c.code || c.id))
    ].filter(Boolean)));
    return codes.map(code => ({
      code,
      name: code,
      Baseline: Number(baselineScoring?.globalScores?.[code]?.points ?? 0),
      Latest: Number(scoring?.globalScores?.[code]?.points ?? 0),
    }));
  };

  const buildCriteriaChartData = (sectionId, rootCode) => {
    const stripTag = (raw) => {
      const m = String(raw || '').match(/^(.*?)-([GB])$/i);
      return m ? m[1] : String(raw || '');
    };
    const latestCriteria = getSectionCriteria(reportAssessment, sectionId);
    const baselineCriteria = getSectionCriteria(baselineAssessment, sectionId);
    const allCriteria = [...latestCriteria, ...baselineCriteria];
    const findRoot = (list) => list.find(c => c?.isRoot && normalizeCriterionCode(c.code || c.id) === rootCode);
    const latestRoot = findRoot(latestCriteria);
    const baselineRoot = findRoot(baselineCriteria);
    const linkedCodes = [
      ...((latestRoot?.links || []).map(v => normalizeCriterionCode(stripTag(v))) || []),
      ...((baselineRoot?.links || []).map(v => normalizeCriterionCode(stripTag(v))) || [])
    ];
    const inferredCodes = allCriteria
      .filter(c => !c?.isRoot)
      .map(c => normalizeCriterionCode(c.code || c.id))
      .filter(code => code && (code.startsWith(`${rootCode}.`) || code.startsWith(`${rootCode}-`)));
    const codes = Array.from(new Set([...linkedCodes, ...inferredCodes].filter(Boolean)));
    return codes.map(code => ({
      code,
      name: code,
      Baseline: Number(baselineScoring?.globalScores?.[code]?.points ?? 0),
      Latest: Number(scoring?.globalScores?.[code]?.points ?? 0),
    }));
  };

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

  const getStatusBadgeStyle = (label) => {
    const v = normalizeResponseLabel(label);
    if (v === 'C') return { color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7' };
    if (v === 'PC') return { color: '#92400e', background: '#fef3c7', border: '1px solid #fbbf24' };
    if (v === 'NC') return { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' };
    if (v === 'Pending') return { color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd' };
    return { color: '#475569', background: '#e2e8f0', border: '1px solid #cbd5e1' };
  };

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
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.name || code}</div>
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
        return { seCode, serviceElement, facilitator: getFacilitatorsForServiceElement(seCode) };
      })
      : facilityOverview.map(row => ({
        seCode: row.seIndex,
        serviceElement: row.seName,
        facilitator: getFacilitatorsForServiceElement(row.seIndex),
      }));
    const serviceElementTableRows = serviceElementRowsSource.map(row => `
      <tr>
        <td class="se-code">${escapeHtml(row.seCode)}</td>
        <td class="se-name">${escapeHtml(row.serviceElement)}</td>
        <td class="se-small"></td>
        <td class="se-small"></td>
        <td class="se-reason"></td>
        <td class="se-facilitator">${escapeHtml(row.facilitator)}</td>
      </tr>
    `).join('');

    const toReportNumber = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    const formatReportCell = (value) => (value === undefined || value === null || value === '' ? '' : value);
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
      return `
        <tr>
          <td>${escapeHtml(formatReportCell(scheduleRow.seCode || row.seIndex))}</td>
          <td class="fo-service">${escapeHtml(formatReportCell(scheduleRow.serviceElement || row.seName))}</td>
          <td>${escapeHtml(formatReportCell(row.baselinePercent))}</td>
          <td>${escapeHtml(formatReportCell(row.latestPercent))}</td>
          <td>${escapeHtml(row.blDefs?.total ?? 0)}</td>
          <td>${escapeHtml(row.blDefs?.NC ?? 0)}</td>
          <td>${escapeHtml(row.blDefs?.PC ?? 0)}</td>
          <td>${escapeHtml(row.completed ?? 0)}</td>
          <td>${escapeHtml(row.remaining?.total ?? 0)}</td>
          <td>${escapeHtml(row.remaining?.NC ?? 0)}</td>
          <td>${escapeHtml(row.remaining?.PC ?? 0)}</td>
          <td>${escapeHtml(row.critical?.total ?? 0)}</td>
          <td>${escapeHtml(row.critical?.NC ?? 0)}</td>
          <td>${escapeHtml(row.critical?.PC ?? 0)}</td>
          <td>${escapeHtml(row.criticalRemaining?.total ?? 0)}</td>
          <td>${escapeHtml(row.criticalRemaining?.NC ?? 0)}</td>
          <td>${escapeHtml(row.criticalRemaining?.PC ?? 0)}</td>
          <td>${escapeHtml(formatReportCell(row.latestDate))}</td>
          <td>${escapeHtml(row.policies?.NC ?? 0)}</td>
          <td>${escapeHtml(row.policies?.PC ?? 0)}</td>
          <td>${escapeHtml(row.policies?.C ?? 0)}</td>
          <td>${escapeHtml(row.policies?.total ?? 0)}</td>
          <td>${escapeHtml(formatReportCell(row.qiCompliance || 'N/A'))}</td>
        </tr>
      `;
    }).join('');
    const baselineOverall = Number.isFinite(baselineScoring?.overall?.percent) ? baselineScoring.overall.percent.toFixed(0) : '';
    const latestOverall = Number.isFinite(scoring?.overall?.percent) ? scoring.overall.percent.toFixed(0) : '';

    const firstSeSectionId = Object.keys(sectionLabels || {})[0] || reportAssessment?.sections?.[0]?.id || null;
    const firstSeSchedule = serviceElementRowsSource[0] || {};
    const firstSeOverview = facilityOverview[0] || {};
    const firstSeCode = firstSeSchedule.seCode || firstSeOverview.seIndex || '1';
    const firstSeName = firstSeSchedule.serviceElement || firstSeOverview.seName || sectionLabels[firstSeSectionId] || 'Service Element';
    const firstSeTitle = `SE ${firstSeCode}: ${firstSeName}`;
    const firstSeFacilitators = getFacilitatorsForServiceElement(firstSeCode) || surveyors;
    const firstSeCriteria = getSectionCriteria(reportAssessment, firstSeSectionId);
    const firstSeImmediateCriteria = firstSeCriteria.filter(c => ['NC', 'PC'].includes(normalizeResponseLabel(c?.response)));
    const firstSeReviewCriteria = firstSeCriteria.filter(c => !['NC', 'PC'].includes(normalizeResponseLabel(c?.response))).slice(0, 12);
    const buildCriterionRows = (criteriaList) => criteriaList.map((criterion) => {
      const code = normalizeCriterionCode(criterion?.code || criterion?.id || '');
      const response = normalizeResponseLabel(criterion?.response || 'NA');
      const scoreInfo = scoring?.globalScores?.[code] || {};
      const scoreText = Number.isFinite(scoreInfo.points) ? Number(scoreInfo.points).toFixed(0) : response;
      return `
        <tr>
          <td><div>${escapeHtml(code)}</div><div>Score: ${escapeHtml(scoreText)}</div></td>
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
    const firstSeImmediateRows = buildCriterionRows(firstSeImmediateCriteria.slice(0, 10)) || `
      <tr><td colspan="9">No immediate-response criteria identified for this service element.</td></tr>
    `;
    const firstSeReviewRows = buildCriterionRows(firstSeReviewCriteria) || `
      <tr><td colspan="9">No review criteria available for this service element.</td></tr>
    `;
    const firstSeSummaryRow = `
      <tr>
        <td>${escapeHtml(formatReportCell(firstSeOverview.baselinePercent))}</td>
        <td>${escapeHtml(formatReportCell(firstSeOverview.latestPercent))}</td>
        <td>${escapeHtml(firstSeOverview.blDefs?.total ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.blDefs?.NC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.blDefs?.PC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.completed ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.remaining?.total ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.remaining?.NC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.remaining?.PC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.critical?.total ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.critical?.NC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.critical?.PC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.criticalRemaining?.total ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.criticalRemaining?.NC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.criticalRemaining?.PC ?? 0)}</td>
        <td>${escapeHtml(formatReportCell(firstSeOverview.latestDate || formatCoverDate(reportInfo.latestDate)))}</td>
        <td>${escapeHtml(firstSeOverview.policies?.NC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.policies?.PC ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.policies?.C ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.policies?.total ?? 0)}</td>
        <td>${escapeHtml(firstSeOverview.qiCompliance || 'N/A')}</td>
      </tr>
    `;
    const firstSeChartData = (() => {
      const rootRows = firstSeSectionId ? buildRootChartData(firstSeSectionId) : [];
      const source = rootRows.length > 0 ? rootRows : firstSeCriteria.slice(0, 6).map(c => {
        const code = normalizeCriterionCode(c?.code || c?.id || '');
        return {
          code,
          name: code,
          Baseline: Number(baselineScoring?.globalScores?.[code]?.points ?? 0),
          Latest: Number(scoring?.globalScores?.[code]?.points ?? 0),
        };
      });
      return source.slice(0, 8);
    })();
    const firstSeChartBars = firstSeChartData.map(item => {
      const baseline = Math.max(0, Math.min(100, Number(item.Baseline || 0)));
      const latest = Math.max(0, Math.min(100, Number(item.Latest || 0)));
      return `
        <div class="se-chart-group">
          <div class="se-chart-bars">
            <div class="se-chart-bar baseline" style="height:${baseline}%;"><span>${baseline.toFixed(0)}</span></div>
            <div class="se-chart-bar latest" style="height:${latest}%;"><span>${latest.toFixed(0)}</span></div>
          </div>
          <div class="se-chart-label">${escapeHtml(item.name || item.code)}</div>
        </div>
      `;
    }).join('');

    const html = `<!doctype html>
      <html>
        <head>
          <title>${escapeHtml(selectedFacilityName)} Progress Report</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { margin: 0; font-family: "Times New Roman", Times, serif; color: #000; }
            .report-page { min-height: 180mm; position: relative; padding: 0 4mm; box-sizing: border-box; }
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
            .overview-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
            .vision-values { text-align: center; font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.35; margin: 2px 0 6px; }
            .overview-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .overview-table td { border: 1px dotted #9ca3af; padding: 3px 4px; vertical-align: top; min-height: 16px; }
            .overview-label { width: 31%; }
            .overview-value { width: 69%; }
            .non-attendance { margin-top: 26px; }
            .overview-heading { font-size: 18px; font-weight: normal; margin: 4px 0 0; }
            .attendance-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 14px; }
            .attendance-title { margin-top: 0; }
            .attendance-link-word { color: #0645ad; text-decoration: underline; }
            .attendance-note { font-size: 9px; margin-left: 2px; }
            .service-elements-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
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
            .facility-overview-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; padding: 0; }
            .facility-overview-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7px; line-height: 1.05; }
            .facility-overview-table th, .facility-overview-table td { border: 1px solid #000; padding: 2px 2px; text-align: center; vertical-align: middle; }
            .facility-overview-table th { font-weight: normal; background: #f3f4f6; }
            .facility-overview-table .fo-se { width: 3%; }
            .facility-overview-table .fo-service { width: 14%; text-align: left; }
            .facility-overview-table .fo-date { width: 7%; }
            .facility-overview-table .fo-qi { width: 7%; }
            .facility-overview-table tfoot td { font-weight: normal; }
            .se-output-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; padding: 0; font-size: 7px; }
            .se-summary-table, .se-criteria-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .se-summary-table th, .se-summary-table td, .se-criteria-table th, .se-criteria-table td { border: 1px solid #000; padding: 2px; vertical-align: top; }
            .se-summary-table th, .se-criteria-table th { background: #f3f4f6; font-weight: normal; text-align: center; }
            .se-output-heading { font-size: 10px; margin: 4px 0 2px; font-weight: bold; }
            .se-output-subheading { font-size: 9px; margin: 2px 0; }
            .se-criteria-table .criterion-col { width: 12%; }
            .se-criteria-table .deficiency-col { width: 20%; }
            .se-criteria-table .action-col { width: 20%; }
            .se-criteria-table .small-col { width: 8%; }
            .se-criteria-table .progress-col { width: 8%; }
            .se-chart-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; text-align: center; }
            .se-chart-title { font-size: 24px; font-weight: bold; margin: 0 0 4px; }
            .se-chart-area { width: 230mm; height: 120mm; margin: 0 auto; border-left: 1px solid #666; border-bottom: 1px solid #666; background: repeating-linear-gradient(to top, transparent 0, transparent 13.5mm, #999 13.7mm); display: flex; align-items: flex-end; justify-content: center; gap: 18mm; padding: 0 10mm; box-sizing: border-box; }
            .se-chart-y-title { position: absolute; left: 19mm; top: 58mm; transform: rotate(-90deg); font-size: 14px; font-weight: bold; }
            .se-chart-wrapper { position: relative; }
            .se-chart-group { width: 28mm; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
            .se-chart-bars { height: 100mm; display: flex; align-items: flex-end; gap: 2mm; }
            .se-chart-bar { width: 10mm; border: 1px solid #000; color: #fff; font-weight: bold; display: flex; align-items: center; justify-content: center; min-height: 3mm; }
            .se-chart-bar.baseline { background: #0505ff; }
            .se-chart-bar.latest { background: #ef5359; }
            .se-chart-label { font-size: 8px; width: 34mm; transform: rotate(-45deg); transform-origin: top left; text-align: left; margin-top: 4mm; }
            .se-chart-x-title { font-size: 14px; font-weight: bold; margin-top: 18mm; }
            .se-chart-legend { display: inline-flex; gap: 8px; border: 1px solid #555; padding: 3px 8px; margin-top: 18px; font-size: 11px; }
            .legend-box { width: 10px; height: 10px; border: 1px solid #000; display: inline-block; margin-right: 4px; }
            .legend-blue { background: #0505ff; } .legend-red { background: #ef5359; }
            .se-narrative-page { page-break-before: always; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
            .se-narrative-title { font-size: 16px; margin: 0 0 12px; font-weight: normal; }
            .se-narrative-line { margin: 8px 0; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
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
                  <th class="fo-se" rowspan="2">SE</th>
                  <th class="fo-service" rowspan="2">Service</th>
                  <th rowspan="2">Overall<br />baseline<br />score</th>
                  <th rowspan="2">Overall<br />progress<br />score</th>
                  <th colspan="3">Deficiencies<br />identified at<br />baseline</th>
                  <th rowspan="2">Deficiencies<br />completed<br />to date</th>
                  <th colspan="3">Remaining<br />deficiencies to be<br />addressed</th>
                  <th colspan="3">Critical Criteria</th>
                  <th colspan="3">Critical Criteria<br />Remaining</th>
                  <th class="fo-date" rowspan="2">Most recent<br />assessment<br />date</th>
                  <th colspan="4">Policies &amp; Procedures</th>
                  <th class="fo-qi" rowspan="2">Quality<br />improvement<br />standard<br />compliance</th>
                </tr>
                <tr>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>Total</th><th>NC</th><th>PC</th>
                  <th>NC</th><th>PC</th><th>C</th><th>Total</th>
                </tr>
              </thead>
              <tbody>${facilityOverviewTableRows}</tbody>
              <tfoot>
                <tr>
                  <td>Totals:</td>
                  <td class="fo-service">SE Count: ${escapeHtml(facilityOverview.length)}</td>
                  <td>${escapeHtml(baselineOverall)}</td>
                  <td>${escapeHtml(latestOverall)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.blTotal)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.blNC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.blPC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.completed)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.remTotal)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.remNC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.remPC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.critTotal)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.critNC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.critPC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.critRemTotal)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.critRemNC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.critRemPC)}</td>
                  <td></td>
                  <td>${escapeHtml(facilityOverviewTotals.policyNC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.policyPC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.policyC)}</td>
                  <td>${escapeHtml(facilityOverviewTotals.policyTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
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
              <tbody>${firstSeSummaryRow}</tbody>
            </table>
            <div class="se-output-heading">Critical criteria requiring immediate response</div>
            <div class="se-output-subheading">${escapeHtml(firstSeTitle)}</div>
            <table class="se-criteria-table">
              <thead>
                <tr>
                  <th class="criterion-col">Criterion</th>
                  <th class="deficiency-col">Criterion / Deficiency Identified</th>
                  <th class="action-col">Action / Recommendation</th>
                  <th class="small-col">Responsible</th>
                  <th class="small-col">Date Due</th>
                  <th class="small-col">Date<br />Reassessed</th>
                  <th class="small-col">Date Completed</th>
                  <th class="progress-col">Progress</th>
                  <th class="small-col">Comment</th>
                </tr>
              </thead>
              <tbody>${firstSeImmediateRows}</tbody>
            </table>
            <div class="se-output-heading">Overall criteria for review</div>
            <table class="se-criteria-table">
              <thead>
                <tr>
                  <th class="criterion-col">Criterion</th>
                  <th class="deficiency-col">Criterion / Deficiency Identified</th>
                  <th class="action-col">Action / Recommendation</th>
                  <th class="small-col">Responsible</th>
                  <th class="small-col">Date Due</th>
                  <th class="small-col">Date<br />Reassessed</th>
                  <th class="small-col">Date Completed</th>
                  <th class="progress-col">Progress</th>
                  <th class="small-col">Comment</th>
                </tr>
              </thead>
              <tbody>${firstSeReviewRows}</tbody>
            </table>
          </section>
          <section class="report-page se-chart-page">
            <h1 class="se-chart-title">${escapeHtml(firstSeTitle)}</h1>
            <div class="se-chart-wrapper">
              <div class="se-chart-y-title">Scores</div>
              <div class="se-chart-area">${firstSeChartBars || '<div>No chart data available</div>'}</div>
            </div>
            <div class="se-chart-x-title">Performance Indicators${escapeHtml(firstSeCode)}</div>
            <div class="se-chart-legend">
              <span><span class="legend-box legend-blue"></span>Baseline</span>
              <span><span class="legend-box legend-red"></span>${escapeHtml(reportInfo.latestType || 'Latest')}</span>
            </div>
          </section>
          <section class="report-page se-narrative-page">
            <h1 class="se-narrative-title">Overview for ${escapeHtml(firstSeTitle.replace(':', ''))}</h1>
            <div class="se-narrative-line">${escapeHtml(reportInfo.latestType || 'Latest assessment')} undertaken by: ${escapeHtml(firstSeFacilitators)}</div>
            <div class="se-narrative-line">No overview is recorded for ${escapeHtml(firstSeTitle.replace(/^SE\s*[0-9]+:\s*/i, ''))}</div>
            <div class="se-narrative-line">Baseline undertaken by: ${escapeHtml(surveyors)}</div>
            <p>${escapeHtml(selectedFacilityName)} assessment findings for ${escapeHtml(firstSeName)} are summarised in the preceding tables and chart.</p>
          </section>
          <script>window.addEventListener('load', function(){ window.print(); });</script>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast?.('Popup blocked. Please allow popups to download the PDF cover.', 'warning');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
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
          disabled={loading || reportLoading || facilityOptions.length === 0}
          onClick={handleGenerate}
        >
          {reportLoading ? 'Generating…' : 'Generate'}
        </Button>
        {reportInfo && (
          <Button
            variant="outlined"
            color="primary"
            onClick={handleDownloadCoverPdf}
          >
            Download PDF
          </Button>
        )}
        {loading && <span style={{ color: '#64748b' }}>Loading facilities…</span>}
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
                <div style={{ fontSize: 12, opacity: 0.8 }}>Facility group</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.groupLabel}</div>
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
                <div style={{ fontSize: 12, opacity: 0.8 }}>Overall (COHSASA)</div>
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
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6 }}>SE</th>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Service</th>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Overall baseline score</th>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Overall progress score</th>
                      <th colSpan={3} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Deficiencies identified at baseline</th>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Deficiencies completed to date</th>
                      <th colSpan={3} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Remaining deficiencies to be addressed</th>
                      <th colSpan={3} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Critical Criteria</th>
                      <th colSpan={3} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Critical Criteria Remaining</th>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Most recent assessment date</th>
                      <th colSpan={4} style={{ border: '1px solid #e2e8f0', padding: 6 }}>Policies &amp; Procedures</th>
                      <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: 6, whiteSpace: 'nowrap' }}>Quality improvement standard compliance</th>
                    </tr>
                    <tr>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>Total</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>NC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>PC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>Total</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>NC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>PC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>Total</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>NC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>PC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>Total</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>NC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>PC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>NC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>PC</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>C</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 6 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilityOverview.map(row => (
                      <tr key={`ov-${row.seIndex}`}>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6 }}>{row.seIndex}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6 }}>{row.seName}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.baselinePercent}%</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.latestPercent}%</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.blDefs.total}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.blDefs.NC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.blDefs.PC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.completed}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.remaining.total}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.remaining.NC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.remaining.PC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.critical.total}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.critical.NC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.critical.PC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.criticalRemaining.total}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.criticalRemaining.NC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.criticalRemaining.PC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6 }}>{row.latestDate}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.policies.NC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.policies.PC}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.policies.C}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{row.policies.total}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 6 }}>{row.qiCompliance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <>
                        <div style={{ width: '100%', overflowX: 'auto', marginBottom: 12 }}>
                          <div style={{ width: chartWidth, height: 340 }}>
                            <BarChart width={chartWidth} height={340} data={chartData} margin={{ top: 16, right: 16, bottom: 24, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                              <Tooltip content={<MainChartTooltip />} />
                              <Legend />
                              <Bar dataKey="Baseline" fill="#60a5fa" cursor="pointer" onClick={(d) => openDrillForSection(d?.id || d?.payload?.id)}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                              <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444" cursor="pointer" onClick={(d) => openDrillForSection(d?.id || d?.payload?.id)}>
                                <LabelList content={<ValueLabel />} />
                              </Bar>
                            </BarChart>
                          </div>
                        </div>

                      </>
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
                      <h3 style={{ margin: 0 }}>SE Drilldown</h3>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                        {sectionChartLabels[drillSectionId] || sectionLabels[drillSectionId] || drillSectionId}
                        {drillLevel === 'criteria' && drillRootCode ? ` / ${drillRootCode}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button size="small" variant="outlined" onClick={backDrill}>{drillLevel === 'criteria' ? 'Back to standards' : 'Close'}</Button>
                      <Button size="small" variant="outlined" onClick={exportDrillAsPng}>Export as PNG</Button>
                    </div>
                  </div>

                  {drillLevel === 'roots' && (() => {
                    const data = buildRootChartData(drillSectionId);
                    const chartWidth = Math.max(700, data.length * 120);
                    if (data.length === 0) return <div style={{ color: '#64748b' }}>No standards available for this SE.</div>;
                    return (
                      <div style={{ width: '100%', overflowX: 'auto' }}>
                        <div ref={drillChartRef} style={{ width: chartWidth, height: 380 }}>
                          <BarChart width={chartWidth} height={380} data={data} margin={{ top: 16, right: 16, bottom: 24, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                            <Tooltip content={<DrillTooltip />} />
                            <Legend />
                            <Bar dataKey="Baseline" fill="#60a5fa" cursor="pointer" onClick={(d) => { setDrillRootCode(d?.code || d?.payload?.code || null); setDrillLevel('criteria'); }}>
                              <LabelList content={<ValueLabel />} />
                            </Bar>
                            <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444" cursor="pointer" onClick={(d) => { setDrillRootCode(d?.code || d?.payload?.code || null); setDrillLevel('criteria'); }}>
                              <LabelList content={<ValueLabel />} />
                            </Bar>
                          </BarChart>
                        </div>
                      </div>
                    );
                  })()}

                  {drillLevel === 'criteria' && (() => {
                    const data = buildCriteriaChartData(drillSectionId, drillRootCode);
                    const chartWidth = Math.max(700, data.length * 120);
                    if (data.length === 0) return <div style={{ color: '#64748b' }}>No linked criteria found for {drillRootCode}.</div>;
                    return (
                      <div style={{ width: '100%', overflowX: 'auto' }}>
                        <div ref={drillChartRef} style={{ width: chartWidth, height: 380 }}>
                          <BarChart width={chartWidth} height={380} data={data} margin={{ top: 16, right: 16, bottom: 24, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                            <Tooltip content={<DrillTooltip />} />
                            <Legend />
                            <Bar dataKey="Baseline" fill="#60a5fa">
                              <LabelList content={<ValueLabel />} />
                            </Bar>
                            <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#ef4444">
                              <LabelList content={<ValueLabel />} />
                            </Bar>
                          </BarChart>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
